// ================================================================
//  TRADING KARTE
// ================================================================

function clampScale(v, lo, hi, outLo=40, outHi=99){
  if(hi === lo) return Math.round((outLo+outHi)/2);
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  return Math.round(outLo + t * (outHi - outLo));
}

function computeCardStats(rows, player){
  const v = rows.filter(r => r.player === player);
  if(!v.length) return null;
  const matches = v.length;
  const wins = v.filter(r=>r.win).length;
  const winPct = (wins/matches)*100;
  const goalsPm = sum(v.map(r=>getPath(r,'core.goals')||0)) / matches;
  const assistsPm = sum(v.map(r=>getPath(r,'core.assists')||0)) / matches;
  const savesPm = sum(v.map(r=>getPath(r,'core.saves')||0)) / matches;
  const demosPm = sum(v.map(r=>getPath(r,'demo.inflicted')||0)) / matches;
  const avgBoost = avg(v.map(r=>getPath(r,'boost.avg_amount')||0));
  const zeroBoostPct = avg(v.map(r=>getPath(r,'boost.percent_zero_boost')||0));
  const avgScore = avg(v.map(r=>getPath(r,'core.score')||0));
  const mvpRate = v.filter(r=>getPath(r,'core.mvp')).length / matches;

  const attrs = {
    GOL: clampScale(goalsPm, 0, 1.6),
    ASI: clampScale(assistsPm, 0, 1.2),
    ODB: clampScale(savesPm, 0, 2.4),
    BUST: clampScale(avgBoost, 15, 70),
    WIN: clampScale(winPct, 0, 100),
    UDA: clampScale(avgScore, 80, 550),
  };
  const ovr = Math.round((attrs.GOL + attrs.ASI + attrs.ODB + attrs.BUST + attrs.WIN + attrs.UDA) / 6);

  const top = Object.entries(attrs).sort((a,b)=>b[1]-a[1])[0][0];
  const position = top === 'GOL' ? 'NAPADAČ' : top === 'ODB' ? 'GOLMAN' : top === 'ASI' ? 'PLEJMEJKER' : 'ALL-ROUND';

  // ===== SPECIJALNOST — auto-otkriven "stil igre" na osnovu dominantne osobine =====
  let specialty = 'Svestran igrač';
  if(mvpRate >= 0.3) specialty = 'Clutch majstor';
  else if(zeroBoostPct >= 25) specialty = 'Boost lakomac';
  else if(attrs.BUST >= 80) specialty = 'Boost menadžer';
  else if(demosPm >= 1) specialty = 'Demolišer';
  else if(attrs.ODB >= 85) specialty = 'Zid odbrane';
  else if(attrs.ASI >= 85) specialty = 'Plejmejker';
  else if(attrs.GOL >= 85) specialty = 'Napadačka mašina';
  else if(attrs.WIN >= 80) specialty = 'Pobednički mentalitet';

  // ===== FORMA — poslednjih do 8 mečeva naspram sopstvenog proseka (potreban minimalan uzorak) =====
  let formTier = 'neutral';
  if(matches >= 6){
    const sorted = v.slice().sort((x,y) => (x.date||'').localeCompare(y.date||''));
    const recent = sorted.slice(-8);
    const recentWinPct = (recent.filter(r=>r.win).length / recent.length) * 100;
    const diff = recentWinPct - winPct;
    if(diff >= 15) formTier = 'hot';
    else if(diff <= -15) formTier = 'cold';
  }

  const withCar = v.filter(r => r.car_name).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const lastCar = withCar.length ? withCar[0].car_name : null;

  return { player, matches, wins, losses: matches-wins, winPct, goalsPm, attrs, ovr, position, lastCar, specialty, formTier };
}

function roundRectPath(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function hexToRgba(hex, a){
  const h = hex.replace('#','');
  const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
  return `rgba(${r},${g},${b},${a})`;
}

// ================================================================
//  WEB SHARE API — deljenje slike direktno u Viber/WhatsApp/itd. preko
//  sistemskog "Podeli" menija telefona, bez ručnog screenshot-a.
//  Radi identično na iOS Safari-ju i Android Chrome-u jer je to
//  ugrađena funkcija browsera, ne posebna aplikacija.
//  Fallback: ako uređaj/browser ne podržava deljenje fajlova (npr.
//  desktop), automatski skida sliku kao i pre.
// ================================================================
function canvasToBlob(canvas){
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

async function shareOrDownloadCanvas(canvas, filename, shareTitle, shareText){
  try{
    const blob = await canvasToBlob(canvas);
    if(!blob) throw new Error('Konverzija u sliku nije uspela');
    const file = new File([blob], filename, { type: 'image/png' });

    if(navigator.canShare && navigator.canShare({ files: [file] })){
      await navigator.share({ files: [file], title: shareTitle, text: shareText });
      return;
    }
    // fallback: nema podrške za deljenje fajlova (najčešće desktop) - skini kao pre
    const link = document.createElement('a');
    link.download = filename;
    link.href = URL.createObjectURL(blob);
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  }catch(e){
    if(e && e.name === 'AbortError') return; // korisnik otkazao deljenje - nije greška
    console.error('[Share] Nije uspelo:', e);
    // poslednji fallback preko dataURL-a
    try{
      const link = document.createElement('a');
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    }catch(e2){
      alert('Ne mogu da sačuvam/podelim sliku na ovom uređaju.');
    }
  }
}

function drawCarBackground(ctx, W, H, color) {
  ctx.save();
  ctx.globalAlpha = 0.25;
  const cx = W/2, cy = H/2 - 20;
  ctx.translate(cx, cy);
  ctx.scale(4.0, 4.0);
  
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-90, 20);
  ctx.quadraticCurveTo(-95, -10, -55, -18);
  ctx.quadraticCurveTo(-30, -42, 20, -40);
  ctx.quadraticCurveTo(55, -38, 70, -14);
  ctx.quadraticCurveTo(95, -8, 92, 18);
  ctx.quadraticCurveTo(94, 30, 78, 30);
  ctx.lineTo(-78, 30);
  ctx.quadraticCurveTo(-92, 30, -90, 20);
  ctx.closePath();
  ctx.fill();
  
  ctx.beginPath(); 
  ctx.arc(-48, 32, 16, 0, Math.PI*2); 
  ctx.fill();
  ctx.beginPath(); 
  ctx.arc(52, 32, 16, 0, Math.PI*2); 
  ctx.fill();
  
  ctx.restore();
}

function drawPlayerCard(canvas, data, color, photoImg, carImg) {
  try {
    const W = 600, H = 840, scaleF = 2;
    canvas.width = W*scaleF; canvas.height = H*scaleF;
    const ctx = canvas.getContext('2d');
    ctx.scale(scaleF, scaleF);

    roundRectPath(ctx, 0, 0, W, H, 28);
    ctx.clip();

    const bg = ctx.createLinearGradient(0, 0, W, H);
    if(data.formTier === 'hot'){
      bg.addColorStop(0, '#FFD76B');
      bg.addColorStop(0.45, '#4a3000');
      bg.addColorStop(1, '#1a0f00');
    } else if(data.formTier === 'cold'){
      bg.addColorStop(0, '#BEE7FF');
      bg.addColorStop(0.45, '#1c2c3a');
      bg.addColorStop(1, '#050b12');
    } else {
      bg.addColorStop(0, hexToRgba(color, 0.9));
      bg.addColorStop(0.45, '#141A24');
      bg.addColorStop(1, '#05070B');
    }
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.fillStyle = '#fff';
    for(let i=-2; i<6; i++){
      ctx.save();
      ctx.translate(i*140, 0);
      ctx.rotate(-0.35);
      ctx.fillRect(0, -100, 40, H+300);
      ctx.restore();
    }
    ctx.restore();

    if(!photoImg) {
      drawCarBackground(ctx, W, H, color);
    }

    roundRectPath(ctx, 6, 6, W-12, H-12, 24);
    ctx.lineWidth = 4;
    ctx.strokeStyle = data.formTier === 'hot' ? '#FFD76B' : data.formTier === 'cold' ? '#BEE7FF' : hexToRgba(color, 0.9);
    ctx.stroke();

    if(photoImg) {
      try {
        const cx = W/2, cy = H*0.32, r = 150;
        
        ctx.save();
        ctx.beginPath(); 
        ctx.arc(cx, cy, r, 0, Math.PI*2); 
        ctx.closePath(); 
        ctx.clip();
        
        const iw = photoImg.naturalWidth || photoImg.width, 
              ih = photoImg.naturalHeight || photoImg.height;
        if(iw > 0 && ih > 0) {
          const s = Math.max((r*2)/iw, (r*2)/ih);
          const dw = iw*s, dh = ih*s;
          
          ctx.fillStyle = '#0B0E14';
          ctx.fillRect(cx-r, cy-r, r*2, r*2);
          ctx.drawImage(photoImg, cx-dw/2, cy-dh/2, dw, dh);
        }
        ctx.restore();

        ctx.beginPath(); 
        ctx.arc(cx, cy, r, 0, Math.PI*2);
        ctx.lineWidth = 5; 
        ctx.strokeStyle = hexToRgba('#ffffff', 0.9); 
        ctx.stroke();
        
        ctx.beginPath(); 
        ctx.arc(cx, cy, r+6, 0, Math.PI*2);
        ctx.lineWidth = 2; 
        ctx.strokeStyle = hexToRgba(color, 0.9); 
        ctx.stroke();
      } catch(e) {
        console.warn('Greška pri crtanju slike za', data.player, e);
      }
    }

    ctx.textBaseline = 'top';
    ctx.fillStyle = '#fff';
    ctx.font = "700 92px 'Rajdhani', sans-serif";
    ctx.textAlign = 'left';
    ctx.fillText(String(data.ovr), 40, 46);
    ctx.font = "700 22px 'Rajdhani', sans-serif";
    ctx.fillStyle = hexToRgba('#ffffff', 0.85);
    ctx.fillText(data.position, 44, 140);
    ctx.textBaseline = 'top';

    if(carImg){
      const bs = 76; // velicina zaobljenog kvadratica
      const bx = W - 24 - bs, by = 34;

      ctx.save();
      roundRectPath(ctx, bx, by, bs, bs, 16);
      ctx.clip();

      const iw = carImg.naturalWidth || carImg.width, ih = carImg.naturalHeight || carImg.height;
      if(iw > 0 && ih > 0){
        const s = Math.max(bs/iw, bs/ih);
        const dw = iw*s, dh = ih*s;
        ctx.fillStyle = hexToRgba(color, 0.5);
        ctx.fillRect(bx, by, bs, bs);
        ctx.drawImage(carImg, bx + bs/2 - dw/2, by + bs/2 - dh/2, dw, dh);
      }
      ctx.restore();

      roundRectPath(ctx, bx, by, bs, bs, 16);
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    } else if(data.lastCar){
      ctx.font = "700 20px 'Rajdhani', sans-serif";
      const label = data.lastCar.toUpperCase();
      const padX = 16;
      const textW = ctx.measureText(label).width;
      const badgeW = textW + padX*2, badgeH = 34;
      const bx = W - 24 - badgeW, by = 40;

      ctx.beginPath();
      roundRectPath(ctx, bx, by, badgeW, badgeH, badgeH/2);
      ctx.fillStyle = hexToRgba(color, 0.35);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#fff';
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(label, bx + badgeW/2, by + badgeH/2 + 1);
      ctx.textBaseline = 'top';
    } else {
      const initials = data.player.slice(0,2).toUpperCase();
      ctx.beginPath();
      ctx.arc(W-72, 78, 42, 0, Math.PI*2);
      ctx.fillStyle = hexToRgba(color, 0.35);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
      ctx.font = "700 30px 'Rajdhani', sans-serif";
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(initials, W-72, 60);
    }

    ctx.textAlign = 'center';
    const nameY = photoImg ? H*0.56 : H*0.48;
    ctx.font = "700 46px 'Rajdhani', sans-serif";
    ctx.fillStyle = '#fff';
    ctx.fillText(data.player.toUpperCase(), W/2, nameY);

    ctx.strokeStyle = hexToRgba('#ffffff', 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(W*0.22, nameY + 48);
    ctx.lineTo(W*0.78, nameY + 48);
    ctx.stroke();

    const statRows = [['GOL','ASI'],['ODB','BUST'],['WIN','UDA']];
    const labelMap = { 
      GOL:'GOL/MEČ', ASI:'ASI/MEČ', ODB:'ODB/MEČ', 
      BUST:'BOOST', WIN:'WIN%', UDA:'UDARNOST' 
    };
    
    const startY = photoImg ? H*0.68 : H*0.58;
    const rowH = 50;
    const colX = [W*0.30, W*0.70];
    
    const statFontSize = 40;
    const labelFontSize = 18;
    
    statRows.forEach((pair, ri) => {
      pair.forEach((key, ci) => {
        const x = colX[ci], y = startY + ri*rowH;
        ctx.textAlign = 'center';
        ctx.font = `700 ${statFontSize}px 'JetBrains Mono', monospace`;
        ctx.fillStyle = '#fff';
        ctx.fillText(String(data.attrs[key]), x - 24, y);
        
        ctx.font = `600 ${labelFontSize}px 'Inter', sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.65)';
        ctx.textAlign = 'left';
        ctx.fillText(labelMap[key], x + 6, y + 7);
      });
    });

    ctx.textAlign = 'center';
    ctx.font = "800 16px 'Inter', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`${data.wins}P – ${data.losses}I  ·  ${data.matches} mečeva  ·  RL STATS`, W/2, H-40);
    
  } catch(e) {
    console.error('Greška pri crtanju karte za', data?.player, e);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#141A24';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = "26px 'Inter', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('Greška pri učitavanju karte', canvas.width/2, canvas.height/2);
  }
}

function cssSafe(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-'); }

const playerImageCache = {};

function loadPlayerImage(url) {
  return new Promise((resolve) => {
    if(!url) {
      resolve(null);
      return;
    }
    if(playerImageCache[url]) {
      resolve(playerImageCache[url]);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      playerImageCache[url] = img;
      resolve(img);
    };
    img.onerror = () => {
      console.warn('Ne mogu da učitam sliku:', url);
      playerImageCache[url] = null;
      resolve(null);
    };
    img.src = url;
  });
}

async function renderCardsTab(rows){
  const grid = $('#cardGrid');
  if(!grid) return;
  const ps = [...activePlayers].filter(p => rows.some(r=>r.player===p)).sort();
  if(!ps.length){ 
    grid.innerHTML = '<div class="empty">Nema izabranih igrača za ovaj filter</div>'; 
    return; 
  }

  grid.innerHTML = ps.map(p => `
    <div class="rlcard-wrap">
      <canvas id="rlcard-${cssSafe(p)}"></canvas>
      <div class="btn-row">
        <button class="rlcard-save" data-player="${p}">💾 Sačuvaj sliku</button>
        <button class="rlcard-share" data-player="${p}">📤 Podeli</button>
      </div>
    </div>
  `).join('');

  for(const p of ps){
    const stats = computeCardStats(rows, p);
    if(!stats) continue;
    const canvas = document.getElementById('rlcard-' + cssSafe(p));
    if(!canvas) continue;
    
    const imgUrl = PLAYER_IMAGE_OVERRIDES[p];
    let photoImg = null;
    if(imgUrl) {
      photoImg = await loadPlayerImage(imgUrl);
    }
    const carImgUrl = stats.lastCar ? CAR_IMAGE_OVERRIDES[stats.lastCar] : null;
    const carImg = carImgUrl ? await loadPlayerImage(carImgUrl) : null;
    drawPlayerCard(canvas, stats, playerColor[p] || '#3DA9FC', photoImg, carImg);
  }

  grid.querySelectorAll('.rlcard-save').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.player;
      const canvas = document.getElementById('rlcard-' + cssSafe(p));
      if(!canvas) return;
      try{
        const link = document.createElement('a');
        link.download = `rl-karta-${cssSafe(p)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }catch(e){
        alert('Ne mogu da snimim sliku - greška pri konverziji.');
      }
    });
  });

  grid.querySelectorAll('.rlcard-share').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.player;
      const canvas = document.getElementById('rlcard-' + cssSafe(p));
      if(!canvas) return;
      shareOrDownloadCanvas(canvas, `rl-karta-${cssSafe(p)}.png`, `${p} — RL karta`, `Trading karta za ${p} 🃏`);
    });
  });
}


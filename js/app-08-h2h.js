// ================================================================
//  HEAD TO HEAD TAB
// ================================================================

let h2hInitialized = false;

function initH2HSelectors(){
  const ps = [...activePlayers].sort();
  const selA = $('#h2hPlayerA'), selB = $('#h2hPlayerB');
  const prevA = selA.value, prevB = selB.value;
  const opts = ps.map(p => `<option value="${p}">${p}</option>`).join('');
  selA.innerHTML = opts;
  selB.innerHTML = opts;
  if(ps.includes(prevA)) selA.value = prevA; 
  if(ps.includes(prevB) && prevB !== selA.value) selB.value = prevB;
  else if(ps.length > 1) selB.value = ps.find(p => p !== selA.value) || ps[0];

  if(!h2hInitialized){
    selA.addEventListener('change', renderH2H);
    selB.addEventListener('change', renderH2H);
    h2hInitialized = true;
  }
}

// ================================================================
//  🥊 VS INTRO — borilacki ekran (Mortal Kombat fazon) pre nego sto
//  se otvori Rivalry/VS Duel karta. Kratko (~1.5s), ali dramaticno.
// ================================================================
let lastVsIntroKey = null;

function currentH2HPlayers(){
  const a = $('#h2hPlayerA')?.value, b = $('#h2hPlayerB')?.value;
  return (a && b && a !== b) ? { a, b } : null;
}

function vsIntroPortraitHtml(name){
  const url = PLAYER_IMAGE_OVERRIDES[name];
  const initial = (name || '?').charAt(0).toUpperCase();
  if(url) return `<img src="${url}" alt="${name}" onerror="this.outerHTML='${initial}';">`;
  return initial;
}

function playVsFightIntro(a, b){
  const overlay = $('#vsIntroOverlay');
  if(!overlay) return;
  const portraitA = $('#vsIntroPortraitA'), portraitB = $('#vsIntroPortraitB');
  const photoA = $('#vsIntroPhotoA'), photoB = $('#vsIntroPhotoB');
  const nameA = $('#vsIntroNameA'), nameB = $('#vsIntroNameB');
  const vsText = $('#vsIntroVsText'), readyText = $('#vsIntroReadyText'), flash = $('#vsIntroFlash');
  if(!portraitA || !portraitB) return;

  // resetuj klase za slucaj da se animacija ponovo pokrene pre nego sto se prethodna zavrsila
  [portraitA, portraitB, vsText, readyText, flash].forEach(el => {
    el.classList.remove('fly-in', 'pop', 'explode', 'fade-out', 'flash-hit');
  });
  overlay.style.transition = '';
  overlay.style.opacity = '';
  overlay.classList.add('open');

  photoA.innerHTML = vsIntroPortraitHtml(a);
  photoB.innerHTML = vsIntroPortraitHtml(b);
  const colorA = (typeof playerColor !== 'undefined' && playerColor[a]) || '#3DA9FC';
  const colorB = (typeof playerColor !== 'undefined' && playerColor[b]) || '#FF6B35';
  photoA.style.borderColor = colorA;
  photoB.style.borderColor = colorB;
  nameA.textContent = a;
  nameB.textContent = b;
  nameA.style.color = colorA;
  nameB.style.color = colorB;

  if(window.SFX) SFX.whoosh();

  requestAnimationFrame(() => {
    portraitA.classList.add('fly-in');
    portraitB.classList.add('fly-in');
  });

  // sudar na sredini (kad se portreti stignu do centra)
  setTimeout(() => {
    document.body.classList.add('screen-shake');
    flash.classList.add('flash-hit');
    vsText.classList.add('pop');
    if(window.SFX) SFX.impact();
    setTimeout(() => document.body.classList.remove('screen-shake'), 360);
  }, 1000);

  // "SPREMNI?" eksplodira
  setTimeout(() => {
    readyText.classList.add('explode');
    if(window.SFX) SFX.fanfare();
  }, 1550);

  // nestani i zatvori (ukupno ~3s)
  setTimeout(() => {
    readyText.classList.add('fade-out');
    overlay.style.transition = 'opacity .45s ease';
    overlay.style.opacity = '0';
  }, 2550);

  setTimeout(() => {
    overlay.classList.remove('open');
    overlay.style.opacity = '';
    overlay.style.transition = '';
  }, 3000);
}

function maybePlayVsIntro(force){
  const tabEl = $('#tab-h2h');
  if(!tabEl || !tabEl.classList.contains('active')) return;
  const pair = currentH2HPlayers();
  if(!pair) return;
  const key = pair.a + '::' + pair.b;
  if(force || key !== lastVsIntroKey){
    lastVsIntroKey = key;
    playVsFightIntro(pair.a, pair.b);
  }
}

function renderH2H(){
  initH2HSelectors();
  const a = $('#h2hPlayerA').value, b = $('#h2hPlayerB').value;
  const wrap = $('#h2hContent');
  if(!wrap) return;
  
  if(!a || !b || a === b){
    wrap.innerHTML = '<div class="card"><div class="empty">Izaberi dva različita igrača</div></div>';
    return;
  }

  const rows = getFiltered();
  const rowsA = rows.filter(r => r.player === a);
  const rowsB = rows.filter(r => r.player === b);
  
  // Postavi podatke za VS Duel canvas
  renderVsDuelCanvas(rows, a, b);
  renderRivalryCanvas(rows, a, b);
  maybePlayVsIntro(false);
  
  // Takođe prikaži i tabelu sa poređenjem
  const metric = (arr, path) => avg(arr.map(r => getPath(r, path) || 0));
  const totalMetric = (arr, path) => sum(arr.map(r => getPath(r, path) || 0));
  const winPct = arr => arr.length ? Math.round((arr.filter(r=>r.win).length/arr.length)*100) : 0;

  const rowsDef = [
    { label:'Mečeva', a: rowsA.length, b: rowsB.length },
    { label:'Win %', a: winPct(rowsA)+'%', b: winPct(rowsB)+'%' },
    { label:'Golova ukupno', a: totalMetric(rowsA,'core.goals'), b: totalMetric(rowsB,'core.goals') },
    { label:'Golova/meč', a: fmtNum(metric(rowsA,'core.goals')), b: fmtNum(metric(rowsB,'core.goals')) },
    { label:'Asistencija/meč', a: fmtNum(metric(rowsA,'core.assists')), b: fmtNum(metric(rowsB,'core.assists')) },
    { label:'Odbrana/meč', a: fmtNum(metric(rowsA,'core.saves')), b: fmtNum(metric(rowsB,'core.saves')) },
    { label:'Prosečan boost', a: Math.round(metric(rowsA,'boost.avg_amount')), b: Math.round(metric(rowsB,'boost.avg_amount')) },
    { label:'% iza lopte', a: Math.round(metric(rowsA,'positioning.percent_behind_ball'))+'%', b: Math.round(metric(rowsB,'positioning.percent_behind_ball'))+'%' },
    { label:'Demo/meč', a: fmtNum(metric(rowsA,'demo.inflicted')), b: fmtNum(metric(rowsB,'demo.inflicted')) },
    { label:'MVP nagrada', a: rowsA.filter(r=>getPath(r,'core.mvp')).length, b: rowsB.filter(r=>getPath(r,'core.mvp')).length },
  ];

  const seen = new Set();
  let together = { total:0, wins:0 };
  let against = { total:0, aWins:0, bWins:0 };
  rows.forEach(r => {
    if(r.player !== a) return;
    if(seen.has(r.replay_id + '|check')) return;
    const bRowSame = rows.find(x => x.replay_id === r.replay_id && x.player === b && x.team_color === r.team_color);
    const bRowOpp = rows.find(x => x.replay_id === r.replay_id && x.player === b && x.team_color !== r.team_color);
    if(bRowSame){
      together.total++;
      if(r.win) together.wins++;
    } else if(bRowOpp){
      against.total++;
      if(r.win) against.aWins++; else against.bWins++;
    }
  });

  // Prikaži tabelu ispod VS Duel canvas-a
  wrap.innerHTML = `
    <div class="card" style="margin-top:16px;">
      <h2 style="font-size:14px; text-transform:uppercase; color:var(--text-muted);">📋 Detaljno poređenje</h2>
      <table style="width:100%; border-collapse:collapse;">
        ${rowsDef.map(r => `
          <tr>
            <td class="mono" style="padding:8px 12px; text-align:right; width:35%; color:${playerColor[a]}; border-bottom:1px solid var(--border);">${r.a}</td>
            <td style="padding:8px 12px; text-align:center; width:30%; color:var(--text-muted); font-size:12px; text-transform:uppercase; border-bottom:1px solid var(--border);">${r.label}</td>
            <td class="mono" style="padding:8px 12px; text-align:left; width:35%; color:${playerColor[b]}; border-bottom:1px solid var(--border);">${r.b}</td>
          </tr>
        `).join('')}
      </table>
      <div class="subtle-note" style="margin-top:12px;">
        Isti tim: ${together.total} mečeva, ${together.total ? Math.round((together.wins/together.total)*100) : 0}% win.<br>
        Suprotni timovi: ${against.total} mečeva — ${a}: ${against.aWins} pobeda, ${b}: ${against.bWins} pobeda.
      </div>
    </div>
  `;
}

// ================================================================
//  VS DUEL — fighting-game stil "VS" slika za dva igrača, generiše se
//  na canvas-u iz H2H podataka i deli preko Web Share API-ja.
//  Sada sa 10 metrika i WOW dizajnom.
// ================================================================

function computeDuelStats(rowsPlayer, player){
  const matches = rowsPlayer.length;
  const wins = rowsPlayer.filter(r=>r.win).length;
  return {
    player,
    meceva: matches,
    winPct: matches ? Math.round((wins/matches)*100) : 0,
    goalsPm: matches ? sum(rowsPlayer.map(r=>getPath(r,'core.goals')||0))/matches : 0,
    assistsPm: matches ? sum(rowsPlayer.map(r=>getPath(r,'core.assists')||0))/matches : 0,
    savesPm: matches ? sum(rowsPlayer.map(r=>getPath(r,'core.saves')||0))/matches : 0,
    shotsPm: matches ? sum(rowsPlayer.map(r=>getPath(r,'core.shots')||0))/matches : 0,
    avgBoost: matches ? avg(rowsPlayer.map(r=>getPath(r,'boost.avg_amount')||0)) : 0,
    behindBallPct: matches ? avg(rowsPlayer.map(r=>getPath(r,'positioning.percent_behind_ball')||0)) : 0,
    demosPm: matches ? sum(rowsPlayer.map(r=>getPath(r,'demo.inflicted')||0))/matches : 0,
    mvps: rowsPlayer.filter(r=>getPath(r,'core.mvp')).length,
  };
}

function computeDuelHeadToHead(rows, a, b){
  const against = { total:0, aWins:0, bWins:0 };
  const together = { total:0, wins:0 };
  rows.forEach(r => {
    if(r.player !== a) return;
    const bRowSame = rows.find(x => x.replay_id === r.replay_id && x.player === b && x.team_color === r.team_color);
    const bRowOpp  = rows.find(x => x.replay_id === r.replay_id && x.player === b && x.team_color !== r.team_color);
    if(bRowSame){ together.total++; if(r.win) together.wins++; }
    else if(bRowOpp){ against.total++; if(r.win) against.aWins++; else against.bWins++; }
  });
  return { against, together };
}

// ================================================================
//  🔥 RIVALRY CARD — pretvara suvi head-to-head u pravu priču:
//  ko vodi, ko je "vreo" u poslednje vreme i ko trenutno ima
//  psihološku prednost (momentum meter).
// ================================================================
function computeRivalryStory(rows, a, b){
  const duels = [];
  rows.forEach(r => {
    if(r.player !== a) return;
    const bRow = rows.find(x => x.replay_id === r.replay_id && x.player === b && x.team_color !== r.team_color);
    if(bRow) duels.push({ date: r.date || '', aWin: !!r.win });
  });
  duels.sort((x,y) => (x.date||'').localeCompare(y.date||''));

  const total = duels.length;
  const aWins = duels.filter(d => d.aWin).length;
  const bWins = total - aWins;

  let streakHolder = null, streakLen = 0;
  for(let i = duels.length - 1; i >= 0; i--){
    const holder = duels[i].aWin ? 'a' : 'b';
    if(streakHolder === null){ streakHolder = holder; streakLen = 1; }
    else if(holder === streakHolder){ streakLen++; }
    else break;
  }

  const leader = aWins > bWins ? 'a' : bWins > aWins ? 'b' : null;

  // momentum: -100 (potpuno na strani B) .. +100 (potpuno na strani A)
  const recordScore = total ? ((aWins - bWins) / total) * 55 : 0;
  const streakScore = streakLen >= 2 ? (streakHolder === 'a' ? 1 : -1) * Math.min(streakLen, 5) * 9 : 0;
  const momentum = Math.max(-100, Math.min(100, Math.round(recordScore + streakScore)));

  const last5 = duels.slice(-5).map(d => d.aWin ? 'a' : 'b');

  return { total, aWins, bWins, leader, streakHolder, streakLen, momentum, last5 };
}

function buildRivalryNarrative(a, b, story){
  if(!story.total) return `${a} i ${b} se još nisu sreli jedan protiv drugog u ovom periodu.`;

  const leaderName = story.leader === 'a' ? a : story.leader === 'b' ? b : null;
  let sentence = leaderName
    ? `${a} vs ${b} — ${story.total} duela, ${leaderName} vodi ${story.aWins}:${story.bWins}.`
    : `${a} vs ${b} — ${story.total} duela, potpuno izjednačeno ${story.aWins}:${story.bWins}.`;

  if(story.streakLen >= 2){
    const streakName = story.streakHolder === 'a' ? a : b;
    if(leaderName && streakName !== leaderName){
      sentence += ` Ali ${streakName} je pobedio poslednja ${story.streakLen} zaredom — osveta u toku!`;
    } else {
      sentence += ` ${streakName} je pobedio ${story.streakLen} zaredom i produžava dominaciju.`;
    }
  }
  return sentence;
}

function wrapCanvasText(ctx, text, maxWidth){
  const words = text.split(' ');
  const lines = [];
  let line = '';
  words.forEach(w => {
    const test = line ? line + ' ' + w : w;
    if(ctx.measureText(test).width > maxWidth && line){ lines.push(line); line = w; }
    else line = test;
  });
  if(line) lines.push(line);
  return lines;
}

function drawRivalryCard(canvas, a, b, colorA, colorB, story, narrative){
  const W = 1200, H = 760, scaleF = 2;
  canvas.width = W*scaleF; canvas.height = H*scaleF;
  const ctx = canvas.getContext('2d');
  ctx.scale(scaleF, scaleF);

  roundRectPath(ctx, 0, 0, W, H, 24);
  ctx.clip();

  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, hexToRgba(colorA, 0.35));
  bg.addColorStop(0.5, '#0B0E14');
  bg.addColorStop(1, hexToRgba(colorB, 0.35));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  roundRectPath(ctx, 5, 5, W-10, H-10, 20);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.stroke();

  // kicker
  ctx.textAlign = 'center';
  ctx.font = "700 20px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('⚔️  R I V A L S T V O', W/2, 46);

  // imena i veliki skor
  ctx.font = "700 42px 'Rajdhani', sans-serif";
  ctx.fillStyle = colorA;
  ctx.textAlign = 'right';
  ctx.fillText(a.toUpperCase(), W/2 - 70, 130);
  ctx.fillStyle = colorB;
  ctx.textAlign = 'left';
  ctx.fillText(b.toUpperCase(), W/2 + 70, 130);
  ctx.font = "700 20px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.textAlign = 'center';
  ctx.fillText('VS', W/2, 126);

  ctx.font = "700 110px 'Rajdhani', sans-serif";
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.fillText(`${story.aWins} : ${story.bWins}`, W/2, 230);
  ctx.font = "600 16px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(`${story.total} odigranih duela`, W/2, 350);

  // ===== MOMENTUM GAUGE (poluokrugli merač psihološke prednosti) =====
  const gx = W/2, gy = 470, gr = 130;
  const grad = ctx.createLinearGradient(gx-gr, gy, gx+gr, gy);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  ctx.beginPath();
  ctx.lineWidth = 22;
  ctx.lineCap = 'round';
  ctx.strokeStyle = grad;
  ctx.globalAlpha = 0.28;
  ctx.arc(gx, gy, gr, Math.PI, 2*Math.PI, false);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // igla
  const angle = Math.PI + ((story.momentum + 100) / 200) * Math.PI;
  const needleLen = gr - 8;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(gx, gy);
  ctx.lineTo(gx + Math.cos(angle)*needleLen, gy + Math.sin(angle)*needleLen);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(gx, gy, 9, 0, Math.PI*2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  ctx.font = "700 15px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.textAlign = 'center';
  ctx.fillText('PSIHOLOŠKA PREDNOST', gx, gy + 34);
  const edgeName = story.momentum > 12 ? a : story.momentum < -12 ? b : 'Izjednačeno';
  ctx.font = "700 22px 'Rajdhani', sans-serif";
  ctx.fillStyle = story.momentum > 12 ? colorA : story.momentum < -12 ? colorB : '#fff';
  ctx.fillText(edgeName.toUpperCase(), gx, gy + 62);

  // narativ
  ctx.font = "500 21px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.textAlign = 'center';
  const lines = wrapCanvasText(ctx, narrative, W - 140);
  const narrY = gy + 108;
  lines.forEach((ln, i) => ctx.fillText(ln, W/2, narrY + i*28));

  // poslednjih 5 duela — niz tačkica
  if(story.last5.length){
    const dotR = 9, gap = 26;
    const startX = W/2 - ((story.last5.length-1)*gap)/2;
    const dotY = H - 46;
    ctx.font = "600 13px 'Inter', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('POSLEDNJIH ' + story.last5.length, W/2, dotY - 26);
    story.last5.forEach((who, i) => {
      const x = startX + i*gap;
      ctx.beginPath();
      ctx.arc(x, dotY, dotR, 0, Math.PI*2);
      ctx.fillStyle = who === 'a' ? colorA : colorB;
      ctx.fill();
    });
  }

  ctx.font = "700 13px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText('RTS ANALIZA', W/2, H - 18);
}

async function renderRivalryCanvas(rows, a, b){
  const canvas = document.getElementById('rivalryCanvas');
  if(!canvas) return;
  const story = computeRivalryStory(rows, a, b);
  const narrative = buildRivalryNarrative(a, b, story);
  drawRivalryCard(canvas, a, b, playerColor[a] || '#3DA9FC', playerColor[b] || '#FF6B35', story, narrative);

  const filename = `rivalstvo-${cssSafe(a)}-${cssSafe(b)}.png`;
  const saveBtn = document.getElementById('rivalrySaveBtn');
  const shareBtn = document.getElementById('rivalryShareBtn');

  if(saveBtn){
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => {
      try{
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }catch(e){ alert('Ne mogu da snimim sliku.'); }
    });
  }
  if(shareBtn){
    const newShareBtn = shareBtn.cloneNode(true);
    shareBtn.parentNode.replaceChild(newShareBtn, shareBtn);
    newShareBtn.addEventListener('click', () => {
      shareOrDownloadCanvas(canvas, filename, `${a} vs ${b} — Rivalstvo`, narrative);
    });
  }
}

function drawDuelPortrait(ctx, cx, cy, r, img, name, color){
  // Neon glow krug
  ctx.save();
  ctx.shadowColor = hexToRgba(color, 0.3);
  ctx.shadowBlur = 50;
  ctx.beginPath(); ctx.arc(cx, cy, r + 6, 0, Math.PI*2); ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.05);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.closePath(); ctx.clip();
  
  if(img){
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if(iw>0 && ih>0){
      const s = Math.max((r*2)/iw, (r*2)/ih);
      const dw = iw*s, dh = ih*s;
      ctx.fillStyle = '#0B0E14';
      ctx.fillRect(cx-r, cy-r, r*2, r*2);
      ctx.drawImage(img, cx-dw/2, cy-dh/2, dw, dh);
    }
  } else {
    ctx.fillStyle = hexToRgba(color, 0.2);
    ctx.fillRect(cx-r, cy-r, r*2, r*2);
    ctx.font = "700 " + Math.round(r*0.9) + "px 'Rajdhani', sans-serif";
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0,2).toUpperCase(), cx, cy+2);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
  
  // Neon border
  ctx.save();
  ctx.shadowColor = hexToRgba(color, 0.5);
  ctx.shadowBlur = 25;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.closePath();
  ctx.lineWidth = 3;
  ctx.strokeStyle = hexToRgba(color, 0.7);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.restore();
  
  // Tanki svetleći prsten
  ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI*2); ctx.closePath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.stroke();
}

function drawVsDuel(canvas, dataA, dataB, colorA, colorB, photoA, photoB, record){
  const W = 1400, H = 960, scaleF = 2;
  canvas.width = W*scaleF; canvas.height = H*scaleF;
  const ctx = canvas.getContext('2d');
  ctx.scale(scaleF, scaleF);

  // ===== POZADINA - DUBOKA TAMNA SA GRADIJENTOM =====
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0a0e17');
  bgGrad.addColorStop(0.5, '#111827');
  bgGrad.addColorStop(1, '#0a0e17');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ===== SUPTILNA TEKSTURA (šum) =====
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }

  // ===== OKVIR KARTICE - TANKI NEON BORDER =====
  roundRectPath(ctx, 8, 8, W-16, H-16, 24);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.stroke();

  // ===== DRUGI OKVIR - GLOW EFEKAT =====
  roundRectPath(ctx, 10, 10, W-20, H-20, 22);
  ctx.lineWidth = 0.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.stroke();

  // ===== SPLIT LINIJA - TANJA I SUPILNA =====
  const splitX = W / 2;
  
  // Suptilna podela pozadine
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, H);
  ctx.clip();
  const gA = ctx.createLinearGradient(0, 0, splitX, 0);
  gA.addColorStop(0, hexToRgba(colorA, 0.12));
  gA.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = gA;
  ctx.fillRect(0, 0, splitX, H);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, 0, W - splitX, H);
  ctx.clip();
  const gB = ctx.createLinearGradient(splitX, 0, W, 0);
  gB.addColorStop(0, 'rgba(255,255,255,0.02)');
  gB.addColorStop(1, hexToRgba(colorB, 0.12));
  ctx.fillStyle = gB;
  ctx.fillRect(splitX, 0, W - splitX, H);
  ctx.restore();

  // ===== CENTRALNA LINIJA - TANJA, SA GLOW-OM =====
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.15)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(splitX, 20);
  ctx.lineTo(splitX, H - 20);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(splitX, 20);
  ctx.lineTo(splitX, H - 20);
  ctx.stroke();

  // ===== HEADER - "VS DUEL" SA GLOW-OM =====
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  
  ctx.shadowColor = 'rgba(255,255,255,0.1)';
  ctx.shadowBlur = 20;
  ctx.font = "700 20px 'Rajdhani', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('⚔️  V S   D U E L', W/2, 42);
  ctx.shadowBlur = 0;

  // ===== PORTRAITI - VEĆI SA NEON KRUGOM =====
  const photoY = 170, photoR = 100;
  const cxA = W*0.22, cxB = W*0.78;
  
  // Neon krugovi iza portreta
  ctx.save();
  ctx.shadowColor = hexToRgba(colorA, 0.4);
  ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.arc(cxA, photoY, photoR + 8, 0, Math.PI*2); ctx.closePath();
  ctx.fillStyle = hexToRgba(colorA, 0.08);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
  
  ctx.save();
  ctx.shadowColor = hexToRgba(colorB, 0.4);
  ctx.shadowBlur = 40;
  ctx.beginPath(); ctx.arc(cxB, photoY, photoR + 8, 0, Math.PI*2); ctx.closePath();
  ctx.fillStyle = hexToRgba(colorB, 0.08);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();

  drawDuelPortrait(ctx, cxA, photoY, photoR, photoA, dataA.player, colorA);
  drawDuelPortrait(ctx, cxB, photoY, photoR, photoB, dataB.player, colorB);

  // ===== VS LOGO - STAKLENI EFEKAT =====
  ctx.save();
  ctx.translate(W/2, photoY);
  
  ctx.shadowColor = 'rgba(255,255,255,0.2)';
  ctx.shadowBlur = 30;
  ctx.beginPath(); 
  ctx.arc(0, 0, 52, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(20,25,45,0.7)';
  ctx.fill();
  ctx.shadowBlur = 0;
  
  ctx.beginPath(); 
  ctx.arc(0, 0, 48, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(10,14,23,0.85)';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.stroke();
  
  ctx.font = "700 32px 'Rajdhani', sans-serif";
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(255,255,255,0.3)';
  ctx.shadowBlur = 15;
  ctx.fillText('VS', 0, 1);
  ctx.shadowBlur = 0;
  ctx.restore();

  // ===== IMENA - SA GRADIJENTOM =====
  ctx.textBaseline = 'alphabetic';
  
  ctx.font = "700 38px 'Rajdhani', sans-serif";
  ctx.textAlign = 'center';
  ctx.shadowColor = hexToRgba(colorA, 0.5);
  ctx.shadowBlur = 30;
  ctx.fillStyle = colorA;
  ctx.fillText(dataA.player.toUpperCase(), cxA, photoY + photoR + 52);
  ctx.shadowBlur = 0;
  
  ctx.shadowColor = hexToRgba(colorB, 0.5);
  ctx.shadowBlur = 30;
  ctx.fillStyle = colorB;
  ctx.fillText(dataB.player.toUpperCase(), cxB, photoY + photoR + 52);
  ctx.shadowBlur = 0;

  // Suptilna linija ispod imena
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(cxA - 60, photoY + photoR + 62);
  ctx.lineTo(cxA + 60, photoY + photoR + 62);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cxB - 60, photoY + photoR + 62);
  ctx.lineTo(cxB + 60, photoY + photoR + 62);
  ctx.stroke();

  // ===== STATISTIKE - SA PROGRES BAROVIMA =====
  const stats = [
    { key:'meceva', label:'MEČEVA', fmt:v=>v, isNumber:true },
    { key:'winPct', label:'WIN %', fmt:v=>Math.round(v)+'%' },
    { key:'goalsPm', label:'GOL/MEČ', fmt:v=>v.toFixed(2) },
    { key:'assistsPm', label:'ASI/MEČ', fmt:v=>v.toFixed(2) },
    { key:'savesPm', label:'ODB/MEČ', fmt:v=>v.toFixed(2) },
    { key:'shotsPm', label:'ŠUT/MEČ', fmt:v=>v.toFixed(2) },
    { key:'avgBoost', label:'BOOST', fmt:v=>Math.round(v) },
    { key:'behindBallPct', label:'IZA LOPTE %', fmt:v=>Math.round(v)+'%' },
    { key:'demosPm', label:'DEMO/MEČ', fmt:v=>v.toFixed(2) },
    { key:'mvps', label:'MVP', fmt:v=>v, isNumber:true },
  ];

  const startY = 310, rowH = 48, barMax = 280, barH = 16;
  
  stats.forEach((s, i) => {
    const y = startY + i*rowH;
    const va = dataA[s.key] || 0, vb = dataB[s.key] || 0;
    const maxV = Math.max(va, vb, 0.0001);
    const wa = (va/maxV) * barMax, wb = (vb/maxV) * barMax;

    // Label
    ctx.font = "700 13px 'Inter', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(s.label, W/2, y - 6);

    // Bar A (levo)
    ctx.fillStyle = hexToRgba(colorA, 0.25);
    roundRectPath(ctx, W/2 - barMax - 4, y, barMax, barH, 4);
    ctx.fill();
    
    ctx.fillStyle = hexToRgba(colorA, 0.85);
    roundRectPath(ctx, W/2 - wa - 4, y, wa, barH, 4);
    ctx.fill();

    // Bar B (desno)
    ctx.fillStyle = hexToRgba(colorB, 0.25);
    roundRectPath(ctx, W/2 + 4, y, barMax, barH, 4);
    ctx.fill();
    
    ctx.fillStyle = hexToRgba(colorB, 0.85);
    roundRectPath(ctx, W/2 + 4, y, wb, barH, 4);
    ctx.fill();

    // Vrednosti
    ctx.font = "700 15px 'JetBrains Mono', monospace";
    ctx.textAlign = 'right';
    ctx.fillStyle = colorA;
    ctx.fillText(s.fmt(va), W/2 - wa - 16, y + barH - 1);
    
    ctx.textAlign = 'left';
    ctx.fillStyle = colorB;
    ctx.fillText(s.fmt(vb), W/2 + wb + 16, y + barH - 1);
  });

  // ===== FOOTER - DIREKTNI DUELI =====
  const bannerY = H - 70;
  
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(60, bannerY - 20);
  ctx.lineTo(W-60, bannerY - 20);
  ctx.stroke();

  if(record.against.total > 0){
    ctx.font = "700 14px 'Inter', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = 'center';
    ctx.fillText('DIREKTNI DUELI  •  ' + record.against.total + ' meč' + (record.against.total===1?'':'a'), W/2, bannerY);

    ctx.font = "700 44px 'Rajdhani', sans-serif";
    
    ctx.textAlign = 'right';
    ctx.fillStyle = colorA;
    ctx.shadowColor = hexToRgba(colorA, 0.3);
    ctx.shadowBlur = 20;
    ctx.fillText(String(record.against.aWins), W/2 - 24, bannerY + 46);
    ctx.shadowBlur = 0;
    
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillText('—', W/2, bannerY + 46);
    
    ctx.textAlign = 'left';
    ctx.fillStyle = colorB;
    ctx.shadowColor = hexToRgba(colorB, 0.3);
    ctx.shadowBlur = 20;
    ctx.fillText(String(record.against.bWins), W/2 + 24, bannerY + 46);
    ctx.shadowBlur = 0;
  } else {
    ctx.font = "600 15px 'Inter', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.textAlign = 'center';
    ctx.fillText('Još se nisu sreli kao protivnici u ovom periodu', W/2, bannerY + 12);
  }

  // ===== BRANDING - RLS LOGO =====
  ctx.font = "500 10px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('RL STATS • VS DUEL', W - 24, H - 12);
  ctx.textBaseline = 'alphabetic';
}

async function renderVsDuelCanvas(rows, a, b){
  const canvas = document.getElementById('vsDuelCanvas');
  if(!canvas) return;
  const rowsA = rows.filter(r => r.player === a);
  const rowsB = rows.filter(r => r.player === b);
  const dataA = computeDuelStats(rowsA, a);
  const dataB = computeDuelStats(rowsB, b);
  const record = computeDuelHeadToHead(rows, a, b);

  const photoA = PLAYER_IMAGE_OVERRIDES[a] ? await loadPlayerImage(PLAYER_IMAGE_OVERRIDES[a]) : null;
  const photoB = PLAYER_IMAGE_OVERRIDES[b] ? await loadPlayerImage(PLAYER_IMAGE_OVERRIDES[b]) : null;

  drawVsDuel(canvas, dataA, dataB, playerColor[a] || '#3DA9FC', playerColor[b] || '#FF6B35', photoA, photoB, record);

  const filename = `vs-duel-${cssSafe(a)}-${cssSafe(b)}.png`;
  const saveBtn = document.getElementById('vsDuelSaveBtn');
  const shareBtn = document.getElementById('vsDuelShareBtn');

  // ==== SAVE BUTTON ====
  if(saveBtn) {
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    newSaveBtn.addEventListener('click', () => {
      try{
        const link = document.createElement('a');
        link.download = filename;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }catch(e){ 
        alert('Ne mogu da snimim sliku.'); 
      }
    });
  }

  // ==== SHARE BUTTON ====
  if(shareBtn) {
    const newShareBtn = shareBtn.cloneNode(true);
    shareBtn.parentNode.replaceChild(newShareBtn, shareBtn);
    newShareBtn.addEventListener('click', () => {
      // Uzmi trenutne vrednosti iz selectora
      const playerA = document.getElementById('h2hPlayerA').value;
      const playerB = document.getElementById('h2hPlayerB').value;
      const currentFilename = `vs-duel-${cssSafe(playerA)}-${cssSafe(playerB)}.png`;
      shareOrDownloadCanvas(canvas, currentFilename, `${playerA} vs ${playerB}`, `⚔️ Duel: ${playerA} vs ${playerB}`);
    });
  }
}


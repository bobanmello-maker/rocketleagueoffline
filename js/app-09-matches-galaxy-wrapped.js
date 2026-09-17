// ================================================================
//  MATCHES TAB
// ================================================================

function renderTable(rows){
  const sorted = [...rows].sort((a,b) => {
    let va = getPath(a,sortKey), vb = getPath(b,sortKey);
    if(typeof va === 'string') va = va.toLowerCase();
    if(typeof vb === 'string') vb = vb.toLowerCase();
    if(va < vb) return -1 * sortDir;
    if(va > vb) return 1 * sortDir;
    return 0;
  });

  const totalPages = Math.ceil(sorted.length / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * pageSize;
  const end = Math.min(start + pageSize, sorted.length);
  const pageData = sorted.slice(start, end);

  const body = $('#matchTableBody');
  body.innerHTML = pageData.map((r, idx) => `
    <tr data-idx="${start + idx}">
      <td class="mono">${fmtDate(r.date)}</td>
      <td>${r.map || ''}</td>
      <td style="color:${playerColor[r.player] || '#fff'}; font-weight:600;">${r.player}</td>
      <td style="text-transform:capitalize;">${r.team_color}</td>
      <td><span class="pill ${r.win ? 'win':'loss'}">${r.team_goals}–${r.opponent_goals}</span></td>
      <td class="mono">${getPath(r,'core.goals')}</td>
      <td class="mono">${getPath(r,'core.assists')}</td>
      <td class="mono">${getPath(r,'core.saves')}</td>
      <td class="mono">${getPath(r,'core.shots')}</td>
      <td class="mono">${getPath(r,'core.score')}</td>
      <td class="mono">${(getPath(r,'boost.avg_amount')||0).toFixed(0)}</td>
      <td class="mono">${(getPath(r,'positioning.percent_behind_ball')||0).toFixed(0)}%</td>
      <td>${getPath(r,'core.mvp') ? '<span class="mvp-star">★</span>' : ''}</td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => openModal(sorted[+tr.dataset.idx]));
  });

  // Update pagination info
  $('#pageInfo').textContent = `Strana ${currentPage} od ${totalPages}`;
  $('#prevPageBtn').disabled = currentPage <= 1;
  $('#nextPageBtn').disabled = currentPage >= totalPages;
  
  // Event listeneri za paginaciju (samo jednom)
  if (!window._paginationInitialized) {
    window._paginationInitialized = true;
    $('#prevPageBtn').addEventListener('click', () => {
      if (currentPage > 1) { currentPage--; render(); }
    });
    $('#nextPageBtn').addEventListener('click', () => {
      if (currentPage < totalPages) { currentPage++; render(); }
    });
    $('#pageSizeSelect').addEventListener('change', (e) => {
      pageSize = parseInt(e.target.value);
      currentPage = 1;
      render();
    });
  }
}
// ================================================================
//  🌌 GALAKSIJA KARIJERE — svaki igrač je sunce, svaki meč planeta u
//  suncokret-spirali koja kruži oko njega (canvas, čist JS, bez biblioteka)
// ================================================================

const GALAXY_GOLDEN_ANGLE = 2.399963229728653; // ~137.5° u radijanima - suncokret spirala

const starMapState = {
  suns: [],
  bgStars: [],
  camX: 0, camY: 0, zoom: 1,
  driftVX: 0.06, driftVY: 0.012,
  dragging: false, dragged: false, lastX: 0, lastY: 0,
  canvas: null, ctx: null, raf: null,
  flying: false, flyFrom:null, flyTo:null, flyStart:0, flyDur:850, flyThenOpen:null,
};

// Deterministicki "seed" random po replay_id - ista planeta uvek zavrsi na istom
// mestu na orbiti, cak i posle ponovnog rendera/filtriranja.
function seededRand(seedStr){
  let h = 0;
  for(let i=0;i<seedStr.length;i++){ h = (h*31 + seedStr.charCodeAt(i)) | 0; }
  return function(){
    h = (h*1664525 + 1013904223) | 0;
    return ((h >>> 0) / 4294967296);
  };
}

// Izgradi jedan sistem (sunce + planete) za jednog igrača.
function buildSunSystem(player, prows, sunX, sunY){
  const sorted = prows.filter(r => r.replay_id && r.date).slice()
    .sort((a,b) => (a.date||'').localeCompare(b.date||''));

  const spiralC = 15.5;    // konstanta rasta Fermatove/suncokret spirale (r = c*sqrt(i))
  const baseR = 46;        // razmak od samog sunca do prve orbite

  const planets = sorted.map((r, i) => {
    const rnd = seededRand(r.replay_id + '|' + player);
    const orbitRadius = baseR + spiralC * Math.sqrt(i + 1);
    const angle0 = i * GALAXY_GOLDEN_ANGLE;
    // Blize suncu (starije) = brze kruzi, kao prava orbitalna mehanika.
    const orbitSpeed = (0.22 + rnd()*0.10) / Math.sqrt(orbitRadius / baseR);

    const goals = getPath(r,'core.goals') || 0;
    const mvp = !!getPath(r,'core.mvp');
    const margin = Math.abs((r.team_goals||0) - (r.opponent_goals||0));
    let significance = 0.18 + Math.min(0.3, margin*0.06) + Math.min(0.3, goals*0.09);
    if(mvp) significance += 0.25;
    significance = Math.min(1, significance);

    const hasRing = !!r.overtime || (r.max_deficit_overcome||0) >= 2;

    return {
      replay_id: r.replay_id,
      row: r,
      win: !!r.win,
      orbitRadius,
      angle: angle0,
      orbitSpeed: r.win ? orbitSpeed : -orbitSpeed, // pobede i porazi kruze u suprotnim smerovima - vizuelno "citljivije"
      significance,
      radius: 2.0 + significance * 3.6,
      hasRing,
      twinklePhase: rnd() * Math.PI * 2,
      twinkleSpeed: 0.5 + rnd() * 1.0,
      _sx:null, _sy:null, _sr:null,
    };
  });

  const maxOrbit = planets.length ? planets[planets.length-1].orbitRadius + 14 : baseR;

  return {
    player, sunX, sunY,
    color: playerColor[player] || '#8EC9FF',
    sunRadius: 12 + Math.min(10, Math.sqrt(planets.length)),
    maxOrbit,
    planets,
    _sx:null, _sy:null, _sr:null,
  };
}

function buildGalaxyData(rows){
  const ps = [...activePlayers];
  if(!ps.length) return [];

  const byPlayer = {};
  ps.forEach(p => byPlayer[p] = []);
  rows.forEach(r => { if(byPlayer[r.player]) byPlayer[r.player].push(r); });

  // Rasporedi suncane sisteme u red, sa razmakom proporcionalnim velicini
  // svakog sistema, tako da se orbite razlicitih igraca ne preklapaju previse.
  const systems = [];
  let cursorX = 0;
  ps.forEach((p, idx) => {
    const prows = byPlayer[p] || [];
    // privremeno sagradi da izracunamo maxOrbit, pa tek onda pozicioniramo
    const tmp = buildSunSystem(p, prows, 0, 0);
    if(idx > 0) cursorX += systems[idx-1].maxOrbit + tmp.maxOrbit + 90;
    const sunY = (idx % 2 === 0) ? 0 : (idx % 4 === 1 ? 160 : -160);
    const sys = buildSunSystem(p, prows, cursorX, sunY);
    systems.push(sys);
  });

  return systems;
}

function buildStarMapBgStars(w, h, count){
  const arr = [];
  for(let i=0;i<count;i++){
    arr.push({
      x: Math.random()*w, y: Math.random()*h, r: Math.random()*1.1 + 0.3,
      baseAlpha: 0.2 + Math.random()*0.45,
      phase: Math.random()*Math.PI*2, speed: 0.25 + Math.random()*0.8,
    });
  }
  return arr;
}

function resizeStarMapCanvas(){
  const wrap = $('#starmapWrap');
  const canvas = starMapState.canvas;
  if(!wrap || !canvas) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if(w < 4 || h < 4) return;
  canvas.width = w;
  canvas.height = h;
  starMapState.bgStars = buildStarMapBgStars(w, h, 140);
}

function easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function drawStarMap(){
  const st = starMapState;
  if(st.canvas && st.ctx){
    const { ctx, canvas } = st;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const grad = ctx.createRadialGradient(w*0.5,h*0.42,0, w*0.5,h*0.42, Math.max(w,h)*0.75);
    grad.addColorStop(0, 'rgba(45,25,85,0.30)');
    grad.addColorStop(1, 'rgba(3,5,12,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,w,h);

    const t = performance.now()/1000;
    const dt = Math.min(0.05, st._lastT ? (t - st._lastT) : 0.016);
    st._lastT = t;

    ctx.fillStyle = '#ffffff';
    st.bgStars.forEach(b => {
      const tw = 0.35 + 0.65 * (0.5 + 0.5*Math.sin(t*b.speed + b.phase));
      ctx.globalAlpha = b.baseAlpha * tw;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    // Kinematski "let" kamere ka izabranoj planeti
    if(st.flying){
      const elapsed = performance.now() - st.flyStart;
      const frac = Math.min(1, elapsed / st.flyDur);
      const e = easeOutCubic(frac);
      st.camX = st.flyFrom.x + (st.flyTo.x - st.flyFrom.x) * e;
      st.camY = st.flyFrom.y + (st.flyTo.y - st.flyFrom.y) * e;
      st.zoom = st.flyFrom.zoom + (st.flyTo.zoom - st.flyFrom.zoom) * e;
      if(frac >= 1){
        st.flying = false;
        if(st.flyThenOpen){ const cb = st.flyThenOpen; st.flyThenOpen = null; cb(); }
      }
    }

    st.suns.forEach(sys => {
      const cx = (sys.sunX - st.camX) * st.zoom + w/2;
      const cy = (sys.sunY - st.camY) * st.zoom + h/2;
      sys._sx = cx; sys._sy = cy; sys._sr = sys.sunRadius * st.zoom;

      const onScreen = cx > -sys.maxOrbit*st.zoom-60 && cx < w+sys.maxOrbit*st.zoom+60 && cy > -sys.maxOrbit*st.zoom-60 && cy < h+sys.maxOrbit*st.zoom+60;
      if(!onScreen){ sys.planets.forEach(p => p._sr=null); return; }

      // Planete (crtaju se prvo, ispod sunca)
      sys.planets.forEach(p => {
        if(!st.dragging && !st.flying) p.angle += p.orbitSpeed * dt;
        const px = cx + Math.cos(p.angle) * p.orbitRadius * st.zoom;
        const py = cy + Math.sin(p.angle) * p.orbitRadius * st.zoom * 0.62; // blago spljosteno - elipticna orbita
        if(px < -30 || px > w+30 || py < -30 || py > h+30){ p._sr = null; return; }

        const twinkle = 0.8 + 0.2 * Math.sin(t*p.twinkleSpeed + p.twinklePhase);
        const r = Math.max(0.8, p.radius * st.zoom * twinkle);
        const color = p.win ? [142,201,255] : [255,107,107];
        const alpha = Math.min(1, 0.6 + p.significance*0.4) * twinkle;

        // Suptilna orbitalna staza
        ctx.strokeStyle = `rgba(255,255,255,${0.05*st.zoom < 0.05 ? 0.035 : 0.05})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, p.orbitRadius*st.zoom, p.orbitRadius*st.zoom*0.62, 0, 0, Math.PI*2);
        ctx.stroke();

        if(p.significance > 0.5){
          const glowR = r * (3 + p.significance*3);
          const glow = ctx.createRadialGradient(px,py,0, px,py,glowR);
          glow.addColorStop(0, `rgba(${color[0]},${color[1]},${color[2]},${0.35*twinkle})`);
          glow.addColorStop(1, `rgba(${color[0]},${color[1]},${color[2]},0)`);
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(px, py, glowR, 0, Math.PI*2);
          ctx.fill();
        }

        // Prsten kao Saturn - za OT ili preokret (comeback)
        if(p.hasRing){
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(0.45);
          ctx.strokeStyle = `rgba(251,191,36,${0.75*twinkle})`;
          ctx.lineWidth = Math.max(1, r*0.35);
          ctx.beginPath();
          ctx.ellipse(0, 0, r*2.1, r*0.8, 0, 0, Math.PI*2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI*2);
        ctx.fill();

        p._sx = px; p._sy = py; p._sr = Math.max(r, 7);
      });

      // Sunce - veliko, sija u boji igraca
      const sunR = Math.max(2, sys._sr);
      const [sr,sg,sb] = hexToRgb(sys.color);
      const sunGlow = ctx.createRadialGradient(cx,cy,0, cx,cy, sunR*4.5);
      sunGlow.addColorStop(0, `rgba(${sr},${sg},${sb},0.55)`);
      sunGlow.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
      ctx.fillStyle = sunGlow;
      ctx.beginPath(); ctx.arc(cx, cy, sunR*4.5, 0, Math.PI*2); ctx.fill();

      ctx.fillStyle = sys.color;
      ctx.beginPath(); ctx.arc(cx, cy, sunR, 0, Math.PI*2); ctx.fill();

      if(st.zoom > 0.5){
        ctx.font = `700 ${Math.max(10, 12*Math.min(1.3,st.zoom))}px Rajdhani, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillText(sys.player, cx, cy - sunR - 10);
      }
    });

    if(!st.dragging && !st.flying){ st.camX += st.driftVX; st.camY += st.driftVY; }
  }
  st.raf = requestAnimationFrame(drawStarMap);
}

function startStarMapLoop(){
  resizeStarMapCanvas();
  if(!starMapState.raf) starMapState.raf = requestAnimationFrame(drawStarMap);
}
function stopStarMapLoop(){
  if(starMapState.raf){ cancelAnimationFrame(starMapState.raf); starMapState.raf = null; }
}

function flyStarMapCameraTo(worldX, worldY, targetZoom, onDone){
  const st = starMapState;
  st.flying = true;
  st.flyFrom = { x: st.camX, y: st.camY, zoom: st.zoom };
  st.flyTo = { x: worldX, y: worldY, zoom: targetZoom };
  st.flyStart = performance.now();
  st.flyDur = 850;
  st.flyThenOpen = onDone;
}

function handleStarMapClick(clientX, clientY){
  const canvas = starMapState.canvas;
  if(!canvas || starMapState.flying) return;
  const rect = canvas.getBoundingClientRect();
  const mx = clientX - rect.left, my = clientY - rect.top;
  let best = null, bestSys = null, bestD = Infinity;
  starMapState.suns.forEach(sys => {
    sys.planets.forEach(p => {
      if(p._sr == null) return;
      const dx = mx - p._sx, dy = my - p._sy;
      const d = Math.hypot(dx, dy);
      if(d <= p._sr + 4 && d < bestD){ bestD = d; best = p; bestSys = sys; }
    });
  });
  if(best && bestSys){
    // Trenutna svetska pozicija planete (ugao je zamrznut tokom leta, pa je bezbedno ciljati je)
    const worldX = bestSys.sunX + Math.cos(best.angle) * best.orbitRadius;
    const worldY = bestSys.sunY + Math.sin(best.angle) * best.orbitRadius * 0.62;
    // "Cinematic zoom": kamera prvo doleti (ease-out, ~0.85s) do planete, tek onda se otvaraju detalji
    flyStarMapCameraTo(
      worldX, worldY,
      Math.min(4.2, Math.max(2.4, starMapState.zoom * 1.8)),
      () => openModal(best.row)
    );
  }
}

function initStarMapInteractions(){
  const wrap = $('#starmapWrap');
  const canvas = $('#starmapCanvas');
  if(!wrap || !canvas) return;
  starMapState.canvas = canvas;
  starMapState.ctx = canvas.getContext('2d');

  wrap.addEventListener('pointerdown', e => {
    if(e.target.closest('.starmap-reset-btn')) return;
    starMapState.dragging = true;
    starMapState.dragged = false;
    starMapState.flying = false;
    wrap.classList.add('dragging');
    starMapState.lastX = e.clientX;
    starMapState.lastY = e.clientY;
    try{ wrap.setPointerCapture(e.pointerId); }catch(err){}
  });
  wrap.addEventListener('pointermove', e => {
    if(!starMapState.dragging) return;
    const dx = e.clientX - starMapState.lastX;
    const dy = e.clientY - starMapState.lastY;
    if(Math.abs(dx) > 2 || Math.abs(dy) > 2) starMapState.dragged = true;
    starMapState.camX -= dx / starMapState.zoom;
    starMapState.camY -= dy / starMapState.zoom;
    starMapState.lastX = e.clientX;
    starMapState.lastY = e.clientY;
  });
  const endDrag = e => {
    starMapState.dragging = false;
    wrap.classList.remove('dragging');
    if(!starMapState.dragged && e) handleStarMapClick(e.clientX, e.clientY);
  };
  wrap.addEventListener('pointerup', endDrag);
  wrap.addEventListener('pointercancel', () => { starMapState.dragging = false; wrap.classList.remove('dragging'); });

  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
    starMapState.zoom = Math.max(0.35, Math.min(6, starMapState.zoom * factor));
  }, { passive:false });

  $('#starmapResetBtn').addEventListener('click', () => {
    starMapState.flying = false;
    starMapState.camX = 0; starMapState.camY = 0; starMapState.zoom = 1;
  });

  window.addEventListener('resize', () => {
    if($('#tab-matches').classList.contains('active')) resizeStarMapCanvas();
  });
}

function renderStarMap(rows){
  starMapState.suns = buildGalaxyData(rows);
}

function openModal(r){
  const c = r.core, b = r.boost, m = r.movement, p = r.positioning, d = r.demo;
  $('#modalContent').innerHTML = `
    <button class="modal-close" id="modalCloseBtn">&times;</button>
    <h3 style="color:${playerColor[r.player]}">${r.player}</h3>
    <div class="sub">${fmtDate(r.date)} &middot; ${r.map} &middot; ${r.playlist} &middot;
      <span class="pill ${r.win?'win':'loss'}">${r.team_goals}–${r.opponent_goals}</span></div>

    <div class="stat-block"><h4>Osnovno</h4>
      ${['goals','assists','saves','shots','score','shooting_percentage'].map(k=>`<div class="stat-line"><span>${statLabel(k)}</span><span>${c[k]}</span></div>`).join('')}
    </div>
    <div class="stat-block"><h4>Boost</h4>
      ${['bpm','avg_amount','amount_collected','amount_stolen','count_collected_big','count_collected_small','percent_zero_boost','percent_full_boost'].map(k=>`<div class="stat-line"><span>${statLabel(k)}</span><span>${b[k]}</span></div>`).join('')}
    </div>
    <div class="stat-block"><h4>Kretanje</h4>
      ${['avg_speed','percent_supersonic_speed','percent_ground','percent_low_air','percent_high_air','count_powerslide'].map(k=>`<div class="stat-line"><span>${statLabel(k)}</span><span>${m[k]}</span></div>`).join('')}
    </div>
    <div class="stat-block"><h4>Pozicioniranje</h4>
      ${['percent_defensive_third','percent_offensive_third','percent_behind_ball','avg_distance_to_ball','avg_distance_to_mates'].map(k=>`<div class="stat-line"><span>${statLabel(k)}</span><span>${p[k]}</span></div>`).join('')}
    </div>
    <div class="stat-block"><h4>Demo</h4>
      ${['inflicted','taken'].map(k=>`<div class="stat-line"><span>${statLabel(k)}</span><span>${d[k]}</span></div>`).join('')}
    </div>
  `;
  $('#modalCloseBtn').addEventListener('click', closeModal);
  $('#modalBackdrop').classList.add('open');
}

function closeModal(){ $('#modalBackdrop').classList.remove('open'); }

// ================================================================
//  SEASON WRAPPED
// ================================================================

function longestWinStreakFor(rows, player){
  const sorted = rows.filter(r => r.player === player).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
  let best = 0, cur = 0;
  sorted.forEach(r => { if(r.win){ cur++; best = Math.max(best, cur); } else cur = 0; });
  return best;
}

function computeWrappedData(rows){
  const ps = [...new Set(rows.map(r => r.player))];
  const dates = rows.map(r => r.date).filter(Boolean).sort();
  const matchCount = new Set(rows.map(r => r.replay_id)).size;

  const byPlayer = p => rows.filter(r => r.player === p);
  const totalGoals = sum(rows.map(r => getPath(r,'core.goals') || 0));
  const totalSaves = sum(rows.map(r => getPath(r,'core.saves') || 0));
  const totalAssists = sum(rows.map(r => getPath(r,'core.assists') || 0));
  const totalDemos = sum(rows.map(r => getPath(r,'demo.inflicted') || 0));

  const topScorer = ps.map(p => ({ p, v: sum(byPlayer(p).map(r=>getPath(r,'core.goals')||0)) }))
    .sort((a,b)=>b.v-a.v)[0];

  const mvpKing = ps.map(p => ({ p, v: byPlayer(p).filter(r=>getPath(r,'core.mvp')).length }))
    .sort((a,b)=>b.v-a.v)[0];

  const streakKing = ps.map(p => ({ p, v: longestWinStreakFor(rows, p) })).sort((a,b)=>b.v-a.v)[0];

  const boostKing = ps.map(p => {
    const v = byPlayer(p);
    const val = v.length ? avg(v.map(r=>getPath(r,'boost.percent_zero_boost')||0)) : 999;
    return { p, v: val };
  }).filter(x=>x.v<999).sort((a,b)=>a.v-b.v)[0];

  let bestMatch = null;
  rows.forEach(r => {
    const score = getPath(r,'core.score') || 0;
    if(!bestMatch || score > bestMatch.score){
      bestMatch = { player: r.player, score, goals: getPath(r,'core.goals')||0, map: mapDisplay(r.map), date: r.date, win: r.win };
    }
  });

  const seen = new Set();
  const duoStats = {};
  rows.forEach(r => {
    const key = r.replay_id + '|' + r.team_color;
    if(seen.has(key)) return;
    seen.add(key);
    const team = [...new Set([r.player, ...(r.teammates||[])])];
    if(team.length !== 2) return;
    const ck = [...team].sort().join(' & ');
    if(!duoStats[ck]) duoStats[ck] = { total:0, wins:0 };
    duoStats[ck].total++;
    if(r.win) duoStats[ck].wins++;
  });
  const bestDuo = Object.entries(duoStats)
    .filter(([,d]) => d.total >= 3)
    .map(([comb,d]) => ({ comb, ...d, pct: d.wins/d.total }))
    .sort((a,b)=>b.pct-a.pct)[0];

  const totalWins = rows.filter(r=>r.win).length;
  const winPct = rows.length ? Math.round((totalWins/rows.length)*100) : 0;

  return {
    ps, dateFrom: dates[0], dateTo: dates[dates.length-1], matchCount,
    totalGoals, totalSaves, totalAssists, totalDemos, winPct,
    topScorer, mvpKing, streakKing, boostKing, bestMatch, bestDuo
  };
}

function mapDisplay(raw){ return raw || '?'; }

function renderWrappedTab(rows){
  wrappedRows = rows;
  const wrap = $('#wrappedPreviewStats');
  if(!wrap) return;
  const matchCount = new Set(rows.map(r=>r.replay_id)).size;
  const totalGoals = sum(rows.map(r=>getPath(r,'core.goals')||0));
  const dates = rows.map(r=>r.date).filter(Boolean).sort();
  wrap.innerHTML = `
    <div><div class="num">${matchCount}</div><div class="lbl">Mečeva</div></div>
    <div><div class="num">${totalGoals}</div><div class="lbl">Golova ukupno</div></div>
    <div><div class="num">${dates.length ? fmtDate(dates[0]) : '—'} – ${dates.length ? fmtDate(dates[dates.length-1]) : '—'}</div><div class="lbl">Period</div></div>
  `;
  $('#wrappedGoBtn').disabled = !matchCount;
}

function buildWrappedSlides(d){
  const slides = [];
  const period = (d.dateFrom && d.dateTo) ? `${fmtDate(d.dateFrom)} – ${fmtDate(d.dateTo)}` : '';

  slides.push({ type:'intro', html: `
    <div class="kicker">Season Wrapped</div>
    <div class="icon-big">🚀</div>
    <div class="headline">Ovo je bila vaša sezona</div>
    <div class="sub">${period}</div>
    <div class="chip-row"><div class="wchip">${d.matchCount} mečeva</div><div class="wchip">${d.ps.length} igrača</div></div>
  `});

  slides.push({ type:'stat', html: `
    <div class="kicker">Ukupno golova</div>
    <div class="megahero">${d.totalGoals}</div>
    <div class="sub">Ekipa je zajedno zatresla mrežu ${d.totalGoals} puta, uz ${d.totalAssists} asistencija i ${d.totalSaves} odbrana.</div>
  `});

  if(d.topScorer && d.topScorer.v > 0){
    slides.push({ type:'winner', html: `
      <div class="kicker">Strelac sezone</div>
      <div class="icon-big">🎯</div>
      <div class="winner-name" style="color:${playerColor[d.topScorer.p]||'#fff'}">${d.topScorer.p}</div>
      <div class="sub">${d.topScorer.v} golova — niko drugi nije bio ni blizu.</div>
    `});
  }

  if(d.streakKing && d.streakKing.v > 0){
    slides.push({ type:'winner', html: `
      <div class="kicker">Nezaustavljiv</div>
      <div class="megahero">${d.streakKing.v}</div>
      <div class="sub">Najduži niz pobeda zaredom, i to od strane <b style="color:${playerColor[d.streakKing.p]||'#fff'}">${d.streakKing.p}</b>.</div>
    `});
  }

  if(d.mvpKing && d.mvpKing.v > 0){
    slides.push({ type:'winner', html: `
      <div class="kicker">MVP kralj</div>
      <div class="icon-big">⭐</div>
      <div class="winner-name" style="color:${playerColor[d.mvpKing.p]||'#fff'}">${d.mvpKing.p}</div>
      <div class="sub">Pokupio MVP nagradu ${d.mvpKing.v} puta ove sezone.</div>
    `});
  }

  if(d.bestDuo){
    slides.push({ type:'winner', html: `
      <div class="kicker">Chemistry par sezone</div>
      <div class="icon-big">🤝</div>
      <div class="winner-name" style="font-size:32px;">${d.bestDuo.comb}</div>
      <div class="sub">${d.bestDuo.wins}/${d.bestDuo.total} pobeda zajedno u 2v2 — ${Math.round(d.bestDuo.pct*100)}% win rate.</div>
    `});
  }

  if(d.bestMatch){
    slides.push({ type:'winner', html: `
      <div class="kicker">Partija sezone</div>
      <div class="icon-big">💯</div>
      <div class="winner-name" style="color:${playerColor[d.bestMatch.player]||'#fff'}">${d.bestMatch.player}</div>
      <div class="sub">${d.bestMatch.score} poena, ${d.bestMatch.goals} golova na mapi ${d.bestMatch.map} (${fmtDate(d.bestMatch.date)}) — ${d.bestMatch.win ? 'pobeda' : 'poraz'}.</div>
    `});
  }

  if(d.boostKing){
    slides.push({ type:'stat', html: `
      <div class="kicker">Boost menadžment</div>
      <div class="icon-big">⚡</div>
      <div class="winner-name" style="color:${playerColor[d.boostKing.p]||'#fff'}">${d.boostKing.p}</div>
      <div class="sub">Samo ${d.boostKing.v.toFixed(1)}% vremena na praznom rezervoaru — najbolja disciplina u ekipi.</div>
    `});
  }

  slides.push({ type:'final', html: `
    <div class="kicker">Rezime sezone</div>
    <div class="headline">To je bilo to 🏁</div>
    <div class="recap-grid">
      <div class="recap-item"><div class="num">${d.matchCount}</div><div class="lbl">Mečeva</div></div>
      <div class="recap-item"><div class="num">${d.winPct}%</div><div class="lbl">Win rate</div></div>
      <div class="recap-item"><div class="num">${d.totalGoals}</div><div class="lbl">Golova</div></div>
      <div class="recap-item"><div class="num">${d.totalDemos}</div><div class="lbl">Demolicija</div></div>
    </div>
    <button class="wrapped-final-btn" id="wrappedReplayBtn">↺ Pusti ponovo</button>
  `});

  return slides;
}

function wrappedConfettiBurst(){
  const stage = $('#wrappedStage');
  if(!stage) return;
  const colors = ['#3DA9FC','#FF6B35','#4ADE80','#FBBF24','#C084FC','#fff'];
  for(let i = 0; i < 34; i++){
    const p = document.createElement('div');
    p.className = 'lootbox-confetti-piece';
    p.style.left = (40 + Math.random() * 20) + '%';
    p.style.top = '35%';
    const angle = Math.random() * Math.PI * 2;
    const dist = 140 + Math.random() * 220;
    p.style.setProperty('--cx', (Math.cos(angle) * dist) + 'px');
    p.style.setProperty('--cy', (Math.sin(angle) * dist - 60) + 'px');
    p.style.setProperty('--cr', (Math.random() * 480) + 'deg');
    p.style.background = colors[i % colors.length];
    p.style.zIndex = 20;
    p.style.animationDuration = (1 + Math.random() * 0.6) + 's';
    stage.appendChild(p);
    setTimeout(() => p.remove(), 1700);
  }
}

function openWrapped(){
  const data = computeWrappedData(wrappedRows.length ? wrappedRows : getFiltered());
  if(!data.matchCount) return;
  wrappedSlides = buildWrappedSlides(data);
  wrappedIndex = 0;

  const stage = $('#wrappedStage');
  stage.querySelectorAll('.wrapped-slide').forEach(el => el.remove());
  wrappedSlides.forEach((slide, i) => {
    const el = document.createElement('div');
    el.className = 'wrapped-slide';
    el.id = 'wslide-' + i;
    el.dataset.type = slide.type;
    el.innerHTML = slide.html;
    stage.appendChild(el);
  });

  const prog = $('#wrappedProgress');
  prog.innerHTML = wrappedSlides.map((_, i) => `<div class="seg" id="wseg-${i}"><span class="fill"></span></div>`).join('');

  $('#wrappedOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  if(window.SFX) SFX.whoosh();
  showWrappedSlide(0);
}

function closeWrapped(){
  $('#wrappedOverlay').classList.remove('open');
  document.body.style.overflow = '';
  clearTimeout(wrappedTimer);
}

function showWrappedSlide(i){
  clearTimeout(wrappedTimer);
  wrappedIndex = Math.max(0, Math.min(i, wrappedSlides.length - 1));

  document.querySelectorAll('.wrapped-slide').forEach((el, idx) => {
    el.classList.toggle('active', idx === wrappedIndex);
  });

  wrappedSlides.forEach((_, idx) => {
    const seg = $('#wseg-' + idx);
    if(!seg) return;
    seg.classList.remove('active','done');
    const fill = seg.querySelector('.fill');
    fill.style.transition = 'none';
    if(idx < wrappedIndex){ seg.classList.add('done'); fill.style.width = '100%'; }
    else{ fill.style.width = '0%'; }
  });

  const curSeg = $('#wseg-' + wrappedIndex);
  if(curSeg){
    curSeg.classList.add('active');
    const fill = curSeg.querySelector('.fill');
    requestAnimationFrame(() => {
      fill.style.transition = `width ${WRAPPED_SLIDE_MS}ms linear`;
      fill.style.width = '100%';
    });
  }

  const replayBtn = document.getElementById('wrappedReplayBtn');
  if(replayBtn) replayBtn.addEventListener('click', () => showWrappedSlide(0));

  if(wrappedIndex < wrappedSlides.length - 1){
    wrappedTimer = setTimeout(() => wrappedGo(1), WRAPPED_SLIDE_MS);
  }
}

function wrappedGo(dir){
  const next = wrappedIndex + dir;
  if(next < 0) return;
  if(next >= wrappedSlides.length) return;
  showWrappedSlide(next);
}


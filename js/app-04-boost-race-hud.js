// ================================================================
//  BOOST TAB FUNKCIJE (skraćeno)
// ================================================================

// ================================================================
//  LOVAC NA OBRASCE — automatska detekcija neobičnih korelacija
// ================================================================

const PATTERN_MIN_SAMPLE = 3;     // minimalan broj meceva da bi se sablon uopste razmatrao
const PATTERN_MIN_DEVIATION = 18; // minimalna razlika u procentnim poenima da bude "zanimljivo"

const DAY_NAMES_INSTR = ['Nedeljom','Ponedeljkom','Utorkom','Sredom','Četvrtkom','Petkom','Subotom'];

function hourBucketLabel(h){
  if(h >= 6 && h < 12) return 'Ujutru (6-12h)';
  if(h >= 12 && h < 18) return 'Popodne (12-18h)';
  if(h >= 18 && h < 24) return 'Uveče (18-24h)';
  return 'Posle ponoći (0-6h)';
}

function winPctOf(list){
  if(!list.length) return null;
  return (list.filter(r => r.win).length / list.length) * 100;
}

function pushPatternIfInteresting(found, { icon, groupRows, baseline, sampleSize, text }){
  if(sampleSize < PATTERN_MIN_SAMPLE) return;
  const pct = winPctOf(groupRows);
  if(pct == null) return;
  const dev = pct - baseline;
  if(Math.abs(dev) < PATTERN_MIN_DEVIATION) return;
  found.push({
    icon,
    weight: Math.abs(dev) * Math.log2(sampleSize + 1),
    html: text(pct, dev, baseline, sampleSize),
  });
}

function detectPatterns(rows){
  const found = [];
  if(!rows.length) return found;
  const overall = winPctOf(rows);

  // --- Auto po igraču (poređeno sa TIM igračevim sopstvenim prosekom) ---
  const byPlayer = {};
  rows.forEach(r => { (byPlayer[r.player] = byPlayer[r.player] || []).push(r); });
  Object.entries(byPlayer).forEach(([player, prows]) => {
    const baseline = winPctOf(prows);
    const byCar = {};
    prows.forEach(r => { if(r.car_name) (byCar[r.car_name] = byCar[r.car_name] || []).push(r); });
    Object.entries(byCar).forEach(([car, crows]) => {
      pushPatternIfInteresting(found, {
        icon: '🚗', groupRows: crows, baseline, sampleSize: crows.length,
        text: (pct, dev, base, n) => `Kad <b style="color:${playerColor[player]||'#fff'}">${player}</b> vozi <b>${car}</b>, tim ${dev>=0?'pobeđuje':'gubi'} <b class="${dev>=0?'pat-good':'pat-bad'}">${pct.toFixed(0)}%</b> mečeva <span class="pattern-baseline">(inače ${base.toFixed(0)}%, ${n} mečeva)</span>`,
      });
    });
  });

  // --- Mapa ---
  const byMap = {};
  rows.forEach(r => { if(r.map) (byMap[r.map] = byMap[r.map] || []).push(r); });
  Object.entries(byMap).forEach(([map, mrows]) => {
    pushPatternIfInteresting(found, {
      icon: '🗺️', groupRows: mrows, baseline: overall, sampleSize: mrows.length,
      text: (pct, dev, base, n) => `Na mapi <b>${map}</b> imate <b class="${dev>=0?'pat-good':'pat-bad'}">${pct.toFixed(0)}%</b> win rate <span class="pattern-baseline">(inače ${base.toFixed(0)}%, ${n} mečeva)</span>`,
    });
  });

  // --- Dan u nedelji ---
  const byDay = {};
  rows.forEach(r => {
    if(!r.date) return;
    const d = new Date(r.date);
    if(isNaN(d)) return;
    const k = d.getDay();
    (byDay[k] = byDay[k] || []).push(r);
  });
  Object.entries(byDay).forEach(([day, drows]) => {
    pushPatternIfInteresting(found, {
      icon: '📅', groupRows: drows, baseline: overall, sampleSize: drows.length,
      text: (pct, dev, base, n) => `${DAY_NAMES_INSTR[+day]} imate <b class="${dev>=0?'pat-good':'pat-bad'}">${pct.toFixed(0)}%</b> win rate <span class="pattern-baseline">(inače ${base.toFixed(0)}%, ${n} mečeva)</span>`,
    });
  });

  // --- Doba dana ---
  const byHour = {};
  rows.forEach(r => {
    if(!r.date) return;
    const d = new Date(r.date);
    if(isNaN(d)) return;
    const k = hourBucketLabel(d.getHours());
    (byHour[k] = byHour[k] || []).push(r);
  });
  Object.entries(byHour).forEach(([bucket, hrows]) => {
    pushPatternIfInteresting(found, {
      icon: '🕒', groupRows: hrows, baseline: overall, sampleSize: hrows.length,
      text: (pct, dev, base, n) => `${bucket} imate <b class="${dev>=0?'pat-good':'pat-bad'}">${pct.toFixed(0)}%</b> win rate <span class="pattern-baseline">(inače ${base.toFixed(0)}%, ${n} mečeva)</span>`,
    });
  });

  found.sort((a,b) => b.weight - a.weight);
  return found.slice(0, 6);
}

let patternList = [];
let patternIndex = 0;
let patternTimer = null;

function renderPatternHunter(rows){
  const card = $('#patternHunterCard');
  const body = $('#patternHunterBody');
  if(patternTimer){ clearInterval(patternTimer); patternTimer = null; }

  patternList = detectPatterns(rows);
  patternIndex = 0;

  if(!patternList.length){
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  body.innerHTML = `
    <div class="pattern-spotlight" id="patternSpotlight">
      <div class="pattern-icon">${patternList[0].icon}</div>
      <div class="pattern-text">${patternList[0].html}</div>
    </div>
    <div class="pattern-dots" id="patternDots">
      ${patternList.map((_,i) => `<span class="pattern-dot ${i===0?'active':''}" data-i="${i}"></span>`).join('')}
    </div>
  `;

  body.querySelectorAll('.pattern-dot').forEach(dot => {
    dot.addEventListener('click', () => showPattern(+dot.dataset.i, true));
  });

  if(patternList.length > 1){
    patternTimer = setInterval(() => showPattern((patternIndex + 1) % patternList.length), 6000);
  }
}

function showPattern(i, userTriggered){
  patternIndex = i;
  const spotlight = $('#patternSpotlight');
  if(!spotlight) return;
  spotlight.classList.add('fade-out');
  setTimeout(() => {
    const pat = patternList[i];
    if(!pat) return;
    spotlight.innerHTML = `<div class="pattern-icon">${pat.icon}</div><div class="pattern-text">${pat.html}</div>`;
    spotlight.classList.remove('fade-out');
  }, 220);
  document.querySelectorAll('.pattern-dot').forEach(d => d.classList.toggle('active', +d.dataset.i === i));
  if(userTriggered && patternTimer){
    clearInterval(patternTimer);
    patternTimer = setInterval(() => showPattern((patternIndex + 1) % patternList.length), 6000);
  }
}

// ================================================================
//  🌀 ŠTA BI BILO DA... — kontrafaktualni scenariji iz stvarnih podataka
// ================================================================

function buildSimple2v2Combos(rows){
  const seen = new Set();
  const groups = {};
  rows.forEach(r => {
    const key = r.replay_id + '|' + r.team_color;
    if(seen.has(key)) return;
    seen.add(key);
    const teamMembers = [...new Set([r.player, ...(r.teammates || [])])];
    if(teamMembers.length !== 2) return;
    const membersSorted = [...teamMembers].sort();
    const combKey = membersSorted.join(' & ');
    if(!groups[combKey]) groups[combKey] = { total:0, wins:0, members:membersSorted };
    groups[combKey].total++;
    if(r.win) groups[combKey].wins++;
  });
  return groups;
}

const WHATIF_MILESTONES = [
  { stat:'matches', label:'Veteran/Legenda', emoji:'🎯', fn: prows => prows.length, steps:[10,50,100] },
  { stat:'wins', label:'Kralj pobeda', emoji:'🏆', fn: prows => prows.filter(r=>r.win).length, steps:[10,25,50] },
  { stat:'goals', label:'Mašina za golove', emoji:'⚽', fn: prows => sum(prows.map(r=>getPath(r,'core.goals')||0)), steps:[50,100] },
  { stat:'assists', label:'Playmaker', emoji:'🎪', fn: prows => sum(prows.map(r=>getPath(r,'core.assists')||0)), steps:[25,50] },
  { stat:'saves', label:'Tvrđava', emoji:'🧤', fn: prows => sum(prows.map(r=>getPath(r,'core.saves')||0)), steps:[50,100] },
  { stat:'demos', label:'Demo kralj', emoji:'💥', fn: prows => sum(prows.map(r=>getPath(r,'demo.inflicted')||0)), steps:[20,50] },
  { stat:'mvps', label:'Super MVP', emoji:'⭐', fn: prows => prows.filter(r=>getPath(r,'core.mvp')).length, steps:[5,10] },
];

function detectCounterfactuals(rows){
  const found = [];
  if(!rows.length) return found;
  const ps = [...activePlayers];

  // --- A: promena plasmana da je poslednji poraz bio pobeda ---
  const rankRows = ps.map(p => {
    const prows = rows.filter(r => r.player === p);
    if(!prows.length) return null;
    const wins = prows.filter(r=>r.win).length;
    const pct = (wins/prows.length)*100;
    const lastLoss = prows.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||'')).reverse().find(r=>!r.win);
    return { p, prows, wins, pct, lastLoss };
  }).filter(Boolean);
  if(rankRows.length >= 2){
    const ranked = rankRows.slice().sort((a,b)=>b.pct-a.pct);
    const rankOf = (p) => ranked.findIndex(x=>x.p===p) + 1;
    rankRows.forEach(rr => {
      if(!rr.lastLoss) return;
      const newWins = rr.wins + 1;
      const newPct = (newWins/rr.prows.length)*100;
      const simulated = ranked.map(x => x.p===rr.p ? { ...x, pct:newPct } : x).sort((a,b)=>b.pct-a.pct);
      const newRank = simulated.findIndex(x=>x.p===rr.p) + 1;
      const oldRank = rankOf(rr.p);
      if(newRank < oldRank){
        found.push({
          icon:'📊', weight: (oldRank-newRank)*30 + 10,
          html: `Da je <b style="color:${playerColor[rr.p]||'#fff'}">${rr.p}</b>-ov poslednji poraz (${fmtDate(rr.lastLoss.date)} · ${mapDisplay(rr.lastLoss.map)}) bio pobeda, popeo bi se sa <b>#${oldRank}</b> na <b class="wi-good">#${newRank}</b> mesto po win rate-u <span class="whatif-baseline">(${rr.pct.toFixed(0)}% → ${newPct.toFixed(0)}%)</span>`,
        });
      }
    });
  }

  // --- B: bez crne serije win rate bi bio X% ---
  ps.forEach(p => {
    const prows = rows.filter(r => r.player === p);
    if(prows.length < 5) return;
    const sorted = prows.slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let curStart = -1, curLen = 0, bestStart = -1, bestLen = 0;
    sorted.forEach((r,i) => {
      if(!r.win){ if(curLen===0) curStart = i; curLen++; if(curLen>bestLen){ bestLen=curLen; bestStart=curStart; } }
      else curLen = 0;
    });
    if(bestLen < 3) return;
    const withoutStreak = sorted.filter((r,i) => i < bestStart || i >= bestStart+bestLen);
    if(!withoutStreak.length) return;
    const actualPct = (sorted.filter(r=>r.win).length/sorted.length)*100;
    const hypoPct = (withoutStreak.filter(r=>r.win).length/withoutStreak.length)*100;
    found.push({
      icon:'💭', weight: Math.abs(hypoPct-actualPct)*1.5 + bestLen*2,
      html: `Bez te crne serije od <b>${bestLen}</b> poraza zaredom, <b style="color:${playerColor[p]||'#fff'}">${p}</b>-ov win rate bi bio <b class="wi-good">${hypoPct.toFixed(0)}%</b> <span class="whatif-baseline">(trenutno ${actualPct.toFixed(0)}%)</span>`,
    });
  });

  // --- C: blizina sledećeg dostignuća ---
  let closest = null;
  ps.forEach(p => {
    const prows = rows.filter(r => r.player === p);
    if(!prows.length) return;
    WHATIF_MILESTONES.forEach(ms => {
      const val = ms.fn(prows);
      const next = ms.steps.find(s => s > val);
      if(next == null) return;
      const dist = next - val;
      const relDist = dist / next;
      if(!closest || relDist < closest.relDist){
        closest = { p, ms, val, next, dist, relDist };
      }
    });
  });
  if(closest && closest.dist > 0){
    found.push({
      icon: closest.ms.emoji, weight: (1 - closest.relDist) * 40,
      html: `<b style="color:${playerColor[closest.p]||'#fff'}">${closest.p}</b> je na samo <b class="wi-good">${closest.dist}</b> od sledećeg praga za "${closest.ms.label}" <span class="whatif-baseline">(trenutno ${closest.val}, treba ${closest.next})</span>`,
    });
  }

  // --- D: poređenje najbolje/najgore hemije ---
  const combos = buildSimple2v2Combos(rows);
  const comboArr = Object.entries(combos).map(([k,v]) => ({ key:k, ...v, pct: (v.wins/v.total)*100 })).filter(c => c.total >= 3);
  if(comboArr.length >= 2){
    const best = comboArr.slice().sort((a,b)=>b.pct-a.pct)[0];
    const worst = comboArr.slice().sort((a,b)=>a.pct-b.pct)[0];
    if(best.key !== worst.key){
      found.push({
        icon:'⚗️', weight: (best.pct - worst.pct) * 0.8,
        html: `Najbolja hemija: <b class="wi-good">${best.key}</b> sa <b>${best.pct.toFixed(0)}%</b> win rate-a <span class="whatif-baseline">(${best.total} mečeva)</span> — najgora: <b class="wi-bad">${worst.key}</b> sa <b>${worst.pct.toFixed(0)}%</b> <span class="whatif-baseline">(${worst.total} mečeva)</span>`,
      });
    }
  }

  found.sort((a,b) => b.weight - a.weight);
  return found.slice(0, 6);
}

let whatifList = [];
let whatifIndex = 0;
let whatifTimer = null;

// ================================================================
//  BAR CHART RACE — animirana "trka" kroz istoriju (canvas, bez biblioteka)
// ================================================================

const RACE_METRIC_FIELDS = {
  goals: r => getPath(r,'core.goals') || 0,
  wins: r => r.win ? 1 : 0,
  mvp: r => getPath(r,'core.mvp') ? 1 : 0,
  assists: r => getPath(r,'core.assists') || 0,
  saves: r => getPath(r,'core.saves') || 0,
};
const RACE_MONTH_NAMES = ['Jan','Feb','Mar','Apr','Maj','Jun','Jul','Avg','Sep','Okt','Nov','Dec'];

const raceState = {
  frames: [], players: [],
  metric: 'goals',
  playing: false, speed: 2, frameDurationMs: 900,
  playT: 0, lastTickTime: 0,
  currentValue: {}, currentRank: {},
  canvas: null, ctx: null, raf: null, rowHeight: 46,
};

function fmtMonthLabel(label){
  if(!label) return '—';
  const [y,m] = label.split('-').map(Number);
  return `${RACE_MONTH_NAMES[m-1]} ${y}.`;
}

function buildRaceFrames(rows, metricKey){
  const valueFn = RACE_METRIC_FIELDS[metricKey] || RACE_METRIC_FIELDS.goals;
  const players = [...new Set(rows.map(r => r.player))].filter(Boolean);
  const sorted = rows.slice().filter(r => r.date && r.player).sort((a,b) => (a.date||'').localeCompare(b.date||''));
  if(!sorted.length || !players.length) return { frames: [], players: [] };

  const monthKey = d => { const dt = new Date(d); return isNaN(dt) ? null : `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`; };
  const firstMonth = monthKey(sorted[0].date);
  const lastMonth = monthKey(sorted[sorted.length-1].date);
  if(!firstMonth || !lastMonth) return { frames: [], players: [] };

  const months = [];
  let [y, m] = firstMonth.split('-').map(Number);
  const [ly, lm] = lastMonth.split('-').map(Number);
  while(y < ly || (y === ly && m <= lm)){
    months.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if(m > 12){ m = 1; y++; }
  }
  if(months.length < 2) return { frames: [], players: [] };

  const cumulative = {};
  players.forEach(p => cumulative[p] = 0);

  let rowIdx = 0;
  const frames = months.map(mo => {
    while(rowIdx < sorted.length && monthKey(sorted[rowIdx].date) <= mo){
      const r = sorted[rowIdx];
      if(cumulative[r.player] != null) cumulative[r.player] += valueFn(r);
      rowIdx++;
    }
    return { label: mo, values: { ...cumulative } };
  });

  return { frames, players };
}

function raceInterpolatedFrame(playT){
  const frames = raceState.frames;
  const n = frames.length;
  if(n === 0) return { values: {}, label: null };
  const idx = Math.max(0, Math.min(n-1, Math.floor(playT)));
  const nextIdx = Math.min(n-1, idx+1);
  const frac = playT - idx;
  const a = frames[idx].values, b = frames[nextIdx].values;
  const out = {};
  raceState.players.forEach(p => { const va = a[p]||0, vb = b[p]||0; out[p] = va + (vb-va)*frac; });
  return { values: out, label: frames[idx].label };
}

function raceRoundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, h/2, Math.max(0,w)/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

function drawRace(){
  const st = raceState;
  if(st.canvas && st.ctx && st.frames.length){
    const { ctx, canvas } = st;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);

    const now = performance.now();
    const dt = st.lastTickTime ? Math.min((now - st.lastTickTime)/1000, 0.1) : 0;
    st.lastTickTime = now;

    if(st.playing){
      const secPerFrame = (st.frameDurationMs/1000) / st.speed;
      st.playT += secPerFrame > 0 ? dt / secPerFrame : 0;
      if(st.playT >= st.frames.length - 1){
        st.playT = st.frames.length - 1;
        st.playing = false;
        updateRacePlayButton();
      }
      updateRaceScrubber();
    }

    const { values: targetValues, label } = raceInterpolatedFrame(st.playT);
    const badge = $('#raceDateBadge');
    if(badge) badge.textContent = fmtMonthLabel(label);

    const ranked = st.players.slice().sort((a,b) => (targetValues[b]||0) - (targetValues[a]||0));
    const targetRank = {};
    ranked.forEach((p,i) => { targetRank[p] = i; });

    st.players.forEach(p => {
      st.currentValue[p] = targetValues[p] || 0;
      if(st.currentRank[p] == null) st.currentRank[p] = targetRank[p];
      st.currentRank[p] += (targetRank[p] - st.currentRank[p]) * Math.min(1, dt*6);
    });

    const maxVal = Math.max(1, ...Object.values(st.currentValue));
    const topN = Math.min(st.players.length, 8);
    const visible = st.players.filter(p => st.currentRank[p] < topN + 0.5);

    const padLeft = 120, padRight = 66, padTop = 46;
    const rowH = Math.min(st.rowHeight, Math.max(24, (h - padTop*2) / topN));
    const barMaxW = Math.max(20, w - padLeft - padRight);

    visible.forEach(p => {
      const y = padTop + st.currentRank[p] * rowH;
      const val = st.currentValue[p];
      const barW = Math.max(0, (val / maxVal) * barMaxW);
      const color = playerColor[p] || '#8A93A3';

      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.font = "700 14px 'Rajdhani', sans-serif";
      ctx.fillStyle = color;
      ctx.fillText(p, padLeft - 12, y + rowH/2);

      const grad = ctx.createLinearGradient(padLeft, 0, padLeft+Math.max(1,barW), 0);
      grad.addColorStop(0, color + 'cc');
      grad.addColorStop(1, color);
      ctx.fillStyle = grad;
      const barH = rowH * 0.6;
      raceRoundRect(ctx, padLeft, y + (rowH-barH)/2, Math.max(2,barW), barH, 6);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.font = "700 12.5px 'JetBrains Mono', monospace";
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillText(Math.round(val).toString(), padLeft + barW + 10, y + rowH/2);
    });
  }
  raceState.raf = requestAnimationFrame(drawRace);
}

function updateRacePlayButton(){
  const btn = $('#racePlayBtn');
  if(!btn) return;
  if(raceState.playing){ btn.textContent = '⏸ Pauziraj'; btn.classList.add('playing'); }
  else if(raceState.frames.length && raceState.playT >= raceState.frames.length - 1){ btn.textContent = '↻ Ponovo'; btn.classList.remove('playing'); }
  else { btn.textContent = '▶ Pusti istoriju'; btn.classList.remove('playing'); }
}
function updateRaceScrubber(){
  const el = $('#raceScrubber');
  if(!el || raceState.frames.length < 2) return;
  const pct = raceState.playT / Math.max(1, raceState.frames.length - 1);
  el.value = Math.round(pct * 1000);
}

function resizeRaceCanvas(){
  const wrap = $('#raceWrap');
  const canvas = raceState.canvas;
  if(!wrap || !canvas) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  if(w < 4 || h < 4) return;
  canvas.width = w;
  canvas.height = h;
}
function startRaceLoop(){ resizeRaceCanvas(); if(!raceState.raf) raceState.raf = requestAnimationFrame(drawRace); }
function stopRaceLoop(){ if(raceState.raf){ cancelAnimationFrame(raceState.raf); raceState.raf = null; } }

function initRaceInteractions(){
  const canvas = $('#raceCanvas');
  if(!canvas) return;
  raceState.canvas = canvas;
  raceState.ctx = canvas.getContext('2d');

  $('#racePlayBtn').addEventListener('click', () => {
    if(!raceState.frames.length) return;
    if(raceState.playT >= raceState.frames.length - 1){ raceState.playT = 0; raceState.currentRank = {}; }
    raceState.playing = !raceState.playing;
    updateRacePlayButton();
  });

  $('#raceScrubber').addEventListener('input', e => {
    if(!raceState.frames.length) return;
    raceState.playing = false;
    updateRacePlayButton();
    const pct = +e.target.value / 1000;
    raceState.playT = pct * (raceState.frames.length - 1);
  });

  document.querySelectorAll('.race-speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.race-speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      raceState.speed = +btn.dataset.speed;
    });
  });

  $('#raceMetricSelect').addEventListener('change', () => renderRace(getFiltered()));

  window.addEventListener('resize', () => {
    if($('#tab-race').classList.contains('active')) resizeRaceCanvas();
  });
}

function renderRace(rows){
  const sel = $('#raceMetricSelect');
  const metric = sel ? sel.value : 'goals';
  raceState.metric = metric;
  const { frames, players } = buildRaceFrames(rows, metric);
  raceState.frames = frames;
  raceState.players = players;
  raceState.playing = false;
  raceState.playT = 0;
  raceState.currentValue = {};
  raceState.currentRank = {};

  const emptyEl = $('#raceEmpty');
  if(emptyEl){
    if(!frames.length){
      emptyEl.style.display = 'block';
      emptyEl.textContent = 'Nema dovoljno podataka za trku (treba bar par meseci istorije).';
    } else {
      emptyEl.style.display = 'none';
    }
  }
  updateRacePlayButton();
  updateRaceScrubber();
}

function renderWhatIf(rows){
  const card = $('#whatIfCard');
  const body = $('#whatIfBody');
  if(!card || !body) return;
  if(whatifTimer){ clearInterval(whatifTimer); whatifTimer = null; }

  whatifList = detectCounterfactuals(rows);
  whatifIndex = 0;

  if(!whatifList.length){
    card.style.display = 'none';
    return;
  }
  card.style.display = '';

  body.innerHTML = `
    <div class="whatif-spotlight" id="whatifSpotlight">
      <div class="whatif-icon">${whatifList[0].icon}</div>
      <div class="whatif-text">${whatifList[0].html}</div>
    </div>
    <div class="whatif-dots" id="whatifDots">
      ${whatifList.map((_,i) => `<span class="whatif-dot ${i===0?'active':''}" data-i="${i}"></span>`).join('')}
    </div>
  `;

  body.querySelectorAll('.whatif-dot').forEach(dot => {
    dot.addEventListener('click', () => showWhatIf(+dot.dataset.i, true));
  });

  if(whatifList.length > 1){
    whatifTimer = setInterval(() => showWhatIf((whatifIndex + 1) % whatifList.length), 7000);
  }
}

function showWhatIf(i, userTriggered){
  whatifIndex = i;
  const spotlight = $('#whatifSpotlight');
  if(!spotlight) return;
  spotlight.classList.add('fade-out');
  setTimeout(() => {
    const wi = whatifList[i];
    if(!wi) return;
    spotlight.innerHTML = `<div class="whatif-icon">${wi.icon}</div><div class="whatif-text">${wi.html}</div>`;
    spotlight.classList.remove('fade-out');
  }, 220);
  document.querySelectorAll('.whatif-dot').forEach(d => d.classList.toggle('active', +d.dataset.i === i));
  if(userTriggered && whatifTimer){
    clearInterval(whatifTimer);
    whatifTimer = setInterval(() => showWhatIf((whatifIndex + 1) % whatifList.length), 7000);
  }
}

// ================================================================
//  PRAVI RL HUD — SVG kružni merači (bez ijedne nove biblioteke)
// ================================================================

const HUD_RING_R = 50;
const HUD_RING_C = 2 * Math.PI * HUD_RING_R; // obim kruga

// Jednostavan prsten (jedna vrednost 0-100%), animira se od praznog ka punom.
function buildRingGauge(pct, color){
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = HUD_RING_C * (1 - clamped / 100);
  return `
    <svg viewBox="0 0 120 120">
      <circle class="hud-ring-track" cx="60" cy="60" r="${HUD_RING_R}"/>
      <circle class="hud-ring-fill" cx="60" cy="60" r="${HUD_RING_R}"
        transform="rotate(-90 60 60)" style="color:${color}; stroke:${color};"
        stroke-dasharray="${HUD_RING_C}" stroke-dashoffset="${HUD_RING_C}" data-offset="${offset}"/>
    </svg>
  `;
}

// Segmentirani "kompas" prsten - vise vrednosti kao lukovi razlicitih boja jedan za drugim.
function buildCompassDonut(segments){
  const total = segments.reduce((s,seg) => s + Math.max(0, seg.value), 0) || 1;
  let cumulative = 0;
  const circles = segments.map(seg => {
    const frac = Math.max(0, seg.value) / total;
    const len = HUD_RING_C * frac;
    const rotateDeg = -90 + cumulative * 360;
    cumulative += frac;
    return `<circle class="hud-ring-fill" cx="60" cy="60" r="${HUD_RING_R}"
      transform="rotate(${rotateDeg} 60 60)" style="color:${seg.color}; stroke:${seg.color};"
      stroke-dasharray="${len} ${HUD_RING_C}" stroke-dashoffset="0" data-offset="0"/>`;
  }).join('');
  return `
    <svg viewBox="0 0 120 120">
      <circle class="hud-ring-track" cx="60" cy="60" r="${HUD_RING_R}"/>
      ${circles}
    </svg>
  `;
}

// Pokrene animaciju punjenja prstena (mora posle umetanja u DOM, u sledecem frejmu).
function animateHudRings(container){
  requestAnimationFrame(() => {
    container.querySelectorAll('.hud-ring-fill[data-offset]').forEach(el => {
      el.style.strokeDashoffset = el.dataset.offset;
    });
  });
}

function renderBoostHud(rows){
  const wrap = $('#boostHud');
  const ps = [...activePlayers].sort();
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  wrap.innerHTML = ps.map(p => {
    const value = avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'boost.avg_amount')||0));
    const color = playerColor[p] || '#FBBF24';
    return `
      <div class="hud-gauge-card">
        <div class="hud-ring-wrap">
          ${buildRingGauge(value, color)}
          <div class="hud-ring-center">
            <div class="hud-ring-value mono" style="color:${color}">${value.toFixed(0)}</div>
            <div class="hud-ring-unit">BOOST</div>
          </div>
        </div>
        <div class="hud-gauge-name" style="color:${color}">${p}</div>
      </div>
    `;
  }).join('');
  animateHudRings(wrap);
}

const HUD_MAX_SPEED = 2300; // uu/s, priblizno supersonic prag u igri

function renderSpeedHud(rows){
  const wrap = $('#speedHud');
  const ps = [...activePlayers].sort();
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  wrap.innerHTML = ps.map(p => {
    const value = avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'movement.avg_speed')||0));
    const pct = (value / HUD_MAX_SPEED) * 100;
    const color = playerColor[p] || '#3DA9FC';
    return `
      <div class="hud-gauge-card">
        <div class="hud-ring-wrap">
          ${buildRingGauge(pct, color)}
          <div class="hud-ring-center">
            <div class="hud-ring-value mono" style="color:${color}">${value.toFixed(0)}</div>
            <div class="hud-ring-unit">UU/S</div>
          </div>
        </div>
        <div class="hud-gauge-name" style="color:${color}">${p}</div>
      </div>
    `;
  }).join('');
  animateHudRings(wrap);
}

const HUD_ZONE_COLORS = { def:'#3DA9FC', neu:'#8A93A3', off:'#FF6B35' };
const HUD_ZONE_LABELS = { def:'ODBRANA', neu:'SREDINA', off:'NAPAD' };

function renderPositionHud(rows){
  const wrap = $('#posHud');
  const ps = [...activePlayers].sort();
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  wrap.innerHTML = ps.map(p => {
    const prows = rows.filter(r=>r.player===p);
    const def = avg(prows.map(r=>getPath(r,'positioning.percent_defensive_third')||0));
    const off = avg(prows.map(r=>getPath(r,'positioning.percent_offensive_third')||0));
    const neu = Math.max(0, 100 - def - off);
    const color = playerColor[p] || '#8A93A3';

    const zones = [{k:'def',v:def},{k:'neu',v:neu},{k:'off',v:off}];
    const dominant = zones.reduce((a,b) => b.v > a.v ? b : a);

    return `
      <div class="hud-gauge-card">
        <div class="hud-ring-wrap">
          ${buildCompassDonut([
            {value:def, color:HUD_ZONE_COLORS.def},
            {value:neu, color:HUD_ZONE_COLORS.neu},
            {value:off, color:HUD_ZONE_COLORS.off},
          ])}
          <div class="hud-ring-center">
            <div class="hud-ring-value mono" style="color:${HUD_ZONE_COLORS[dominant.k]}; font-size:15px;">${HUD_ZONE_LABELS[dominant.k]}</div>
            <div class="hud-ring-unit">${dominant.v.toFixed(0)}%</div>
          </div>
        </div>
        <div class="hud-gauge-name" style="color:${color}">${p}</div>
        <div class="hud-compass-legend">
          <span><i style="background:${HUD_ZONE_COLORS.def}"></i>${def.toFixed(0)}%</span>
          <span><i style="background:${HUD_ZONE_COLORS.neu}"></i>${neu.toFixed(0)}%</span>
          <span><i style="background:${HUD_ZONE_COLORS.off}"></i>${off.toFixed(0)}%</span>
        </div>
      </div>
    `;
  }).join('');
  animateHudRings(wrap);
}

function renderBpmChart(rows){
  const ps = [...activePlayers].sort();
  const bpm = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'boost.bpm')||0)));
  destroyChart('bpm');
  charts.bpm = new Chart($('#bpmChart'), {
    type:'bar',
    data:{ labels:ps, datasets:[{ label:'BPM', data:bpm, backgroundColor:ps.map(p=>playerColor[p]) }] },
    options:{ responsive:true, plugins:{legend:{display:false}},
      scales:{ x:{ticks:{color:'#8A93A3'},grid:{display:false}}, y:{ticks:{color:'#8A93A3'},grid:{color:'rgba(255,255,255,0.05)'}} } }
  });
}

function renderBoostDistChart(rows){
  const ps = [...activePlayers].sort();
  const buckets = ['percent_boost_0_25','percent_boost_25_50','percent_boost_50_75','percent_boost_75_100'];
  const bucketLabels = ['0-25','25-50','50-75','75-100'];
  const colors = ['#F87171','#FBBF24','#4ADE80','#3DA9FC'];
  const datasets = buckets.map((b,i) => ({
    label: bucketLabels[i]+'%',
    data: ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'boost.'+b)||0))),
    backgroundColor: colors[i],
  }));
  destroyChart('boostDist');
  charts.boostDist = new Chart($('#boostDistChart'), {
    type:'bar',
    data:{ labels:ps, datasets },
    options:{ responsive:true, plugins:{legend:{labels:{color:'#8A93A3'}}},
      scales:{ x:{stacked:true,ticks:{color:'#8A93A3'},grid:{display:false}}, y:{stacked:true,max:100,ticks:{color:'#8A93A3',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.05)'}} } }
  });
}

function statTable(tableId, rows, players_, columns){
  const table = $(tableId);
  table.querySelector('thead').innerHTML = '<tr><th>Igrač</th>' + columns.map(c=>`<th class="mono">${c.label}</th>`).join('') + '</tr>';
  table.querySelector('tbody').innerHTML = players_.map(p => {
    const prows = rows.filter(r => r.player === p);
    return '<tr><td style="color:'+playerColor[p]+';font-weight:600;">'+p+'</td>' +
      columns.map(c => {
        const v = avg(prows.map(r => getPath(r, c.key) || 0));
        return `<td class="mono">${c.fmt ? c.fmt(v) : v.toFixed(1)}</td>`;
      }).join('') + '</tr>';
  }).join('');
}

function renderBoostTable(rows){
  const ps = [...activePlayers].sort();
  statTable('#boostTable', rows, ps, [
    {key:'boost.bpm', label:'BPM'},
    {key:'boost.avg_amount', label:'Prosek'},
    {key:'boost.amount_collected', label:'Sakupljeno'},
    {key:'boost.amount_stolen', label:'Ukradeno'},
    {key:'boost.count_collected_big', label:'Veliki pedovi'},
    {key:'boost.count_collected_small', label:'Mali pedovi'},
    {key:'boost.amount_overfill', label:'Overfill'},
    {key:'boost.percent_zero_boost', label:'% na 0', fmt:v=>v.toFixed(1)+'%'},
    {key:'boost.percent_full_boost', label:'% na 100', fmt:v=>v.toFixed(1)+'%'},
  ]);
}


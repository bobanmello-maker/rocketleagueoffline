// ================================================================
//  LOAD I RENDER FUNKCIJE
// ================================================================

async function load(){
  try{
    const res = await fetch('./data.json');
    RAW = await res.json();
  }catch(e){ RAW = []; }

  RAW = RAW.map(r => {
    const mappedTeammateStats = {};
    if(r.teammate_stats){
      Object.entries(r.teammate_stats).forEach(([name, stats]) => {
        mappedTeammateStats[mapName(name)] = stats;
      });
    }
    return {
      ...r,
      player: mapName(r.player),
      teammates: (r.teammates || []).map(mapName),
      teammate_stats: mappedTeammateStats,
    };
  });

  if(!RAW.length){
    $('#content').innerHTML = `<div class="empty">Nema podataka jos uvek.<br><b>data.json</b> je prazan ili ga fetch_stats.py jos nije generisao.<br>Pokreni GitHub Action "Update RL stats" (tab Actions &rarr; Run workflow).</div>`;
    document.getElementById('tabbar').style.display = 'none';
    return;
  }

  allPlayers = [...new Set(RAW.map(r => r.player))].sort();
  let colorIdx = 0;
  allPlayers.forEach(p => {
    if(PLAYER_COLOR_OVERRIDES[p]){
      playerColor[p] = PLAYER_COLOR_OVERRIDES[p];
    } else {
      playerColor[p] = PALETTE[colorIdx % PALETTE.length];
      colorIdx++;
    }
  });

  checkForNewAchievements();

  refreshVisiblePlayers();
  buildDateInputs();
  buildTrendMetricSelect();
  buildTabs();

  $('#dateFrom').addEventListener('change', render);
  $('#dateTo').addEventListener('change', render);
  $('#trendMetric').addEventListener('change', render);
  document.querySelectorAll('.mode-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      modeFilter = btn.dataset.mode;
      refreshVisiblePlayers();
      renderFormMarquee();
      render();
    });
  });
  document.querySelectorAll('.chem-mode-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chem-mode-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      chemMode = btn.dataset.chemmode;
      chemCurrentPage = 1;
      render();
    });
  });
  $('#chemPrevPageBtn').addEventListener('click', () => {
    if(chemCurrentPage > 1){ chemCurrentPage--; render(); }
  });
  $('#chemNextPageBtn').addEventListener('click', () => {
    chemCurrentPage++; render();
  });
  $('#resetBtn').addEventListener('click', () => {
    $('#dateFrom').value = ''; $('#dateTo').value = '';
    modeFilter = 'offline';
    document.querySelectorAll('.mode-chip').forEach(c => c.classList.remove('active'));
    $('.mode-chip[data-mode="offline"]').classList.add('active');
    refreshVisiblePlayers();
    renderFormMarquee();
    render();
  });
  document.querySelectorAll('#matchTable th[data-key]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if(sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
      render();
    });
  });
  $('#modalBackdrop').addEventListener('click', e => { if(e.target.id === 'modalBackdrop') closeModal(); });

  $('#highlightsViewToggle').textContent = highlightsViewMode === 'shelf' ? '🏛️ Vitrina' : '▦ Mreža';
  $('#highlightsViewToggle').addEventListener('click', () => {
    highlightsViewMode = highlightsViewMode === 'shelf' ? 'grid' : 'shelf';
    try{ localStorage.setItem('rl_highlights_view', highlightsViewMode); }catch(e){}
    $('#highlightsViewToggle').textContent = highlightsViewMode === 'shelf' ? '🏛️ Vitrina' : '▦ Mreža';
    renderMilestones(getFiltered());
  });
  $('#lootboxManualBtn').addEventListener('click', openManualLootBox);

  $('#wrappedGoBtn').addEventListener('click', openWrapped);
  $('#wrappedCloseBtn').addEventListener('click', closeWrapped);
  $('#wrappedNavLeft').addEventListener('click', () => wrappedGo(-1));
  $('#wrappedNavRight').addEventListener('click', () => wrappedGo(1));
  initStarMapInteractions();
  initRaceInteractions();
  document.addEventListener('keydown', e => {
    if(!$('#wrappedOverlay').classList.contains('open')) return;
    if(e.key === 'Escape') closeWrapped();
    else if(e.key === 'ArrowRight') wrappedGo(1);
    else if(e.key === 'ArrowLeft') wrappedGo(-1);
  });
  let wrappedTouchX = null;
  $('#wrappedStage').addEventListener('touchstart', e => { wrappedTouchX = e.touches[0].clientX; }, {passive:true});
  $('#wrappedStage').addEventListener('touchend', e => {
    if(wrappedTouchX == null) return;
    const dx = e.changedTouches[0].clientX - wrappedTouchX;
    if(Math.abs(dx) > 40) wrappedGo(dx < 0 ? 1 : -1);
    wrappedTouchX = null;
  }, {passive:true});

  renderFormMarquee();
  render();
}

function buildTabs(){
  document.querySelectorAll('.tabbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabbtn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tabpanel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#tab-' + btn.dataset.tab).classList.add('active');
      if(btn.dataset.tab === 'matches') startStarMapLoop(); else stopStarMapLoop();
      if(btn.dataset.tab === 'race') startRaceLoop(); else stopRaceLoop();
      if(btn.dataset.tab === 'h2h') maybePlayVsIntro(true);
    });
  });

  document.querySelectorAll('.ov-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ov-subtab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.ov-subpanel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $('#ovsub-' + btn.dataset.ovsub).classList.add('active');
    });
  });
}

function refreshVisiblePlayers(){
  const modeRows = modeFilter === 'all' ? RAW : RAW.filter(r => r.mode === modeFilter);
  players = [...new Set(modeRows.map(r => r.player))].sort();
  activePlayers = new Set(players);
  buildChips();
}

function buildChips(){
  const wrap = $('#playerChips');
  wrap.innerHTML = '';
  players.forEach((p, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip active';
    chip.dataset.idx = i % 4;
    chip.textContent = p;
    chip.addEventListener('click', () => {
      if(activePlayers.has(p)){ activePlayers.delete(p); chip.classList.remove('active'); }
      else { activePlayers.add(p); chip.classList.add('active'); }
      render();
    });
    wrap.appendChild(chip);
  });
}

function buildDateInputs(){
  const dates = RAW.map(r => r.date).filter(Boolean).sort();
  if(dates.length){
    $('#dateFrom').min = dates[0].slice(0,10);
    $('#dateFrom').max = dates[dates.length-1].slice(0,10);
    $('#dateTo').min = dates[0].slice(0,10);
    $('#dateTo').max = dates[dates.length-1].slice(0,10);
  }
}

function buildTrendMetricSelect(){
  const sel = $('#trendMetric');
  sel.innerHTML = TREND_METRICS.map(m => `<option value="${m.key}">${m.label}</option>`).join('');
}

function getFiltered(){
  const from = $('#dateFrom').value;
  const to = $('#dateTo').value;
  return RAW.filter(r => {
    if(!activePlayers.has(r.player)) return false;
    if(modeFilter !== 'all' && r.mode !== modeFilter) return false;
    if(from && r.date && r.date.slice(0,10) < from) return false;
    if(to && r.date && r.date.slice(0,10) > to) return false;
    return true;
  });
}

function destroyChart(key){ if(charts[key]){ charts[key].destroy(); delete charts[key]; } }

// ================================================================
//  🍞 TOAST — kratka povratna poruka (npr. "Kopirano!")
// ================================================================
function showToast(msg, duration){
  const el = $('#rlToast');
  if(!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => el.classList.remove('show'), duration || 2200);
}

// ================================================================
//  🏅 POWER RANKINGS — kombinovan nedeljni rang (forma + uticaj +
//  niz pobeda), sa strelicama pomeranja u odnosu na prošlu nedelju
//  (snapshot čuvan lokalno po ISO nedelji).
// ================================================================
function getISOWeekKey(d){
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}

function computePowerScore(rows, player){
  const pis = computePIS(rows, player);
  if(pis === null) return null;
  const prows = rows.filter(r => r.player === player).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
  const matches = prows.length;
  const recentN = prows.slice(-10);
  const recentWinPct = recentN.length ? (recentN.filter(r=>r.win).length / recentN.length) * 100 : 0;

  let streak = 0, streakWin = null;
  for(let i = prows.length - 1; i >= 0; i--){
    const w = !!prows[i].win;
    if(streakWin === null){ streakWin = w; streak = 1; }
    else if(w === streakWin){ streak++; }
    else break;
  }
  const streakBonus = (streakWin ? 1 : -1) * Math.min(streak, 6) * 1.5;
  const formBonus = (recentWinPct - 50) / 10;

  return {
    score: Math.round((pis + formBonus + streakBonus) * 10) / 10,
    matches, recentWinPct, streak, streakWin,
  };
}

function powerRankReason(entry){
  if(entry.streak >= 2){
    return entry.streakWin
      ? `${entry.streak} pobeda zaredom ga drži gore.`
      : `${entry.streak} poraza zaredom su ga koštala mesta.`;
  }
  if(entry.recentWinPct >= 65) return `Odlična skorašnja forma (${Math.round(entry.recentWinPct)}% u poslednjih ${Math.min(entry.matches,10)}).`;
  if(entry.recentWinPct <= 35) return `Slaba skorašnja forma (${Math.round(entry.recentWinPct)}% u poslednjih ${Math.min(entry.matches,10)}).`;
  return 'Stabilan učinak.';
}

function renderPowerRankings(rows){
  const body = $('#powerRankBody');
  if(!body) return;
  const ps = [...activePlayers];
  if(ps.length < 2){ body.innerHTML = '<div class="empty">Treba bar 2 izabrana igrača</div>'; return; }

  const entries = ps.map(p => {
    const stat = computePowerScore(rows, p);
    return stat ? { p, ...stat } : null;
  }).filter(Boolean);

  if(!entries.length){ body.innerHTML = '<div class="empty">Nema dovoljno podataka</div>'; return; }

  entries.sort((a,b) => b.score - a.score);
  entries.forEach((e,i) => e.rank = i+1);

  let store = {};
  try{ store = JSON.parse(localStorage.getItem('rl_power_rankings_v1') || '{}'); }catch(e){ store = {}; }

  const thisWeekKey = getISOWeekKey(new Date());
  const prevDate = new Date(); prevDate.setDate(prevDate.getDate() - 7);
  const prevWeekKey = getISOWeekKey(prevDate);
  const prevRanks = (store[prevWeekKey] && store[prevWeekKey].ranks) || null;

  store[thisWeekKey] = { savedAt: new Date().toISOString(), ranks: Object.fromEntries(entries.map(e => [e.p, e.rank])) };
  const keys = Object.keys(store).sort();
  if(keys.length > 12) keys.slice(0, keys.length - 12).forEach(k => delete store[k]);
  try{ localStorage.setItem('rl_power_rankings_v1', JSON.stringify(store)); }catch(e){}

  const medals = ['🥇','🥈','🥉'];
  body.innerHTML = entries.map(e => {
    const prevRank = prevRanks ? prevRanks[e.p] : null;
    const delta = (prevRanks && prevRank != null) ? prevRank - e.rank : null;
    let deltaHtml;
    if(delta === null) deltaHtml = `<div class="power-rank-delta new">NOVO</div>`;
    else if(delta > 0) deltaHtml = `<div class="power-rank-delta up">↑${delta}</div>`;
    else if(delta < 0) deltaHtml = `<div class="power-rank-delta down">↓${Math.abs(delta)}</div>`;
    else deltaHtml = `<div class="power-rank-delta same">=</div>`;

    return `
      <div class="power-rank-row">
        <div class="power-rank-pos">${medals[e.rank-1] || '#'+e.rank}</div>
        <div class="power-rank-info">
          <div class="power-rank-name" style="color:${playerColor[e.p]}">${e.p}</div>
          <div class="power-rank-comment">${powerRankReason(e)}</div>
        </div>
        <div class="power-rank-score">${e.score}</div>
        ${deltaHtml}
      </div>`;
  }).join('');
}

// ================================================================
//  📅 NA OVAJ DAN — uspomena iz prošlih sezona (ista kalendarska
//  nedelja/dan, iz cele istorije, nezavisno od aktivnih filtera).
// ================================================================
function computeOnThisDay(){
  const today = new Date();
  const mm = String(today.getMonth()+1).padStart(2,'0');
  const dd = String(today.getDate()).padStart(2,'0');
  const curYear = String(today.getFullYear());

  const matches = RAW.filter(r => {
    if(!r.date) return false;
    const d = r.date.slice(0,10);
    return d.slice(5,7) === mm && d.slice(8,10) === dd && d.slice(0,4) !== curYear;
  });
  if(!matches.length) return null;

  const byReplay = {};
  matches.forEach(r => { if(r.replay_id) (byReplay[r.replay_id] = byReplay[r.replay_id] || []).push(r); });
  const replayIds = Object.keys(byReplay);
  if(!replayIds.length) return null;
  const chosenId = replayIds[Math.floor(Math.random() * replayIds.length)];
  const matchRows = byReplay[chosenId];

  const standout = matchRows.reduce((best, r) => (getPath(r,'core.goals')||0) > (getPath(best,'core.goals')||0) ? r : best, matchRows[0]);
  const yearsAgo = today.getFullYear() - Number(matchRows[0].date.slice(0,4));
  const rep = matchRows[0];

  return { yearsAgo, rep, standout, standoutGoals: getPath(standout,'core.goals') || 0 };
}

function renderOnThisDay(){
  const card = $('#onThisDayCard'), body = $('#onThisDayBody');
  if(!card || !body) return;
  const info = computeOnThisDay();
  if(!info){ card.style.display = 'none'; return; }
  card.style.display = '';

  const { yearsAgo, rep, standout, standoutGoals } = info;
  const yearsLabel = yearsAgo === 1 ? 'pre godinu dana' : `pre ${yearsAgo} godine`;
  let extra = '';
  if(standoutGoals >= 2){
    extra = ` <b style="color:${playerColor[standout.player]}">${standout.player}</b> je te večeri ubacio ${standoutGoals} gola.`;
  }

  body.innerHTML = `
    <div class="on-this-day-emoji">🕰️</div>
    <div class="on-this-day-text">
      Na ovaj dan <b>${yearsLabel}</b>: rezultat <b>${rep.team_goals}–${rep.opponent_goals}</b> na ${mapDisplay ? mapDisplay(rep.map) : (rep.map||'nepoznatoj mapi')}.${extra}
    </div>`;
}

// ================================================================
//  📋 REZIME NEDELJE — automatski generisan tekst spreman za
//  lepljenje u grupni chat (Viber/WhatsApp), iz poslednjih 7 dana.
// ================================================================
function computeWeekSummaryText(){
  const now = new Date();
  const weekAgo = new Date(); weekAgo.setDate(now.getDate() - 7);
  const fromStr = weekAgo.toISOString().slice(0,10);
  const modeRows = modeFilter === 'all' ? RAW : RAW.filter(r => r.mode === modeFilter);
  const wRows = modeRows.filter(r => r.date && r.date.slice(0,10) >= fromStr);

  if(!wRows.length) return '⚽ Nema odigranih mečeva u poslednjih 7 dana.';

  const byReplay = {};
  wRows.forEach(r => { if(r.replay_id) (byReplay[r.replay_id] = byReplay[r.replay_id] || []).push(r); });
  const matches = Object.values(byReplay);
  const matchCount = matches.length;

  const ps = [...new Set(wRows.map(r => r.player))].sort();

  // ===== zbirno za ekipu =====
  const teamWins = matches.filter(rs => rs[0].win).length;
  const teamWinPct = matchCount ? Math.round((teamWins/matchCount)*100) : 0;
  const totalGoalsFor = sum(matches.map(rs => rs[0].team_goals||0));
  const goalsPerMatch = matchCount ? (totalGoalsFor/matchCount).toFixed(1) : '0';

  // ===== po igracu =====
  const perPlayer = {};
  ps.forEach(p => {
    const prows = wRows.filter(r => r.player === p);
    perPlayer[p] = {
      matches: prows.length,
      wins: prows.filter(r=>r.win).length,
      goals: sum(prows.map(r=>getPath(r,'core.goals')||0)),
      assists: sum(prows.map(r=>getPath(r,'core.assists')||0)),
      saves: sum(prows.map(r=>getPath(r,'core.saves')||0)),
      demos: sum(prows.map(r=>getPath(r,'demo.inflicted')||0)),
      mvp: prows.filter(r=>getPath(r,'core.mvp')).length,
      zeroBoostPct: avg(prows.map(r=>getPath(r,'boost.percent_zero_boost')||0)),
    };
  });

  const topMvpEntry = Object.entries(perPlayer).filter(([,v])=>v.mvp>0).sort((a,b)=>b[1].mvp-a[1].mvp)[0];
  const topScorerEntry = Object.entries(perPlayer).filter(([,v])=>v.goals>0).sort((a,b)=>b[1].goals-a[1].goals)[0];

  const bestRecord = Object.entries(perPlayer)
    .filter(([,v]) => v.matches >= 2)
    .sort((a,b) => (b[1].wins/b[1].matches) - (a[1].wins/a[1].matches))[0];

  const demoKing = Object.entries(perPlayer).filter(([,v])=>v.demos>0).sort((a,b)=>b[1].demos-a[1].demos)[0];

  const boostManager = Object.entries(perPlayer)
    .filter(([,v]) => v.matches >= 2)
    .sort((a,b) => a[1].zeroBoostPct - b[1].zeroBoostPct)[0];

  // ===== mecevi - najtesnji, najubedljiviji, najbolniji poraz =====
  let closestMatch = null, closestDiff = Infinity;
  let biggestWin = null, biggestWinMargin = -1;
  let worstLoss = null, worstLossMargin = -1;
  matches.forEach(rs => {
    const rep = rs[0];
    const diff = Math.abs((rep.team_goals||0) - (rep.opponent_goals||0));
    if(diff < closestDiff){ closestDiff = diff; closestMatch = rep; }
    if(rep.win && diff > biggestWinMargin){ biggestWinMargin = diff; biggestWin = rep; }
    if(!rep.win && diff > worstLossMargin){ worstLossMargin = diff; worstLoss = rep; }
  });

  // ===== comeback nedelje =====
  let bestComeback = null, bestComebackVal = 0;
  wRows.forEach(r => {
    if(r.win && (r.max_deficit_overcome||0) > bestComebackVal){ bestComebackVal = r.max_deficit_overcome; bestComeback = r; }
  });

  // ===== najigranija mapa =====
  const mapCounts = {};
  matches.forEach(rs => { const mp = rs[0].map; if(mp) mapCounts[mp] = (mapCounts[mp]||0)+1; });
  const topMap = Object.entries(mapCounts).sort((a,b)=>b[1]-a[1])[0];

  const fromLabel = fmtDate(fromStr);
  const toLabel = fmtDate(now.toISOString().slice(0,10));

  let text = `⚽ NEDELJNI REZIME (${fromLabel} – ${toLabel})\n`;
  text += `━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📊 ${matchCount} odigranih mečeva · ${teamWins}P–${matchCount-teamWins}I (${teamWinPct}% win rate)\n`;
  text += `⚽ ${totalGoalsFor} golova ukupno (${goalsPerMatch}/meč)\n\n`;

  text += `👤 PO IGRAČU:\n`;
  ps.forEach(p => {
    const v = perPlayer[p];
    if(!v.matches) return;
    text += `   ${p}: ${v.wins}P–${v.matches-v.wins}I · ${v.goals}⚽ ${v.assists}🅰 ${v.saves}🧤${v.mvp ? ` · ${v.mvp}x MVP` : ''}\n`;
  });
  text += `\n`;

  if(topMvpEntry) text += `⭐ MVP nedelje: ${topMvpEntry[0]} (${topMvpEntry[1].mvp}x)\n`;
  if(topScorerEntry) text += `🎯 Topskorer: ${topScorerEntry[0]} (${topScorerEntry[1].goals} golova)\n`;
  if(bestRecord) text += `🔥 Najbolja forma: ${bestRecord[0]} (${bestRecord[1].wins}/${bestRecord[1].matches} pobeda)\n`;
  if(demoKing) text += `💣 Demo kralj: ${demoKing[0]} (${demoKing[1].demos} demolicija)\n`;
  if(boostManager) text += `🔋 Boost menadžer: ${boostManager[0]} (najmanje vremena na praznom baku)\n`;
  if(bestComeback) text += `🔄 Comeback nedelje: ${bestComeback.player} (okrenuo zaostatak od ${bestComeback.max_deficit_overcome} gola)\n`;
  if(biggestWin) text += `💥 Najubedljivija pobeda: ${biggestWin.team_goals}–${biggestWin.opponent_goals} na ${mapDisplay ? mapDisplay(biggestWin.map) : (biggestWin.map||'')}\n`;
  if(worstLoss) text += `😬 Najbolniji poraz: ${worstLoss.team_goals}–${worstLoss.opponent_goals} na ${mapDisplay ? mapDisplay(worstLoss.map) : (worstLoss.map||'')}\n`;
  if(closestMatch) text += `🎯 Najtešnji meč: ${closestMatch.team_goals}–${closestMatch.opponent_goals} na ${mapDisplay ? mapDisplay(closestMatch.map) : (closestMatch.map||'')}\n`;
  if(topMap) text += `🗺️ Najigranija mapa: ${mapDisplay ? mapDisplay(topMap[0]) : topMap[0]} (${topMap[1]}x)\n`;

  text += `\n— Trener Brka 🧔`;
  return text;
}

function renderWeekSummary(){
  const body = $('#weekSummaryBody');
  if(!body) return;
  const text = computeWeekSummaryText();
  body.innerHTML = `
    <div class="week-summary-pre" id="weekSummaryPre"></div>
    <button class="week-summary-copy-btn" id="weekSummaryCopyBtn">📋 Kopiraj rezime</button>`;
  $('#weekSummaryPre').textContent = text;

  const btn = $('#weekSummaryCopyBtn');
  btn.addEventListener('click', async () => {
    try{
      await navigator.clipboard.writeText(text);
      showToast('Kopirano! Nalepi u chat 📋');
    }catch(e){
      showToast('Ne mogu da kopiram — markiraj tekst ručno.');
    }
  });
}

function syncSummaryCardHeights(){
  const grid = document.querySelector('.grid-summary');
  const powerCard = document.querySelector('.power-rank-card');
  const weekCard = document.querySelector('.week-summary-card');
  if(!grid || !powerCard || !weekCard) return;

  // na uskim ekranima kartice se ionako slažu jedna ispod druge — ne teraj visinu
  if(window.innerWidth <= 900){
    weekCard.style.height = '';
    return;
  }

  weekCard.style.height = '';

  requestAnimationFrame(() => {
    weekCard.style.height = powerCard.offsetHeight + 'px';
  });
}

let _summaryResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_summaryResizeTimer);
  _summaryResizeTimer = setTimeout(syncSummaryCardHeights, 150);
});

function render(){
  const rows = getFiltered();
  renderScoreline(rows);
  renderPowerRankings(rows);
  renderOnThisDay();
  renderWeekSummary();
  syncSummaryCardHeights();
  renderPatternHunter(rows);
  renderWhatIf(rows);
  renderPlayerRecords(rows);
  
  renderGamification(rows);
  renderClutchAnalysis(rows);
  renderPlayerImpact(rows);
  
  renderTrend(rows);
  renderBoostMeters(rows);
  renderForma(rows);
  renderRadar(rows);

  renderBpmChart(rows);
  renderBoostDistChart(rows);
  renderBoostTable(rows);
  renderBoostHud(rows);

  renderAirChart(rows);
  renderSpeedChart(rows);
  renderMovementTable(rows);
  renderSpeedHud(rows);

  renderPositioningChart(rows);
  renderRotationRank(rows);
  renderPosTable(rows);
  renderPositionHud(rows);

  renderDemoDuelHud(rows);
  renderDemoChart(rows);
  renderDemoTrend(rows);

  renderChemistry(rows);
  renderRecords(rows);
  renderTable(rows);
  renderTiltDetector(rows); 

  renderHighlights(rows);
  renderH2H();

  renderWrappedTab(rows);
  renderCardsTab(rows);
  renderStarMap(rows);
  renderRace(rows);
}

// ================================================================
//  OVERVIEW FUNKCIJE
// ================================================================

function renderScoreline(rows){
  const uniqueMatches = new Set(rows.map(r => r.replay_id));
  const goals = sum(rows.map(r => getPath(r,'core.goals')));
  const mvps = rows.filter(r => getPath(r,'core.mvp')).length;
  const avgGoalsPerMatch = uniqueMatches.size ? (goals / uniqueMatches.size) : 0;

  $('#scoreline').innerHTML = `
    <div class="score-item"><div class="num mono">${uniqueMatches.size}</div><div class="lbl">Mečeva</div></div>
    <div class="score-item"><div class="num mono">${goals}</div><div class="lbl">Golova ukupno (svi igrači)</div></div>
    <div class="score-item"><div class="num mono">${avgGoalsPerMatch.toFixed(1)}</div><div class="lbl">Gol. po meču/igraču</div></div>
    <div class="score-item"><div class="num mono">${mvps}</div><div class="lbl">MVP nagrada</div></div>
  `;
}

function renderPlayerRecords(rows){
  const wrap = $('#playerRecords');
  const ps = [...activePlayers].sort();
  if(!ps.length){ wrap.innerHTML = ''; return; }

  wrap.innerHTML = ps.map(p => {
    const prows = rows.filter(r => r.player === p);
    const wins = prows.filter(r => r.win).length;
    const losses = prows.length - wins;
    const pct = prows.length ? Math.round((wins/prows.length)*100) : 0;
    return `
      <div class="prec-card" style="border-left-color:${playerColor[p]}">
        <div class="name" style="color:${playerColor[p]}">${p}</div>
        <div class="row">
          <span class="wl"><span class="w">${wins}P</span> – <span class="l">${losses}I</span></span>
          <span class="pct">${pct}% win</span>
        </div>
        <div class="matches">${prows.length} odigranih mečeva</div>
      </div>
    `;
  }).join('');
}

function groupByMatchAndPlayer(rows, metricKey){
  const byReplay = {};
  rows.forEach(r => {
    if(!byReplay[r.replay_id]) byReplay[r.replay_id] = { date: r.date, players: {} };
    byReplay[r.replay_id].players[r.player] = getPath(r, metricKey);
  });
  return Object.values(byReplay).sort((a,b) => (a.date||'').localeCompare(b.date||''));
}

function movingAvg(data, window){
  if(!window || window <= 1) return data;
  const out = [];
  for(let i=0;i<data.length;i++){
    const slice = data.slice(Math.max(0, i-window+1), i+1).filter(v => v!=null && !isNaN(v));
    out.push(slice.length ? slice.reduce((a,b)=>a+b,0)/slice.length : null);
  }
  return out;
}

function lineChartFor(canvasId, chartKey, ordered, opts){
  opts = opts || {};
  const labels = ordered.map(m => fmtDate(m.date));
  const datasets = [...activePlayers].sort().map(p => {
    const raw = ordered.map(m => m.players[p] ?? null);
    return {
      label: p,
      data: opts.smooth ? movingAvg(raw, opts.smooth) : raw,
      borderColor: playerColor[p],
      backgroundColor: opts.fill ? hexToRgba(playerColor[p], 0.12) : playerColor[p],
      tension: opts.tension ?? 0.3,
      spanGaps: true,
      fill: opts.fill ?? false,
      borderWidth: opts.borderWidth ?? 2,
      pointRadius: opts.pointRadius ?? 3,
      pointHoverRadius: opts.pointHoverRadius ?? 5,
    };
  });
  destroyChart(chartKey);
  charts[chartKey] = new Chart($(canvasId), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive:true,
      maintainAspectRatio: opts.maintainAspectRatio ?? true,
      interaction:{ mode:'index', intersect:false },
      plugins:{ legend:{ labels:{ color:'#8A93A3' } } },
      scales:{
        x:{ ticks:{ color:'#8A93A3', maxRotation:0, autoSkip:true }, grid:{ color:'rgba(255,255,255,0.05)' } },
        y:{ ticks:{ color:'#8A93A3' }, grid:{ color:'rgba(255,255,255,0.05)' }, beginAtZero:true }
      }
    }
  });
}

function renderTrend(rows){
  const metric = $('#trendMetric').value || 'core.goals';
  const ordered = groupByMatchAndPlayer(rows, metric);
  lineChartFor('#trendChart', 'trend', ordered);
  renderMetricSummary(rows, metric);
}

function fmtNum(v){
  if(v == null || isNaN(v)) return '0';
  return Math.abs(v) >= 100 ? Math.round(v).toString() : (Math.round(v*10)/10).toString();
}

function renderMetricSummary(rows, metricKey){
  const wrap = $('#metricSummary');
  const info = TREND_METRICS.find(m => m.key === metricKey) || {label: metricKey};
  const ps = [...activePlayers];
  const showShootPct = metricKey === 'core.shots';

  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  const stats = ps.map(p => {
    const prows = rows.filter(r => r.player === p);
    const matches = new Set(prows.map(r => r.replay_id)).size;
    const total = sum(prows.map(r => getPath(r, metricKey)));
    const average = matches ? total / matches : 0;
    const goals = showShootPct ? sum(prows.map(r => getPath(r, 'core.goals'))) : 0;
    const shootPct = showShootPct && total > 0 ? (goals / total) * 100 : null;
    return { p, matches, total, average, goals, shootPct };
  });

  const rankVal = s => info.isRate ? s.average : s.total;
  stats.sort((a,b) => rankVal(b) - rankVal(a));
  const maxVal = Math.max(1, ...stats.map(rankVal));

  const head = `
    <div class="metric-summary-head">
      <div class="rank"></div><div class="dot"></div><div class="pname">Ukupno za period — ${info.label}</div>
      <div class="bar-track"></div>
      <div class="total">${info.isRate ? 'Prosek' : 'Ukupno'}</div>
      <div class="avg">${info.isRate ? '' : 'Prosek/meč'}</div>
      ${showShootPct ? '<div class="avg">Gol %</div>' : ''}
    </div>`;

  const body = stats.map((s,i) => `
    <div class="metric-summary-row">
      <div class="rank">${i+1}.</div>
      <div class="dot" style="background:${playerColor[s.p]}"></div>
      <div class="pname" style="color:${playerColor[s.p]}">${s.p}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(rankVal(s)/maxVal*100).toFixed(0)}%; background:${playerColor[s.p]}"></div></div>
      <div class="total">${fmtNum(rankVal(s))}</div>
      <div class="avg">${info.isRate ? '' : (s.matches ? fmtNum(s.average) + '/meč' : '–')}</div>
      ${showShootPct ? `<div class="avg" style="color:var(--text); font-weight:600;">${s.shootPct !== null ? s.shootPct.toFixed(1) + '%' : '–'}</div>` : ''}
    </div>`).join('');

  wrap.innerHTML = head + body;
}

function renderBoostMeters(rows){
  // Linearni "meter" prikaz je uklonjen odavde — Boost HUD u tabu Boost
  // već pokriva isti prosečan boost po igraču, samo lepše (gauge stil).
  renderBoostExtras(rows);
}

function renderBoostExtras(rows){
  const effWrap = $('#boostEfficiency');
  const factsWrap = $('#boostFacts');
  const ps = [...activePlayers];

  if(!ps.length){ effWrap.innerHTML = ''; factsWrap.innerHTML = ''; return; }

  const stats = ps.map(p => {
    const prows = rows.filter(r => r.player === p);
    const goals = sum(prows.map(r => getPath(r,'core.goals')));
    const assists = sum(prows.map(r => getPath(r,'core.assists')));
    const collected = sum(prows.map(r => getPath(r,'boost.amount_collected')));
    const stolen = sum(prows.map(r => getPath(r,'boost.amount_stolen')));
    const zeroPct = avg(prows.map(r => getPath(r,'boost.percent_zero_boost') || 0));
    const efficiency = collected > 0 ? ((goals + assists) / (collected / 100)) : 0;
    return { p, goals, assists, collected, stolen, zeroPct, efficiency, matches: prows.length };
  });

  const effSorted = [...stats].sort((a,b) => b.efficiency - a.efficiency);
  const maxEff = Math.max(0.01, ...effSorted.map(s => s.efficiency));
  effWrap.innerHTML = `
    <div class="subhead">Boost efikasnost — gol+asistencija na svakih 100 sakupljenog boosta</div>
    ${effSorted.map(s => `
      <div class="beff-row">
        <div class="pname" style="color:${playerColor[s.p]}">${s.p}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(s.efficiency/maxEff*100).toFixed(0)}%; background:${playerColor[s.p]}"></div></div>
        <div class="val">${s.efficiency.toFixed(2)}</div>
      </div>
    `).join('')}
  `;

  const withMatches = stats.filter(s => s.matches > 0);
  const facts = [];
  if(withMatches.length){
    const topStealer = [...withMatches].sort((a,b) => b.stolen - a.stolen)[0];
    const bestMgmt = [...withMatches].sort((a,b) => a.zeroPct - b.zeroPct)[0];
    if(topStealer.stolen > 0){
      facts.push(`Najviše ukrao boosta: <b style="color:${playerColor[topStealer.p]}">${topStealer.p}</b> (${Math.round(topStealer.stolen)})`);
    }
    facts.push(`Najbolji boost menadžment: <b style="color:${playerColor[bestMgmt.p]}">${bestMgmt.p}</b> (najmanje vremena na 0 — ${bestMgmt.zeroPct.toFixed(0)}%)`);
  }
  factsWrap.innerHTML = facts.map(f => `<div class="boost-fact">${f}</div>`).join('');
}

function renderForma(rows){
  const wrap = $('#formaList');
  const ps = [...activePlayers].sort();
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  wrap.innerHTML = ps.map(p => {
    const prows = rows.filter(r => r.player === p).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    const last = prows.slice(-10);
    const wins = prows.filter(r => r.win).length;
    const pct = prows.length ? Math.round((wins/prows.length)*100) : 0;
    const squares = last.map(r => {
      const cls = r.win ? 'w' : 'l';
      const letter = r.win ? 'P' : 'I';
      const title = `${fmtDate(r.date)} · ${r.team_goals}–${r.opponent_goals} · ${r.map||''}`;
      return `<div class="form-sq ${cls}" title="${title}">${letter}</div>`;
    }).join('');
    return `
      <div class="form-row">
        <div class="pname" style="color:${playerColor[p]}">${p}</div>
        <div class="form-squares">${squares || '<span style="color:var(--text-muted); font-size:12px;">nema mečeva</span>'}</div>
        <div class="form-winrate">${pct}% (${prows.length})</div>
      </div>
    `;
  }).join('');
}

function renderRadar(rows){
  const perPlayer = {};
  [...activePlayers].forEach(p => {
    const prows = rows.filter(r => r.player === p);
    perPlayer[p] = RADAR_METRICS.map(m => avg(prows.map(r => getPath(r,m.key) || 0)));
  });
  const maxes = RADAR_METRICS.map((m,i) => Math.max(1, ...Object.values(perPlayer).map(v => v[i])));
  const datasets = [...activePlayers].sort().map(p => ({
    label: p,
    data: perPlayer[p].map((v,i) => (v / maxes[i]) * 100),
    borderColor: playerColor[p],
    backgroundColor: playerColor[p] + '33',
    pointBackgroundColor: playerColor[p],
  }));
  destroyChart('radar');
  charts.radar = new Chart($('#radarChart'), {
    type: 'radar',
    data: { labels: RADAR_METRICS.map(m=>m.label), datasets },
    options: {
      responsive:true,
      maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{ r:{
        angleLines:{ color:'rgba(255,255,255,0.08)' }, grid:{ color:'rgba(255,255,255,0.08)' },
        pointLabels:{ color:'#E8ECF1', font:{ size:11 } }, ticks:{ display:false, backdropColor:'transparent' },
        suggestedMin:0, suggestedMax:100
      }}
    }
  });

  const legendEl = $('#radarLegend');
  if(legendEl){
    const rows = [...activePlayers].sort().map(p => {
      const vals = perPlayer[p].map((v,i) => (v / maxes[i]) * 100);
      let topIdx = 0;
      vals.forEach((v,i) => { if(v > vals[topIdx]) topIdx = i; });
      const topLabel = RADAR_METRICS[topIdx] ? RADAR_METRICS[topIdx].label : '';
      return `
        <div class="radar-legend-row">
          <span class="radar-legend-dot" style="background:${playerColor[p]}; color:${playerColor[p]};"></span>
          <span class="radar-legend-name" style="color:${playerColor[p]}">${p}</span>
          <span class="radar-legend-top">najjača kategorija:<br><b>${topLabel}</b></span>
        </div>
      `;
    }).join('');
    legendEl.innerHTML = `<div class="radar-legend-head">Igrači na grafikonu</div>${rows || '<div class="empty">Nema izabranih igrača</div>'}`;
  }
}


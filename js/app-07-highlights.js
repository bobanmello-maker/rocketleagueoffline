// ================================================================
//  📻 MARQUEE TRAKA — automatski generisane "vesti" o trenutnoj
//  formi ekipe, iz celokupne istorije (RAW), nezavisno od filtera.
// ================================================================
function computeFormMarqueeItems(){
  const items = [];
  const modeRows = modeFilter === 'all' ? RAW : RAW.filter(r => r.mode === modeFilter);
  const modePlayers = [...new Set(modeRows.map(r => r.player))].sort();
  if(!modePlayers.length) return items;

  const byPlayer = p => modeRows.filter(r => r.player === p);

  modePlayers.forEach(p => {
    const v = byPlayer(p).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    if(v.length < 3) return;

    // trenutni niz (pobede ili porazi unazad od poslednjeg meca)
    let streak = 0, streakWin = null;
    for(let i = v.length - 1; i >= 0; i--){
      const w = !!v[i].win;
      if(streakWin === null){ streakWin = w; streak = 1; }
      else if(w === streakWin){ streak++; }
      else break;
    }
    if(streak >= 3){
      if(streakWin) items.push(`🔥 <b>${p}</b> u vatri — ${streak} pobeda zaredom`);
      else items.push(`📉 <b>${p}</b> u padu forme — ${streak} poraza zaredom`);
    }
  });

  // ko se priblizava rekordu golova
  const totalGoals = p => sum(byPlayer(p).map(r => getPath(r,'core.goals') || 0));
  const goalTotals = modePlayers.map(p => ({ p, g: totalGoals(p) })).sort((a,b) => b.g - a.g);
  if(goalTotals.length >= 2 && goalTotals[0].g > 0){
    const leader = goalTotals[0], chaser = goalTotals[1];
    const gap = leader.g - chaser.g;
    if(gap > 0 && gap <= Math.max(3, leader.g * 0.08)){
      items.push(`🎯 <b>${chaser.p}</b> se približava rekordu golova — zaostaje ${gap} iza <b>${leader.p}</b>`);
    }
  }

  // poslednji odigran mec — MVP i rezultat
  const byReplay = {};
  modeRows.forEach(r => { if(r.replay_id && r.date) (byReplay[r.replay_id] = byReplay[r.replay_id] || []).push(r); });
  const replays = Object.values(byReplay).sort((a,b) => (b[0].date||'').localeCompare(a[0].date||''));
  if(replays.length){
    const last = replays[0];
    const mvpRow = last.find(r => getPath(r,'core.mvp'));
    if(mvpRow) items.push(`⭐ <b>${mvpRow.player}</b> je bio MVP u poslednjem odigranom meču`);
    const rep = last.reduce((best, r) => (getPath(r,'core.score')||0) > (getPath(best,'core.score')||0) ? r : best, last[0]);
    items.push(`🕹️ Poslednji meč: <b>${rep.team_goals}–${rep.opponent_goals}</b> na ${rep.map || 'nepoznatoj mapi'}`);
  }

  // ukupan broj odigranih meceva ikad
  items.push(`📊 Ukupno odigrano <b>${replays.length || Object.keys(byReplay).length}</b> mečeva u istoriji ekipe`);

  return items;
}

function renderFormMarquee(){
  const bar = $('#formMarquee'), track = $('#formMarqueeTrack');
  if(!bar || !track) return;
  const items = computeFormMarqueeItems();
  if(!items.length){ bar.style.display = 'none'; return; }
  bar.style.display = 'block';

  // dupliraj sadrzaj radi neprekidnog "beskonacnog" skrolovanja
  const html = items.map(it => `<span class="fm-item">${it}</span>`).join('');
  track.innerHTML = html + html;

  // brzina skrolovanja skalirana prema kolicini teksta (konzistentan tempo)
  const speedPxPerSec = 55;
  requestAnimationFrame(() => {
    const fullWidth = track.scrollWidth / 2;
    const duration = Math.max(18, fullWidth / speedPxPerSec);
    track.style.animationDuration = duration + 's';
  });
}

function renderRecords(rows){
  const ps = [...activePlayers];
  if(!ps.length){ $('#awardGrid').innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  const byPlayer = p => rows.filter(r => r.player === p);
  const totalGoals = p => sum(byPlayer(p).map(r=>getPath(r,'core.goals')));
  const totalSaves = p => sum(byPlayer(p).map(r=>getPath(r,'core.saves')));
  const totalWins = p => byPlayer(p).filter(r=>r.win).length;
  const totalDemos = p => sum(byPlayer(p).map(r=>getPath(r,'demo.inflicted')));
  const totalMvp = p => byPlayer(p).filter(r=>getPath(r,'core.mvp')).length;
  const hatTricks = p => byPlayer(p).filter(r=>getPath(r,'core.goals')>=3).length;
  const avgZeroBoost = p => { const v=byPlayer(p); return v.length ? avg(v.map(r=>getPath(r,'boost.percent_zero_boost')||0)) : 999; };
  const bestScore = p => Math.max(0, ...byPlayer(p).map(r=>getPath(r,'core.score')||0));

  function longestStreak(p){
    const sorted = byPlayer(p).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''));
    let best=0, cur=0;
    sorted.forEach(r => { if(r.win){ cur++; best=Math.max(best,cur);} else cur=0; });
    return best;
  }

  const top = (fn, better='max') => {
    let bestP = null, bestV = better==='max' ? -Infinity : Infinity;
    ps.forEach(p => { const v = fn(p); if((better==='max' && v>bestV) || (better==='min' && v<bestV)){ bestV=v; bestP=p; } });
    return { player: bestP, value: bestV };
  };

  const awards = [
    { emoji:'🏆', title:'Najviše pobeda', ...top(totalWins), unit:'pobeda' },
    { emoji:'🎯', title:'Najviše golova', ...top(totalGoals), unit:'golova' },
    { emoji:'🧤', title:'Najviše odbrana', ...top(totalSaves), unit:'odbrana' },
    { emoji:'⭐', title:'Najviše MVP nagrada', ...top(totalMvp), unit:'MVP' },
    { emoji:'🎩', title:'Hat-trick heroj', ...top(hatTricks), unit:'hat-trickova' },
    { emoji:'💥', title:'Demo kralj', ...top(totalDemos), unit:'demolicija' },
    { emoji:'🔥', title:'Najduži niz pobeda', ...top(longestStreak), unit:'pobeda zaredom' },
    { emoji:'⚡', title:'Najbolji boost menadžment', ...top(avgZeroBoost,'min'), unit:'% vremena na 0 boosta', fmt:v=>v.toFixed(1) },
    { emoji:'💯', title:'Najbolja partija ikad (score)', ...top(bestScore), unit:'poena u jednom meču' },
  ];

  $('#awardGrid').innerHTML = awards.map(a => `
    <div class="award-card">
      <div class="emoji">${a.emoji}</div>
      <div class="title">${a.title}</div>
      <div class="winner" style="color:${a.player ? playerColor[a.player] : '#fff'}">${a.player || '—'}</div>
      <div class="detail">${a.player ? (a.fmt ? a.fmt(a.value) : a.value) + ' ' + a.unit : 'nema podataka'}</div>
    </div>
  `).join('');
}

// ================================================================
//  HIGHLIGHTS TAB
// ================================================================

function dedupeByMatchTeam(rows){
  const seen = new Set();
  const out = [];
  rows.forEach(r => {
    const key = r.replay_id + '|' + r.team_color;
    if(seen.has(key)) return;
    seen.add(key);
    out.push(r);
  });
  return out;
}

function renderHighlights(rows){
  renderMilestones(rows);
  renderShame(rows);
  renderMonthCompare();
}

const MILESTONE_GOAL_STEPS = [50, 100, 200, 300, 500, 1000];
const MILESTONE_STREAK_STEPS = [5, 10, 15, 20, 30];

function getPlayerAchievements(rows, player){
  const prows = rows.filter(r => r.player === player);
  if(!prows.length) return [];
  const achievements = [];
  const matches = prows.length;
  const wins = prows.filter(r => r.win).length;
  const totalGoals = sum(prows.map(r => getPath(r,'core.goals')));
  const totalAssists = sum(prows.map(r => getPath(r,'core.assists')));
  const totalSaves = sum(prows.map(r => getPath(r,'core.saves')));
  const totalDemos = sum(prows.map(r => getPath(r,'demo.inflicted')));
  const totalShots = sum(prows.map(r => getPath(r,'core.shots')));
  const mvps = prows.filter(r => getPath(r,'core.mvp')).length;
  const hatTricks = prows.filter(r => (getPath(r,'core.goals')||0) >= 3).length;
  const cleanSheets = prows.filter(r => (getPath(r,'core.goals_against')||0) === 0).length;

  const accuracy = totalShots > 0 ? (totalGoals / totalShots) * 100 : 0;
  let bestStreak = 0, curStreak = 0;
  const sorted = prows.slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
  sorted.forEach(r => {
    if(r.win){ curStreak++; bestStreak = Math.max(bestStreak, curStreak); }
    else curStreak = 0;
  });

  if(matches >= 10) achievements.push({ emoji:'🎯', name:'Veteran', desc:`${matches} odigranih mečeva`, tier:'common' });
  if(matches >= 50) achievements.push({ emoji:'🏅', name:'Iskusni veteran', desc:'50+ mečeva', tier:'rare' });
  if(matches >= 100) achievements.push({ emoji:'💎', name:'Legenda', desc:'100+ mečeva', tier:'legendary' });

  if(wins >= 10) achievements.push({ emoji:'🏆', name:'Pobednik', desc:`${wins} pobeda`, tier:'common' });
  if(wins >= 25) achievements.push({ emoji:'👑', name:'Kralj pobeda', desc:'25+ pobeda', tier:'rare' });
  if(wins >= 50) achievements.push({ emoji:'⚜️', name:'Imperator', desc:'50+ pobeda', tier:'legendary' });

  if(totalGoals >= 50) achievements.push({ emoji:'⚽', name:'Strelac', desc:`${totalGoals} golova`, tier:'common' });
  if(totalGoals >= 100) achievements.push({ emoji:'🔥', name:'Mašina za golove', desc:'100+ golova', tier:'epic' });

  if(totalAssists >= 25) achievements.push({ emoji:'🎯', name:'Asistent', desc:`${totalAssists} asistencija`, tier:'common' });
  if(totalAssists >= 50) achievements.push({ emoji:'🎪', name:'Playmaker', desc:'50+ asistencija', tier:'rare' });

  if(totalSaves >= 50) achievements.push({ emoji:'🧤', name:'Zid', desc:`${totalSaves} odbrana`, tier:'common' });
  if(totalSaves >= 100) achievements.push({ emoji:'🛡️', name:'Tvrđava', desc:'100+ odbrana', tier:'epic' });

  if(totalDemos >= 20) achievements.push({ emoji:'💥', name:'Demo majstor', desc:`${totalDemos} demolicija`, tier:'common' });
  if(totalDemos >= 50) achievements.push({ emoji:'💀', name:'Demo kralj', desc:'50+ demolicija', tier:'epic' });

  if(mvps >= 5) achievements.push({ emoji:'⭐', name:'MVP', desc:`${mvps} MVP nagrada`, tier:'common' });
  if(mvps >= 10) achievements.push({ emoji:'🌟', name:'Super MVP', desc:'10+ MVP nagrada', tier:'rare' });

  if(hatTricks >= 3) achievements.push({ emoji:'🎩', name:'Hat-trick heroj', desc:`${hatTricks} hat-trickova`, tier:'rare' });
  if(hatTricks >= 5) achievements.push({ emoji:'🎩', name:'Hat-trick mašina', desc:'5+ hat-trickova', tier:'epic' });

  if(cleanSheets >= 3) achievements.push({ emoji:'🧹', name:'Čista mreža', desc:`${cleanSheets} mečeva bez primljenog gola`, tier:'common' });
  if(cleanSheets >= 10) achievements.push({ emoji:'🔒', name:'Neprobojni', desc:'10+ čistih mreža', tier:'epic' });

  if(bestStreak >= 5) achievements.push({ emoji:'🔥', name:'Niz pobeda', desc:`${bestStreak} pobeda zaredom`, tier:'rare' });
  if(bestStreak >= 10) achievements.push({ emoji:'⚡', name:'Nezaustavljivi', desc:'10+ pobeda zaredom', tier:'legendary' });

  if(accuracy >= 70) achievements.push({ emoji:'🎯', name:'Sniper', desc:`${Math.round(accuracy)}% šut preciznost`, tier:'rare' });
  if(accuracy >= 80) achievements.push({ emoji:'🎯', name:'Oštri strelac', desc:`${Math.round(accuracy)}% šut preciznost`, tier:'legendary' });

  return achievements;
}

// ================================================================
//  😈 HALL OF SHAME — isti motor kao dostignuća, samo obrnuto
// ================================================================

function getPlayerShame(rows, player){
  const prows = rows.filter(r => r.player === player);
  if(!prows.length) return [];
  const shame = [];
  const sorted = prows.slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));

  // --- Crna serija poraza ---
  let worstLossStreak = 0, curLoss = 0;
  sorted.forEach(r => {
    if(!r.win){ curLoss++; worstLossStreak = Math.max(worstLossStreak, curLoss); }
    else curLoss = 0;
  });
  if(worstLossStreak >= 3) shame.push({ emoji:'💀', name:'Crna serija', desc:`${worstLossStreak} poraza zaredom`, tier:'common' });
  if(worstLossStreak >= 5) shame.push({ emoji:'🕳️', name:'Bezdan', desc:`${worstLossStreak}+ poraza zaredom`, tier:'rare' });
  if(worstLossStreak >= 8) shame.push({ emoji:'☠️', name:'Ambis', desc:`${worstLossStreak} poraza zaredom — dno dna`, tier:'legendary' });

  // --- Suša golova (uzastopni mečevi bez gola) ---
  let worstDrought = 0, curDrought = 0;
  sorted.forEach(r => {
    const g = getPath(r,'core.goals') || 0;
    if(g === 0){ curDrought++; worstDrought = Math.max(worstDrought, curDrought); }
    else curDrought = 0;
  });
  if(worstDrought >= 3) shame.push({ emoji:'🏜️', name:'Suša golova', desc:`${worstDrought} mečeva bez gola zaredom`, tier:'common' });
  if(worstDrought >= 6) shame.push({ emoji:'🌵', name:'Sahara', desc:`${worstDrought}+ mečeva bez gola zaredom`, tier:'epic' });

  // --- Rešeto (najviše primljenih golova u jednom meču) ---
  let worstConceded = 0, worstConcededRow = null;
  prows.forEach(r => {
    const ga = getPath(r,'core.goals_against');
    if(ga != null && ga > worstConceded){ worstConceded = ga; worstConcededRow = r; }
  });
  if(worstConceded >= 5) shame.push({ emoji:'🪣', name:'Rešeto', desc:`${worstConceded} primljenih golova u jednom meču${worstConcededRow ? ' ('+mapDisplay(worstConcededRow.map)+')' : ''}`, tier:'common' });
  if(worstConceded >= 8) shame.push({ emoji:'🧀', name:'Švajcarski sir', desc:`${worstConceded} primljenih golova u jednom meču`, tier:'epic' });

  // --- Veliki čoking (najveće ispušteno vođstvo) ---
  let worstChoke = 0;
  prows.forEach(r => { const l = r.max_lead_lost || 0; if(l > worstChoke) worstChoke = l; });
  if(worstChoke >= 2) shame.push({ emoji:'😱', name:'Čoking', desc:`ispušteno vođstvo od ${worstChoke} gola`, tier:'common' });
  if(worstChoke >= 3) shame.push({ emoji:'🫠', name:'Veliki čoking', desc:`ispušteno vođstvo od ${worstChoke}+ gola — legendarni pad`, tier:'legendary' });

  // --- Masakr (najbolniji poraz po razlici u golovima) ---
  let worstMargin = 0, worstMarginRow = null;
  prows.forEach(r => {
    if(r.win) return;
    const margin = (r.opponent_goals||0) - (r.team_goals||0);
    if(margin > worstMargin){ worstMargin = margin; worstMarginRow = r; }
  });
  if(worstMargin >= 3) shame.push({ emoji:'🔪', name:'Bolan poraz', desc:worstMarginRow ? `poraz ${worstMarginRow.team_goals}–${worstMarginRow.opponent_goals} (${mapDisplay(worstMarginRow.map)})` : `poraz razlike ${worstMargin}`, tier:'common' });
  if(worstMargin >= 5) shame.push({ emoji:'🩸', name:'Masakr', desc:worstMarginRow ? `poraz ${worstMarginRow.team_goals}–${worstMarginRow.opponent_goals} — pravi masakr` : `poraz razlike ${worstMargin}+`, tier:'legendary' });

  return shame;
}

function renderShame(rows){
  const wrap = $('#shameGrid');
  if(!wrap) return;
  const ps = [...activePlayers];
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  const blocks = ps.map(p => {
    const shame = getPlayerShame(rows, p);
    if(!shame.length) return '';
    const chips = shame.map(a => `
      <div class="shame-chip" title="${a.name} — ${a.desc}">
        <div class="b-emoji">${a.emoji}</div>
        <span class="b-name">${a.name}</span>
      </div>
    `).join('');
    return `
      <div class="achievement-block">
        <div class="achievement-block-head">
          <span class="name" style="color:${playerColor[p]||'#fff'}">${p}</span>
          <span class="count">${shame.length} sramota</span>
        </div>
        <div class="badge-shelf">${chips}</div>
      </div>
    `;
  }).filter(Boolean).join('');

  wrap.innerHTML = blocks || '<div class="empty">Čista savest — bar za sada 😇</div>';
}

// ===== LOOT BOX — detekcija novih dostignuća (karijera, sva vremena/režimi) =====
function seenAchievementsStore(){
  try{ return JSON.parse(localStorage.getItem('rl_seen_achievements') || '{}'); }
  catch(e){ return {}; }
}
function saveSeenAchievements(store){
  try{ localStorage.setItem('rl_seen_achievements', JSON.stringify(store)); }catch(e){}
}

function checkForNewAchievements(){
  if(!allPlayers.length) return;
  const seen = seenAchievementsStore();
  const newItems = [];

  allPlayers.forEach(p => {
    const achievements = getPlayerAchievements(RAW, p);
    const seenNames = new Set(seen[p] || []);
    const currentNames = achievements.map(a => a.name);

    achievements.forEach(a => {
      if(!seenNames.has(a.name)){
        newItems.push({ ...a, player: p, color: playerColor[p] });
      }
    });

    seen[p] = currentNames; // upamti sve trenutno otključano, da se ne ponavlja
  });

  saveSeenAchievements(seen);

  if(newItems.length && window.LootBox){
    window.LootBox.enqueueAuto(newItems);
  }
}

function openManualLootBox(){
  const ps = allPlayers.length ? allPlayers : [...activePlayers];
  const items = [];
  ps.forEach(p => {
    const achievements = getPlayerAchievements(RAW, p);
    achievements.forEach(a => items.push({ ...a, player: p, color: playerColor[p] }));
  });
  if(!items.length){ alert('Još uvek nema otključanih dostignuća.'); return; }
  // promešaj malo da ne bude uvek isti redosled — zabavnije za "replay"
  for(let i = items.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  window.LootBox.openManual(items);
}

// ===== TROFEJNA VITRINA — rotirajuća 3D polica (čist CSS transform + rAF, bez 3D biblioteka) =====
class TrophyShelf{
  constructor(container, achievements, player){
    this.container = container;
    this.achievements = achievements;
    this.player = player;
    this.angle = Math.random() * 360;
    this.speed = 10; // stepeni/sek auto-rotacija
    this.dragging = false;
    this.dragged = false;
    this.lastX = 0;
    this.lastT = null;
    this.raf = null;
    this._tick = this._tick.bind(this);
    this._build();
    this._bind();
    this.raf = requestAnimationFrame(this._tick);
  }
  _build(){
    const n = this.achievements.length;
    const radius = n <= 4 ? 115 : n <= 6 ? 140 : n <= 9 ? 168 : 195;
    this.radius = radius;
    this.container.innerHTML = `<div class="trophy-stage"></div><div class="trophy-hint">prevuci da okreneš vitrinu</div>`;
    this.stage = this.container.querySelector('.trophy-stage');
    this.achievements.forEach((a, i) => {
      const ang = (360 / n) * i;
      const item = document.createElement('div');
      item.className = 'trophy-item unlocked';
      item.style.transform = `rotateY(${ang}deg) translateZ(${radius}px)`;
      item.innerHTML = `
        <div class="trophy-face" title="${a.name} — ${a.desc}">
          <div class="b-emoji">${a.emoji}</div>
          <span class="b-name">${a.name}</span>
        </div>
      `;
      item.addEventListener('click', () => {
        if(this.dragged) return;
        openBadgeModal(a, this.player);
      });
      this.stage.appendChild(item);
    });
  }
  _bind(){
    const el = this.container;
    el.addEventListener('pointerdown', e => {
      this.dragging = true;
      this.dragged = false;
      el.classList.add('dragging');
      this.lastX = e.clientX;
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
    });
    el.addEventListener('pointermove', e => {
      if(!this.dragging) return;
      const dx = e.clientX - this.lastX;
      if(Math.abs(dx) > 2) this.dragged = true;
      this.angle -= dx * 0.5;
      this.lastX = e.clientX;
    });
    const end = () => { this.dragging = false; el.classList.remove('dragging'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }
  _tick(t){
    if(this.lastT == null) this.lastT = t;
    const dt = Math.min((t - this.lastT) / 1000, 0.1);
    this.lastT = t;
    if(!this.dragging) this.angle += this.speed * dt;
    if(this.stage) this.stage.style.transform = `rotateY(${this.angle}deg)`;
    this.raf = requestAnimationFrame(this._tick);
  }
  destroy(){
    if(this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
  }
}

function destroyTrophyShelves(){
  activeTrophyShelves.forEach(s => s.destroy());
  activeTrophyShelves = [];
}

function openBadgeModal(a, player){
  $('#modalContent').innerHTML = `
    <button class="modal-close" id="modalCloseBtn">&times;</button>
    <div style="font-size:52px; text-align:center; margin-bottom:4px;">${a.emoji}</div>
    <h3 style="text-align:center;">${a.name}</h3>
    <div class="sub" style="text-align:center; color:${playerColor[player]||'var(--text-muted)'}">${player}</div>
    <div class="stat-block">
      <div class="stat-line"><span>Opis</span><span>${a.desc}</span></div>
      <div class="stat-line"><span>Status</span><span style="color:var(--amber);">🏆 Otključano</span></div>
    </div>
  `;
  $('#modalCloseBtn').addEventListener('click', closeModal);
  $('#modalBackdrop').classList.add('open');
}

function renderMilestonesGrid(ps, rows){
  const wrap = $('#milestoneGrid');
  const blocks = ps.map(p => {
    const achievements = getPlayerAchievements(rows, p);
    if(!achievements.length) return '';
    const chips = achievements.map(a => `
      <div class="badge-chip" title="${a.name} — ${a.desc}">
        <div class="b-emoji">${a.emoji}</div>
        <span class="b-name">${a.name}</span>
      </div>
    `).join('');
    return `
      <div class="achievement-block">
        <div class="achievement-block-head">
          <span class="name" style="color:${playerColor[p]||'#fff'}">${p}</span>
          <span class="count">${achievements.length} otključano</span>
        </div>
        <div class="badge-shelf">${chips}</div>
      </div>
    `;
  }).filter(Boolean).join('');

  wrap.innerHTML = blocks || '<div class="empty">Još uvek nema dostignuća (nedovoljno mečeva)</div>';
}

function renderMilestonesShelf(ps, rows){
  const wrap = $('#milestoneGrid');
  const withAch = ps.map(p => ({ p, achievements: getPlayerAchievements(rows, p) })).filter(x => x.achievements.length);

  if(!withAch.length){
    wrap.innerHTML = '<div class="empty">Još uvek nema dostignuća (nedovoljno mečeva)</div>';
    return;
  }

  wrap.innerHTML = withAch.map(({p, achievements}, idx) => `
    <div class="achievement-block">
      <div class="achievement-block-head">
        <span class="name" style="color:${playerColor[p]||'#fff'}">${p}</span>
        <span class="count">${achievements.length} otključano</span>
      </div>
      <div class="trophy-scene" data-shelf-idx="${idx}"></div>
    </div>
  `).join('');

  withAch.forEach(({p, achievements}, idx) => {
    const scene = wrap.querySelector(`.trophy-scene[data-shelf-idx="${idx}"]`);
    if(scene) activeTrophyShelves.push(new TrophyShelf(scene, achievements, p));
  });
}

function renderMilestones(rows){
  const wrap = $('#milestoneGrid');
  const ps = [...activePlayers];
  destroyTrophyShelves();
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  if(highlightsViewMode === 'shelf') renderMilestonesShelf(ps, rows);
  else renderMilestonesGrid(ps, rows);
}

function renderMonthCompare(){
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const prevDate = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth()+1).padStart(2,'0')}`;

  const modeRows = modeFilter === 'all' ? RAW : RAW.filter(r => r.mode === modeFilter);
  const ps = [...activePlayers];
  const rowsFor = (p, monthKey) => modeRows.filter(r => r.player === p && (r.date||'').slice(0,7) === monthKey);

  const body = ps.map(p => {
    const curr = rowsFor(p, thisMonthKey);
    const prev = rowsFor(p, prevMonthKey);
    if(!curr.length && !prev.length) return '';

    const goalsC = sum(curr.map(r=>getPath(r,'core.goals')));
    const goalsP = sum(prev.map(r=>getPath(r,'core.goals')));
    const wrC = curr.length ? Math.round((curr.filter(r=>r.win).length/curr.length)*100) : 0;
    const wrP = prev.length ? Math.round((prev.filter(r=>r.win).length/prev.length)*100) : 0;
    const boostC = avg(curr.map(r=>getPath(r,'boost.avg_amount')||0));
    const boostP = avg(prev.map(r=>getPath(r,'boost.avg_amount')||0));

    const arrow = (c,p_) => {
      if(!p_ && !c) return '';
      const diff = c - p_;
      if(Math.abs(diff) < 0.05) return `<span style="color:var(--text-muted);">→</span>`;
      return diff > 0 ? `<span style="color:var(--green);">▲ +${fmtNum(diff)}</span>` : `<span style="color:var(--loss);">▼ ${fmtNum(diff)}</span>`;
    };

    return `<tr>
      <td style="color:${playerColor[p]}">${p}</td>
      <td class="mono">${goalsC} / ${goalsP}</td><td>${arrow(goalsC,goalsP)}</td>
      <td class="mono">${wrC}% / ${wrP}%</td><td>${arrow(wrC,wrP)}</td>
      <td class="mono">${boostC.toFixed(0)} / ${boostP.toFixed(0)}</td><td>${arrow(boostC,boostP)}</td>
    </tr>`;
  }).filter(Boolean).join('');

  $('#monthCompareBody').innerHTML = body || '<tr><td colspan="7" class="empty">Nema mečeva ovog ili prošlog meseca za izabrane igrače</td></tr>';
}


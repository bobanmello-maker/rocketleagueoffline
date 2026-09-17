// ================================================================
//  LEVEL SISTEM I GAMIFIKACIJA
// ================================================================

const LEVEL_THRESHOLDS = [
  { level: 1, name: 'Bronza I', xp: 0, badge: '🥉' },
  { level: 2, name: 'Bronza II', xp: 100, badge: '🥉' },
  { level: 3, name: 'Bronza III', xp: 250, badge: '🥉' },
  { level: 4, name: 'Srebro I', xp: 500, badge: '🥈' },
  { level: 5, name: 'Srebro II', xp: 800, badge: '🥈' },
  { level: 6, name: 'Srebro III', xp: 1200, badge: '🥈' },
  { level: 7, name: 'Zlato I', xp: 1800, badge: '🥇' },
  { level: 8, name: 'Zlato II', xp: 2500, badge: '🥇' },
  { level: 9, name: 'Zlato III', xp: 3500, badge: '🥇' },
  { level: 10, name: 'Platinasti I', xp: 4800, badge: '💎' },
  { level: 11, name: 'Platinasti II', xp: 6200, badge: '💎' },
  { level: 12, name: 'Platinasti III', xp: 8000, badge: '💎' },
  { level: 13, name: 'Dijamant I', xp: 10000, badge: '🔷' },
  { level: 14, name: 'Dijamant II', xp: 12500, badge: '🔷' },
  { level: 15, name: 'Dijamant III', xp: 15500, badge: '🔷' },
  { level: 16, name: 'Šampion I', xp: 19000, badge: '🏆' },
  { level: 17, name: 'Šampion II', xp: 23000, badge: '🏆' },
  { level: 18, name: 'Šampion III', xp: 28000, badge: '🏆' },
  { level: 19, name: 'Grand Šampion', xp: 35000, badge: '👑' },
  { level: 20, name: 'SSL', xp: 45000, badge: '⭐' },
];

function computePlayerXP(rows, player) {
  const prows = rows.filter(r => r.player === player);
  if (!prows.length) return 0;

  let xp = 0;
  prows.forEach(r => {
    xp += 10;
    if (r.win) xp += 15;
    xp += (getPath(r, 'core.goals') || 0) * 8;
    xp += (getPath(r, 'core.assists') || 0) * 5;
    xp += (getPath(r, 'core.saves') || 0) * 4;
    if (getPath(r, 'core.mvp')) xp += 20;
    xp += (getPath(r, 'core.shots') || 0) * 2;
    xp += (getPath(r, 'demo.inflicted') || 0) * 3;
    if (r.overtime && r.win) xp += 10;
  });

  return Math.round(xp);
}

function getPlayerLevel(xp) {
  let current = LEVEL_THRESHOLDS[0];
  let next = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];

  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i].xp) {
      current = LEVEL_THRESHOLDS[i];
      next = LEVEL_THRESHOLDS[i + 1] || LEVEL_THRESHOLDS[i];
      break;
    }
  }

  return { current, next, xp };
}

function renderGamification(rows) {
  const ps = [...activePlayers].sort();
  if (!ps.length) return;

  const recordsWrap = $('#playerRecords');
  if (!recordsWrap) return;

  const cards = recordsWrap.querySelectorAll('.prec-card');
  cards.forEach((card, index) => {
    const player = ps[index];
    if (!player) return;

    const oldBadges = card.querySelectorAll('.level-badge, .progress-wrapper');
    oldBadges.forEach(el => el.remove());

    const xp = computePlayerXP(rows, player);
    const { current, next, xp: currentXp } = getPlayerLevel(xp);
    const progress = Math.min(100, ((xp - current.xp) / (next.xp - current.xp)) * 100 || 0);

    const nameEl = card.querySelector('.name');
    if (nameEl) {
      const badge = document.createElement('span');
      badge.className = 'level-badge';
      badge.style.cssText = `
        font-size: 14px;
        margin-left: 8px;
        background: rgba(255,255,255,0.1);
        padding: 2px 8px;
        border-radius: 999px;
        font-family: 'Rajdhani', sans-serif;
        font-weight: 700;
      `;
      badge.textContent = `${current.badge} Lv.${current.level} ${current.name}`;
      nameEl.appendChild(badge);
    }

    const row = card.querySelector('.row');
    if (row) {
      const progressDiv = document.createElement('div');
      progressDiv.className = 'progress-wrapper';
      progressDiv.style.cssText = `
        margin-top: 6px;
        display: flex;
        align-items: center;
        gap: 8px;
      `;
      progressDiv.innerHTML = `
        <div style="flex:1; height:4px; background:var(--boost-track); border-radius:2px; overflow:hidden;">
          <div style="height:100%; width:${progress}%; background:linear-gradient(90deg, ${playerColor[player]}, #fff); border-radius:2px; transition:width 0.5s ease;"></div>
        </div>
        <span style="font-size:10px; color:var(--text-muted); font-family:'JetBrains Mono',monospace;">${Math.round(progress)}%</span>
      `;
      row.parentNode.insertBefore(progressDiv, row.nextSibling);
    }
  });
}

// ================================================================
//  CLUTCH ANALIZA
// ================================================================

function renderClutchAnalysis(rows) {
  const ps = [...activePlayers].sort();
  if (!ps.length) return;

  const overviewTab = $('#overviewProfileExtra');
  if (!overviewTab) return;

  const oldCard = document.getElementById('clutchCard');
  if (oldCard) oldCard.remove();

  const clutchCard = document.createElement('div');
  clutchCard.id = 'clutchCard';
  clutchCard.className = 'card';
  clutchCard.style.marginTop = '20px';

  const stats = ps.map(p => {
    const prows = rows.filter(r => r.player === p);
    const otMatches = prows.filter(r => r.overtime);
    const otWins = otMatches.filter(r => r.win).length;
    const otWinPct = otMatches.length ? Math.round((otWins / otMatches.length) * 100) : 0;
    const comebacks = prows.filter(r => r.win && r.max_deficit_overcome >= 2).length;
    const chokes = prows.filter(r => !r.win && r.max_lead_lost >= 2).length;
    const clutchScore = (otWinPct / 100 * 50) + (comebacks * 5) - (chokes * 3);
    return { p, otMatches: otMatches.length, otWins, otWinPct, comebacks, chokes, clutchScore };
  });

  stats.sort((a, b) => b.clutchScore - a.clutchScore);

  if (stats.every(s => s.otMatches === 0 && s.comebacks === 0 && s.chokes === 0)) {
    clutchCard.innerHTML = `
      <h2><span>🔥 Clutch analiza <small>produžeci &amp; preokreti</small></span></h2>
      <div class="empty">Nema dovoljno podataka za clutch analizu (potrebni produžeci ili preokreti)</div>
    `;
    overviewTab.appendChild(clutchCard);
    return;
  }

  clutchCard.innerHTML = `
    <h2><span>🔥 Clutch analiza <small>produžeci &amp; preokreti</small></span></h2>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
      ${stats.map(s => `
        <div style="background:var(--surface-2); border-radius:10px; padding:14px 16px; border-left:3px solid ${playerColor[s.p]};">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-weight:700; color:${playerColor[s.p]};">${s.p}</span>
            <span style="font-size:20px; font-weight:700; color:${s.clutchScore > 0 ? 'var(--green)' : 'var(--loss)'};">${s.clutchScore > 0 ? '+' : ''}${s.clutchScore.toFixed(1)}</span>
          </div>
          <div style="display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--text-muted);">
            <span>🏆 OT: ${s.otWins}/${s.otMatches} (${s.otWinPct}%)</span>
            <span>🔄 Preokreti: ${s.comebacks}</span>
            <span>💔 Izgubljene prednosti: ${s.chokes}</span>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="subtle-note" style="margin-top:12px;">
      Clutch faktor = OT win% + 5 po preokretu - 3 po izgubljenoj prednosti
    </div>
  `;

  overviewTab.appendChild(clutchCard);
}

// ================================================================
//  PLAYER IMPACT SCORE (PIS)
// ================================================================

function computePIS(rows, player) {
  const prows = rows.filter(r => r.player === player);
  if (!prows.length) return null;

  const matches = prows.length;
  const wins = prows.filter(r => r.win).length;
  const winPct = (wins / matches) * 100;

  const goalsPerMatch = avg(prows.map(r => getPath(r, 'core.goals') || 0));
  const assistsPerMatch = avg(prows.map(r => getPath(r, 'core.assists') || 0));
  const savesPerMatch = avg(prows.map(r => getPath(r, 'core.saves') || 0));
  const shotsPerMatch = avg(prows.map(r => getPath(r, 'core.shots') || 0));
  const scorePerMatch = avg(prows.map(r => getPath(r, 'core.score') || 0));
  const boostAvg = avg(prows.map(r => getPath(r, 'boost.avg_amount') || 0));
  const demoDiff = sum(prows.map(r => (getPath(r, 'demo.inflicted') || 0) - (getPath(r, 'demo.taken') || 0))) / matches;
  const mvpRate = prows.filter(r => getPath(r, 'core.mvp')).length / matches * 100;

  const pis =
    (goalsPerMatch * 2.5) +
    (assistsPerMatch * 1.8) +
    (savesPerMatch * 1.2) +
    (shotsPerMatch * 0.3) +
    (winPct / 20) +
    (scorePerMatch / 80) +
    (boostAvg / 20) +
    (demoDiff * 0.5) +
    (mvpRate / 20);

  return Math.round(pis * 10) / 10;
}

function renderPlayerImpact(rows) {
  const ps = [...activePlayers].sort();
  if (!ps.length) return;

  const overviewTab = $('#overviewProfileExtra');
  if (!overviewTab) return;

  const oldCard = document.getElementById('pisCard');
  if (oldCard) oldCard.remove();

  const stats = ps.map(p => ({
    p,
    pis: computePIS(rows, p),
    matches: rows.filter(r => r.player === p).length,
  })).filter(s => s.pis !== null);

  stats.sort((a, b) => b.pis - a.pis);

  const pisCard = document.createElement('div');
  pisCard.id = 'pisCard';
  pisCard.className = 'card';
  pisCard.style.marginTop = '20px';

  if (!stats.length || stats.every(s => s.matches === 0)) {
    pisCard.innerHTML = `
      <h2><span>📊 Player Impact Score <small>ukupan uticaj na igru</small></h2>
      <div class="empty">Nema dovoljno podataka za PIS izračun</div>
    `;
    overviewTab.appendChild(pisCard);
    return;
  }

  const maxPIS = Math.max(1, ...stats.map(s => s.pis));

  pisCard.innerHTML = `
    <h2><span>📊 Player Impact Score <small>ukupan uticaj na igru</small></span></h2>
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${stats.map((s, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:6px 0; border-bottom:1px solid var(--border);">
          <div style="width:24px; font-family:'JetBrains Mono',monospace; font-size:12px; color:var(--text-muted);">#${i+1}</div>
          <div style="width:120px; font-weight:700; color:${playerColor[s.p]};">${s.p}</div>
          <div style="flex:1; height:20px; background:var(--boost-track); border-radius:4px; overflow:hidden; position:relative;">
            <div style="height:100%; width:${(s.pis/maxPIS)*100}%; background:linear-gradient(90deg, ${playerColor[s.p]}, #fff); border-radius:4px; transition:width 0.5s ease;"></div>
            <div style="position:absolute; right:4px; top:50%; transform:translateY(-50%); font-size:10px; font-weight:700; color:rgba(255,255,255,0.8);">${s.pis}</div>
          </div>
          <div style="font-size:11px; color:var(--text-muted); font-family:'JetBrains Mono',monospace; width:60px; text-align:right;">${s.matches} meč</div>
        </div>
      `).join('')}
    </div>
    <div class="subtle-note" style="margin-top:12px;">
      PIS = Golovi×2.5 + Asistencije×1.8 + Odbrane×1.2 + Šutevi×0.3 + Win%/20 + Score/80 + Boost/20 + Demo diff×0.5 + MVP%/20
    </div>
  `;

  overviewTab.appendChild(pisCard);
}


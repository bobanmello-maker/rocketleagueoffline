// ================================================================
//  CHEMISTRY TAB
// ================================================================

let chemMode = '2v2';
let chemCurrentPage = 1;
const CHEM_PAGE_SIZE = 14;
let lastChemRows = [];       // filtrirani redovi na osnovu kojih je Chemistry racunat
let lastChemGroups = {};     // { combKey: { total, wins, members:[...], matches:[{replay_id,team_color,date,map,win,team_goals,opponent_goals}] } }

const GUEST_PALETTE = ['#9CA3AF', '#C084FC', '#38BDF8', '#F472B6', '#34D399'];

function hexToRgb(hex){
  const h = (hex || '#8A93A3').replace('#','');
  const n = h.length === 3 ? h.split('').map(c => c+c).join('') : h;
  const num = parseInt(n, 16) || 0;
  return [(num>>16)&255, (num>>8)&255, num&255];
}
function blendColors(hexArr){
  if(!hexArr.length) return '#8A93A3';
  const sum = [0,0,0];
  hexArr.forEach(h => { const [r,g,b] = hexToRgb(h); sum[0]+=r; sum[1]+=g; sum[2]+=b; });
  const n = hexArr.length;
  return `rgb(${Math.round(sum[0]/n)}, ${Math.round(sum[1]/n)}, ${Math.round(sum[2]/n)})`;
}

// Prosecna statistika jednog clana kombinacije preko svih zajednickih meceva.
// Prvo pokusava sopstveni red (nasa cetvorka - kao i do sada), a ako igrac
// nema sopstveni red (gost, nije neko od nas cetvoro) - vadi njegovu statistiku
// iz teammate_stats snapshot-a koji su nasi igraci sacuvali za taj mec. To
// polje postoji tek posle sledeceg osvezavanja podataka (fetch_stats.py) -
// dok se to ne desi, gost jednostavno nema dostupnu statistiku.
function getMemberAggStats(data, name, catKeys){
  const matchIds = new Set(data.matches.map(m => m.replay_id));
  const buildFromSource = (sourceList, pathFn) => {
    const stats = {};
    Object.keys(catKeys).forEach(cat => {
      stats[cat] = {};
      catKeys[cat].forEach(k => { stats[cat][k] = avg(sourceList.map(s => Number(pathFn(s, cat, k)) || 0)); });
    });
    return stats;
  };

  const ownRows = lastChemRows.filter(r => r.player === name && matchIds.has(r.replay_id));
  if(ownRows.length){
    return { stats: buildFromSource(ownRows, (r,cat,k) => getPath(r, `${cat}.${k}`)), matches: ownRows.length };
  }

  const samples = [];
  data.matches.forEach(m => {
    const row = lastChemRows.find(r => r.replay_id === m.replay_id && r.team_color === m.team_color && r.teammate_stats && r.teammate_stats[name]);
    if(row) samples.push(row.teammate_stats[name]);
  });
  if(!samples.length) return null;
  return { stats: buildFromSource(samples, (s,cat,k) => (s[cat]||{})[k]), matches: samples.length };
}

function renderChemistry(rows){
  lastChemRows = rows;
  const seen = new Set();
  const groups2 = {};
  const groups3 = {};

  rows.forEach(r => {
    const key = r.replay_id + '|' + r.team_color;
    if(seen.has(key)) return;
    seen.add(key);

    const teamMembers = [...new Set([r.player, ...(r.teammates || [])])];
    let target = null;
    if(teamMembers.length === 2) target = groups2;
    else if(teamMembers.length === 3) target = groups3;
    else return;

    const membersSorted = [...teamMembers].sort();
    const combKey = membersSorted.join(' & ');
    if(!target[combKey]) target[combKey] = { total:0, wins:0, members:membersSorted, matches:[] };
    target[combKey].total++;
    if(r.win) target[combKey].wins++;
    target[combKey].matches.push({
      replay_id: r.replay_id, team_color: r.team_color, date: r.date, map: r.map,
      win: r.win, team_goals: r.team_goals, opponent_goals: r.opponent_goals,
    });
  });

  const active = chemMode === '3v3' ? groups3 : groups2;
  lastChemGroups = active;

  // Sortirano po broju odigranih mečeva zajedno (najviše prvo).
  const entries = Object.entries(active).sort((a,b) => b[1].total - a[1].total);

  const totalPages = Math.ceil(entries.length / CHEM_PAGE_SIZE) || 1;
  if(chemCurrentPage > totalPages) chemCurrentPage = totalPages;
  if(chemCurrentPage < 1) chemCurrentPage = 1;
  const start = (chemCurrentPage - 1) * CHEM_PAGE_SIZE;
  const pageEntries = entries.slice(start, start + CHEM_PAGE_SIZE);

  $('#chemPageInfo').textContent = `Strana ${chemCurrentPage} od ${totalPages}`;
  $('#chemPrevPageBtn').disabled = chemCurrentPage <= 1;
  $('#chemNextPageBtn').disabled = chemCurrentPage >= totalPages;

  const emptyEl = $('#chemEmpty');
  const gridEl = $('#chemComboGrid');

  if(!pageEntries.length){
    emptyEl.style.display = 'block';
    emptyEl.textContent = `Nema ${chemMode} mečeva u izabranom periodu`;
    gridEl.innerHTML = '';
    return;
  }
  emptyEl.style.display = 'none';

  gridEl.innerHTML = pageEntries.map(([comb, d]) => {
    const losses = d.total - d.wins;
    const pct = Math.round((d.wins/d.total)*100);
    const borderColor = blendColors(d.members.map(m => playerColor[m] || '#9CA3AF'));
    const namesHtml = d.members.map(m => `<span style="color:${playerColor[m]||'#9CA3AF'}">${m}</span>`).join(' &amp; ');
    return `
      <div class="prec-card chem-combo-card" style="border-left-color:${borderColor}" data-comb="${comb.replace(/"/g,'&quot;')}">
        <div class="name">${namesHtml}</div>
        <div class="row">
          <span class="wl"><span class="w">${d.wins}P</span> – <span class="l">${losses}I</span></span>
          <span class="pct">${pct}% win</span>
        </div>
        <div class="bar-track"><div class="bar-fill" data-pct="${pct}" style="background:${borderColor}"></div></div>
        <div class="matches">${d.total} mečeva zajedno</div>
      </div>
    `;
  }).join('');

  gridEl.querySelectorAll('.chem-combo-card').forEach(card => {
    card.addEventListener('click', () => openTeamComboModal(card.dataset.comb));
  });

  // Animiraj popunjavanje bar-a posle rendera (umesto da odmah bude pun).
  requestAnimationFrame(() => {
    gridEl.querySelectorAll('.bar-fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
  });
}

const COMBO_CHART_KEYS = ['comboCat_core','comboCat_boost','comboCat_movement','comboCat_positioning','comboCat_demo'];

function openTeamComboModal(combKey){
  const data = lastChemGroups[combKey];
  if(!data) return;
  const members = combKey.split(' & ');

  const matchesSorted = data.matches.slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  const winPct = ((data.wins/data.total)*100).toFixed(0);

  const catBlocks = ['core','boost','movement','positioning','demo'];
  const catLabels = { core:'Osnovno', boost:'Boost', movement:'Kretanje', positioning:'Pozicioniranje', demo:'Demo' };
  const catKeys = {
    core: ['goals','assists','saves','shots','score','shooting_percentage'],
    boost: ['bpm','avg_amount','amount_collected','amount_stolen','percent_zero_boost','percent_full_boost'],
    movement: ['avg_speed','percent_supersonic_speed','percent_ground','percent_low_air','count_powerslide'],
    positioning: ['percent_defensive_third','percent_offensive_third','percent_behind_ball','avg_distance_to_ball','avg_distance_to_mates'],
    demo: ['inflicted','taken'],
  };

  let guestIdx = 0;
  const memberInfo = members.map(name => {
    const isGuest = !playerColor[name];
    const color = playerColor[name] || GUEST_PALETTE[guestIdx++ % GUEST_PALETTE.length];
    return { name, color, isGuest, agg: getMemberAggStats(data, name, catKeys) };
  });

  const namesHeaderHtml = memberInfo.map(m =>
    `<span style="color:${m.color}">${m.name}</span>${m.isGuest ? '<span class="guest-tag">gost</span>' : ''}`
  ).join(' &amp; ');

  const withStats = memberInfo.filter(m => m.agg);
  const missing = memberInfo.filter(m => !m.agg);
  const missingNote = missing.length
    ? `<div class="subtle-note" style="margin-top:0;">${missing.map(m=>m.name).join(', ')}: statistika još nije sačuvana za ove mečeve (biće dostupna posle sledećeg osvežavanja podataka).</div>`
    : '';

  const matchRowsHtml = matchesSorted.map(m => `
    <tr class="chem-match-row" data-replay="${m.replay_id}" style="cursor:pointer;">
      <td class="mono">${fmtDate(m.date)}</td><td>${m.map||''}</td>
      <td><span class="pill ${m.win?'win':'loss'}">${m.team_goals}–${m.opponent_goals}</span></td>
    </tr>
  `).join('');

  $('#modalContent').innerHTML = `
    <button class="modal-close" id="modalCloseBtn">&times;</button>
    <h3>${namesHeaderHtml}</h3>
    <div class="sub">${data.total} mečeva zajedno &middot; ${data.wins} pobeda &middot; <b>${winPct}% win rate</b></div>

    ${withStats.length ? `
      <div class="stat-block"><h4>Poređenje po igraču (prosek preko svih zajedničkih mečeva)</h4></div>
      ${missingNote}
      <div class="combo-cat-grid">
        ${catBlocks.map(cat => `
          <div class="combo-cat-block">
            <h4>${catLabels[cat]}</h4>
            <canvas id="comboCat_${cat}"></canvas>
          </div>
        `).join('')}
      </div>
    ` : missingNote}

    <div class="stat-block" style="margin-top:18px;"><h4>Svi zajednički mečevi</h4>
      <div class="table-wrap">
        <table style="width:100%;">
          <thead><tr><th>Datum</th><th>Mapa</th><th>Rezultat</th></tr></thead>
          <tbody>${matchRowsHtml}</tbody>
        </table>
      </div>
    </div>
  `;
  $('#modalCloseBtn').addEventListener('click', closeModal);
  document.querySelectorAll('.chem-match-row').forEach(tr => {
    tr.addEventListener('click', () => {
      const r = lastChemRows.find(row => row.replay_id === tr.dataset.replay && members.includes(row.player));
      if(r) openModal(r);
    });
  });

  // Bitno: modal mora biti VIDLJIV (display:flex) PRE nego sto Chart.js
  // izmeri canvas i nacrta grafikon - u suprotnom canvas ima 0x0 dimenzije
  // u trenutku kreiranja i neki tipovi grafikona (npr. radar) ostanu prazni.
  $('#modalBackdrop').classList.add('open');

  COMBO_CHART_KEYS.forEach(destroyChart);

  if(withStats.length){
    catBlocks.forEach(cat => {
      const keys = catKeys[cat];
      charts['comboCat_'+cat] = new Chart($('#comboCat_'+cat), {
        type:'bar',
        data:{
          labels: keys.map(statLabel),
          datasets: withStats.map(w => ({
            label: w.name,
            data: keys.map(k => Number((getPath(w.agg.stats, `${cat}.${k}`) || 0).toFixed(2))),
            backgroundColor: w.color,
          }))
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          animation:{ duration:600, easing:'easeOutQuart' },
          plugins:{ legend:{ display: withStats.length > 1, labels:{ color:'#8A93A3', boxWidth:10, font:{size:10} } } },
          scales:{
            x:{ ticks:{ color:'#8A93A3', font:{size:10} }, grid:{ display:false } },
            y:{ ticks:{ color:'#8A93A3', font:{size:10} }, grid:{ color:'rgba(255,255,255,0.05)' } }
          }
        }
      });
    });
  }
}

// ================================================================
//  RECORDS TAB
// ================================================================


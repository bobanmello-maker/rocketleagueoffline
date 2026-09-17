// ================================================================
//  OSTALE TAB FUNKCIJE (skraćeno - postoje u originalu)
// ================================================================

function renderAirChart(rows){
  const ps = [...activePlayers].sort();
  const ground = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'movement.percent_ground')||0)));
  const low = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'movement.percent_low_air')||0)));
  const high = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'movement.percent_high_air')||0)));
  destroyChart('air');
  charts.air = new Chart($('#airChart'), {
    type:'bar',
    data:{ labels:ps, datasets:[
      {label:'Zemlja', data:ground, backgroundColor:'#4ADE80'},
      {label:'Nizak vazduh', data:low, backgroundColor:'#FBBF24'},
      {label:'Visok vazduh', data:high, backgroundColor:'#3DA9FC'},
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8A93A3'}}},
      scales:{ x:{stacked:true,ticks:{color:'#8A93A3'},grid:{display:false}}, y:{stacked:true,max:100,ticks:{color:'#8A93A3',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.05)'}} } }
  });
}

function renderSpeedChart(rows){
  const ps = [...activePlayers].sort();
  const speed = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'movement.avg_speed')||0)));
  const supersonic = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'movement.percent_supersonic_speed')||0)));
  destroyChart('speed');
  charts.speed = new Chart($('#speedChart'), {
    data:{ labels:ps, datasets:[
      {type:'bar', label:'Prosečna brzina', data:speed, backgroundColor:'#3DA9FC', yAxisID:'y'},
      {type:'line', label:'% supersonic', data:supersonic, borderColor:'#FF6B35', backgroundColor:'#FF6B35', yAxisID:'y1'},
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8A93A3'}}},
      scales:{
        x:{ticks:{color:'#8A93A3'},grid:{display:false}},
        y:{position:'left',ticks:{color:'#8A93A3'},grid:{color:'rgba(255,255,255,0.05)'}},
        y1:{position:'right',max:100,ticks:{color:'#8A93A3',callback:v=>v+'%'},grid:{display:false}}
      } }
  });
}

function renderMovementTable(rows){
  const ps = [...activePlayers].sort();
  statTable('#movementTable', rows, ps, [
    {key:'movement.avg_speed', label:'Pros. brzina'},
    {key:'movement.percent_supersonic_speed', label:'% supersonic', fmt:v=>v.toFixed(1)+'%'},
    {key:'movement.total_distance', label:'Distanca'},
    {key:'movement.count_powerslide', label:'Powerslide #'},
    {key:'movement.avg_powerslide_duration', label:'Pros. trajanje', fmt:v=>v.toFixed(2)+'s'},
  ]);
}

function renderPositioningChart(rows){
  const ps = [...activePlayers].sort();
  const def = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'positioning.percent_defensive_third')||0)));
  const off = ps.map(p => avg(rows.filter(r=>r.player===p).map(r=>getPath(r,'positioning.percent_offensive_third')||0)));
  const neu = ps.map((p,i) => Math.max(0, 100 - def[i] - off[i]));
  destroyChart('pos');
  charts.pos = new Chart($('#posChart'), {
    type:'bar',
    data:{ labels:ps, datasets:[
      {label:'Odbrana', data:def, backgroundColor:'#3DA9FC'},
      {label:'Neutralna zona', data:neu, backgroundColor:'#8A93A3'},
      {label:'Napad', data:off, backgroundColor:'#FF6B35'},
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8A93A3'}}},
      scales:{ x:{stacked:true,ticks:{color:'#8A93A3'},grid:{display:false}}, y:{stacked:true,max:100,ticks:{color:'#8A93A3',callback:v=>v+'%'},grid:{color:'rgba(255,255,255,0.05)'}} } }
  });
}

function renderRotationRank(rows){
  const wrap = $('#rotationRank');
  if(!wrap) return;
  const ps = [...activePlayers];
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  const entries = ps.map(p => {
    const prows = rows.filter(r=>r.player===p);
    const val = avg(prows.map(r=>getPath(r,'positioning.percent_behind_ball')||0));
    return { p, val };
  }).sort((a,b) => b.val - a.val);

  const teamAvg = avg(entries.map(e=>e.val));
  const maxVal = Math.max(100, ...entries.map(e=>e.val));
  const medals = ['🥇','🥈','🥉'];

  wrap.innerHTML = `
    ${entries.map((e,i) => {
      const color = playerColor[e.p] || '#3DA9FC';
      const pct = (e.val / maxVal) * 100;
      const avgPct = (teamAvg / maxVal) * 100;
      return `
        <div class="rotation-rank-row">
          <div class="rotation-rank-medal">${medals[i] || (i+1)}</div>
          <div class="rotation-rank-name" style="color:${color}">${e.p}</div>
          <div class="rotation-rank-track">
            <div class="rotation-rank-avgline" style="left:${avgPct}%" title="Prosek ekipe: ${teamAvg.toFixed(0)}%"></div>
            <div class="rotation-rank-fill" data-w="${pct}" style="background:${color}; color:${color};"></div>
          </div>
          <div class="rotation-rank-val mono">${e.val.toFixed(0)}%</div>
        </div>
      `;
    }).join('')}
    <div class="rotation-rank-legend"><i></i> prosek ekipe (${teamAvg.toFixed(0)}%)</div>
  `;

  requestAnimationFrame(() => {
    wrap.querySelectorAll('.rotation-rank-fill').forEach(el => { el.style.width = el.dataset.w + '%'; });
  });
}

function renderPosTable(rows){
  const ps = [...activePlayers].sort();
  statTable('#posTable', rows, ps, [
    {key:'positioning.percent_behind_ball', label:'% iza lopte', fmt:v=>v.toFixed(1)+'%'},
    {key:'positioning.percent_most_back', label:'% poslednji', fmt:v=>v.toFixed(1)+'%'},
    {key:'positioning.avg_distance_to_ball', label:'Dist. do lopte'},
    {key:'positioning.avg_distance_to_mates', label:'Dist. do saigrača'},
    {key:'positioning.percent_closest_to_ball', label:'% najbliži', fmt:v=>v.toFixed(1)+'%'},
    {key:'positioning.goals_against_while_last_defender', label:'Primljeno kao zadnji'},
  ]);
}

function renderDemoDuelHud(rows){
  const wrap = $('#demoDuelHud');
  if(!wrap) return;
  const ps = [...activePlayers].sort();
  if(!ps.length){ wrap.innerHTML = '<div class="empty">Nema izabranih igrača</div>'; return; }

  const entries = ps.map(p => {
    const prows = rows.filter(r=>r.player===p);
    const inflicted = sum(prows.map(r=>getPath(r,'demo.inflicted')||0));
    const taken = sum(prows.map(r=>getPath(r,'demo.taken')||0));
    return { p, inflicted, taken, net: inflicted - taken };
  });
  const maxVal = Math.max(1, ...entries.flatMap(e => [e.inflicted, e.taken]));
  const topNet = Math.max(...entries.map(e=>e.net));

  wrap.innerHTML = entries.map(e => {
    const color = playerColor[e.p] || '#3DA9FC';
    const takenPct = (e.taken / maxVal) * 100;
    const givenPct = (e.inflicted / maxVal) * 100;
    const netClass = e.net > 0 ? 'pos' : (e.net < 0 ? 'neg' : 'zero');
    const netLabel = e.net > 0 ? `+${e.net}` : e.net;
    const crown = (e.net === topNet && topNet > 0) ? '<div class="demo-duel-crown">👑</div>' : '';
    return `
      <div class="demo-duel-card">
        ${crown}
        <div class="demo-duel-top"><div class="demo-duel-name" style="color:${color}">${e.p}</div></div>
        <div class="demo-duel-track">
          <div class="demo-duel-half taken"><div class="demo-duel-bar" data-w="${takenPct}"></div></div>
          <div class="demo-duel-center"></div>
          <div class="demo-duel-half given"><div class="demo-duel-bar" data-w="${givenPct}"></div></div>
        </div>
        <div class="demo-duel-labels">
          <span class="taken-val">👈 ${e.taken}</span>
          <span class="given-val">${e.inflicted} 👉</span>
        </div>
        <div class="demo-duel-net ${netClass}">${netLabel} neto</div>
      </div>
    `;
  }).join('');

  requestAnimationFrame(() => {
    wrap.querySelectorAll('.demo-duel-bar').forEach(el => { el.style.width = el.dataset.w + '%'; });
  });
}

function renderDemoChart(rows){
  const ps = [...activePlayers].sort();
  const inflicted = ps.map(p => sum(rows.filter(r=>r.player===p).map(r=>getPath(r,'demo.inflicted')||0)));
  const taken = ps.map(p => sum(rows.filter(r=>r.player===p).map(r=>getPath(r,'demo.taken')||0)));
  destroyChart('demo');
  charts.demo = new Chart($('#demoChart'), {
    type:'bar',
    data:{ labels:ps, datasets:[
      {label:'Zadati', data:inflicted, backgroundColor:'#4ADE80', borderRadius:6, maxBarThickness:42},
      {label:'Primljeni', data:taken, backgroundColor:'#F87171', borderRadius:6, maxBarThickness:42},
    ]},
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{labels:{color:'#8A93A3'}}},
      scales:{ x:{ticks:{color:'#8A93A3'},grid:{display:false}}, y:{ticks:{color:'#8A93A3'},grid:{color:'rgba(255,255,255,0.05)'},beginAtZero:true} } }
  });
}

function renderDemoTrend(rows){
  const byReplay = {};
  rows.forEach(r => {
    if(!byReplay[r.replay_id]) byReplay[r.replay_id] = { date: r.date, players: {} };
    byReplay[r.replay_id].players[r.player] = (getPath(r,'demo.inflicted')||0) - (getPath(r,'demo.taken')||0);
  });
  const ordered = Object.values(byReplay).sort((a,b) => (a.date||'').localeCompare(b.date||''));

  // kumulativna razlika kroz sezonu — glatka priča o dominaciji, umesto šuma po meču
  const running = {};
  const cumulative = ordered.map(m => {
    const players = {};
    [...activePlayers].forEach(p => {
      const diff = m.players[p];
      if(diff != null){ running[p] = (running[p] || 0) + diff; }
      players[p] = running[p] ?? null;
    });
    return { date: m.date, players };
  });

  lineChartFor('#demoTrendChart', 'demoTrend', cumulative, { maintainAspectRatio:false, pointRadius:0, pointHoverRadius:5, tension:0.3, fill:true, borderWidth:2.5 });
}


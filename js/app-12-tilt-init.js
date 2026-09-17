// ================================================================
//  😤 TILT DETECTOR
// ================================================================

function detectTilt(rows) {
    const ps = [...activePlayers];
    if (!ps.length) return null;
    
    const results = {};
    
    ps.forEach(p => {
        const prows = rows.filter(r => r.player === p);
        if (prows.length < 4) {
            results[p] = { status: 'insufficient', message: 'Potrebno najmanje 4 meča za analizu' };
            return;
        }
        
        // Sortiraj po datumu
        const sorted = prows.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        
        // Podeli na polovine
        const half = Math.floor(sorted.length / 2);
        const firstHalf = sorted.slice(0, half);
        const secondHalf = sorted.slice(half);
        
        // Izračunaj performanse za svaku polovinu
        const calcStats = (matches) => {
            if (!matches.length) return null;
            const goals = avg(matches.map(r => getPath(r, 'core.goals') || 0));
            const assists = avg(matches.map(r => getPath(r, 'core.assists') || 0));
            const saves = avg(matches.map(r => getPath(r, 'core.saves') || 0));
            const score = avg(matches.map(r => getPath(r, 'core.score') || 0));
            const winrate = matches.filter(r => r.win).length / matches.length * 100;
            const shots = avg(matches.map(r => getPath(r, 'core.shots') || 0));
            const boost = avg(matches.map(r => getPath(r, 'boost.avg_amount') || 0));
            return { goals, assists, saves, score, winrate, shots, boost, matches: matches.length };
        };
        
        const first = calcStats(firstHalf);
        const second = calcStats(secondHalf);
        
        if (!first || !second) {
            results[p] = { status: 'error', message: 'Greška pri računanju' };
            return;
        }
        
        // Izračunaj procentualne promene
        const changes = {
            goals: ((second.goals - first.goals) / (first.goals || 0.01)) * 100,
            assists: ((second.assists - first.assists) / (first.assists || 0.01)) * 100,
            saves: ((second.saves - first.saves) / (first.saves || 0.01)) * 100,
            score: ((second.score - first.score) / (first.score || 0.01)) * 100,
            winrate: second.winrate - first.winrate,
            shots: ((second.shots - first.shots) / (first.shots || 0.01)) * 100,
            boost: ((second.boost - first.boost) / (first.boost || 0.01)) * 100,
        };
        
        // Detektuj "tilt" - pad od > 25% u bilo kojoj kategoriji
        const tiltedCategories = [];
        const tiltThreshold = 25;
        const improveThreshold = 15;
        
        // Koje kategorije pokazuju pad?
        if (changes.goals < -tiltThreshold) tiltedCategories.push({ name: 'golovi', change: changes.goals });
        if (changes.assists < -tiltThreshold) tiltedCategories.push({ name: 'asistencije', change: changes.assists });
        if (changes.saves < -tiltThreshold) tiltedCategories.push({ name: 'odbrane', change: changes.saves });
        if (changes.score < -tiltThreshold) tiltedCategories.push({ name: 'score', change: changes.score });
        if (changes.winrate < -tiltThreshold) tiltedCategories.push({ name: 'win rate', change: changes.winrate });
        if (changes.shots < -tiltThreshold) tiltedCategories.push({ name: 'šutevi', change: changes.shots });
        
        // Koje kategorije pokazuju napredak?
        const improvedCategories = [];
        if (changes.goals > improveThreshold) improvedCategories.push({ name: 'golovi', change: changes.goals });
        if (changes.assists > improveThreshold) improvedCategories.push({ name: 'asistencije', change: changes.assists });
        if (changes.saves > improveThreshold) improvedCategories.push({ name: 'odbrane', change: changes.saves });
        if (changes.score > improveThreshold) improvedCategories.push({ name: 'score', change: changes.score });
        if (changes.winrate > improveThreshold) improvedCategories.push({ name: 'win rate', change: changes.winrate });
        
        // Odredi status
        let status = 'stable';
        let message = '';
        let emoji = '😐';
        let severity = 0;
        
        if (tiltedCategories.length >= 3) {
            status = 'tilted';
            emoji = '😤';
            severity = 3;
            message = `🚨 TEŠKI TILT! Pad u ${tiltedCategories.length} kategorija!`;
        } else if (tiltedCategories.length >= 2) {
            status = 'tilted';
            emoji = '😤';
            severity = 2;
            const worst = tiltedCategories.sort((a, b) => a.change - b.change)[0];
            message = `😤 Tilt detektovan! Najveći pad: ${worst.name} (${worst.change.toFixed(0)}%)`;
        } else if (tiltedCategories.length === 1) {
            status = 'warning';
            emoji = '😅';
            severity = 1;
            const cat = tiltedCategories[0];
            message = `⚠️ Blagi pad u ${cat.name} (${cat.change.toFixed(0)}%)`;
        } else if (improvedCategories.length >= 2) {
            status = 'improving';
            emoji = '🔥';
            severity = -1;
            message = `🔥 U poletu! Napredak u ${improvedCategories.length} kategorija!`;
        } else {
            status = 'stable';
            emoji = '😎';
            message = '✅ Stabilne performanse kroz celu sesiju';
        }
        
        // Dodaj duhoviti komentar
        const comments = {
            tilted: [
                'Izgleda da je neko trebao da pauzira ranije 😅',
                'Vreme je za pauzu i vodu 💧',
                'Ko je rekao da je rocket league opuštajuća igra? 😂',
                'Možda je vreme za switch na casual? 🤔',
                'Tilt je stvaran, prijatelju! 😤'
            ],
            warning: [
                'Počinje da se oseća umor... 🥱',
                'Samo jedan loš meč, još uvek si u igri! 💪',
                'Nisi još na dnu, ali se približavaš... 😅'
            ],
            improving: [
                'Sve jači! Ko te zaustavlja? 🔥',
                'Ovo je tvoj dan! Nastavi tako! 💪',
                'Forma je na vrhuncu! 🚀'
            ],
            stable: [
                'Konzistentnost je ključ! 👏',
                'Kao švajcarski sat - precizno i pouzdano! ⏱️',
                'Ovo je pravi profesionalac! 🎯'
            ]
        };
        
        const commentList = comments[status] || comments.stable;
        const randomComment = commentList[Math.floor(Math.random() * commentList.length)];
        
        // Izračunaj ukupni "tilt score" (0-100)
        const avgChange = Object.values(changes).reduce((a, b) => a + b, 0) / Object.values(changes).length;
        const tiltScore = Math.min(100, Math.max(0, 50 - avgChange * 0.5));
        
        results[p] = {
            status,
            emoji,
            severity,
            message,
            comment: randomComment,
            tiltScore: Math.round(tiltScore),
            changes,
            firstHalf: first,
            secondHalf: second,
            tiltedCategories,
            improvedCategories,
            matches: sorted.length,
        };
    });
    
    return results;
}

// ================================================================
//  😤 TILT DETECTOR - DORADJENA VERZIJA
// ================================================================

function renderTiltDetector(rows) {
    const container = document.getElementById('tiltDetectorContent');
    if (!container) return;
    
    const results = detectTilt(rows);
    if (!results) {
        container.innerHTML = '<div class="empty">Nema dovoljno podataka za tilt analizu</div>';
        return;
    }
    
    // Prevodimo ključeve na srpski
    const metricLabels = {
        goals: 'Golovi',
        assists: 'Asistencije',
        saves: 'Odbrane',
        score: 'Poeni',
        winrate: 'Pobede',
        shots: 'Šutevi',
        boost: 'Boost'
    };
    
    const emojiMap = {
        tilted: '😤',
        warning: '😅',
        improving: '🔥',
        stable: '😎'
    };
    
    const statusMap = {
        tilted: '🚨 TILT DETEKTOVAN!',
        warning: '⚠️ Blagi pad forme',
        improving: '📈 U poletu!',
        stable: '✅ Stabilne performanse'
    };
    
    let html = `<div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:16px;">`;
    
    Object.entries(results).forEach(([player, data]) => {
        if (data.status === 'insufficient') {
            html += `
                <div class="card" style="padding:14px; opacity:0.5; border:1px dashed var(--border);">
                    <h4 style="color:${playerColor[player] || '#fff'}; margin:0 0 4px;">${player}</h4>
                    <div style="font-size:12px; color:var(--text-muted);">${data.message}</div>
                </div>
            `;
            return;
        }
        
        // Boja na osnovu statusa
        let borderColor = 'var(--border)';
        let bgGradient = 'var(--surface-2)';
        let accentColor = 'var(--text-muted)';
        
        if (data.status === 'tilted') {
            borderColor = '#F87171';
            bgGradient = 'linear-gradient(135deg, rgba(248,113,113,0.12), rgba(248,113,113,0.03))';
            accentColor = '#F87171';
        } else if (data.status === 'warning') {
            borderColor = '#FBBF24';
            bgGradient = 'linear-gradient(135deg, rgba(251,191,36,0.10), rgba(251,191,36,0.02))';
            accentColor = '#FBBF24';
        } else if (data.status === 'improving') {
            borderColor = '#4ADE80';
            bgGradient = 'linear-gradient(135deg, rgba(74,222,128,0.10), rgba(74,222,128,0.02))';
            accentColor = '#4ADE80';
        } else {
            borderColor = '#3DA9FC';
            bgGradient = 'linear-gradient(135deg, rgba(61,169,252,0.06), rgba(61,169,252,0.01))';
            accentColor = '#3DA9FC';
        }
        
        // Tilt score bar
        const scoreColor = data.tiltScore > 70 ? '#F87171' : data.tiltScore > 40 ? '#FBBF24' : '#4ADE80';
        
        // Spremi promene za prikaz
        const changes = Object.entries(data.changes || {});
        
        html += `
            <div class="card" style="
                padding:16px; 
                background: ${bgGradient};
                border-left: 4px solid ${borderColor};
                transition: all 0.3s ease;
            ">
                <!-- Header: Ime i emoji -->
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <h4 style="color:${playerColor[player] || '#fff'}; margin:0; font-size:17px;">
                        ${player}
                    </h4>
                    <span style="font-size:30px; line-height:1;">${data.emoji || emojiMap[data.status] || '😐'}</span>
                </div>
                
                <!-- Status i komentar -->
                <div style="font-size:15px; font-weight:700; color:${accentColor}; margin-bottom:2px;">
                    ${statusMap[data.status] || data.message}
                </div>
                <div style="font-size:13px; color:var(--text-muted); margin-bottom:10px; font-style:italic;">
                    "${data.comment || 'Nema komentara'}"
                </div>
                
                <!-- Info o mečevima -->
                <div style="display:flex; gap:14px; margin:6px 0 10px; font-size:12px; color:var(--text-muted); flex-wrap:wrap;">
                    <span>📊 ${data.matches || 0} mečeva</span>
                    <span>📈 Početak: ${data.firstHalf?.matches || 0} meč</span>
                    <span>📉 Kraj: ${data.secondHalf?.matches || 0} meč</span>
                </div>
                
                <!-- Tilt score bar -->
                <div style="margin-bottom:12px;">
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted);">
                        <span>😌 Smiren</span>
                        <span>😤 Tilt</span>
                    </div>
                    <div style="height:6px; background:var(--boost-track); border-radius:3px; overflow:hidden;">
                        <div style="height:100%; width:${data.tiltScore || 0}%; background:${scoreColor}; border-radius:3px; transition:width 0.8s ease;"></div>
                    </div>
                </div>
                
                <!-- Metrike - dve kolone -->
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:3px 16px; font-size:12px; border-top:1px solid var(--border); padding-top:10px;">
                    ${changes.map(([key, val]) => {
                        const label = metricLabels[key] || key;
                        const isPositive = val > 0;
                        const isNegative = val < 0;
                        const color = isPositive ? 'var(--green)' : isNegative ? 'var(--loss)' : 'var(--text-muted)';
                        const sign = val > 0 ? '+' : '';
                        return `
                            <div style="display:flex; justify-content:space-between; padding:2px 0;">
                                <span style="color:var(--text-muted);">${label}</span>
                                <span style="color:${color}; font-weight:600; font-family:'JetBrains Mono',monospace;">
                                    ${sign}${val.toFixed(0)}%
                                </span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}
function trenerBrkaMood(data){
  const tm = data?.teamStats;
  if(!tm || !tm.total_matches) return { emoji:'🧐', label:'Proučava' };
  const wr = tm.total_wins / tm.total_matches;
  if(wr >= 0.6) return { emoji:'😎', label:'Zadovoljan' };
  if(wr >= 0.4) return { emoji:'🧐', label:'Skeptičan' };
  return { emoji:'😤', label:'Nervozan' };
}

function typewriterInto(el, text, speed){
  if(!el) return;
  el.classList.add('ai-typewriter');
  el.classList.remove('ai-typing-done');
  el.textContent = '';
  let i = 0;
  const step = Math.max(1, Math.round(text.length / 90)); // brže za duži tekst, da ne traje večno
  const tick = () => {
    i += step;
    el.textContent = text.slice(0, i);
    if(i < text.length){
      setTimeout(tick, speed || 12);
    } else {
      el.textContent = text;
      el.classList.add('ai-typing-done');
    }
  };
  tick();
}

function showAIAnalysisModal(analysis, data, usedFallback){
  const modal = $('#aiModalContent');
  // odbrana od slučaja da model vrati npr. string umesto niza za strengths/tips/itd -
  // bez ovoga bi .map pukao i ceo modal tiho ne bi prikazao ništa
  const asArray = v => Array.isArray(v) ? v : (v ? [String(v)] : []);
  const strengths = asArray(analysis?.strengths);
  const weaknesses = asArray(analysis?.weaknesses);
  const tips = asArray(analysis?.tips);
  const training = asArray(analysis?.training);
  const summary = analysis?.summary ? String(analysis.summary) : '';
  const playersText = analysis?.players ? String(analysis.players) : '';
  const mood = trenerBrkaMood(data);

  try{
    modal.innerHTML = `
      <button class="modal-close" id="aiModalClose">&times;</button>
      <div class="ai-persona-head">
        <div class="ai-persona-avatar">${mood.emoji}</div>
        <div class="ai-persona-info">
          <div class="ai-persona-name">Trener Brka</div>
          <div class="ai-persona-title">Analitičar terena &middot; ${mood.label}</div>
        </div>
      </div>
      <div class="sub">${data?.teamStats?.total_matches || 0} mečeva &middot; ${new Date().toLocaleString('sr-RS')}</div>
      ${usedFallback ? `<div class="fallback-badge">⚠️ Trener Brka je bez mreže — improvizuje po pravilima (AI trenutno nedostupan)</div>` : ''}

      <div class="analysis-section" style="border-left:3px solid #7C3AED; margin-top:16px;">
        <h4 style="color:#7C3AED;">📊 Sažetak</h4>
        <p id="aiSummaryText" style="margin:0; font-size:13px; line-height:1.7; color:var(--text); min-height:1.4em;"></p>
      </div>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px;">
        <div class="analysis-section" style="border-left:3px solid var(--green);">
          <h4 style="color:var(--green);">✅ Snage</h4>
          <ul>${strengths.map(s => `<li>${s}</li>`).join('')}</ul>
        </div>
        <div class="analysis-section" style="border-left:3px solid var(--loss);">
          <h4 style="color:var(--loss);">⚠️ Slabosti</h4>
          <ul>${weaknesses.map(s => `<li>${s}</li>`).join('')}</ul>
        </div>
      </div>

      ${playersText ? `
      <div class="analysis-section" style="border-left:3px solid var(--blue);">
        <h4 style="color:var(--blue);">👤 Analiza po igraču</h4>
        <div style="white-space:pre-wrap; font-size:13px; line-height:1.8; color:var(--text-muted);">${playersText}</div>
      </div>` : ''}

      <div class="analysis-section" style="border-left:3px solid var(--amber);">
        <h4 style="color:var(--amber);">💡 Konkretni saveti</h4>
        <ul>${tips.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>

      ${training.length ? `
      <div class="analysis-section" style="border-left:3px solid var(--blue);">
        <h4 style="color:var(--blue);">🎯 Trening preporuke</h4>
        <ul>${training.map(s => `<li>${s}</li>`).join('')}</ul>
      </div>` : ''}
    `;
    typewriterInto($('#aiSummaryText'), summary, 12);
  }catch(e){
    console.error('[AI] Renderovanje modala nije uspelo:', e);
    modal.innerHTML = `
      <button class="modal-close" id="aiModalClose">&times;</button>
      <h3>🧔 Trener Brka</h3>
      <p style="color:var(--text-muted); font-size:13px;">Došlo je do greške pri prikazu analize. Detalji su u konzoli (F12 → Console).</p>
    `;
  }

  if(window.SFX) SFX.whoosh();
  $('#aiModalClose').addEventListener('click', () => $('#aiModalBackdrop').classList.remove('open'));
  $('#aiModalBackdrop').classList.add('open');
}

$('#aiAnalyzeBtn').addEventListener('click', () => {
  const rows = getFiltered();
  if(rows.length < 5){
    alert('Potrebno je najmanje 5 mečeva u izabranom periodu za smislenu analizu.');
    return;
  }
  analyzeWithAI(rows);
});

// sigurnosna mreža: ako NEŠTO potpuno neočekivano pukne bilo gde na stranici dok
// je dugme za AI analizu u stanju "Analiziram...", vrati ga u normalno stanje i
// glasno ispiši grešku u konzoli, umesto da ostane zaglavljeno u tišini
function resetStuckAIButton(source, err){
  console.error('[AI] Uhvaćena neočekivana greška (' + source + '):', err);
  const btn = $('#aiAnalyzeBtn');
  if(btn && btn.disabled){
    btn.innerHTML = `<span style="font-size:18px;"></span> Analiza`;
    btn.disabled = false;
  }
}
window.addEventListener('error', e => resetStuckAIButton('window error', e.error || e.message));
window.addEventListener('unhandledrejection', e => resetStuckAIButton('unhandled promise rejection', e.reason));

// pauziraj animaciju čestica u pozadini dok je AI modal otvoren - manje posla za
// glavnu nit dok se čeka/čita analiza
const aiModalObserver = new MutationObserver(() => {
  const isOpen = $('#aiModalBackdrop')?.classList.contains('open');
  if(!particleSystem) return;
  if(isOpen && particleSystem.animationId){
    particleSystem.destroy();
  } else if(!isOpen && !particleSystem.animationId){
    particleSystem.animate();
  }
});
if($('#aiModalBackdrop')) aiModalObserver.observe($('#aiModalBackdrop'), { attributes: true, attributeFilter: ['class'] });

load();

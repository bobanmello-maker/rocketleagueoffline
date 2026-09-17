// ================================================================
//  AI ANALITIČAR
// ================================================================

const WORKER_URL = 'https://rocketleague-ai-proxy.boban-mello.workers.dev';
const APP_SECRET = 'promeni-ovo-2026-rl-stats';

const aiAnalysisCache = new Map();

function aiCacheKey(rows){
  const ids = rows.map(r => r.replay_id + '|' + r.player).sort().join(',');
  return modeFilter + '|' + [...activePlayers].sort().join(',') + '|' + ids.length + '|' + ids.slice(0,500);
}

function getPreviousPeriodRows(currentRows){
  const fromStr = $('#dateFrom').value;
  const toStr = $('#dateTo').value;
  let startDate, endDate;

  if(fromStr && toStr){
    startDate = new Date(fromStr);
    endDate = new Date(toStr);
  } else {
    const dates = currentRows.map(r => r.date).filter(Boolean).sort();
    if(!dates.length) return [];
    startDate = new Date(dates[0].slice(0,10));
    endDate = new Date(dates[dates.length-1].slice(0,10));
  }

  const dayMs = 24 * 3600 * 1000;
  const lengthMs = Math.max(endDate - startDate, dayMs);
  const prevEnd = new Date(startDate.getTime() - dayMs);
  const prevStart = new Date(prevEnd.getTime() - lengthMs);

  const modeRows = modeFilter === 'all' ? RAW : RAW.filter(r => r.mode === modeFilter);
  return modeRows.filter(r => {
    if(!activePlayers.has(r.player) || !r.date) return false;
    const d = new Date(r.date.slice(0,10));
    return d >= prevStart && d <= prevEnd;
  });
}

function prepareDetailedData(rows){
  const players = {};
  const avgFn = arr => arr.length ? arr.reduce((a,b) => a + b, 0) / arr.length : 0;

  [...activePlayers].forEach(p => {
    const prows = rows.filter(r => r.player === p);
    if(prows.length < 2) return;

    const goals = prows.map(r => getPath(r,'core.goals') || 0);
    const assists = prows.map(r => getPath(r,'core.assists') || 0);
    const saves = prows.map(r => getPath(r,'core.saves') || 0);
    const shots = prows.map(r => getPath(r,'core.shots') || 0);
    const boostAvg = prows.map(r => getPath(r,'boost.avg_amount') || 0);
    const zeroBoost = prows.map(r => getPath(r,'boost.percent_zero_boost') || 0);
    const behindBall = prows.map(r => getPath(r,'positioning.percent_behind_ball') || 0);
    const demosInflicted = prows.map(r => getPath(r,'demo.inflicted') || 0);
    const demosTaken = prows.map(r => getPath(r,'demo.taken') || 0);

    players[p] = {
      matches: prows.length,
      winrate: Math.round((prows.filter(r => r.win).length / prows.length) * 100),
      goals_pm: +avgFn(goals).toFixed(2),
      assists_pm: +avgFn(assists).toFixed(2),
      saves_pm: +avgFn(saves).toFixed(2),
      shots_pm: +avgFn(shots).toFixed(2),
      avg_boost: Math.round(avgFn(boostAvg)),
      zero_boost_pct: +avgFn(zeroBoost).toFixed(1),
      behind_ball_pct: Math.round(avgFn(behindBall)),
      demos_pm: +avgFn(demosInflicted).toFixed(2),
      demos_taken_pm: +avgFn(demosTaken).toFixed(2),
      mvp_count: prows.filter(r => getPath(r,'core.mvp')).length,
      best_goals_in_match: Math.max(0, ...goals),
    };
  });

  // "wins" moraju biti brojani po JEDINSTVENOM meču (replay_id), ne po redu.
  // Svaki meč ima jedan red PO IGRAČU koji je u njemu igrao (npr. 2 reda za
  // 2v2), pa brojanje rows.filter(win) duplira svaku pobedu onoliko puta
  // koliko je tvojih igrača bilo u toj partiji.
  const uniqueMatches = [...new Map(rows.map(r => [r.replay_id, r])).values()];

  const teamStats = {
    total_matches: uniqueMatches.length,
    total_goals: rows.reduce((s,r) => s + (getPath(r,'core.goals') || 0), 0),
    total_wins: uniqueMatches.filter(r => r.win).length,
    mode: modeFilter,
  };

  return { players, teamStats };
}

async function callGroqAPI(data, prevData){
  const hasComparison = prevData && Object.keys(prevData.players || {}).length > 0;

  const systemPrompt = `Zoveš se Trener Brka - iskusan, direktan Rocket League trener-analitičar sa stavom, ne suvoparan
izveštaj. Pišeš na srpskom jeziku, konkretno i sa ličnošću: pohvališ ono što zaslužuje pohvalu bez
ustručavanja, ali isto tako otvoreno kažeš kad nešto ne valja, sa malo duha i direktnosti (kao pravi
trener u svlačionici), možeš ponekad koristiti stil koji koristi u analizi Rade Bogdanović sa TV RTS sa primesama rečnika Zorice Marković kada se iznervira ali u šaljivom fazonu. Svaka tvrdnja MORA biti
potkrepljena konkretnom brojkom iz podataka koje dobiješ. Ne moraš svaki put da se predstavljaš imenom, ali piši kao da ti (Trener Brka) lično gledaš ove brojke i komentarišeš ih.
${hasComparison ? 'Dobićeš podatke za TRENUTNI period i za PRETHODNI period iste dužine - obavezno prokomentariši trend (da li je ekipa/igrač napredovala ili nazadovala, sa konkretnim brojkama razlike).' : ''}
Odgovaraš ISKLJUČIVO validnim JSON objektom, bez markdown code fence-ova (bez \`\`\`), bez ijedne
reči teksta pre ili posle JSON-a. Struktura mora biti tačno:
{"summary":"3-4 rečenice sažetka${hasComparison ? ', sa osvrtom na trend u odnosu na prethodni period' : ''}","strengths":["stavka 1","stavka 2","..."],"weaknesses":["stavka 1","..."],"players":"analiza po igraču, više pasusa razdvojenih sa \\n\\n","tips":["savet 1","..."],"training":["preporuka 1","..."]}
Strengths/weaknesses/tips/training: 4-6 stavki svaka, svaka stavka konkretna i sa brojkom.`;

  const payload = hasComparison
    ? { trenutni_period: data, prethodni_period: prevData }
    : data;
  const userPrompt = `Analiziraj ove podatke i vrati ISKLJUČIVO JSON (bez ičeg drugog):\n\n${JSON.stringify(payload)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s - da dugme nikad ne ostane zaglavljeno ako Worker/Groq ne odgovori

  let response;
  try{
    response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Secret': APP_SECRET },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.6,
        max_tokens: 2500
      }),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }

  console.log('[AI] Worker response status:', response.status);
  if(!response.ok) throw new Error(`Worker HTTP ${response.status}`);
  const result = await response.json();
  if(result.error) throw new Error(result.error?.message || 'Groq API greška');

  const raw = result?.choices?.[0]?.message?.content;
  if(!raw) throw new Error('Prazan odgovor od modela');

  const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/,'').replace(/```\s*$/,'');
  let parsed;
  try{
    parsed = JSON.parse(cleaned);
  }catch(parseErr){
    console.error('[AI] JSON.parse nije uspeo. Sirovi odgovor modela:', raw);
    throw new Error('Odgovor modela nije validan JSON: ' + parseErr.message);
  }

  const required = ['summary','strengths','weaknesses','tips'];
  if(!required.every(k => k in parsed)) throw new Error('Odgovor modela nema sva ocekivana polja');

  parsed.strengths = parsed.strengths || [];
  parsed.weaknesses = parsed.weaknesses || [];
  parsed.tips = parsed.tips || [];
  parsed.training = parsed.training || [];
  parsed.players = parsed.players || '';
  console.log('[AI] Uspešno parsiran odgovor od Groq-a.');
  return parsed;
}

function generateDetailedFallback(data, prevData){
  const players = Object.entries(data.players || {});
  if(!players.length){
    return {
      summary: 'Nema dovoljno podataka za analizu. Potrebno je najmanje 2 meča po igraču u izabranom periodu.',
      strengths: [], weaknesses: [],
      players: 'Nema dovoljno podataka.',
      tips: ['Odigrajte još nekoliko mečeva pa probajte ponovo.'],
      training: [],
    };
  }

  const bestWinrate = players.reduce((a,b) => (b[1].winrate||0) > (a[1].winrate||0) ? b : a);
  const bestGoals = players.reduce((a,b) => (b[1].goals_pm||0) > (a[1].goals_pm||0) ? b : a);
  const bestAssists = players.reduce((a,b) => (b[1].assists_pm||0) > (a[1].assists_pm||0) ? b : a);
  const bestSaves = players.reduce((a,b) => (b[1].saves_pm||0) > (a[1].saves_pm||0) ? b : a);
  const worstBoost = players.reduce((a,b) => (b[1].avg_boost||0) < (a[1].avg_boost||0) ? b : a);
  const worstZero = players.reduce((a,b) => (b[1].zero_boost_pct||0) > (a[1].zero_boost_pct||0) ? b : a);

  let trendNote = '';
  if(prevData && Object.keys(prevData.players || {}).length){
    const currTotalGoals = Object.values(data.players).reduce((s,p) => s + (p.goals_pm * p.matches), 0);
    const prevTotalGoals = Object.values(prevData.players).reduce((s,p) => s + (p.goals_pm * p.matches), 0);
    const currWr = data.teamStats?.total_matches ? Math.round((data.teamStats.total_wins/data.teamStats.total_matches)*100) : 0;
    const prevWr = prevData.teamStats?.total_matches ? Math.round((prevData.teamStats.total_wins/prevData.teamStats.total_matches)*100) : 0;
    const diff = currWr - prevWr;
    trendNote = ` U odnosu na prethodni period, win rate je ${diff > 0 ? `porastao za ${diff}%` : diff < 0 ? `pao za ${Math.abs(diff)}%` : 'ostao isti'}.`;
  }

  const playerAnalysis = players.map(([name, s]) => {
    const style = s.goals_pm > 1.2 ? 'ofanzivan' : s.saves_pm > 1.5 ? 'defanzivan' : 'svestran';
    return `${name} (${style}): ${s.matches} mečeva, ${s.winrate}% win rate, ${s.goals_pm} gol/meč, ${s.assists_pm} asist/meč, ${s.saves_pm} odbrana/meč, ${s.avg_boost}% prosečan boost.`;
  }).join('\n\n');

  return {
    summary: `Odigrano ${data.teamStats?.total_matches || 0} mečeva. Najbolji win rate ima ${bestWinrate[0]} (${bestWinrate[1].winrate}%).${trendNote} Ovo je automatska analiza po pravilima (AI trenutno nije dostupan).`,
    strengths: [
      `${bestGoals[0]} je najbolji strelac (${bestGoals[1].goals_pm} gol/meč)`,
      `${bestAssists[0]} je najbolji asistent (${bestAssists[1].assists_pm} asist/meč)`,
      `${bestSaves[0]} je najbolji u odbrani (${bestSaves[1].saves_pm} odbrana/meč)`,
      `${bestWinrate[0]} ima najbolji win rate (${bestWinrate[1].winrate}%)`,
    ],
    weaknesses: [
      `${worstBoost[0]} ima najniži prosečan boost (${worstBoost[1].avg_boost}%)`,
      `${worstZero[0]} najčešće ostaje na 0 boosta (${worstZero[1].zero_boost_pct}% vremena)`,
    ],
    players: playerAnalysis,
    tips: [
      `${worstBoost[0]} — radi na boost menadžmentu, cilj je da retko padneš na 0.`,
      'Pratite rotacije kroz "Pozicioniranje" tab za konkretne brojke po meču.',
    ],
    training: [],
  };
}

async function analyzeWithAI(rows){
  const btn = $('#aiAnalyzeBtn');
  if(!btn) return;
  const originalHTML = btn.innerHTML;
  btn.innerHTML = `<span class="spinner"></span> Analiziram...`;
  btn.disabled = true;
  console.log('[AI] Analiza pokrenuta, broj redova:', rows.length);

  try{
    const data = prepareDetailedData(rows);
    const prevRows = getPreviousPeriodRows(rows);
    const prevData = prepareDetailedData(prevRows);
    const cacheKey = aiCacheKey(rows);

    if(aiAnalysisCache.has(cacheKey)){
      console.log('[AI] Koristim keširan rezultat.');
      const cached = aiAnalysisCache.get(cacheKey);
      showAIAnalysisModal(cached.analysis, data, cached.usedFallback);
      return;
    }

    let analysis = null;
    let usedFallback = false;
    try{
      console.log('[AI] Pozivam Groq Worker...');
      analysis = await callGroqAPI(data, prevData);
    }catch(e){
      console.error('[AI] Worker/Groq nije uspeo, koristim fallback po pravilima. Razlog:', e);
    }
    if(!analysis){
      analysis = generateDetailedFallback(data, prevData);
      usedFallback = true;
    }

    aiAnalysisCache.set(cacheKey, { analysis, usedFallback });
    console.log('[AI] Otvaram modal sa rezultatom. usedFallback =', usedFallback);
    showAIAnalysisModal(analysis, data, usedFallback);
  }catch(e){
    console.error('[AI] Neočekivana greška u analyzeWithAI:', e);
    alert('Greška pri analizi: ' + e.message + '\n\n(Detalji su ispisani u konzoli - F12 → Console)');
  }finally{
    btn.innerHTML = originalHTML;
    btn.disabled = false;
  }
}

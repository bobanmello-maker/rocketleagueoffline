  // ================================================================
  //  🔊 SFX ENGINE — sintetisani zvuci preko Web Audio API-ja (bez
  //  eksternih fajlova, radi odmah i offline)
  // ================================================================
  window.SFX = (function(){
    let ctx = null;
    let muted = (function(){ try{ return localStorage.getItem('rl_sfx_muted') === '1'; }catch(e){ return false; } })();

    function ensureCtx(){
      if(!ctx){
        try{ ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ return null; }
      }
      if(ctx.state === 'suspended') ctx.resume().catch(()=>{});
      return ctx;
    }

    function tone(freq, dur, type, vol, delay){
      if(muted) return;
      const c = ensureCtx(); if(!c) return;
      const t0 = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol != null ? vol : 0.16, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.03);
    }

    function sweep(f0, f1, dur, vol){
      if(muted) return;
      const c = ensureCtx(); if(!c) return;
      const t0 = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(f0, t0);
      osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol || 0.14, t0 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.05);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.08);
    }

    return {
      setMuted(v){ muted = !!v; try{ localStorage.setItem('rl_sfx_muted', muted ? '1' : '0'); }catch(e){} },
      isMuted(){ return muted; },
      unlockCtx(){ ensureCtx(); },
      click(){ tone(600, 0.06, 'square', 0.10); },
      whoosh(){ sweep(180, 900, 0.35, 0.13); },
      shake(){ tone(90, 0.07, 'square', 0.09); },
      impact(){ tone(70, 0.18, 'square', 0.22); tone(48, 0.22, 'sine', 0.18, 0.02); },
      unlock(){ tone(523.25, 0.12, 'triangle', 0.16); tone(659.25, 0.12, 'triangle', 0.15, 0.09); tone(783.99, 0.22, 'triangle', 0.17, 0.18); },
      fanfare(){ tone(523.25, 0.14, 'triangle', 0.18, 0); tone(659.25, 0.14, 'triangle', 0.18, 0.12); tone(783.99, 0.14, 'triangle', 0.18, 0.24); tone(1046.5, 0.34, 'triangle', 0.2, 0.36); },
    };
  })();

  (function(){
    const btn = document.getElementById('sfxToggleBtn');
    if(!btn) return;
    function paint(){ btn.textContent = SFX.isMuted() ? '🔇' : '🔊'; }
    paint();
    btn.addEventListener('click', () => {
      SFX.setMuted(!SFX.isMuted());
      if(!SFX.isMuted()){ SFX.unlockCtx(); SFX.click(); }
      paint();
    });
  })();

  // ================================================================
  //  🎁 LOOT BOX — sistem za dramatično otključavanje dostignuća
  // ================================================================
  window.LootBox = (function(){
    const TIER_LABELS = { common:'Obično', rare:'Retko', epic:'Epsko', legendary:'Legendarno' };
    const TIER_COLORS = { common:'#D9A566', rare:'#8EC9FF', epic:'#C084FC', legendary:'#FBBF24' };

    const overlay = document.getElementById('lootboxOverlay');
    const crate = document.getElementById('lootboxCrate');
    const crateEmoji = document.getElementById('lootboxCrateEmoji');
    const glow = document.getElementById('lootboxGlow');
    const reveal = document.getElementById('lootboxReveal');
    const rarityEl = document.getElementById('lootboxRarity');
    const badgeEmoji = document.getElementById('lootboxBadgeEmoji');
    const badgeName = document.getElementById('lootboxBadgeName');
    const badgeDesc = document.getElementById('lootboxBadgeDesc');
    const badgePlayer = document.getElementById('lootboxBadgePlayer');
    const nextBtn = document.getElementById('lootboxNextBtn');
    const closeBtn = document.getElementById('lootboxCloseBtn');
    const queueHint = document.getElementById('lootboxQueueHint');

    let queue = [];
    let idx = 0;
    let opened = false;

    function spawnConfetti(){
      if(!crate) return;
      const colors = ['#3DA9FC','#FF6B35','#4ADE80','#FBBF24','#C084FC'];
      const host = crate.querySelector('.lootbox-crate-inner');
      if(!host) return;
      const ring = document.createElement('div');
      ring.className = 'lootbox-burst-ring go';
      host.appendChild(ring);
      setTimeout(() => ring.remove(), 700);
      for(let i = 0; i < 22; i++){
        const p = document.createElement('div');
        p.className = 'lootbox-confetti-piece';
        const angle = Math.random() * Math.PI * 2;
        const dist = 90 + Math.random() * 110;
        p.style.setProperty('--cx', (Math.cos(angle) * dist) + 'px');
        p.style.setProperty('--cy', (Math.sin(angle) * dist) + 'px');
        p.style.setProperty('--cr', (Math.random() * 360) + 'deg');
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.08) + 's';
        host.appendChild(p);
        setTimeout(() => p.remove(), 1300);
      }
    }

    function paintQueueHint(){
      if(!queueHint) return;
      queueHint.textContent = queue.length > 1 ? `${idx + 1} / ${queue.length}` : '';
    }

    function showCrateState(item){
      reveal.classList.remove('show');
      crate.classList.remove('crate-hidden', 'shaking', 'bursting');
      crateEmoji.textContent = '🎁';
      glow.style.setProperty('--crate-color', TIER_COLORS[item.tier] || '#FBBF24');
      opened = false;
      paintQueueHint();
    }

    function openCurrent(){
      if(opened) return;
      opened = true;
      SFX.shake();
      crate.classList.add('shaking');
      setTimeout(() => {
        crate.classList.remove('shaking');
        crate.classList.add('bursting');
        SFX.unlock();
        spawnConfetti();
        setTimeout(() => {
          crate.classList.add('crate-hidden');
          revealItem(queue[idx]);
          SFX.fanfare();
        }, 260);
      }, 500);
    }

    function revealItem(item){
      rarityEl.textContent = TIER_LABELS[item.tier] || 'Dostignuće';
      rarityEl.className = 'lootbox-rarity tier-' + (item.tier || 'common');
      badgeEmoji.textContent = item.emoji || '🏆';
      badgeName.textContent = item.name || '';
      badgeDesc.textContent = item.desc || '';
      badgePlayer.innerHTML = item.player ? `Otključao/la: <b style="color:${item.color||'#fff'}">${item.player}</b>` : '';
      nextBtn.textContent = (idx < queue.length - 1) ? 'Dalje →' : 'Super!';
      reveal.classList.add('show');
    }

    function next(){
      SFX.click();
      idx++;
      if(idx >= queue.length){ close(); return; }
      showCrateState(queue[idx]);
    }

    function open(items){
      if(!items || !items.length) return;
      queue = items; idx = 0;
      overlay.classList.add('open');
      showCrateState(queue[0]);
    }

    function close(){
      overlay.classList.remove('open');
      queue = []; idx = 0;
    }

    if(crate) crate.addEventListener('click', () => { if(!opened) openCurrent(); });
    if(nextBtn) nextBtn.addEventListener('click', next);
    if(closeBtn) closeBtn.addEventListener('click', close);

    let pendingAuto = null;
    function tryPlayAuto(){
      if(pendingAuto && pendingAuto.length) open(pendingAuto);
      pendingAuto = null;
    }

    return {
      // pokreće se automatski, ali čeka da intro-animacija završi da se ne preklapaju
      enqueueAuto(items){
        if(!items || !items.length) return;
        pendingAuto = items;
        if(window.__introDone) tryPlayAuto();
        else document.addEventListener('rlIntroDone', tryPlayAuto, { once:true });
      },
      openManual(items){ if(items && items.length) open(items); },
    };
  })();

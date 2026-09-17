  (function(){
    document.body.classList.add('intro-active');
    var overlay = document.getElementById('introOverlay');
    var stage = document.getElementById('introSignatureStage');
    var logoStage = document.getElementById('introLogoStage');
    var logoImg = document.getElementById('introLogoImg');
    var path = document.getElementById('introUnderlinePath');
    var timers = [];
    var done = false;

    // animiraj potez pera (podvlaka) tačnom dužinom putanje
    if(path){
      var len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      path.getBoundingClientRect(); // reflow
      path.style.transition = 'stroke-dashoffset 2s cubic-bezier(.62,.02,.32,1)';
      requestAnimationFrame(function(){ path.style.strokeDashoffset = '0'; });
    }

    // ako logo ne postoji na prvoj putanji, probaj fallback folder pre nego što odustaneš
    if(logoImg){
      logoImg.addEventListener('error', function(){
        var fallback = logoImg.getAttribute('data-fallback');
        if(fallback){
          console.warn('[intro] Logo nije nađen na "' + logoImg.getAttribute('src') + '", pokušavam "' + fallback + '"');
          logoImg.removeAttribute('data-fallback');
          logoImg.src = fallback;
        } else {
          console.warn('[intro] Logo se ne može učitati ni sa jedne putanje — proveri folder/ime fajla.');
          logoImg.style.display = 'none';
        }
      });
    }

    function finishIntro(){
      if(done) return;
      done = true;
      overlay.classList.add('intro-hidden');
      document.body.classList.remove('intro-active');
      window.__introDone = true;
      document.dispatchEvent(new CustomEvent('rlIntroDone'));
    }

    function showLogo(){
      if(done) return;
      if(stage) stage.classList.add('intro-fade-out');
      timers.push(setTimeout(function(){
        if(logoStage) logoStage.classList.add('intro-logo-show');
      }, 260));
      timers.push(setTimeout(function(){
        if(logoStage) logoStage.classList.remove('intro-logo-show');
        timers.push(setTimeout(finishIntro, 500));
      }, 260 + 1000));
    }

    timers.push(setTimeout(showLogo, 2150));

    overlay.addEventListener('click', function(){
      timers.forEach(clearTimeout);
      if(!stage.classList.contains('intro-fade-out')){
        showLogo();
      } else {
        finishIntro();
      }
    });
  })();

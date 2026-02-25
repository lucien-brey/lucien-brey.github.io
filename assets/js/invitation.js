(function () {
  'use strict';

  const INTRO_TEXT = 'You are invited to a date in Lausanne';
  const INTRO_DURATION_MS = 2500;
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const introEl = document.getElementById('invitation-intro');
  const introTextEl = document.getElementById('invitation-intro-text');
  const stillEl = document.getElementById('invitation-still');
  const questionEl = document.getElementById('invitation-question');
  const yesBtn = document.getElementById('invitation-yes');
  const noWrapper = document.getElementById('invitation-no-wrapper');
  const noBtn = document.getElementById('invitation-no');
  const datePickerEl = document.getElementById('invitation-date-picker');
  const datesContainer = document.getElementById('invitation-dates');
  const dateConfirmEl = document.getElementById('invitation-date-confirm');

  if (!introTextEl || !stillEl || !questionEl || !yesBtn || !noWrapper || !noBtn || !datePickerEl) {
    return;
  }

  function runIntroAnimation() {
    if (REDUCED_MOTION) {
      introTextEl.textContent = INTRO_TEXT;
      setTimeout(finishIntro, 300);
      return;
    }
    var i = 0;
    introTextEl.textContent = '';
    function tick() {
      if (i <= INTRO_TEXT.length) {
        introTextEl.textContent = INTRO_TEXT.slice(0, i);
        i++;
        setTimeout(tick, INTRO_DURATION_MS / INTRO_TEXT.length);
      } else {
        finishIntro();
      }
    }
    tick();
  }

  function finishIntro() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
    introEl.setAttribute('aria-hidden', 'true');
    introEl.hidden = true;
    stillEl.removeAttribute('hidden');
    stillEl.setAttribute('aria-hidden', 'false');
    questionEl.removeAttribute('hidden');
    questionEl.setAttribute('aria-hidden', 'false');
    initNoButtonFlee();
  }

  function initNoButtonFlee() {
    var noX = 0;
    var noY = 0;
    var targetX = -1000;
    var targetY = -1000;
    var padding = 24;
    var fleeRadius = 40;
    var speed = 0.32;
    var returnSpeed = 0.08;
    var running = true;

    function updatePosition() {
      var root = document.getElementById('invitation-root');
      if (!root) return;
      var rootRect = root.getBoundingClientRect();
      var noRect = noBtn.getBoundingClientRect();
      var noCenterXRoot = noRect.left - rootRect.left + noRect.width / 2;
      var noCenterYRoot = noRect.top - rootRect.top + noRect.height / 2;
      var dx = noCenterXRoot - targetX;
      var dy = noCenterYRoot - targetY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < fleeRadius && dist > 2) {
        var moveX = (dx / dist) * Math.min((fleeRadius - dist) * speed, 18);
        var moveY = (dy / dist) * Math.min((fleeRadius - dist) * speed, 18);
        noX += moveX;
        noY += moveY;
        var margin = 16;
        var maxX = Math.max(0, rootRect.width - noRect.width - margin);
        var maxY = Math.max(0, rootRect.height - noRect.height - margin);
        noX = Math.max(-maxX, Math.min(maxX, noX));
        noY = Math.max(-maxY, Math.min(maxY, noY));
      } else {
        noX *= 1 - returnSpeed;
        noY *= 1 - returnSpeed;
        if (Math.abs(noX) < 0.5) noX = 0;
        if (Math.abs(noY) < 0.5) noY = 0;
      }

      noWrapper.style.transform = 'translate(' + noX + 'px, ' + noY + 'px)';
      if (running) requestAnimationFrame(updatePosition);
    }

    document.addEventListener('mousemove', function (e) {
      var root = document.getElementById('invitation-root');
      if (!root) return;
      var r = root.getBoundingClientRect();
      targetX = e.clientX - r.left;
      targetY = e.clientY - r.top;
    });

    document.addEventListener('touchmove', function (e) {
      if (e.touches.length) {
        var root = document.getElementById('invitation-root');
        if (!root) return;
        var r = root.getBoundingClientRect();
        targetX = e.touches[0].clientX - r.left;
        targetY = e.touches[0].clientY - r.top;
      }
    }, { passive: true });

    requestAnimationFrame(updatePosition);
  }

  yesBtn.addEventListener('click', function () {
    questionEl.setAttribute('aria-hidden', 'true');
    questionEl.hidden = true;
    datePickerEl.removeAttribute('hidden');
    datePickerEl.setAttribute('aria-hidden', 'false');
  });

  if (datesContainer) {
    datesContainer.addEventListener('click', function (e) {
      var btn = e.target.closest('.invitation-date-option');
      if (!btn) return;
      document.querySelectorAll('.invitation-date-option').forEach(function (b) {
        b.classList.remove('invitation-date-selected');
      });
      btn.classList.add('invitation-date-selected');
      var dateStr = btn.getAttribute('data-date');
      var label = btn.textContent;
      if (dateConfirmEl) {
        dateConfirmEl.textContent = 'You chose ' + label + '. See you then!';
        dateConfirmEl.hidden = false;
      }
      var root = document.getElementById('invitation-root');
      var endpoint = root && root.getAttribute('data-invitation-endpoint');
      if (endpoint) {
        fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ date: label, date_iso: dateStr })
        }).catch(function () {});
      }
    });
  }

  runIntroAnimation();
})();

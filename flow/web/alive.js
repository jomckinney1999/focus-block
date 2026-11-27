/*
 * Undercurrent landing page: the parts that make it feel alive.
 *
 *  - the "current": a flowing canvas behind the hero that swells with the music
 *    and ripples on every keystroke
 *  - an autoplay demo that types, pauses and comes back on its own until you take over
 *  - a sound switch, plus soft pitched cues on buttons and cards when sound is on
 *  - a playhead that walks the "How it moves" timeline and lights up each state
 *  - small loops: the VS Code mockup types and counts, the Chrome card raises its shield
 *  - sections drift in as you scroll
 *
 * Everything respects prefers-reduced-motion: the page stays complete and readable, just still.
 */
(function () {
  'use strict';
  const UC = window.UC;
  if (!UC) return;
  const $ = (id) => document.getElementById(id);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const visible = new Map(); // element -> on screen?

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => entries.forEach((e) => visible.set(e.target, e.isIntersecting)), { threshold: 0.05 })
    : null;
  const watch = (el) => { visible.set(el, true); if (io) io.observe(el); };
  const onScreen = (el) => visible.get(el) !== false;

  // ------------------------------------------------------------------ sound switch + cues

  const soundBtn = $('sound');
  function showSound(on) {
    soundBtn.setAttribute('aria-pressed', String(on));
    $('sound-label').textContent = on ? 'Sound on' : 'Sound off';
    document.documentElement.classList.toggle('sound-on', on);
  }
  UC.on('sound', showSound);
  soundBtn.addEventListener('click', async () => {
    if (UC.isSoundOn()) UC.soundOff();
    else {
      await UC.soundOn();
      cue('on');
    }
  });

  // A pentatonic set (D major) so any sequence of cues sounds consonant with the tracks.
  const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81];
  let lastCue = 0;
  function cue(kind, step = 0) {
    const ctx = UC.audio.ctx;
    if (!UC.isSoundOn() || !ctx || ctx.state !== 'running') return;
    const now = performance.now();
    if (kind === 'hover' && now - lastCue < 90) return;
    lastCue = now;
    const notes = kind === 'on' ? [62, 69, 74] : kind === 'click' ? [SCALE[step % 9], SCALE[(step + 2) % 9]] : [SCALE[step % 9]];
    const t0 = ctx.currentTime + 0.01;
    notes.forEach((m, i) => {
      const t = t0 + i * 0.07;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
      const peak = kind === 'hover' ? 0.025 : 0.05;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    });
  }
  document.querySelectorAll('.btn, .track, .sound-pill, .steps.big li, .findings article, .states article').forEach((el, i) => {
    el.addEventListener('pointerenter', () => cue('hover', i));
    if (el.matches('.btn, .track')) el.addEventListener('click', () => cue('click', i));
  });

  // ------------------------------------------------------------------ the current (hero canvas)

  const hero = document.querySelector('.hero');
  const canvas = $('current');
  const g = canvas.getContext('2d');
  watch(hero);
  const ripples = [];
  const motes = Array.from({ length: 46 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random() * 1.4, p: i }));
  UC.on('key', () => {
    ripples.push({ x: 0.15 + Math.random() * 0.7, born: performance.now() });
    if (ripples.length > 24) ripples.shift();
  });

  let level = 0; // 0..1, smoothed
  function drawCurrent(t) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = hero.clientWidth;
    const h = hero.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const db = UC.levelAt(performance.now());
    const target = Math.max(0, (db + 48) / 48);
    level += (target - level) * 0.04;
    const time = t / 1000;

    // flowing lines: amplitude and brightness follow the music level
    const lines = 7;
    for (let i = 0; i < lines; i++) {
      const k = i / (lines - 1);
      const base = h * (0.52 + k * 0.42);
      const amp = 8 + level * 34 * (1 - k * 0.5);
      const freq = 0.0035 + k * 0.0012;
      const speed = 0.25 + k * 0.18 + level * 0.35;
      g.beginPath();
      for (let x = -20; x <= w + 20; x += 14) {
        let y = base + Math.sin(x * freq + time * speed + i * 1.7) * amp + Math.sin(x * freq * 2.3 - time * speed * 0.7 + i) * amp * 0.35;
        for (const r of ripples) {
          const age = (performance.now() - r.born) / 1000;
          const d = Math.abs(x - r.x * w) - age * 260;
          if (age < 2.2) y -= Math.exp(-(d * d) / 2600) * 14 * (1 - age / 2.2) * (1 - k * 0.6);
        }
        x === -20 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      const warm = level * (1 - k);
      g.strokeStyle = `rgba(${Math.round(120 + 106 * warm)}, ${Math.round(203 - 23 * warm)}, ${Math.round(187 - 81 * warm)}, ${0.07 + 0.16 * (1 - k) * (0.4 + level)})`;
      g.lineWidth = 1.5 + (1 - k) * 1.5;
      g.stroke();
    }

    // drifting motes, like light in water
    for (const m of motes) {
      m.y -= (0.00006 + level * 0.00025) * m.s;
      m.x += Math.sin(time * 0.3 + m.p) * 0.00008;
      if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
      g.beginPath();
      g.arc(m.x * w, m.y * h, m.s, 0, Math.PI * 2);
      g.fillStyle = `rgba(226, 200, 150, ${0.08 + level * 0.25})`;
      g.fill();
    }
  }
  function loopCurrent(t) {
    if (onScreen(hero)) drawCurrent(t);
    requestAnimationFrame(loopCurrent);
  }
  if (reduce) drawCurrent(0);
  else requestAnimationFrame(loopCurrent);

  // ------------------------------------------------------------------ autoplay demo

  const SCRIPT = [
    { type: '\n// autoplay: watch the music follow the keys\nconst queue = loadTasks();\nfor (const task of queue) {\n  focus(task);' },
    { wait: 9000 }, // a thinking pause: the music softens
    { type: '\n  ship(task);\n}\n' },
    { wait: 5000 },
    { type: '\n// stepping away now. watch it let go' },
    { wait: 52000 }, // away: it fades out completely
  ];
  const code = UC.code;
  const autoChip = $('auto');
  const demo = document.querySelector('.demo');
  watch(demo);
  let autoplay = !reduce;
  const original = code.value;

  function stopAutoplay() {
    if (!autoplay) return;
    autoplay = false;
    autoChip.hidden = true;
    demo.classList.remove('autoplaying');
  }
  code.addEventListener('keydown', (e) => { if (e.isTrusted) stopAutoplay(); });
  code.addEventListener('pointerdown', stopAutoplay);

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function typeOut(text) {
    for (const ch of text) {
      if (!autoplay) return;
      while (!onScreen(demo) || document.hidden) await sleep(400);
      code.value += ch;
      code.scrollTop = code.scrollHeight;
      if (ch.trim()) UC.edit(); // whitespace isn't a keystroke worth counting
      await sleep(ch === '\n' ? 260 : 45 + Math.random() * 90);
    }
  }
  async function runAutoplay() {
    await sleep(1400);
    if (!autoplay) return;
    autoChip.hidden = false;
    demo.classList.add('autoplaying');
    while (autoplay) {
      for (const step of SCRIPT) {
        if (!autoplay) return;
        if (step.type) await typeOut(step.type);
        else {
          const until = performance.now() + step.wait;
          while (autoplay && performance.now() < until) await sleep(300);
        }
      }
      if (!autoplay) return;
      code.value = original; // start the loop fresh
      code.dispatchEvent(new Event('scroll'));
    }
  }
  runAutoplay();

  // ------------------------------------------------------------------ timeline playhead

  const tl = UC.timeline;
  const stateCards = document.querySelectorAll('.states article');
  if (tl && !reduce) {
    const ns = 'http://www.w3.org/2000/svg';
    const head = document.createElementNS(ns, 'line');
    head.setAttribute('class', 'tl-head');
    head.setAttribute('y1', tl.T - 6);
    head.setAttribute('y2', 260 - tl.B + 2);
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('class', 'tl-dot');
    dot.setAttribute('r', 6);
    tl.svg.append(head, dot);
    watch(tl.svg);

    // Which card is "now": in flow (0), thinking (1), away (2), back (3), by the curve.
    function phase(i) {
      const db = tl.pts[i][1];
      const prev = tl.pts[Math.max(0, i - 40)][1];
      if (db > -1.5) return prev < -20 ? 3 : 0;
      if (db > -12) return 1;
      return db < prev - 0.5 || db < -40 ? 2 : 3;
    }
    const DURATION = 16000;
    const start = performance.now();
    (function step(t) {
      if (onScreen(tl.svg)) {
        // rAF timestamps can be a hair earlier than performance.now() at setup.
        const k = (Math.max(0, t - start) % DURATION) / DURATION;
        const i = Math.max(0, Math.min(tl.pts.length - 1, Math.floor(k * tl.pts.length)));
        const [time, db] = tl.pts[i];
        const x = tl.x(time);
        head.setAttribute('x1', x);
        head.setAttribute('x2', x);
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', tl.y(db));
        const p = phase(i);
        stateCards.forEach((c, j) => c.classList.toggle('now', j === p));
      }
      requestAnimationFrame(step);
    })(start);
  }

  // ------------------------------------------------------------------ VS Code mockup

  const typed = $('vsc-typed');
  const vscNow = $('vsc-now');
  const vscStatus = $('vsc-status');
  const fig = document.querySelector('.vsc');
  if (fig && !reduce) {
    watch(fig);
    const lines = ['ready.sort(byPriority)[0]', 'ready.find((j) => j.urgent) ?? ready[0]', 'pickNext(ready, { fair: true })'];
    let li = 0;
    let minutes = 38;
    (async function loop() {
      for (;;) {
        await sleep(2600);
        if (!onScreen(fig)) continue;
        const target = lines[(li = (li + 1) % lines.length)];
        while (typed.textContent.length) { typed.textContent = typed.textContent.slice(0, -1); await sleep(22); }
        for (const ch of target) { typed.textContent += ch; await sleep(55 + Math.random() * 60); }
      }
    })();
    setInterval(() => {
      if (!onScreen(fig)) return;
      minutes += 1;
      vscNow.textContent = `${minutes}m`;
      vscStatus.textContent = `〰 ${minutes}m`;
    }, 6000);
  }

  // ------------------------------------------------------------------ scroll reveals

  if (!reduce && io) {
    const targets = document.querySelectorAll('.band h2, .band .intro, .timeline, .states article, .findings article, .track, .vsc, .steps li, .keys, .mini');
    const revealer = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        revealer.unobserve(e.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el, i) => {
      // Only animate things below the fold; anything already visible stays put.
      if (el.getBoundingClientRect().top < window.innerHeight) return;
      el.classList.add('reveal');
      el.style.setProperty('--d', `${(i % 4) * 70}ms`);
      revealer.observe(el);
    });
  }

  // Music playing → let the page know (track cards show live EQ bars).
  setInterval(() => {
    const playing = UC.isSoundOn() && UC.audio.running && UC.levelAt(performance.now()) > -40;
    document.documentElement.classList.toggle('playing', playing);
  }, 400);
})();

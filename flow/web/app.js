/* Undercurrent landing page: live demo, to-scale timeline, track cards. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TRACKS = FlowAudio.tracks;
  const D = FlowModel.DEFAULTS;

  // ---------------------------------------------------------------- demo model

  const audio = new FlowAudio({ volume: 0.65, track: 'prelude' });
  const FAST = 10;
  let speed = FAST;

  function scaled(k) {
    return {
      adaptive: false,
      graceMs: D.graceMs / k,
      softRampMs: D.softRampMs / k,
      restAfterMs: D.restAfterMs / k,
      restRampMs: D.restRampMs / k,
    };
  }
  const model = new FlowModel(scaled(speed));

  // Our own copy of the level curve, so the trace draws even if audio is blocked.
  let ramp = { from: D.silentDb, to: D.silentDb, t0: 0, dur: 1 };
  function levelAt(t) {
    const k = Math.min(1, Math.max(0, (t - ramp.t0) / ramp.dur));
    return ramp.from + (ramp.to - ramp.from) * k;
  }

  function apply(tr) {
    if (!tr) return;
    const now = performance.now();
    const cur = levelAt(now);
    const from = tr.fromDb != null ? Math.max(tr.fromDb, cur) : cur;
    ramp = { from, to: tr.db, t0: now, dur: Math.max(50, tr.rampMs) };
    audio.setLevel(tr.db, tr.rampMs, tr.fromDb);
    render();
  }

  const WORDS = { flow: 'In flow', soft: 'Thinking', resting: 'Resting', paused: 'Paused' };

  function secs(ms) {
    return Math.max(0, Math.ceil(ms / 1000));
  }

  function render() {
    const s = model.state;
    const now = Date.now();
    const pill = $('state-pill');
    pill.textContent = WORDS[s];
    pill.dataset.state = s;
    let word = WORDS[s];
    let note = '';
    if (s === 'flow') {
      const left = model.grace() - (now - model.lastEdit);
      note = `Pause and it softens in ${secs(left)} s.`;
    } else if (s === 'soft') {
      const left = model.o.restAfterMs - (now - model.lastActivity());
      note = `Softened to −9 dB. Type to bring it back. Lets go in ${secs(left)} s.`;
    } else if (model.lastEdit < 0 || !isFinite(model.lastEdit)) {
      word = 'Start typing';
      note = 'Three keystrokes bring the music in.';
    } else {
      note = 'Silent. Three keystrokes bring it back, mid-phrase.';
    }
    $('state-word').textContent = word;
    $('state-note').textContent = note;
  }

  // ---------------------------------------------------------------- inputs

  const code = $('code');
  const keys = [];

  async function ensureAudio() {
    if (!audio.running) await audio.unlock();
  }

  // Phones only allow audio to start from a tap, so unlock on the tap into the editor too.
  code.addEventListener('pointerdown', () => { ensureAudio(); });
  code.addEventListener('keydown', () => { ensureAudio(); });
  code.addEventListener('input', () => {
    keys.push(performance.now());
    apply(model.edit(Date.now()));
    updateGutter();
  });
  for (const ev of ['scroll', 'click', 'select']) code.addEventListener(ev, () => model.presence(Date.now()));
  window.addEventListener('scroll', () => model.presence(Date.now()), { passive: true });

  setInterval(() => {
    apply(model.tick(Date.now()));
    render();
  }, 250);

  $('speed').addEventListener('change', (e) => {
    speed = e.target.checked ? FAST : 1;
    model.setOptions(scaled(speed));
    render();
  });
  $('volume').addEventListener('input', (e) => audio.setVolume(Number(e.target.value) / 100));

  function updateGutter() {
    const lines = code.value.split('\n').length;
    $('gutter').textContent = Array.from({ length: Math.max(lines, 9) }, (_, i) => i + 1).join('\n');
  }
  code.addEventListener('scroll', () => { $('gutter').scrollTop = code.scrollTop; });
  $('gutter').style.overflow = 'hidden';
  updateGutter();

  // ---------------------------------------------------------------- tracks

  const select = $('track-select');
  const cards = $('track-cards');
  for (const t of Object.values(TRACKS)) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    select.appendChild(o);

    const b = document.createElement('button');
    b.className = 'track';
    b.type = 'button';
    b.dataset.id = t.id;
    b.setAttribute('aria-pressed', String(t.id === audio.trackId));
    b.innerHTML = `<span class="kind"></span><b></b><span class="blurb"></span><small></small>`;
    b.querySelector('.kind').textContent = t.kind;
    b.querySelector('b').textContent = t.name;
    b.querySelector('.blurb').textContent = t.blurb;
    b.querySelector('small').textContent = t.credit;
    b.addEventListener('click', async () => {
      chooseTrack(t.id);
      await ensureAudio();
      apply(model.play(Date.now()));
    });
    cards.appendChild(b);
  }
  function chooseTrack(id) {
    audio.setTrack(id);
    select.value = id;
    cards.querySelectorAll('.track').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.id === id)));
  }
  select.addEventListener('change', () => chooseTrack(select.value));

  // ---------------------------------------------------------------- live trace

  const canvas = $('trace');
  const g = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLORS = { flow: '#e2b46a', soft: '#7fb0d6', resting: '#4f6763', paused: '#4f6763' };

  function drawTrace() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);

    const now = performance.now();
    const windowMs = 60_000 / (speed === FAST ? 2 : 1);
    const pad = { l: 10, r: 46, t: 12, b: 20 };
    const x = (t) => pad.l + (1 - (now - t) / windowMs) * (w - pad.l - pad.r);
    const y = (db) => pad.t + (Math.min(0, Math.max(-48, db)) / -48) * (h - pad.t - pad.b);

    // grid
    g.font = '10px "JetBrains Mono", ui-monospace, monospace';
    g.fillStyle = '#5c7571';
    g.strokeStyle = 'rgba(120,203,187,0.10)';
    g.lineWidth = 1;
    for (const [db, label] of [[0, '0 dB'], [-9, '−9'], [-48, 'silent']]) {
      g.beginPath();
      g.moveTo(pad.l, y(db) + 0.5);
      g.lineTo(w - pad.r, y(db) + 0.5);
      g.stroke();
      g.fillText(label, w - pad.r + 6, y(db) + 3);
    }

    // level curve, sampled from the ramp history
    history.push([now, levelAt(now)]);
    while (history.length && history[0][0] < now - windowMs - 1000) history.shift();
    const grad = g.createLinearGradient(0, y(0), 0, y(-48));
    grad.addColorStop(0, 'rgba(226,180,106,0.35)');
    grad.addColorStop(1, 'rgba(226,180,106,0)');
    g.beginPath();
    history.forEach(([t, db], i) => (i ? g.lineTo(x(t), y(db)) : g.moveTo(x(t), y(db))));
    g.lineTo(x(now), y(-48));
    g.lineTo(x(history[0][0]), y(-48));
    g.closePath();
    g.fillStyle = grad;
    g.fill();
    g.beginPath();
    history.forEach(([t, db], i) => (i ? g.lineTo(x(t), y(db)) : g.moveTo(x(t), y(db))));
    g.strokeStyle = COLORS[model.state];
    g.lineWidth = 2;
    g.stroke();

    // keystrokes
    g.fillStyle = 'rgba(220,232,228,0.55)';
    while (keys.length && keys[0] < now - windowMs) keys.shift();
    for (const k of keys) g.fillRect(x(k), h - 10, 1.5, 6);

    // live dot
    const ly = y(levelAt(now));
    g.beginPath();
    g.arc(x(now), ly, 3.5 + (reduce ? 0 : audio.meter() * 4), 0, Math.PI * 2);
    g.fillStyle = COLORS[model.state];
    g.fill();

    requestAnimationFrame(drawTrace);
  }
  const history = [];
  requestAnimationFrame(drawTrace);

  // ---------------------------------------------------------------- to-scale timeline

  function simulateSession() {
    const S = 1000;
    const M = 60 * S;
    const m = new FlowModel({ adaptive: false });
    const r = (() => { let a = 7; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
    const typing = [[0.2 * M, 3 * M], [4.6 * M, 7 * M], [16.4 * M, 18 * M]];
    const reading = [[7 * M, 8.2 * M]];
    const events = [];
    for (const [a, b] of typing) for (let t = a; t < b; t += 400 + r() * 2600) events.push([t, 'edit']);
    for (const [a, b] of reading) for (let t = a; t < b; t += 20 * S) events.push([t, 'presence']);
    events.sort((p, q) => p[0] - q[0]);

    const pts = [];
    let rp = { from: -48, to: -48, t0: 0, dur: 1 };
    const lvl = (t) => rp.from + (rp.to - rp.from) * Math.min(1, Math.max(0, (t - rp.t0) / rp.dur));
    const take = (tr, t) => {
      if (!tr) return;
      const cur = lvl(t);
      rp = { from: tr.fromDb != null ? Math.max(tr.fromDb, cur) : cur, to: tr.db, t0: t, dur: tr.rampMs };
    };
    let ei = 0;
    const end = 18 * M;
    for (let t = 0; t <= end; t += 500) {
      while (ei < events.length && events[ei][0] <= t) {
        const [et, kind] = events[ei++];
        take(kind === 'edit' ? m.edit(et) : m.presence(et), et);
      }
      take(m.tick(t), t);
      pts.push([t, lvl(t)]);
    }
    return { pts, edits: events.filter((e) => e[1] === 'edit').map((e) => e[0]), reading, end };
  }

  function drawTimeline() {
    const svg = $('timeline');
    const { pts, edits, reading, end } = simulateSession();
    const W = 900, H = 260, L = 56, R = 16, T = 34, B = 46;
    const x = (t) => L + (t / end) * (W - L - R);
    const y = (db) => T + (Math.min(0, db) / -48) * (H - T - B);
    const ns = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs, text) => {
      const e = document.createElementNS(ns, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text) e.textContent = text;
      svg.appendChild(e);
      return e;
    };
    const axisText = { class: 'tl-axis' };

    for (const [db, label] of [[0, '0 dB'], [-9, '−9 dB'], [-48, 'silent']]) {
      el('line', { x1: L, x2: W - R, y1: y(db), y2: y(db), class: 'tl-grid' });
      el('text', { ...axisText, x: L - 8, y: y(db) + 4, 'text-anchor': 'end' }, label);
    }
    for (let min = 0; min <= 18; min += 2) {
      el('text', { ...axisText, x: x(min * 60000), y: H - 14, 'text-anchor': 'middle' }, `${min}m`);
    }
    for (const [a, b] of reading) {
      el('rect', { x: x(a), y: T - 4, width: x(b) - x(a), height: H - T - B + 8, class: 'tl-reading' });
      el('text', { ...axisText, x: (x(a) + x(b)) / 2, y: T + 70, 'text-anchor': 'middle' }, 'reading');
    }
    const d = pts.map(([t, db], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(db).toFixed(1)}`).join('');
    el('path', { d: `${d}L${x(end)},${y(-48)}L${x(0)},${y(-48)}Z`, class: 'tl-fill' });
    el('path', { d, class: 'tl-line' });
    for (const t of edits) el('line', { x1: x(t), x2: x(t), y1: H - B + 6, y2: H - B + 13, class: 'tl-key' });

    const notes = [
      [1.6, 'in flow'], [4.1, 'thinking'], [5.8, 'back'], [10.5, 'reading, then thinking'], [14.4, 'away'], [17.2, 'back'],
    ];
    for (const [min, label] of notes) el('text', { x: x(min * 60000), y: T - 14, 'text-anchor': 'middle', class: 'tl-note' }, label);
  }
  drawTimeline();

  const style = document.createElement('style');
  style.textContent = `
    .tl-grid { stroke: var(--line); stroke-width: 1; }
    .tl-axis { fill: var(--dim); font: 12px var(--mono); }
    .tl-note { fill: var(--fg); font: 600 13px var(--display); }
    .tl-line { fill: none; stroke: var(--warm); stroke-width: 2.5; stroke-linejoin: round; }
    .tl-fill { fill: color-mix(in srgb, var(--warm) 14%, transparent); stroke: none; }
    .tl-key { stroke: var(--dim); stroke-width: 1; }
    .tl-reading { fill: color-mix(in srgb, var(--soft) 12%, transparent); stroke: none; }`;
  document.head.appendChild(style);

  render();
})();

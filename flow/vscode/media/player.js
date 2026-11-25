/* Undercurrent webview: makes the sound, shows the state. The model lives in the extension host. */
(function () {
  'use strict';
  const vscode = acquireVsCodeApi();
  const $ = (id) => document.getElementById(id);
  const audio = new FlowAudio();

  let tracks = [];
  let status = null;
  let pendingLevel = null;

  const WORDS = {
    flow: ['In flow', 'The music is with you.'],
    soft: ['Thinking', 'Softened while you think. Type and it swells back.'],
    resting: ['Resting', 'Start typing. The music will find you.'],
    paused: ['Paused', 'Press play when you want it back.'],
  };

  function fmt(ms) {
    const m = Math.floor(ms / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }

  async function unlock() {
    const ok = await audio.unlock();
    $('unlock').hidden = ok;
    vscode.postMessage({ type: 'audio', running: ok });
    if (ok && pendingLevel) {
      audio.setLevel(pendingLevel.db, pendingLevel.rampMs, pendingLevel.fromDb);
      pendingLevel = null;
    }
    return ok;
  }

  function setLevel(msg) {
    if (!audio.ctx || (!audio.running && msg.db > -40)) {
      pendingLevel = msg;
      if (audio.ctx) unlock();
      return;
    }
    audio.setLevel(msg.db, msg.rampMs, msg.fromDb);
  }

  function renderTracks(current) {
    const box = $('tracks');
    box.textContent = '';
    for (const t of tracks) {
      const b = document.createElement('button');
      b.className = 'track' + (t.id === current ? ' on' : '');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(t.id === current));
      b.title = t.detail;
      b.textContent = t.label;
      b.addEventListener('click', () => vscode.postMessage({ type: 'setTrack', id: t.id }));
      box.appendChild(b);
    }
  }

  function renderStatus(s) {
    status = s;
    const [word, sub] = WORDS[s.state];
    $('state').textContent = word;
    $('state').dataset.state = s.state;
    $('sub').textContent = s.holdUntil > Date.now()
      ? `Holding full volume until ${new Date(s.holdUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`
      : sub;
    $('toggle').textContent = s.state === 'paused' || s.state === 'resting' ? 'Play' : 'Pause';
    const g = s.grace;
    const graceLine = g.learned
      ? `Softens after <b>${Math.round(g.ms / 1000)} s</b> without typing. Learned from ${g.samples} of your thinking pauses.`
      : `Softens after <b>${Math.round(g.ms / 1000)} s</b> without typing. Learning your rhythm (${g.samples}/${g.needed} pauses).`;
    $('facts').innerHTML =
      `<div><span>Now</span><b>${fmt(s.stats.currentMs)}</b></div>` +
      `<div><span>Today</span><b>${fmt(s.stats.todayMs)}</b></div>` +
      `<div><span>Longest</span><b>${fmt(s.stats.longestTodayMs)}</b></div>` +
      `<p>${graceLine} Lets go after ${Math.round(s.awayMs / 60000)} min away.</p>`;
  }

  function applyConfig(c) {
    if (c.customUrl) audio.setCustom(c.customUrl);
    else if (c.track) audio.setTrack(c.track);
    if (typeof c.volume === 'number') {
      audio.setVolume(c.volume);
      $('volume').value = String(Math.round(c.volume * 100));
    }
    renderTracks(c.customUrl ? 'custom' : c.track);
  }

  window.addEventListener('message', async (e) => {
    const msg = e.data;
    switch (msg.type) {
      case 'init':
        tracks = msg.tracks;
        audio.trackId = msg.track;
        audio.levelDb = msg.db;
        applyConfig(msg);
        renderStatus(msg);
        if (!(await unlock())) $('unlock').hidden = false;
        break;
      case 'level':
        setLevel(msg);
        break;
      case 'status':
        renderStatus(msg);
        break;
      case 'config':
        applyConfig(msg);
        break;
    }
  });

  $('unlock').addEventListener('click', unlock);
  // Any click in the panel counts as the gesture browsers need before playing sound.
  document.addEventListener('pointerdown', () => { if (!audio.running && status && status.state !== 'paused') unlock(); });
  $('toggle').addEventListener('click', () => vscode.postMessage({ type: 'toggle' }));
  $('hold').addEventListener('click', () => vscode.postMessage({ type: 'hold' }));
  $('volume').addEventListener('input', (e) => audio.setVolume(Number(e.target.value) / 100));
  $('volume').addEventListener('change', (e) => vscode.postMessage({ type: 'setVolume', value: Number(e.target.value) / 100 }));

  // A slow ripple that breathes with the music.
  const canvas = $('ripple');
  const g = canvas.getContext('2d');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let smooth = 0;
  let phase = 0;
  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    const level = audio.running ? audio.currentLevel() : 0;
    smooth += ((audio.meter() * 0.6 + level * 0.4) - smooth) * 0.05;
    phase += reduce ? 0 : 0.006 + smooth * 0.01;
    g.clearRect(0, 0, w, h);
    const color = getComputedStyle(document.body).getPropertyValue('--uc-accent').trim() || '#4fb3a9';
    for (let i = 0; i < 4; i++) {
      const p = (phase + i / 4) % 1;
      const r = 18 + p * (w / 2 - 22) * (0.35 + smooth * 0.65);
      g.beginPath();
      g.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      g.strokeStyle = color;
      g.globalAlpha = (1 - p) * (0.15 + smooth * 0.75);
      g.lineWidth = 1.5;
      g.stroke();
    }
    g.globalAlpha = 0.25 + smooth * 0.75;
    g.beginPath();
    g.arc(w / 2, h / 2, 10 + smooth * 6, 0, Math.PI * 2);
    g.fillStyle = color;
    g.fill();
    g.globalAlpha = 1;
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);

  vscode.postMessage({ type: 'ready' });
})();

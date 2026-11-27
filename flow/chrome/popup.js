/* Toolbar popup: shows your flow state and holds the controls. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const send = (msg) => chrome.runtime.sendMessage(msg);

  const WORDS = {
    flow: ['In flow', 'The music is with you.'],
    soft: ['Thinking', 'Softened while you think. Type and it swells back.'],
    resting: ['Resting', 'Start typing anywhere. The music will find you.'],
    paused: ['Paused', 'Press Start when you want it back.'],
  };

  function fmt(ms) {
    const m = Math.floor(ms / 60000);
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }

  let filledOnce = false;

  function render(s) {
    if (!s) return;
    const [word, sub] = WORDS[s.state] || WORDS.resting;
    $('state').textContent = word;
    $('sub').textContent = s.settings.enabled ? sub : 'Not following your typing. Turn it on below.';
    $('dot').dataset.state = s.state;
    const playing = s.state === 'flow' || s.state === 'soft';
    $('toggle').textContent = playing ? 'Pause' : 'Start';
    $('now').textContent = fmt(s.stats.currentMs);
    $('today').textContent = fmt(s.stats.todayMs);
    $('longest').textContent = fmt(s.stats.longestTodayMs);
    const g = s.grace;
    $('grace').textContent = g.learned
      ? `Softens after ${Math.round(g.ms / 1000)} s without typing, learned from ${g.samples} of your pauses.`
      : `Softens after ${Math.round(g.ms / 1000)} s without typing. Learning your rhythm (${g.samples}/${g.needed}).`;

    if (!filledOnce) {
      filledOnce = true;
      const select = $('track');
      for (const t of s.tracks) {
        const o = document.createElement('option');
        o.value = t.id;
        o.textContent = t.name;
        o.title = t.credit;
        select.appendChild(o);
      }
      select.value = s.settings.track;
      $('volume').value = String(Math.round(s.settings.volume * 100));
      $('intention').value = s.settings.intention || '';
      $('enabled').checked = s.settings.enabled;
      $('shield').checked = s.settings.shield;
      $('sites').value = s.settings.sites.join('\n');
    }
  }

  const update = (patch) => send({ type: 'settings', patch }).then(render);

  $('toggle').addEventListener('click', () => send({ type: 'toggle' }).then(render));
  $('track').addEventListener('change', (e) => update({ track: e.target.value }));
  $('volume').addEventListener('input', (e) => update({ volume: Number(e.target.value) / 100 }));
  $('enabled').addEventListener('change', (e) => update({ enabled: e.target.checked }));
  $('shield').addEventListener('change', (e) => update({ shield: e.target.checked }));
  let typingTimer;
  $('intention').addEventListener('input', (e) => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => update({ intention: e.target.value.trim() }), 300);
  });
  $('save-sites').addEventListener('click', async () => {
    const sites = $('sites').value.split(/\s+/).filter(Boolean);
    const s = await update({ sites });
    $('sites').value = s.settings.sites.join('\n');
    $('saved').hidden = false;
    setTimeout(() => { $('saved').hidden = true; }, 1500);
  });

  send({ type: 'status' }).then(render);
  setInterval(() => send({ type: 'status' }).then(render), 2000);
})();

/*
 * Undercurrent page script. Runs on every page, and does two small things:
 *
 * 1. Tells Undercurrent *that* you typed into a text field or scrolled.
 *    It never reads or sends which keys you pressed or any page content.
 * 2. While you're in flow, puts a calm pause screen over sites you've
 *    chosen to hold back (the flow shield).
 */
(() => {
  'use strict';
  if (window.__undercurrent) return;
  window.__undercurrent = true;

  function send(msg) {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch (_) {
      return Promise.resolve(null); // extension was reloaded; this old page script is orphaned
    }
  }

  // ---------------------------------------------------------- typing & presence

  const EDIT_KEYS = new Set(['Backspace', 'Delete', 'Enter', 'Tab']);
  const NOT_TEXT = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image']);

  function inTextField(e) {
    const path = e.composedPath ? e.composedPath() : [e.target];
    for (const el of path) {
      if (!el || el.nodeType !== 1) continue;
      if (el.isContentEditable) return true;
      if (el.tagName === 'TEXTAREA') return true;
      if (el.tagName === 'INPUT' && !NOT_TEXT.has(el.type)) return true;
      if (el.getAttribute('role') === 'textbox') return true;
    }
    return false;
  }

  let lastEdit = 0;
  addEventListener(
    'keydown',
    (e) => {
      if (e.metaKey || (e.ctrlKey && !e.altKey)) return; // shortcuts, not typing
      if (!(e.key && (e.key.length === 1 || EDIT_KEYS.has(e.key)))) return;
      if (!inTextField(e)) return;
      const now = Date.now();
      if (now - lastEdit < 350) return;
      lastEdit = now;
      send({ type: 'edit' });
    },
    true
  );

  let lastPresence = 0;
  function presence() {
    const now = Date.now();
    if (now - lastPresence < 15000 || !document.hasFocus()) return;
    lastPresence = now;
    send({ type: 'presence' });
  }
  addEventListener('scroll', presence, { capture: true, passive: true });
  addEventListener('pointerdown', presence, true);
  addEventListener('wheel', presence, { capture: true, passive: true });

  // ---------------------------------------------------------- flow shield

  if (window.top !== window) return;

  let shown = null;

  async function checkShield() {
    if (shown || document.visibilityState !== 'visible') return;
    const res = await send({ type: 'shield-check', host: location.hostname });
    if (res && res.shield) show(res);
  }

  function show(info) {
    const host = document.createElement('undercurrent-shield');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    const mins = info.minutes;
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap { position: fixed; inset: 0; display: grid; place-items: center; padding: 24px;
          background: radial-gradient(70% 70% at 70% 25%, rgba(120,203,187,.16), transparent 70%), #0c1517;
          color: #dce8e4; font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
        .card { max-width: 460px; display: flex; flex-direction: column; gap: 14px; }
        .eyebrow { font: 500 12px/1 ui-monospace, Menlo, Consolas, monospace; letter-spacing: .1em; text-transform: uppercase; color: #78cbbb; }
        h1 { margin: 0; font-size: 40px; line-height: 1.05; letter-spacing: -.02em; font-weight: 700; color: #eef5f2; }
        p { margin: 0; color: #8ea7a1; }
        .goal { color: #e2b46a; }
        .row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
        button { font: 500 15px system-ui, -apple-system, "Segoe UI", sans-serif; min-height: 44px; padding: 0 18px;
          border-radius: 10px; border: 1px solid #22393a; background: transparent; color: #dce8e4; cursor: pointer; }
        button.primary { background: #78cbbb; border-color: #78cbbb; color: #0c1517; }
        button:focus-visible { outline: 2px solid #e2b46a; outline-offset: 2px; }
      </style>
      <div class="wrap" role="dialog" aria-modal="true" aria-labelledby="t">
        <div class="card">
          <div class="eyebrow">Undercurrent · flow shield</div>
          <h1 id="t">You're in flow.</h1>
          <p>${mins >= 1 ? `${mins} minute${mins === 1 ? '' : 's'} in.` : 'You just got going.'} <span class="goal"></span></p>
          <p>This site will still be here later. Your train of thought might not.</p>
          <div class="row">
            <button class="primary" id="back">Back to work</button>
            <button id="open"></button>
          </div>
        </div>
      </div>`;
    if (info.intention) root.querySelector('.goal').textContent = `Working on: ${info.intention}`;
    root.querySelector('#open').textContent = `Open ${info.site} for 10 minutes`;
    root.querySelector('#back').addEventListener('click', () => {
      if (history.length > 1) history.back();
      else send({ type: 'shield-close' });
    });
    root.querySelector('#open').addEventListener('click', async () => {
      await send({ type: 'shield-snooze', host: location.hostname });
      hide();
    });

    (document.documentElement || document).appendChild(host);
    const pauseMedia = () => document.querySelectorAll('video, audio').forEach((m) => { if (!m.paused) m.pause(); });
    pauseMedia();
    const timer = setInterval(pauseMedia, 500);
    shown = { host, timer };
    root.querySelector('#back').focus();
  }

  function hide() {
    if (!shown) return;
    clearInterval(shown.timer);
    shown.host.remove();
    shown = null;
  }

  checkShield();
  document.addEventListener('visibilitychange', checkShield);
  // Single-page sites (YouTube, X) change pages without reloading.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      checkShield();
    }
  }, 1000);
})();

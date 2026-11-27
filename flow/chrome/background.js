/*
 * Undercurrent for Chrome: background service worker.
 *
 * Runs the same FlowModel as the VS Code extension. Pages report typing and
 * presence (timing only, never keys or text); this worker decides the music
 * level, drives the offscreen audio page, and answers the flow shield.
 *
 * Chrome stops idle service workers, so model state is saved to
 * chrome.storage.session after every change and restored on wake. Ticks come
 * from a 30 s alarm, plus a 5 s heartbeat from the audio page while it plays.
 */
importScripts('engine/flow-model.js');

const DEFAULT_SITES = [
  'youtube.com', 'x.com', 'twitter.com', 'reddit.com', 'facebook.com', 'instagram.com',
  'tiktok.com', 'news.ycombinator.com', 'netflix.com', 'twitch.tv',
];
const DEFAULTS = {
  enabled: true,
  track: 'prelude',
  volume: 0.6,
  shield: true,
  sites: DEFAULT_SITES,
  intention: '',
};
const SNOOZE_MS = 10 * 60_000;
const RUNTIME_KEYS = ['state', 'lastEdit', 'lastPresence', 'recentEdits', 'holdUntil', 'sessionStart'];

let model = null;
let lastHeard = null; // { at, host }: last typing signal, shown in the popup to help debugging
let settings = null;
let snoozes = {};
let loading = null;

// ---------------------------------------------------------------- state

async function load() {
  const local = await chrome.storage.local.get(['settings', 'learned']);
  const session = await chrome.storage.session.get(['runtime', 'snoozes']);
  settings = { ...DEFAULTS, ...(local.settings || {}) };
  model = new FlowModel({}, local.learned || null);
  const rt = session.runtime;
  if (rt) {
    for (const k of RUNTIME_KEYS) if (k in rt) model[k] = rt[k];
    // JSON storage turns -Infinity into null.
    if (model.lastEdit == null) model.lastEdit = -Infinity;
    if (model.lastPresence == null) model.lastPresence = -Infinity;
  }
  snoozes = session.snoozes || {};
  lastHeard = session.lastHeard || null;
}

function ready() {
  if (!loading) loading = load();
  return loading;
}

function saveRuntime() {
  const runtime = {};
  for (const k of RUNTIME_KEYS) runtime[k] = model[k];
  return chrome.storage.session.set({ runtime, snoozes, lastHeard });
}

function saveLearned() {
  return chrome.storage.local.set({ learned: model.snapshot() });
}

function saveSettings() {
  return chrome.storage.local.set({ settings });
}

// ---------------------------------------------------------------- audio page

let creating = null;

/** Opens the offscreen audio page if needed. Returns true if it was just created. */
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return false;
  if (!creating) {
    creating = chrome.offscreen
      .createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'Plays focus music that follows your typing.',
      })
      .finally(() => { creating = null; });
  }
  await creating;
  return true;
}

function toAudio(msg) {
  chrome.runtime.sendMessage({ target: 'offscreen', ...msg }).catch(() => {});
}

async function sendLevel(t) {
  const silent = t.db <= -40;
  if (silent && !(await chrome.offscreen.hasDocument())) return; // nothing playing, nothing to fade
  // A fresh audio page asks for its starting level itself (see 'hello').
  if (await ensureOffscreen()) return;
  toAudio({ type: 'level', db: t.db, rampMs: t.rampMs, fromDb: t.fromDb });
}

// ---------------------------------------------------------------- model plumbing

async function apply(t) {
  if (!t) return;
  if (t.state === 'resting' || t.state === 'paused' || t.from === 'resting') saveLearned();
  await sendLevel(t);
}

function minutes(ms) {
  return Math.floor(ms / 60_000);
}

function updateBadge() {
  const active = model.state === 'flow' || model.state === 'soft';
  const text = active ? `${Math.max(1, minutes(model.stats(Date.now()).currentMs))}m` : '';
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: model.state === 'flow' ? '#e2b46a' : '#7fb0d6' });
}

async function after(t) {
  await apply(t);
  updateBadge();
  await saveRuntime();
}

function hostOf(sender) {
  try {
    return new URL((sender.tab && sender.tab.url) || sender.url).hostname.replace(/^www\./, '');
  } catch (_) {
    return '';
  }
}

async function onEdit(sender) {
  lastHeard = { at: Date.now(), host: hostOf(sender) };
  if (!settings.enabled) return saveRuntime();
  await after(model.edit(Date.now()));
}

async function onPresence() {
  model.presence(Date.now());
  await saveRuntime();
}

async function onTick() {
  await after(model.tick(Date.now()));
}

function status() {
  const now = Date.now();
  return {
    state: model.state,
    stats: model.stats(now),
    grace: model.graceInfo(),
    lastHeard,
    now,
    settings,
    tracks: [
      { id: 'prelude', name: 'Prelude', credit: 'J. S. Bach, BWV 846' },
      { id: 'ground', name: 'Ground', credit: "Variations on Pachelbel's bass" },
      { id: 'drift', name: 'Drift', credit: 'Sparse piano, after Satie' },
      { id: 'tide', name: 'Tide', credit: 'Ambient pad' },
      { id: 'brown', name: 'Brown noise', credit: 'Low, steady noise' },
    ],
  };
}

async function togglePlay() {
  const now = Date.now();
  const playing = model.state === 'flow' || model.state === 'soft';
  await after(playing ? model.pause(now) : model.play(now));
}

async function updateSettings(patch) {
  const before = settings;
  settings = { ...settings, ...patch };
  if (Array.isArray(settings.sites)) {
    settings.sites = [...new Set(settings.sites.map(cleanHost).filter(Boolean))];
  }
  await saveSettings();
  if (patch.track && patch.track !== before.track) toAudio({ type: 'track', track: settings.track });
  if (typeof patch.volume === 'number') toAudio({ type: 'volume', volume: settings.volume });
  if (patch.enabled === false && before.enabled) await after(model.pause(Date.now()));
  if (patch.enabled === true && !before.enabled && model.state === 'paused') {
    // Back to following your typing: silent until you type.
    model.state = 'resting';
    await saveRuntime();
  }
}

// ---------------------------------------------------------------- flow shield

function cleanHost(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function shieldedSite(host) {
  const h = cleanHost(host);
  return settings.sites.find((site) => h === site || h.endsWith('.' + site)) || null;
}

function shieldCheck(host) {
  const active = model.state === 'flow' || model.state === 'soft';
  const site = shieldedSite(host);
  if (!settings.enabled || !settings.shield || !active || !site) return { shield: false };
  if ((snoozes[site] || 0) > Date.now()) return { shield: false };
  return {
    shield: true,
    site,
    minutes: minutes(model.stats(Date.now()).currentMs),
    intention: settings.intention,
  };
}

// ---------------------------------------------------------------- wiring

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.target === 'offscreen') return false;
  (async () => {
    await ready();
    switch (msg.type) {
      case 'edit': return onEdit(sender);
      case 'presence': return onPresence();
      case 'tick': return onTick();
      case 'hello': {
        // The audio page just opened: tell it what to play and where the level should be.
        const db = model.level();
        return { track: settings.track, volume: settings.volume, db, rampMs: db > -40 ? 5_000 : 500, fromDb: -30 };
      }
      case 'status': return status();
      case 'toggle': await togglePlay(); return status();
      case 'settings': await updateSettings(msg.patch || {}); return status();
      case 'shield-check': return shieldCheck(msg.host);
      case 'shield-snooze': {
        const site = shieldedSite(msg.host);
        if (site) snoozes[site] = Date.now() + SNOOZE_MS;
        await saveRuntime();
        return { ok: true };
      }
      case 'shield-close':
        if (sender.tab && sender.tab.id != null) chrome.tabs.remove(sender.tab.id).catch(() => {});
        return { ok: true };
    }
  })().then(sendResponse, () => sendResponse(null));
  return true; // respond asynchronously
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'tick') return;
  await ready();
  await onTick();
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-music') return;
  await ready();
  await togglePlay();
});

function startAlarm() {
  chrome.alarms.create('tick', { periodInMinutes: 0.5 });
}

/**
 * Chrome only adds content scripts to pages loaded after install, so tabs that were
 * already open (or open during an update) would never report typing. Add it to them now.
 */
async function injectIntoOpenTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs
      .filter((tab) => tab.id != null && /^(https?|file):/.test(tab.url || ''))
      .map((tab) =>
        chrome.scripting
          .executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] })
          .catch(() => {}) // e.g. the Chrome Web Store, or a page that's still loading
      )
  );
}

chrome.runtime.onInstalled.addListener(() => {
  startAlarm();
  injectIntoOpenTabs();
});
chrome.runtime.onStartup.addListener(startAlarm);

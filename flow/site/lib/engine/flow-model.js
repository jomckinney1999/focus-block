/*
 * Undercurrent — FlowModel
 *
 * Pure, clock-injected state machine that turns editor activity into a
 * target music level. No audio, no DOM, no timers: callers feed it events
 * and call tick() about once a second, then apply the returned transition
 * ({ db, rampMs }) to whatever is playing. Runs in Node (VS Code extension
 * host, tests) and in the browser (web demo).
 *
 * States
 *   flow     typing recently            → full level (0 dB)
 *   soft     a thinking/reading pause   → gentle dip (default -9 dB, ~half as loud)
 *   resting  away from the keyboard     → slow fade to silence, audio suspended
 *   paused   user muted it              → silent until they press play
 *
 * Signals
 *   edit()      a change to the document (typing, paste, delete)
 *   presence()  navigation: scrolling, cursor moves, switching files.
 *               Reading code is part of flow, so presence keeps you out of
 *               "resting" but does not lift a dip back to full.
 *
 * See RESEARCH.md for where each default comes from.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FlowModel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    // How long a pause in typing must last before the music softens.
    // Used until the model has learned your rhythm (or always, if adaptive=false).
    graceMs: 60_000,
    adaptive: true,
    adaptiveMinMs: 30_000,
    adaptiveMaxMs: 180_000,
    adaptiveMinSamples: 30,
    adaptivePercentile: 0.9,
    adaptiveMargin: 1.25,
    // Gaps shorter than this are ordinary inter-key intervals, not thinking pauses.
    thinkingPauseMinMs: 2_000,

    softDb: -9,
    softRampMs: 45_000,

    // No edits *and* no navigation for this long → you have left.
    restAfterMs: 5 * 60_000,
    restRampMs: 120_000,
    silentDb: -48,

    // Coming back from a dip: quick, so typing feels answered.
    returnRampMs: 2_500,

    // Coming back from silence: needs a few real edits, so a stray keypress
    // (or a cat on the keyboard) doesn't start the music.
    wakeEdits: 3,
    wakeWindowMs: 15_000,
    wakeRampMs: 6_000,
    wakeFromDb: -30,

    maxPauseSamples: 400,
    keepSessionsMs: 8 * 86_400_000,
  };

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function percentile(values, p) {
    if (!values.length) return NaN;
    const sorted = values.slice().sort((a, b) => a - b);
    const idx = clamp(Math.ceil(p * sorted.length) - 1, 0, sorted.length - 1);
    return sorted[idx];
  }

  function startOfDay(ts) {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  class FlowModel {
    constructor(options = {}, saved = null, now = Date.now()) {
      this.o = { ...DEFAULTS, ...options };
      this.state = 'resting';
      this.lastEdit = -Infinity;
      this.lastPresence = -Infinity;
      this.recentEdits = [];
      this.holdUntil = 0;
      this.sessionStart = null;
      this.pauses = [];
      this.sessions = [];
      this._now = now;
      if (saved) this.restore(saved);
    }

    // ---------- persistence ----------

    snapshot() {
      return { pauses: this.pauses.slice(), sessions: this.sessions.slice() };
    }

    restore(saved) {
      if (Array.isArray(saved.pauses)) {
        this.pauses = saved.pauses
          .filter((n) => Number.isFinite(n) && n > 0)
          .slice(-this.o.maxPauseSamples);
      }
      if (Array.isArray(saved.sessions)) {
        this.sessions = saved.sessions.filter(
          (s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start
        );
      }
    }

    setOptions(options) {
      this.o = { ...this.o, ...options };
    }

    resetLearning() {
      this.pauses = [];
    }

    // ---------- derived values ----------

    /** Current grace period in ms (learned from your own thinking pauses when adaptive). */
    grace() {
      const o = this.o;
      if (!o.adaptive || this.pauses.length < o.adaptiveMinSamples) return o.graceMs;
      const p = percentile(this.pauses, o.adaptivePercentile);
      return Math.round(clamp(p * o.adaptiveMargin, o.adaptiveMinMs, o.adaptiveMaxMs));
    }

    /** How the grace period was chosen, for showing to the user. */
    graceInfo() {
      const o = this.o;
      const learned = o.adaptive && this.pauses.length >= o.adaptiveMinSamples;
      return {
        ms: this.grace(),
        learned,
        samples: this.pauses.length,
        needed: o.adaptiveMinSamples,
        typicalPauseMs: learned ? percentile(this.pauses, o.adaptivePercentile) : null,
      };
    }

    level() {
      switch (this.state) {
        case 'flow':
          return 0;
        case 'soft':
          return this.o.softDb;
        default:
          return this.o.silentDb;
      }
    }

    lastActivity() {
      return Math.max(this.lastEdit, this.lastPresence);
    }

    stats(now = Date.now()) {
      const dayStart = startOfDay(now);
      const current = this.sessionStart != null ? Math.max(0, now - this.sessionStart) : 0;
      let today = 0;
      let longestToday = current;
      for (const s of this.sessions) {
        if (s.end < dayStart) continue;
        const len = s.end - Math.max(s.start, dayStart);
        today += len;
        longestToday = Math.max(longestToday, len);
      }
      if (this.sessionStart != null) today += now - Math.max(this.sessionStart, dayStart);
      return { currentMs: current, todayMs: today, longestTodayMs: longestToday };
    }

    // ---------- inputs ----------

    edit(now = Date.now()) {
      const o = this.o;
      const gap = now - this.lastEdit;
      if (this.state !== 'resting' && this.state !== 'paused' && gap >= o.thinkingPauseMinMs && gap <= o.restAfterMs) {
        this.pauses.push(gap);
        if (this.pauses.length > o.maxPauseSamples) this.pauses.splice(0, this.pauses.length - o.maxPauseSamples);
      }
      this.lastEdit = now;
      this.recentEdits.push(now);
      while (this.recentEdits.length && now - this.recentEdits[0] > o.wakeWindowMs) this.recentEdits.shift();

      if (this.state === 'soft') return this._to('flow', 0, o.returnRampMs, 'typing', now);
      if (this.state === 'resting' && this.recentEdits.length >= o.wakeEdits) {
        return this._to('flow', 0, o.wakeRampMs, 'back', now, o.wakeFromDb);
      }
      return null;
    }

    presence(now = Date.now()) {
      this.lastPresence = now;
      return null;
    }

    tick(now = Date.now()) {
      const o = this.o;
      if (this.state === 'paused') return null;

      if (this.holdUntil > now) {
        this.lastPresence = now;
        if (this.state !== 'flow') return this._to('flow', 0, o.wakeRampMs, 'hold', now);
        return null;
      }

      const sinceActivity = now - this.lastActivity();
      if ((this.state === 'flow' || this.state === 'soft') && sinceActivity > o.restAfterMs) {
        return this._to('resting', o.silentDb, o.restRampMs, 'away', now);
      }
      if (this.state === 'flow' && now - this.lastEdit > this.grace()) {
        return this._to('soft', o.softDb, o.softRampMs, 'thinking', now);
      }
      return null;
    }

    /** Keep playing at full level for a while, e.g. while reading docs or a long review. */
    hold(ms, now = Date.now()) {
      this.holdUntil = now + ms;
      this.lastPresence = now;
      if (this.state !== 'flow') return this._to('flow', 0, this.o.wakeRampMs, 'hold', now);
      return null;
    }

    releaseHold() {
      this.holdUntil = 0;
    }

    play(now = Date.now()) {
      this.lastEdit = now;
      if (this.state === 'flow') return null;
      return this._to('flow', 0, this.o.wakeRampMs, 'play', now, this.o.wakeFromDb);
    }

    pause(now = Date.now()) {
      if (this.state === 'paused') return null;
      return this._to('paused', this.o.silentDb, 1_500, 'pause', now);
    }

    // ---------- internals ----------

    _to(state, db, rampMs, reason, now, fromDb) {
      const from = this.state;
      if (from === state) return null;

      const wasActive = from === 'flow' || from === 'soft';
      const isActive = state === 'flow' || state === 'soft';
      if (!wasActive && isActive) {
        this.sessionStart = now;
      } else if (wasActive && !isActive && this.sessionStart != null) {
        // A session ends at the last sign of life, not when the fade finished.
        const end = state === 'resting' ? Math.max(this.sessionStart, this.lastActivity()) : now;
        if (end - this.sessionStart >= 60_000) this.sessions.push({ start: this.sessionStart, end });
        this.sessionStart = null;
        const cutoff = now - this.o.keepSessionsMs;
        this.sessions = this.sessions.filter((s) => s.end >= cutoff);
      }
      this.recentEdits = [];

      this.state = state;
      const t = { state, from, db, rampMs, reason };
      if (fromDb != null) t.fromDb = fromDb;
      return t;
    }
  }

  FlowModel.DEFAULTS = DEFAULTS;
  FlowModel.percentile = percentile;
  FlowModel.dbToGain = (db) => Math.pow(10, db / 20);
  return FlowModel;
});

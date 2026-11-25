'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const FlowModel = require('../engine/flow-model.js');

const S = 1000;
const M = 60 * S;

function typing(model, from, count, every = 150) {
  let last = null;
  for (let i = 0; i < count; i++) {
    const t = model.edit(from + i * every);
    if (t) last = t;
  }
  return last;
}

test('starts silent and needs a few edits to wake', () => {
  const m = new FlowModel({}, null, 0);
  assert.equal(m.state, 'resting');
  assert.equal(m.edit(1000), null);
  assert.equal(m.edit(1200), null);
  const t = m.edit(1400);
  assert.equal(t.state, 'flow');
  assert.equal(t.db, 0);
  assert.equal(t.fromDb, FlowModel.DEFAULTS.wakeFromDb);
});

test('stray keypresses spread out do not wake it', () => {
  const m = new FlowModel({}, null, 0);
  assert.equal(m.edit(0), null);
  assert.equal(m.edit(20 * S), null);
  assert.equal(m.edit(40 * S), null);
  assert.equal(m.state, 'resting');
});

test('short thinking pauses never touch the music', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 5);
  for (let t = 1 * S; t < 55 * S; t += S) assert.equal(m.tick(t), null);
  assert.equal(m.state, 'flow');
});

test('softens after the grace period, slowly', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 5);
  const t = m.tick(61 * S + 600);
  assert.equal(t.state, 'soft');
  assert.equal(t.db, -9);
  assert.equal(t.rampMs, 45_000);
});

test('one keystroke brings it back from soft, quickly', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 5);
  m.tick(70 * S);
  const t = m.edit(90 * S);
  assert.equal(t.state, 'flow');
  assert.equal(t.rampMs, 2_500);
});

test('reading (navigation) keeps it soft but stops it going silent', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 5);
  m.tick(70 * S);
  for (let t = 70 * S; t < 12 * M; t += 30 * S) {
    m.presence(t);
    const tr = m.tick(t + 1);
    assert.ok(!tr || tr.state !== 'resting', 'should not rest while reading');
  }
  assert.equal(m.state, 'soft');
});

test('lets go after five minutes with no activity at all', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 5);
  m.tick(70 * S);
  assert.equal(m.tick(5 * M), null);
  const t = m.tick(5 * M + 2 * S);
  assert.equal(t.state, 'resting');
  assert.equal(t.rampMs, 120_000);
  assert.ok(t.db <= -40);
});

test('session ends at the last sign of life, not after the fade', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 3);
  for (let t = 10 * S; t < 3 * M; t += 10 * S) m.edit(t);
  const last = m.lastEdit;
  m.tick(last + 70 * S);
  m.tick(last + 5 * M + S);
  assert.equal(m.state, 'resting');
  assert.equal(m.sessions.length, 1);
  assert.equal(m.sessions[0].end, last);
});

test('learns your thinking pauses and adapts the grace period', () => {
  const m = new FlowModel({}, null, 0);
  assert.equal(m.grace(), 60_000);
  typing(m, 0, 3);
  let t = 1 * S;
  // A coder whose thinking pauses are all 8–20 s.
  for (let i = 0; i < 40; i++) {
    t += 8 * S + (i % 13) * S;
    m.edit(t);
  }
  const info = m.graceInfo();
  assert.equal(info.learned, true);
  assert.ok(info.ms >= 30_000 && info.ms <= 30_000, `clamped to floor, got ${info.ms}`);
});

test('learned grace grows for someone who pauses longer', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 3);
  let t = 1 * S;
  for (let i = 0; i < 60; i++) {
    t += 20 * S + (i % 10) * 10 * S; // 20 s – 110 s
    m.edit(t);
    m.tick(t);
  }
  const g = m.grace();
  assert.ok(g > 100_000 && g <= 180_000, `expected long grace, got ${g}`);
});

test('ordinary inter-key gaps are not counted as thinking pauses', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 200, 180);
  assert.equal(m.pauses.length, 0);
});

test('hold keeps full level while reading, then releases', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 5);
  m.tick(70 * S);
  assert.equal(m.state, 'soft');
  const t = m.hold(10 * M, 80 * S);
  assert.equal(t.state, 'flow');
  for (let x = 80 * S; x < 80 * S + 10 * M; x += 30 * S) assert.equal(m.tick(x), null);
  const after = m.tick(80 * S + 10 * M + S);
  assert.equal(after.state, 'soft');
});

test('pause wins over everything until play', () => {
  const m = new FlowModel({}, null, 0);
  typing(m, 0, 5);
  assert.equal(m.pause(1 * S).state, 'paused');
  typing(m, 2 * S, 10);
  assert.equal(m.tick(3 * S), null);
  assert.equal(m.state, 'paused');
  assert.equal(m.play(4 * S).state, 'flow');
});

test('snapshot round-trips learning and sessions', () => {
  const m = new FlowModel({}, null, 0);
  m.pauses = [5000, 6000];
  m.sessions = [{ start: 0, end: 120_000 }];
  const m2 = new FlowModel({}, JSON.parse(JSON.stringify(m.snapshot())), 0);
  assert.deepEqual(m2.pauses, [5000, 6000]);
  assert.deepEqual(m2.sessions, [{ start: 0, end: 120_000 }]);
});

test('stats count today', () => {
  const now = new Date(2026, 10, 25, 15, 0, 0).getTime();
  const m = new FlowModel({}, null, now);
  m.sessions = [
    { start: now - 3 * 3600_000, end: now - 2 * 3600_000 },
    { start: now - 2 * 86_400_000, end: now - 2 * 86_400_000 + 3600_000 },
  ];
  typing(m, now - 10 * M, 3, 0); // three edits at once wake it exactly 10 min ago
  const s = m.stats(now);
  assert.equal(s.currentMs, 10 * M);
  assert.equal(s.todayMs, 3600_000 + 10 * M);
  assert.equal(s.longestTodayMs, 3600_000);
});

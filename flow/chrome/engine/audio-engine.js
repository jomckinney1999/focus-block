/*
 * Undercurrent — FlowAudio
 *
 * Everything you hear is synthesized live with the Web Audio API: no audio
 * files, no streaming, no licensing. The classical pieces are public-domain
 * compositions played by a small piano voice; the rest is generative.
 *
 * Signal path
 *   track → bus → (dry + convolution reverb) → level → volume → limiter → out
 *
 *   level   is driven by FlowModel (typing in / pauses out), ramped in dB
 *           so a fade sounds even from start to finish.
 *   volume  is the user's own volume knob.
 *
 * When the level reaches silence the AudioContext is suspended. Its clock
 * stops, so sequenced pieces resume exactly where they left off.
 */
(function (root) {
  'use strict';

  const SILENT_GAIN = 0.0001;
  const dbToGain = (db) => Math.max(SILENT_GAIN, Math.pow(10, db / 20));
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(name) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
    if (!m) throw new Error('bad note ' + name);
    return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }

  // Small, fast, seedable PRNG so generative pieces are varied but reproducible.
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // ---------------------------------------------------------------- voices

  /** A soft felt-piano: a few partials, fast attack, two-stage decay, darkening filter. */
  function piano(ctx, out, m, t, vel = 0.5, hold = 1.2) {
    const f = mtof(m);
    const amp = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    const bright = 900 + 2600 * vel;
    lp.frequency.setValueAtTime(Math.min(bright + f * 2, 9000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(500, f * 1.5), t + hold + 1.5);
    lp.Q.value = 0.3;

    const peak = 0.22 * vel * (m < 48 ? 1.25 : 1); // a little more weight in the bass
    const end = t + hold + 2.2;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.006);
    amp.gain.exponentialRampToValueAtTime(peak * 0.35, t + 0.35);
    amp.gain.exponentialRampToValueAtTime(peak * 0.12, t + hold);
    amp.gain.exponentialRampToValueAtTime(SILENT_GAIN, end);

    const partials = [
      [1, 'sine', 1],
      [1.0015, 'triangle', 0.35],
      [2.001, 'sine', 0.22],
      [3.003, 'sine', 0.07],
    ];
    for (const [ratio, type, g] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f * ratio;
      const pg = ctx.createGain();
      pg.gain.value = g;
      o.connect(pg).connect(lp);
      o.start(t);
      o.stop(end + 0.05);
    }
    lp.connect(amp).connect(out);
  }

  // ---------------------------------------------------------------- track base

  class Sequenced {
    constructor(ctx, out) {
      this.ctx = ctx;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(out);
      this.next = 0;
      this.timer = null;
    }
    start(fadeSec = 2) {
      const t = this.ctx.currentTime;
      this.bus.gain.setValueAtTime(SILENT_GAIN, t);
      // Per-track trim so every track sits at a similar loudness (about -25 LUFS).
      this.bus.gain.exponentialRampToValueAtTime(this.trim || 1, t + fadeSec);
      this.next = t + 0.15;
      // Look 2.5 s ahead: hidden tabs/webviews may only get ~1 timer tick per second.
      this.timer = setInterval(() => this.pump(), 250);
      this.pump();
    }
    pump() {
      const now = this.ctx.currentTime;
      if (this.next < now - 0.05) this.next = now + 0.05; // timer was starved; skip, don't cram
      const horizon = now + 2.5;
      while (this.next < horizon) this.next += this.step(this.next);
    }
    stop(fadeSec = 2.5) {
      clearInterval(this.timer);
      const t = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setValueAtTime(Math.max(this.bus.gain.value, SILENT_GAIN), t);
      this.bus.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + fadeSec);
      setTimeout(() => this.bus.disconnect(), fadeSec * 1000 + 3000);
    }
  }

  // ---------------------------------------------------------------- tracks

  /*
   * J. S. Bach — Prelude in C major, BWV 846 (Well-Tempered Clavier I, 1722).
   * Bars 1–32 share one figure: five chord tones played 1-2-3-4-5-3-4-5, twice.
   */
  const BWV846 = [
    'C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5',
    'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5', 'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5',
    'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4', 'G3 Bb3 E4 G4 C#5',
    'F3 A3 D4 A4 D5', 'F3 Ab3 D4 F4 B4', 'E3 G3 C4 G4 C5', 'E3 F3 A3 C4 F4',
    'D3 F3 A3 C4 F4', 'G2 D3 G3 B3 F4', 'C3 E3 G3 C4 E4', 'C3 G3 Bb3 C4 E4',
    'F2 F3 A3 C4 E4', 'F#2 C3 A3 C4 Eb4', 'Ab2 F3 B3 C4 D4', 'G2 F3 G3 B3 D4',
    'G2 E3 G3 C4 E4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'G2 Eb3 A3 C4 F#4',
    'G2 E3 G3 C4 G4', 'G2 D3 G3 C4 F4', 'G2 D3 G3 B3 F4', 'C2 C3 G3 Bb3 E4',
  ].map((bar) => bar.split(' ').map(midi));
  const BWV846_CODA = [
    'C2 C3 F3 A3 C4 F4 C4 A3 C4 A3 F3 A3 F3 D3 F3 D3',
    'C2 B2 G4 B4 D5 F5 D5 B4 D5 B4 G4 B4 D4 F4 E4 D4',
  ].map((bar) => bar.split(' ').map(midi));
  const BWV846_FINAL = 'C2 C3 E4 G4 C5'.split(' ').map(midi);
  const FIGURE = [0, 1, 2, 3, 4, 2, 3, 4, 0, 1, 2, 3, 4, 2, 3, 4];

  class Prelude extends Sequenced {
    constructor(ctx, out) {
      super(ctx, out);
      this.r = rng(846);
      this.sixteenth = 60 / 60 / 4; // ♩ = 60, unhurried
      this.pos = 0; // sixteenths since start of piece
    }
    step(t) {
      const r = this.r;
      const s = this.sixteenth;
      const bar = Math.floor(this.pos / 16);
      const i = this.pos % 16;
      const jitter = (r() - 0.5) * 0.012;
      const totalBars = BWV846.length + BWV846_CODA.length + 3; // + final chord + 2 bars of breath
      let advance = 1;

      if (bar < BWV846.length) {
        const chord = BWV846[bar];
        const idx = FIGURE[i];
        const accent = i === 0 || i === 8 ? 0.62 : i % 4 === 2 ? 0.48 : 0.42;
        // The two lowest voices ring on, as Bach wrote them (half note / dotted quarter).
        const hold = idx === 0 ? s * 8 : idx === 1 ? s * 7 : s * 2.2;
        piano(this.ctx, this.bus, chord[idx], t + jitter, accent + r() * 0.06, hold);
      } else if (bar < BWV846.length + BWV846_CODA.length) {
        const seq = BWV846_CODA[bar - BWV846.length];
        piano(this.ctx, this.bus, seq[i], t + jitter, i === 0 ? 0.6 : 0.42, i === 0 ? s * 16 : s * 2.2);
      } else if (bar === BWV846.length + BWV846_CODA.length && i === 0) {
        BWV846_FINAL.forEach((m, k) => piano(this.ctx, this.bus, m, t + k * 0.045, 0.5, s * 14));
        advance = 16;
      }
      // Ritardando through the last two bars.
      const slow = bar >= BWV846.length ? 1.12 : 1;
      this.pos = (this.pos + advance) % (totalBars * 16);
      return s * slow * advance;
    }
  }

  /*
   * Ground — baroque-style variations over Pachelbel's ground bass
   * (D A Bm F#m G D G A, c. 1680). The bass repeats; the figuration above it
   * is generated, so it never plays the same eight bars twice.
   */
  class Ground extends Sequenced {
    constructor(ctx, out) {
      super(ctx, out);
      this.r = rng(1680);
      this.beat = 60 / 56;
      this.chords = [
        ['D2', 'D4 F#4 A4'], ['A1', 'C#4 E4 A4'], ['B1', 'D4 F#4 B4'], ['F#2', 'C#4 F#4 A4'],
        ['G1', 'D4 G4 B4'], ['D2', 'D4 F#4 A4'], ['G1', 'D4 G4 B4'], ['A1', 'C#4 E4 A4'],
      ].map(([b, c]) => [midi(b), c.split(' ').map(midi)]);
      this.figures = [
        [0, 1, 2, 3], [3, 2, 1, 0], [0, 2, 1, 3], [0, 1, 2, 1], [2, 1, 0, 1], [0, 2, 3, 2],
      ];
      this.ci = 0;
      this.n = 0;
      this.fig = this.figures[0];
      this.octave = 0;
    }
    step(t) {
      const r = this.r;
      const [bass, chord] = this.chords[this.ci];
      const tones = [...chord, chord[0] + 12];
      if (this.n === 0) {
        piano(this.ctx, this.bus, bass, t, 0.55, this.beat * 2);
        piano(this.ctx, this.bus, bass + 12, t + 0.01, 0.25, this.beat * 2);
        if (this.ci % 2 === 0) {
          this.fig = pick(r, this.figures);
          this.octave = r() < 0.25 ? 12 : 0;
        }
      }
      const m = tones[this.fig[this.n % 4]] + this.octave;
      const vel = (this.n % 4 === 0 ? 0.44 : 0.34) + r() * 0.06;
      piano(this.ctx, this.bus, m, t + (r() - 0.5) * 0.01, vel, this.beat * 0.7);
      // Occasionally a sustained top line note, like a melody surfacing.
      if (this.n === 0 && r() < 0.35) piano(this.ctx, this.bus, pick(r, chord) + 12, t + 0.02, 0.3, this.beat * 3);

      this.n += 1;
      if (this.n === 8) {
        this.n = 0;
        this.ci = (this.ci + 1) % this.chords.length;
      }
      return this.beat / 4;
    }
  }

  /*
   * Drift — slow, sparse piano in 3/4, in the spirit of Satie's Gymnopédies
   * (1888): two gently swaying major-seventh chords and a melody that only
   * sometimes speaks.
   */
  class Drift extends Sequenced {
    constructor(ctx, out) {
      super(ctx, out);
      this.r = rng(1888);
      this.trim = 1.5;
      this.beat = 60 / 66;
      this.harmony = [
        [midi('G2'), ['B3', 'D4', 'F#4'].map(midi)],
        [midi('D2'), ['A3', 'C#4', 'F#4'].map(midi)],
      ];
      this.scale = ['F#4', 'A4', 'B4', 'C#5', 'D5', 'E5', 'F#5'].map(midi);
      this.mi = 3;
      this.bar = 0;
      this.b = 0;
    }
    step(t) {
      const r = this.r;
      const [bass, chord] = this.harmony[this.bar % 2];
      const j = (r() - 0.5) * 0.02;
      if (this.b === 0) {
        piano(this.ctx, this.bus, bass, t + j, 0.5, this.beat * 3);
        if (r() < 0.55) {
          this.mi = Math.max(0, Math.min(this.scale.length - 1, this.mi + pick(r, [-2, -1, -1, 0, 1, 1, 2])));
          piano(this.ctx, this.bus, this.scale[this.mi], t + 0.04 + j, 0.4 + r() * 0.08, this.beat * 3);
        }
      } else if (this.b === 1) {
        chord.forEach((m, k) => piano(this.ctx, this.bus, m, t + j + k * 0.012, 0.26, this.beat * 1.6));
      } else if (r() < 0.15) {
        piano(this.ctx, this.bus, this.scale[Math.max(0, this.mi - 1)], t + j, 0.3, this.beat);
      }
      this.b = (this.b + 1) % 3;
      if (this.b === 0) this.bar += 1;
      return this.beat;
    }
  }

  /** Tide — an evolving, wordless pad. Chords crossfade every ~20 s. */
  class Tide {
    constructor(ctx, out) {
      this.ctx = ctx;
      this.r = rng(42);
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.filter = ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 900;
      this.filter.Q.value = 0.5;
      this.lfo = ctx.createOscillator();
      this.lfo.frequency.value = 0.03;
      const lfoAmt = ctx.createGain();
      lfoAmt.gain.value = 350;
      this.lfo.connect(lfoAmt).connect(this.filter.frequency);
      this.filter.connect(this.bus).connect(out);
      this.chords = [
        ['D3', 'A3', 'E4', 'F#4'], ['B2', 'F#3', 'D4', 'A4'], ['G2', 'D3', 'B3', 'F#4'], ['A2', 'E3', 'C#4', 'E4'],
      ].map((c) => c.map(midi));
      this.voices = [];
      this.ci = 0;
    }
    _chord(t) {
      const fade = 8;
      for (const v of this.voices) {
        v.g.gain.setValueAtTime(v.g.gain.value, t);
        v.g.gain.linearRampToValueAtTime(0, t + fade);
        v.oscs.forEach((o) => o.stop(t + fade + 0.1));
      }
      this.voices = this.chords[this.ci].map((m) => {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + fade);
        const oscs = [-7, 0, 6].map((cents) => {
          const o = this.ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = mtof(m);
          o.detune.value = cents + (this.r() - 0.5) * 4;
          o.connect(g);
          o.start(t);
          return o;
        });
        g.connect(this.filter);
        return { g, oscs };
      });
      this.ci = (this.ci + 1 + (this.r() < 0.3 ? 1 : 0)) % this.chords.length;
    }
    start(fadeSec = 3) {
      const t = this.ctx.currentTime;
      this.lfo.start(t);
      this.bus.gain.setValueAtTime(SILENT_GAIN, t);
      this.bus.gain.exponentialRampToValueAtTime(1, t + fadeSec);
      this._chord(t);
      this.nextChange = t + 20;
      this.timer = setInterval(() => {
        const now = this.ctx.currentTime;
        if (now >= this.nextChange - 0.5) {
          this._chord(Math.max(now, this.nextChange));
          this.nextChange += 18 + this.r() * 8;
        }
      }, 500);
    }
    stop(fadeSec = 3) {
      clearInterval(this.timer);
      const t = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setValueAtTime(Math.max(this.bus.gain.value, SILENT_GAIN), t);
      this.bus.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + fadeSec);
      setTimeout(() => {
        this.voices.forEach((v) => v.oscs.forEach((o) => { try { o.stop(); } catch (_) {} }));
        try { this.lfo.stop(); } catch (_) {}
        this.bus.disconnect();
      }, fadeSec * 1000 + 500);
    }
  }

  /** Brown noise — a steady, low, rain-on-the-roof wash. Masks speech without demanding attention. */
  class Brown {
    constructor(ctx, out, { dry = true } = {}) {
      this.ctx = ctx;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(out);
      this.dry = dry;
    }
    start(fadeSec = 3) {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 8;
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        let last = 0;
        for (let i = 0; i < len; i++) {
          last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
          d[i] = last * 3.2;
        }
        // Crossfade the loop seam so there's no click every 8 s.
        const x = Math.floor(ctx.sampleRate * 0.5);
        for (let i = 0; i < x; i++) {
          const a = i / x;
          d[i] = d[i] * a + d[len - x + i] * (1 - a);
        }
      }
      this.src = ctx.createBufferSource();
      this.src.buffer = buf;
      this.src.loop = true;
      this.src.loopEnd = (len - Math.floor(ctx.sampleRate * 0.5)) / ctx.sampleRate;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1100;
      this.src.connect(lp).connect(this.bus);
      const t = ctx.currentTime;
      this.bus.gain.setValueAtTime(SILENT_GAIN, t);
      this.bus.gain.exponentialRampToValueAtTime(0.55, t + fadeSec);
      this.src.start(t);
    }
    stop(fadeSec = 3) {
      const t = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setValueAtTime(Math.max(this.bus.gain.value, SILENT_GAIN), t);
      this.bus.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + fadeSec);
      setTimeout(() => { try { this.src.stop(); } catch (_) {} this.bus.disconnect(); }, fadeSec * 1000 + 300);
    }
  }

  // ---------------------------------------------------------------- more voices

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const noiseCache = new WeakMap();
  /** Two seconds of white noise per context, shared by every noise voice. */
  function whiteNoise(ctx) {
    let buf = noiseCache.get(ctx);
    if (!buf) {
      const len = ctx.sampleRate * 2;
      buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      noiseCache.set(ctx, buf);
    }
    return buf;
  }
  /** A filtered burst of noise: brushes, cymbals, rain drops, fire crackle. */
  function noiseHit(ctx, out, t, { dur = 0.1, type = 'bandpass', freq = 3000, q = 0.8, gain = 0.1, attack = 0.002, sweepTo } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = whiteNoise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }
  /** A continuous filtered noise bed (rain body, waves, fire rumble). Returns the nodes to stop later. */
  function noiseBed(ctx, out, { type = 'lowpass', freq = 800, q = 0.7, gain = 0.1 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = whiteNoise(ctx);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(out);
    src.start();
    return { src, filter: f, gain: g };
  }
  /** Electric piano, Rhodes-like: an FM bell tone on a warm body. */
  function epiano(ctx, out, m, t, vel = 0.4, hold = 1.5) {
    const f = mtof(m);
    const end = t + hold + 1.8;
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const modGain = ctx.createGain();
    modGain.gain.setValueAtTime(f * 1.4 * vel, t);
    modGain.gain.exponentialRampToValueAtTime(f * 0.1, t + 0.6);
    mod.connect(modGain).connect(car.frequency);
    const tine = ctx.createOscillator();
    tine.frequency.value = f * 14;
    const tineGain = ctx.createGain();
    tineGain.gain.setValueAtTime(0.025 * vel, t);
    tineGain.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + 0.12);
    tine.connect(tineGain);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    const amp = ctx.createGain();
    const peak = 0.13 * vel;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.005);
    amp.gain.exponentialRampToValueAtTime(peak * 0.45, t + 0.4);
    amp.gain.exponentialRampToValueAtTime(peak * 0.2, t + hold);
    amp.gain.exponentialRampToValueAtTime(SILENT_GAIN, end);
    car.connect(lp);
    tineGain.connect(lp);
    lp.connect(amp).connect(out);
    for (const o of [car, mod, tine]) { o.start(t); o.stop(end + 0.05); }
  }
  /** Upright bass: a round, plucked low note. */
  function bass(ctx, out, m, t, vel = 0.5, dur = 0.7) {
    const f = mtof(m);
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = f;
    const sub = ctx.createOscillator();
    sub.frequency.value = f;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(250, t + 0.25);
    lp.Q.value = 2;
    const g = ctx.createGain();
    const peak = 0.3 * vel;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.008);
    g.gain.exponentialRampToValueAtTime(peak * 0.4, t + 0.18);
    g.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + dur);
    o.connect(lp);
    sub.connect(lp);
    lp.connect(g).connect(out);
    for (const x of [o, sub]) { x.start(t); x.stop(t + dur + 0.05); }
  }
  /** Vibraphone: a pure tone with a slow motor tremolo. */
  function vibes(ctx, out, m, t, vel = 0.3, dur = 2.5) {
    const f = mtof(m);
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const over = ctx.createOscillator();
    over.frequency.value = f * 4;
    const overGain = ctx.createGain();
    overGain.gain.value = 0.07;
    over.connect(overGain);
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 5;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = 0.25;
    lfo.connect(lfoAmt).connect(trem.gain);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.11 * vel, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + dur);
    o.connect(trem);
    overGain.connect(trem);
    trem.connect(amp).connect(out);
    for (const x of [o, over, lfo]) { x.start(t); x.stop(t + dur + 0.05); }
  }
  /** A soft, rounded kick drum. */
  function kick(ctx, out, t, vel = 0.6) {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(105, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45 * vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + 0.4);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.45);
  }

  /** Puts a chord's pitch classes into the octave above a bass root, for walking lines. */
  const inBassRange = (root, m) => root + (((m % 12) - (root % 12) + 12) % 12);

  /*
   * Noir — a late-night jazz club. Walking upright bass, brushes and ride,
   * smoky electric-piano chords and the odd vibraphone note, at a slow swing.
   * Melody stays sparse on purpose: jazz's improvised lines are what pull
   * attention, so here the band only ever plays the room.
   */
  class Noir extends Sequenced {
    constructor(ctx, out) {
      super(ctx, out);
      this.r = rng(1947);
      this.beat = 60 / 66;
      const chord = (b, c) => [midi(b), c.split(' ').map(midi)];
      this.bars = [
        chord('C2', 'Eb3 G3 Bb3 D4'), chord('C2', 'Eb3 G3 Bb3 D4'),
        chord('F2', 'Ab3 C4 Eb4 G4'), chord('F2', 'Ab3 C4 Eb4 G4'),
        chord('D2', 'F3 Ab3 C4'), chord('G1', 'F3 B3 D4 Ab4'),
        chord('C2', 'Eb3 G3 Bb3 D4'), chord('Ab1', 'G3 C4 Eb4'),
      ];
      this.scale = ['C5', 'D5', 'Eb5', 'F5', 'G5', 'Bb5', 'C6'].map(midi);
      this.mi = 3;
      this.bar = 0;
      this.e = 0; // eighth note in the bar, 0..7
    }
    step(t) {
      const r = this.r;
      const ctx = this.ctx;
      const out = this.bus;
      const [root, chord] = this.bars[this.bar];
      const nextRoot = this.bars[(this.bar + 1) % this.bars.length][0];
      const e = this.e;
      const onBeat = e % 2 === 0;
      const beat = e >> 1;
      const j = (r() - 0.5) * 0.014;
      if (onBeat) {
        // Walking bass: root on 1, chord tones in between, a chromatic step into the next bar.
        let m = root;
        if (beat === 3) m = inBassRange(root, nextRoot) + (r() < 0.5 ? 1 : -1);
        else if (beat > 0) m = inBassRange(root, pick(r, chord));
        bass(ctx, out, m, t + j, 0.55 + r() * 0.1, this.beat * 0.95);
        noiseHit(ctx, out, t + j, { type: 'highpass', freq: 6200, dur: 0.38, gain: 0.03 }); // ride
        if (beat === 1 || beat === 3) noiseHit(ctx, out, t + j, { type: 'bandpass', freq: 1700, q: 0.6, dur: 0.45, gain: 0.045, attack: 0.07, sweepTo: 900 }); // brush swish
        if (beat === 0 && r() < 0.6) chord.forEach((m2, k) => epiano(ctx, out, m2, t + j + k * 0.014, 0.3 + r() * 0.06, this.beat * 1.6));
        if (r() < 0.1) {
          this.mi = clamp(this.mi + pick(r, [-2, -1, 1, 2]), 0, this.scale.length - 1);
          vibes(ctx, out, this.scale[this.mi], t + 0.02, 0.32, 2.8);
        }
      } else {
        if (beat === 1 || beat === 3) noiseHit(ctx, out, t + j, { type: 'highpass', freq: 6800, dur: 0.18, gain: 0.02 }); // the swung "-a-" of the ride
        if (beat === 1 && r() < 0.4) chord.forEach((m2, k) => epiano(ctx, out, m2, t + j + k * 0.01, 0.26, this.beat));
      }
      this.e = (e + 1) % 8;
      if (this.e === 0) this.bar = (this.bar + 1) % this.bars.length;
      return onBeat ? this.beat * 0.64 : this.beat * 0.36; // swing
    }
  }

  /* Lo-fi — dusky beats: soft kick and snare, mellow keys, a little vinyl crackle. */
  class LoFi extends Sequenced {
    constructor(ctx, out) {
      super(ctx, out);
      this.r = rng(2019);
      this.trim = 1.7;
      this.beat = 60 / 72;
      const chord = (b, c) => [midi(b), c.split(' ').map(midi)];
      this.bars = [
        chord('F2', 'A3 C4 E4 G4'), chord('E2', 'G3 B3 D4'),
        chord('D2', 'F3 A3 C4 E4'), chord('C2', 'E3 G3 B3 D4'),
      ];
      this.bar = 0;
      this.e = 0;
    }
    step(t) {
      const r = this.r;
      const ctx = this.ctx;
      const out = this.bus;
      const [root, chord] = this.bars[this.bar];
      const e = this.e;
      const j = (r() - 0.5) * 0.02;
      if (e === 0) chord.forEach((m, k) => epiano(ctx, out, m, t + k * 0.02, 0.34, this.beat * 3.6));
      if (e === 0 || e === 5) {
        kick(ctx, out, t + j, 0.55);
        bass(ctx, out, root, t + j, 0.5, this.beat * 1.4);
      }
      if (e === 2 || e === 6) {
        noiseHit(ctx, out, t + j, { type: 'bandpass', freq: 1600, q: 0.7, dur: 0.22, gain: 0.07 }); // soft snare
        noiseHit(ctx, out, t + j, { type: 'lowpass', freq: 400, q: 0.5, dur: 0.12, gain: 0.05 });
      }
      noiseHit(ctx, out, t + j, { type: 'highpass', freq: 8500, dur: 0.05, gain: e % 2 ? 0.01 : 0.016 }); // hat
      if (r() < 0.5) noiseHit(ctx, out, t + r() * 0.3, { type: 'highpass', freq: 3000, dur: 0.008, gain: 0.02 + r() * 0.02 }); // crackle
      this.e = (e + 1) % 8;
      if (this.e === 0) this.bar = (this.bar + 1) % this.bars.length;
      return e % 2 === 0 ? this.beat * 0.56 : this.beat * 0.44; // lazy swing
    }
  }

  /* Rain — a steady shower: a soft hiss, a low body, and scattered drops. */
  class Rain extends Sequenced {
    constructor(ctx, out) {
      super(ctx, out);
      this.r = rng(7);
      this.trim = 2.6;
      this.beds = [];
    }
    start(fadeSec) {
      super.start(fadeSec);
      this.beds = [
        noiseBed(this.ctx, this.bus, { type: 'bandpass', freq: 2600, q: 0.35, gain: 0.05 }),
        noiseBed(this.ctx, this.bus, { type: 'lowpass', freq: 420, q: 0.5, gain: 0.07 }),
      ];
    }
    step(t) {
      const r = this.r;
      const ctx = this.ctx;
      const f = 1800 + r() * 4200;
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.03);
      const g = ctx.createGain();
      const peak = 0.004 + r() * 0.014;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.002);
      g.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + 0.04);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.05);
      if (r() < 0.3) noiseHit(ctx, this.bus, t, { type: 'highpass', freq: 5000, dur: 0.02, gain: 0.015 });
      return 0.015 + r() * 0.09;
    }
    stop(fadeSec = 2.5) {
      super.stop(fadeSec);
      setTimeout(() => this.beds.forEach((b) => { try { b.src.stop(); } catch (_) {} }), fadeSec * 1000 + 500);
    }
  }

  /* Waves — slow ocean swells breathing in and out, roughly every 8–12 seconds. */
  class Waves {
    constructor(ctx, out) {
      this.ctx = ctx;
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(out);
      this.parts = [];
    }
    start(fadeSec = 3) {
      const ctx = this.ctx;
      const t = ctx.currentTime;
      for (const [rate, freq, depth, gain] of [[0.1, 700, 500, 0.22], [0.071, 380, 220, 0.18], [0.13, 2400, 900, 0.05]]) {
        const bed = noiseBed(ctx, this.bus, { type: 'lowpass', freq, q: 0.4, gain });
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const toFreq = ctx.createGain();
        toFreq.gain.value = depth;
        const toGain = ctx.createGain();
        toGain.gain.value = gain * 0.85;
        lfo.connect(toFreq).connect(bed.filter.frequency);
        lfo.connect(toGain).connect(bed.gain.gain);
        lfo.start(t);
        this.parts.push(bed.src, lfo);
      }
      this.bus.gain.setValueAtTime(SILENT_GAIN, t);
      this.bus.gain.exponentialRampToValueAtTime(1, t + fadeSec);
    }
    stop(fadeSec = 3) {
      const t = this.ctx.currentTime;
      this.bus.gain.cancelScheduledValues(t);
      this.bus.gain.setValueAtTime(Math.max(this.bus.gain.value, SILENT_GAIN), t);
      this.bus.gain.exponentialRampToValueAtTime(SILENT_GAIN, t + fadeSec);
      setTimeout(() => { this.parts.forEach((p) => { try { p.stop(); } catch (_) {} }); this.bus.disconnect(); }, fadeSec * 1000 + 400);
    }
  }

  /* Hearth — a crackling fire over a low, warm hum. */
  class Hearth extends Sequenced {
    constructor(ctx, out) {
      super(ctx, out);
      this.r = rng(1666);
      this.trim = 3.4;
      this.parts = [];
    }
    start(fadeSec) {
      super.start(fadeSec);
      const ctx = this.ctx;
      const rumble = noiseBed(ctx, this.bus, { type: 'lowpass', freq: 260, q: 0.6, gain: 0.16 });
      this.parts.push(rumble.src);
      for (const [m, g] of [[midi('F2'), 0.018], [midi('C3'), 0.012]]) {
        const o = ctx.createOscillator();
        o.frequency.value = mtof(m);
        const gain = ctx.createGain();
        gain.gain.value = g;
        o.connect(gain).connect(this.bus);
        o.start();
        this.parts.push(o);
      }
    }
    step(t) {
      const r = this.r;
      const n = r() < 0.25 ? 3 + Math.floor(r() * 4) : 1; // crackles come in little clusters
      for (let i = 0; i < n; i++) {
        noiseHit(this.ctx, this.bus, t + i * (0.01 + r() * 0.04), {
          type: 'bandpass', freq: 1500 + r() * 5000, q: 1.2, dur: 0.012 + r() * 0.03, gain: 0.03 + r() * 0.09,
        });
      }
      if (r() < 0.06) noiseHit(this.ctx, this.bus, t, { type: 'bandpass', freq: 700, q: 1.5, dur: 0.08, gain: 0.14 }); // a log pops
      return 0.05 + r() * 0.35;
    }
    stop(fadeSec = 2.5) {
      super.stop(fadeSec);
      setTimeout(() => this.parts.forEach((p) => { try { p.stop(); } catch (_) {} }), fadeSec * 1000 + 500);
    }
  }

  const TRACKS = {
    prelude: {
      id: 'prelude', name: 'Prelude', kind: 'Classical',
      credit: 'J. S. Bach, Prelude in C major, BWV 846',
      blurb: 'Even, unbroken arpeggios at 60 bpm. The most predictable music ever written, in the best way.',
      make: (ctx, out) => new Prelude(ctx, out), reverb: 0.32,
    },
    ground: {
      id: 'ground', name: 'Ground', kind: 'Classical, generative',
      credit: "Variations over Pachelbel's ground bass",
      blurb: 'A repeating bass with ever-changing baroque figuration above it. Steady, never quite the same.',
      make: (ctx, out) => new Ground(ctx, out), reverb: 0.34,
    },
    drift: {
      id: 'drift', name: 'Drift', kind: 'Minimal piano',
      credit: "In the spirit of Satie's Gymnopédies",
      blurb: 'Slow, sparse, lots of air. For deep reading and hard problems.',
      make: (ctx, out) => new Drift(ctx, out), reverb: 0.45,
    },
    tide: {
      id: 'tide', name: 'Tide', kind: 'Ambient',
      credit: 'Generative pad',
      blurb: 'No melody, no rhythm, nothing to follow. A warm floor under your thoughts.',
      make: (ctx, out) => new Tide(ctx, out), reverb: 0.4,
    },
    brown: {
      id: 'brown', name: 'Brown noise', kind: 'Noise',
      credit: 'Filtered brown noise',
      blurb: 'A low, steady wash that masks voices and office noise.',
      make: (ctx, out) => new Brown(ctx, out), reverb: 0,
    },
    noir: {
      id: 'noir', name: 'Noir', kind: 'Jazz',
      credit: 'Late-night jazz trio, generative',
      blurb: 'Walking bass, brushes and smoky keys at a slow swing. The band plays the room, never a solo.',
      make: (ctx, out) => new Noir(ctx, out), reverb: 0.3,
    },
    lofi: {
      id: 'lofi', name: 'Lo-fi', kind: 'Beats',
      credit: 'Dusky lo-fi, generative',
      blurb: 'Soft kick and snare, mellow keys, a little vinyl crackle. Steady as a heartbeat.',
      make: (ctx, out) => new LoFi(ctx, out), reverb: 0.22,
    },
    rain: {
      id: 'rain', name: 'Rain', kind: 'Nature',
      credit: 'Synthesized rain',
      blurb: 'A steady shower with scattered drops. Nothing to follow, everything to settle into.',
      make: (ctx, out) => new Rain(ctx, out), reverb: 0.12,
    },
    waves: {
      id: 'waves', name: 'Waves', kind: 'Nature',
      credit: 'Synthesized ocean swells',
      blurb: 'Slow swells breathing in and out. The undercurrent, literally.',
      make: (ctx, out) => new Waves(ctx, out), reverb: 0.15,
    },
    hearth: {
      id: 'hearth', name: 'Hearth', kind: 'Ambient',
      credit: 'Synthesized fire',
      blurb: 'A crackling fire over a low, warm hum.',
      make: (ctx, out) => new Hearth(ctx, out), reverb: 0.1,
    },
  };

  // ---------------------------------------------------------------- engine

  function makeImpulse(ctx, seconds = 3.2, decay = 2.6) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  class FlowAudio {
    constructor({ volume = 0.7, track = 'prelude' } = {}) {
      this.ctx = null;
      this.trackId = TRACKS[track] ? track : 'prelude';
      this.volumeValue = volume;
      this.levelDb = -48;
      this.custom = null; // { el } when playing the user's own audio
      this._suspendTimer = null;
      this._customRamp = null;
    }

    static get tracks() {
      return TRACKS;
    }

    get running() {
      return !!this.ctx && this.ctx.state === 'running';
    }

    _build() {
      const AC = root.AudioContext || root.webkitAudioContext;
      const ctx = (this.ctx = new AC({ latencyHint: 'playback' }));
      this.limiter = ctx.createDynamicsCompressor();
      this.limiter.threshold.value = -10;
      this.limiter.ratio.value = 8;
      this.limiter.attack.value = 0.01;
      this.limiter.release.value = 0.3;
      this.volume = ctx.createGain();
      this.volume.gain.value = this.volumeValue;
      this.level = ctx.createGain();
      this.level.gain.value = dbToGain(this.levelDb);
      this.bus = ctx.createGain();
      this.dry = ctx.createGain();
      this.wet = ctx.createGain();
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = makeImpulse(ctx);
      this.bus.connect(this.dry).connect(this.level);
      this.bus.connect(this.reverb).connect(this.wet).connect(this.level);
      this.level.connect(this.volume).connect(this.limiter).connect(ctx.destination);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.limiter.connect(this.analyser);
    }

    /** Must be called from a user gesture the first time (browser autoplay rules). */
    async unlock() {
      if (!this.ctx) this._build();
      if (this.ctx.state !== 'running') {
        try { await this.ctx.resume(); } catch (_) { /* handled by caller via .running */ }
      }
      if (!this.track && !this.custom) this._startTrack(this.trackId, 0.5);
      return this.running;
    }

    _startTrack(id, fadeSec) {
      const def = TRACKS[id];
      this.trackId = id;
      this.wet.gain.setTargetAtTime(def.reverb, this.ctx.currentTime, 0.5);
      this.dry.gain.setTargetAtTime(1 - def.reverb * 0.5, this.ctx.currentTime, 0.5);
      this.track = def.make(this.ctx, this.bus);
      this.track.start(fadeSec);
    }

    setTrack(id) {
      if (!TRACKS[id]) return;
      this._stopCustom();
      if (!this.ctx) { this.trackId = id; return; }
      if (this.track && this.trackId === id) return;
      if (this.track) this.track.stop(2.5);
      this.track = null;
      this._startTrack(id, 3);
    }

    /** Play the user's own audio (a file or URL) instead of a built-in track. */
    setCustom(src) {
      if (this.track) { this.track.stop(1.5); this.track = null; }
      this._stopCustom();
      const el = new Audio();
      el.src = src;
      el.loop = true;
      el.volume = this.running ? dbToGain(this.levelDb) * this.volumeValue : 0;
      this.custom = { el, src };
      this.trackId = 'custom';
      if (this.levelDb > -40) el.play().catch(() => {});
    }

    _stopCustom() {
      if (!this.custom) return;
      clearInterval(this._customRamp);
      this.custom.el.pause();
      this.custom.el.src = '';
      this.custom = null;
    }

    setVolume(v) {
      this.volumeValue = Math.max(0, Math.min(1, v));
      if (this.ctx) this.volume.gain.setTargetAtTime(this.volumeValue, this.ctx.currentTime, 0.08);
      if (this.custom) this.custom.el.volume = dbToGain(this.levelDb) * this.volumeValue;
    }

    /**
     * Move the flow level to `db` over `rampMs`, linearly in decibels
     * (exponential in amplitude), which is how loudness is perceived.
     */
    async setLevel(db, rampMs, fromDb) {
      this.levelDb = db;
      clearTimeout(this._suspendTimer);
      if (!this.ctx) return;
      const silent = db <= -40;
      if (!silent && this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch (_) {}
      }
      const t = this.ctx.currentTime;
      const g = this.level.gain;
      const start = fromDb != null ? Math.max(dbToGain(fromDb), g.value) : Math.max(g.value, SILENT_GAIN);
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(start, SILENT_GAIN), t);
      g.exponentialRampToValueAtTime(dbToGain(db), t + Math.max(0.05, rampMs / 1000));

      if (this.custom) this._rampCustom(start, dbToGain(db), rampMs);

      if (silent) {
        this._suspendTimer = setTimeout(() => {
          if (this.levelDb <= -40 && this.ctx.state === 'running') this.ctx.suspend();
          if (this.custom && this.levelDb <= -40) this.custom.el.pause();
        }, rampMs + 400);
      }
    }

    _rampCustom(from, to, rampMs) {
      clearInterval(this._customRamp);
      const el = this.custom.el;
      if (to > SILENT_GAIN * 10 && el.paused) el.play().catch(() => {});
      const t0 = performance.now();
      const a = Math.log(Math.max(from, SILENT_GAIN));
      const b = Math.log(Math.max(to, SILENT_GAIN));
      this._customRamp = setInterval(() => {
        const k = Math.min(1, (performance.now() - t0) / Math.max(1, rampMs));
        el.volume = Math.min(1, Math.exp(a + (b - a) * k) * this.volumeValue);
        if (k >= 1) clearInterval(this._customRamp);
      }, 50);
    }

    /** 0..1 loudness of what's playing right now, for visuals. */
    meter() {
      if (!this.analyser || !this.running) return 0;
      const data = new Uint8Array(this.analyser.fftSize);
      this.analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / data.length) * 4);
    }

    currentLevel() {
      return this.ctx ? this.level.gain.value : 0;
    }
  }

  FlowAudio.dbToGain = dbToGain;
  root.FlowAudio = FlowAudio;
})(typeof self !== 'undefined' ? self : this);

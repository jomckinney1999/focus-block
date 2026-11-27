"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import type FlowModelType from "@/lib/engine/flow-model.js";
import type { FlowState, FlowTransition } from "@/lib/engine";

const START = `function enterFlow(task) {
  const music = follow(keyboard);
  return deepWork(task, { music });
}
`;

// Typed by the autoplay demo until you start typing yourself.
const SCRIPT: Array<{ type?: string; wait?: number }> = [
  { type: "\n// watch the music follow the keys\nfor (const task of queue) {\n  focus(task);" },
  { wait: 9000 }, // a thinking pause: it softens
  { type: "\n  ship(task);\n}\n" },
  { wait: 5000 },
  { type: "\n// stepping away now" },
  { wait: 50000 }, // away: it fades out
];

const LABEL: Record<FlowState, string> = { flow: "In flow", soft: "Thinking", resting: "Resting", paused: "Paused" };
const TRACKS = [
  { id: "prelude", name: "Bach" },
  { id: "noir", name: "Noir jazz" },
  { id: "lofi", name: "Lo-fi" },
  { id: "drift", name: "Piano" },
  { id: "rain", name: "Rain" },
  { id: "waves", name: "Waves" },
  { id: "hearth", name: "Fire" },
  { id: "tide", name: "Ambient" },
];

export function LiveDemo() {
  const codeRef = useRef<HTMLTextAreaElement>(null);
  const barsRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<FlowModelType | null>(null);
  const audioRef = useRef<FlowAudio | null>(null);
  const rampRef = useRef({ from: -48, to: -48, t0: 0, dur: 1 });
  const autoplayRef = useRef(true);
  const [state, setState] = useState<FlowState>("resting");
  const [sound, setSound] = useState(false);
  const [track, setTrack] = useState("prelude");
  const [autoplay, setAutoplay] = useState(false);

  const levelAt = (t: number) => {
    const r = rampRef.current;
    const k = Math.min(1, Math.max(0, (t - r.t0) / r.dur));
    return r.from + (r.to - r.from) * k;
  };

  const apply = useCallback((tr: FlowTransition | null) => {
    if (!tr) return;
    const now = performance.now();
    const cur = levelAt(now);
    rampRef.current = { from: tr.fromDb != null ? Math.max(tr.fromDb, cur) : cur, to: tr.db, t0: now, dur: Math.max(50, tr.rampMs) };
    audioRef.current?.setLevel(tr.db, tr.rampMs, tr.fromDb);
    setState(tr.state);
  }, []);

  const edit = useCallback(() => {
    if (modelRef.current) apply(modelRef.current.edit(Date.now()));
  }, [apply]);

  const soundOn = useCallback(async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.running) await a.unlock();
    a.setVolume(0.6);
    setSound(true);
  }, []);

  // Load the shared engine in the browser, then tick the model.
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    let cancelled = false;
    (async () => {
      const { default: FlowModel } = await import("@/lib/engine/flow-model.js");
      await import("@/lib/engine/audio-engine.js");
      if (cancelled) return;
      // Demo timing runs 10× faster than the real extension.
      modelRef.current = new FlowModel({ adaptive: false, graceMs: 6000, softRampMs: 4500, restAfterMs: 30000, restRampMs: 12000 });
      audioRef.current = new window.FlowAudio({ volume: 0.6, track: "prelude" });
      timer = setInterval(() => apply(modelRef.current!.tick(Date.now())), 250);
    })();
    return () => { cancelled = true; clearInterval(timer); };
  }, [apply]);

  // Autoplay: types, pauses and steps away on its own until you take over.
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let alive = true;
    (async () => {
      await sleep(1500);
      if (!autoplayRef.current) return;
      setAutoplay(true);
      while (alive && autoplayRef.current) {
        for (const step of SCRIPT) {
          if (!alive || !autoplayRef.current) return;
          if (step.type) {
            for (const ch of step.type) {
              if (!alive || !autoplayRef.current) return;
              const el = codeRef.current;
              if (!el) return;
              el.value += ch;
              el.scrollTop = el.scrollHeight;
              if (ch.trim()) edit();
              await sleep(ch === "\n" ? 240 : 45 + Math.random() * 90);
            }
          } else {
            const until = performance.now() + (step.wait ?? 0);
            while (alive && autoplayRef.current && performance.now() < until) await sleep(300);
          }
        }
        if (codeRef.current) codeRef.current.value = START;
      }
    })();
    return () => { alive = false; };
  }, [edit]);

  // Level bars follow the music.
  useEffect(() => {
    let raf = 0;
    const draw = (t: number) => {
      const bars = barsRef.current;
      if (bars) {
        const level = Math.max(0, (levelAt(performance.now()) + 48) / 48);
        Array.from(bars.children).forEach((b, i) => {
          const wave = 0.55 + 0.45 * Math.sin(t / 380 + i * 0.7) * Math.sin(t / 910 + i * 1.3);
          (b as HTMLElement).style.height = `${8 + level * wave * 88}%`;
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const takeOver = () => {
    if (!autoplayRef.current) return;
    autoplayRef.current = false;
    setAutoplay(false);
  };

  const tone = state === "flow" ? "text-warm border-warm/60" : state === "soft" ? "text-soft border-soft/60" : "text-mist border-line";

  return (
    <div className="glass mx-auto w-full max-w-3xl overflow-hidden rounded-3xl">
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3 font-mono text-xs text-mist">
        <span className="flex gap-1.5" aria-hidden><i className="size-2.5 rounded-full bg-white/15" /><i className="size-2.5 rounded-full bg-white/15" /><i className="size-2.5 rounded-full bg-white/15" /></span>
        <span className="flex-1">flow.ts</span>
        {autoplay && <span className="hidden rounded-full bg-warm/10 px-2.5 py-1 text-warm sm:inline">Autoplay · type to take over</span>}
        <span className={cn("rounded-full border px-2.5 py-1 uppercase tracking-wider transition-colors duration-700", tone)} aria-live="polite">{LABEL[state]}</span>
      </div>

      <label htmlFor="demo-code" className="sr-only">Type here to hear the music respond</label>
      <textarea
        id="demo-code"
        ref={codeRef}
        defaultValue={START}
        spellCheck={false}
        wrap="off"
        autoCapitalize="off"
        autoComplete="off"
        onPointerDown={() => { takeOver(); soundOn(); }}
        onKeyDown={(e) => { if (e.nativeEvent.isTrusted) { takeOver(); soundOn(); } }}
        onInput={edit}
        className="block h-56 w-full resize-none bg-transparent px-5 py-4 font-mono text-sm leading-relaxed text-fog outline-none sm:h-64"
      />

      <div className="flex items-end gap-4 border-t border-white/10 px-5 py-4">
        <div ref={barsRef} className="flex h-10 flex-1 items-end gap-1" aria-hidden>
          {Array.from({ length: 32 }, (_, i) => (
            <span key={i} className={cn("w-full rounded-full transition-colors duration-700", state === "soft" ? "bg-soft/70" : "bg-warm/80")} style={{ height: "8%" }} />
          ))}
        </div>
        <button
          type="button"
          onClick={() => (sound ? (audioRef.current?.setVolume(0), setSound(false)) : soundOn())}
          aria-pressed={sound}
          className={cn("glass flex items-center gap-2 rounded-full px-4 py-2 text-sm", sound ? "text-warm" : "text-fog")}
        >
          {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          {sound ? "Sound on" : "Sound off"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-white/10 px-5 py-3">
        {TRACKS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={async () => { setTrack(t.id); audioRef.current?.setTrack(t.id); await soundOn(); if (modelRef.current) apply(modelRef.current.play(Date.now())); }}
            className={cn("rounded-full border px-3 py-1 text-xs transition-colors", track === t.id ? "border-warm bg-warm/15 text-warm" : "border-white/15 text-mist hover:text-fog")}
          >
            {t.name}
          </button>
        ))}
        <span className="ml-auto self-center font-mono text-[11px] text-mist/70">demo runs 10× faster</span>
      </div>
    </div>
  );
}

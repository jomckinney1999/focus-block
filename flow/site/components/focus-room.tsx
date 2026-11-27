"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Pause, Play, RotateCcw, Settings2, Maximize2, Minimize2, Volume2, VolumeX,
  Waves, Moon, Sunset, CloudRain, Flame, Sparkles, type LucideIcon,
} from "lucide-react";
import { SceneCanvas } from "@/components/scene-canvas";
import { SCENES, type SceneId } from "@/lib/scenes";
import { cn } from "@/lib/utils";

type Phase = "focus" | "short" | "long";
type Settings = { focus: number; short: number; long: number; every: number; autoNext: boolean; volume: number };

const DEFAULTS: Settings = { focus: 25, short: 5, long: 15, every: 4, autoNext: true, volume: 0.6 };
const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short: "Short break", long: "Long break" };
const ICONS: Record<SceneId, LucideIcon> = { deep: Sparkles, noir: Moon, dusk: Sunset, rain: CloudRain, ocean: Waves, fire: Flame };
const TRACKS = [
  ["prelude", "Bach"], ["ground", "Baroque"], ["noir", "Noir jazz"], ["lofi", "Lo-fi"], ["drift", "Piano"],
  ["tide", "Ambient"], ["rain", "Rain"], ["waves", "Waves"], ["hearth", "Fire"], ["brown", "Brown noise"],
] as const;
const STORE = "undercurrent.focus";

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || "{}") };
  } catch {
    return DEFAULTS;
  }
}
function save(s: Settings) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* private mode: settings just won't persist */ }
}
const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** A soft two-note bell for phase changes, in the tracks' key. */
function chime(ctx: AudioContext | null, up: boolean) {
  if (!ctx || ctx.state !== "running") return;
  const notes = up ? [74, 81] : [81, 74];
  notes.forEach((m, i) => {
    const t = ctx.currentTime + i * 0.22;
    for (const [mult, g] of [[1, 0.06], [2.76, 0.012]] as const) {
      const o = ctx.createOscillator();
      const gain = ctx.createGain();
      o.frequency.value = 440 * Math.pow(2, (m - 69) / 12) * mult;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(g, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
      o.connect(gain).connect(ctx.destination);
      o.start(t);
      o.stop(t + 2.5);
    }
  });
}

export function FocusRoom() {
  const [scene, setScene] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(DEFAULTS.focus * 60_000);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0); // focus sessions completed
  const [track, setTrack] = useState<string>("prelude");
  const [muted, setMuted] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [full, setFull] = useState(false);
  const audioRef = useRef<FlowAudio | null>(null);
  const endRef = useRef(0);

  // Settings live in this browser only.
  useEffect(() => {
    const s = load();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once after mount
    setSettings(s);
    setRemaining(s.focus * 60_000);
  }, []);

  const level = useCallback((p: Phase, isRunning: boolean, ramp = 3000) => {
    const a = audioRef.current;
    if (!a) return;
    // Music plays in focus, softens in breaks (like a thinking pause), rests when paused.
    a.setLevel(!isRunning ? -48 : p === "focus" ? 0 : -10, ramp);
  }, []);

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      await import("@/lib/engine/audio-engine.js");
      audioRef.current = new window.FlowAudio({ volume: settings.volume, track });
    }
    await audioRef.current.unlock();
    audioRef.current.setVolume(muted ? 0 : settings.volume);
  }, [settings.volume, track, muted]);

  const durationOf = useCallback((p: Phase) => settings[p] * 60_000, [settings]);

  const goTo = useCallback((p: Phase, autoStart: boolean) => {
    setPhase(p);
    setRemaining(durationOf(p));
    setRunning(autoStart);
    if (autoStart) endRef.current = Date.now() + durationOf(p);
    level(p, autoStart);
  }, [durationOf, level]);

  // The clock: counts down to a fixed end time, so it stays right even if the tab sleeps.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = endRef.current - Date.now();
      if (left > 0) {
        setRemaining(left);
        return;
      }
      clearInterval(id);
      const ctx = audioRef.current?.ctx ?? null;
      if (phase === "focus") {
        const n = done + 1;
        setDone(n);
        chime(ctx, false);
        goTo(n % settings.every === 0 ? "long" : "short", settings.autoNext);
      } else {
        chime(ctx, true);
        goTo("focus", settings.autoNext);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running, phase, done, settings, goTo]);

  // Tab title shows the clock.
  useEffect(() => {
    document.title = scene === null ? "Focus room · Undercurrent" : `${fmt(remaining)} · ${PHASE_LABEL[phase]}`;
  }, [remaining, phase, scene]);

  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const start = async () => {
    await ensureAudio();
    endRef.current = Date.now() + remaining;
    setRunning(true);
    level(phase, true, 4000);
  };
  const pause = () => {
    setRunning(false);
    level(phase, false, 1500);
  };
  const reset = () => {
    setRunning(false);
    setRemaining(durationOf(phase));
    level(phase, false, 1500);
  };
  const enter = (i: number) => {
    setScene(i);
    const t = SCENES[i].track;
    setTrack(t);
    audioRef.current?.setTrack(t);
  };
  const leave = () => {
    pause();
    setScene(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const pickTrack = async (id: string) => {
    setTrack(id);
    if (audioRef.current) audioRef.current.setTrack(id);
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    audioRef.current?.setVolume(m ? 0 : settings.volume);
  };
  const update = (patch: Partial<Settings>) => {
    const s = { ...settings, ...patch };
    setSettings(s);
    save(s);
    if (!running && (patch.focus || patch.short || patch.long)) setRemaining(s[phase] * 60_000);
    if (patch.volume !== undefined && !muted) audioRef.current?.setVolume(patch.volume);
  };
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  // ------------------------------------------------------------------ mood grid
  if (scene === null) {
    return (
      <main className="min-h-dvh bg-ink px-4 py-6 sm:px-8">
        <header className="mx-auto mb-6 flex max-w-6xl items-center justify-between">
          <Link href="/" className="font-display text-lg font-semibold text-fog">Undercurrent</Link>
          <span className="font-mono text-xs uppercase tracking-[0.25em] text-sea">Focus room</span>
        </header>
        <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SCENES.map((s, i) => {
            const Icon = ICONS[s.id];
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => enter(i)}
                className="group relative aspect-[3/2] overflow-hidden rounded-2xl text-left ring-1 ring-white/10 transition hover:ring-white/30 focus-visible:ring-warm"
              >
                <Image src={`/scenes/${s.id}.jpg`} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <Icon className="absolute left-5 top-5 size-6 text-white/90" aria-hidden />
                <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-semibold text-white">{s.name}</p>
                    <p className="text-sm text-white/70">{s.line}</p>
                  </div>
                  <span className="glass flex size-10 shrink-0 items-center justify-center rounded-full opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    <Play className="size-4 text-white" aria-hidden />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-center text-sm text-mist">Pick a mood. Press start. The music follows the timer: full while you focus, softer on breaks.</p>
      </main>
    );
  }

  // ------------------------------------------------------------------ session
  const s = SCENES[scene];
  const total = durationOf(phase);
  const progress = 1 - remaining / total;

  return (
    <main className="relative h-dvh overflow-hidden bg-ink text-fog">
      <SceneCanvas scene={scene} className="absolute inset-0" />
      <div className="absolute inset-0 bg-black/20" aria-hidden />

      <header className="absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-6">
        <button type="button" onClick={leave} className="glass flex items-center gap-2 rounded-full px-4 py-2 text-sm">
          <ArrowLeft className="size-4" /> Moods
        </button>
        <p className="hidden font-display text-lg font-semibold text-white/90 sm:block">{s.name}</p>
        <button type="button" onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"} className="glass flex size-10 items-center justify-center rounded-full">
          {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
      </header>

      <section className="absolute inset-0 flex flex-col items-center justify-center gap-6 px-4">
        <div className="glass flex rounded-full p-1 text-sm" role="tablist" aria-label="Timer mode">
          {(["focus", "short", "long"] as Phase[]).map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={phase === p}
              onClick={() => goTo(p, false)}
              className={cn("rounded-full px-4 py-1.5 transition", phase === p ? "bg-white text-ink" : "text-white/80 hover:text-white")}
            >
              {PHASE_LABEL[p]}
            </button>
          ))}
        </div>

        <p className="font-display text-[clamp(5rem,18vw,11rem)] font-bold leading-none tracking-tight text-white tabular-nums [text-shadow:0_4px_40px_rgba(0,0,0,0.35)]" aria-live="off">
          {fmt(remaining)}
        </p>

        <div className="h-1 w-56 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div className="h-full rounded-full bg-warm transition-[width] duration-300" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={running ? pause : start}
            className="flex min-w-36 items-center justify-center gap-2 rounded-full bg-white px-8 py-3 font-medium text-ink transition hover:brightness-95"
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {running ? "Pause" : "Start"}
          </button>
          <button type="button" onClick={reset} aria-label="Reset timer" className="glass flex size-12 items-center justify-center rounded-full">
            <RotateCcw className="size-4" />
          </button>
          <button type="button" onClick={() => setShowSettings((v) => !v)} aria-label="Timer settings" aria-expanded={showSettings} className="glass flex size-12 items-center justify-center rounded-full">
            <Settings2 className="size-4" />
          </button>
        </div>

        <div className="flex gap-2" aria-label={`${done % settings.every} of ${settings.every} sessions before a long break`}>
          {Array.from({ length: settings.every }, (_, i) => (
            <span key={i} className={cn("size-2 rounded-full", i < done % settings.every ? "bg-warm" : "bg-white/25")} />
          ))}
        </div>

        {showSettings && (
          <div className="glass grid w-full max-w-sm gap-4 rounded-2xl p-5 text-sm">
            {([["focus", "Focus", [25, 50, 90]], ["short", "Short break", [5, 10]], ["long", "Long break", [15, 20, 30]]] as const).map(([key, label, opts]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-white/80">{label}</span>
                <div className="flex gap-1">
                  {opts.map((m) => (
                    <button key={m} type="button" onClick={() => update({ [key]: m } as Partial<Settings>)}
                      className={cn("rounded-full px-3 py-1", settings[key] === m ? "bg-white text-ink" : "bg-white/10 text-white/80 hover:bg-white/20")}>
                      {m}m
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label className="flex items-center justify-between gap-3 text-white/80">
              Start the next session automatically
              <input type="checkbox" checked={settings.autoNext} onChange={(e) => update({ autoNext: e.target.checked })} className="size-4 accent-[#e2b46a]" />
            </label>
          </div>
        )}
      </section>

      <footer className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-center gap-3 p-4 sm:justify-between sm:p-6">
        <div className="glass flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 text-xs">
          {TRACKS.map(([id, name]) => (
            <button key={id} type="button" onClick={() => pickTrack(id)}
              className={cn("shrink-0 rounded-full px-3 py-1.5 transition", track === id ? "bg-white text-ink" : "text-white/80 hover:text-white")}>
              {name}
            </button>
          ))}
        </div>
        <div className="glass flex items-center gap-3 rounded-full px-4 py-2">
          <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
          <label htmlFor="focus-volume" className="sr-only">Volume</label>
          <input id="focus-volume" type="range" min={0} max={1} step={0.01} value={settings.volume}
            onChange={(e) => update({ volume: Number(e.target.value) })} className="w-28 accent-[#e2b46a]" />
        </div>
      </footer>
    </main>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft, Pause, Play, RotateCcw, Settings2, Maximize2, Minimize2, Volume2, VolumeX,
  Waves, Moon, Sunset, CloudRain, Flame, Sparkles, ImagePlus, Link2, X, Music2, type LucideIcon,
} from "lucide-react";
import { SceneCanvas } from "@/components/scene-canvas";
import { SCENES, type SceneId } from "@/lib/scenes";
import { toSpotifyUri, loadSpotifyApi, type SpotifyController } from "@/lib/spotify";
import { saveBackgroundFile, loadBackgroundFile, clearBackgroundFile } from "@/lib/bg-store";
import { cn } from "@/lib/utils";

type Phase = "focus" | "short" | "long";
type Source = "undercurrent" | "spotify";
type Bg = { kind: "scene" } | { kind: "image" | "video"; url: string; fromFile: boolean };
type Settings = {
  focus: number; short: number; long: number; every: number; autoNext: boolean; volume: number;
  source: Source; spotify: string; pauseSpotifyOnBreak: boolean; bgUrl: string;
};

const DEFAULTS: Settings = {
  focus: 25, short: 5, long: 15, every: 4, autoNext: true, volume: 0.6,
  source: "undercurrent", spotify: "", pauseSpotifyOnBreak: true, bgUrl: "",
};
const PHASE_LABEL: Record<Phase, string> = { focus: "Focus", short: "Short break", long: "Long break" };
const ICONS: Record<SceneId, LucideIcon> = { deep: Sparkles, noir: Moon, dusk: Sunset, rain: CloudRain, ocean: Waves, fire: Flame };
const TRACKS = [
  ["prelude", "Bach"], ["ground", "Baroque"], ["noir", "Noir jazz"], ["lofi", "Lo-fi"], ["drift", "Piano"],
  ["tide", "Ambient"], ["rain", "Rain"], ["waves", "Waves"], ["hearth", "Fire"], ["brown", "Brown noise"],
] as const;
const STORE = "undercurrent.focus";
const isVideo = (s: string) => /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(s);

function load(): Settings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE) || "{}") }; } catch { return DEFAULTS; }
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
  (up ? [74, 81] : [81, 74]).forEach((m, i) => {
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

/** A label that appears under an icon button on hover or keyboard focus. */
function Tip({ label, children, side = "bottom" }: { label: string; children: ReactNode; side?: "bottom" | "top" }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-lg bg-black/80 px-2.5 py-1 text-xs text-white opacity-0 shadow-lg backdrop-blur transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "bottom" ? "top-full mt-2" : "bottom-full mb-2",
        )}
      >
        {label}
      </span>
    </span>
  );
}

const iconBtn = "glass flex size-11 items-center justify-center rounded-full text-white hover:bg-white/15";

export function FocusRoom() {
  const [scene, setScene] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [phase, setPhase] = useState<Phase>("focus");
  const [remaining, setRemaining] = useState(DEFAULTS.focus * 60_000);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [track, setTrack] = useState<string>("prelude");
  const [muted, setMuted] = useState(false);
  const [panel, setPanel] = useState<null | "settings" | "background">(null);
  const [full, setFull] = useState(false);
  const [bg, setBg] = useState<Bg>({ kind: "scene" });
  const [spotifyInput, setSpotifyInput] = useState("");
  const [spotifyError, setSpotifyError] = useState("");
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [bgUrlInput, setBgUrlInput] = useState("");
  const [bgError, setBgError] = useState("");
  const audioRef = useRef<FlowAudio | null>(null);
  const spotifyRef = useRef<SpotifyController | null>(null);
  const spotifyEl = useRef<HTMLDivElement>(null);
  const spotifyStarted = useRef(false);
  const endRef = useRef(0);

  // Settings and a saved background live in this browser only.
  useEffect(() => {
    const s = load();
    /* eslint-disable react-hooks/set-state-in-effect -- reads browser storage once after mount */
    setSettings(s);
    setRemaining(s.focus * 60_000);
    setSpotifyInput(s.spotify);
    /* eslint-enable react-hooks/set-state-in-effect */
    if (s.bgUrl) setBg({ kind: isVideo(s.bgUrl) ? "video" : "image", url: s.bgUrl, fromFile: false });
    else loadBackgroundFile().then((file) => {
      if (file) setBg({ kind: file.type.startsWith("video") ? "video" : "image", url: URL.createObjectURL(file), fromFile: true });
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const s = { ...prev, ...patch };
      save(s);
      return s;
    });
  }, []);

  // ------------------------------------------------------------------ music

  const level = useCallback((p: Phase, isRunning: boolean, ramp = 3000) => {
    const a = audioRef.current;
    if (!a) return;
    // Undercurrent's own music: full in focus, softer on breaks, resting when paused. Silent if Spotify is the source.
    const on = settings.source === "undercurrent" && isRunning;
    a.setLevel(!on ? -48 : p === "focus" ? 0 : -10, ramp);
  }, [settings.source]);

  const spotifyFollow = useCallback((p: Phase, isRunning: boolean) => {
    const c = spotifyRef.current;
    if (!c || settings.source !== "spotify") return;
    const shouldPlay = isRunning && (p === "focus" || !settings.pauseSpotifyOnBreak);
    if (shouldPlay) {
      if (spotifyStarted.current) c.resume();
      else { c.play(); spotifyStarted.current = true; }
    } else c.pause();
  }, [settings.source, settings.pauseSpotifyOnBreak]);

  const ensureAudio = useCallback(async () => {
    if (!audioRef.current) {
      await import("@/lib/engine/audio-engine.js");
      audioRef.current = new window.FlowAudio({ volume: settings.volume, track });
    }
    await audioRef.current.unlock();
    audioRef.current.setVolume(muted ? 0 : settings.volume);
  }, [settings.volume, track, muted]);

  // Mount the Spotify player whenever Spotify is the source and a link is set.
  useEffect(() => {
    const uri = toSpotifyUri(settings.spotify);
    if (scene === null || settings.source !== "spotify" || !uri || !spotifyEl.current) return;
    let cancelled = false;
    if (spotifyRef.current) {
      spotifyRef.current.loadUri(uri);
      spotifyStarted.current = false;
      return;
    }
    const host = document.createElement("div");
    spotifyEl.current.appendChild(host);
    // If the player hasn't appeared after 10 s (offline, or blocked by an extension), say so.
    const slow = setTimeout(() => {
      if (!spotifyRef.current) setSpotifyError("Spotify didn't load. Check your connection, or allow open.spotify.com if an ad blocker is on.");
    }, 10_000);
    loadSpotifyApi()
      .then((api) => {
        if (cancelled) return;
        api.createController(host, { uri, width: "100%", height: 152 }, (c) => {
          spotifyRef.current = c;
          setSpotifyReady(true);
          setSpotifyError("");
        });
      })
      .catch(() => setSpotifyError("Couldn't reach Spotify. Check your connection and try again."));
    return () => { cancelled = true; clearTimeout(slow); };
  }, [scene, settings.source, settings.spotify]);

  // Leaving the room or switching source tears the player down.
  useEffect(() => {
    if (scene !== null && settings.source === "spotify") return;
    spotifyRef.current?.destroy();
    spotifyRef.current = null;
    spotifyStarted.current = false;
    if (spotifyEl.current) spotifyEl.current.innerHTML = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the player's status when it's torn down
    setSpotifyReady(false);
  }, [scene, settings.source]);

  // ------------------------------------------------------------------ timer

  const durationOf = useCallback((p: Phase) => settings[p] * 60_000, [settings]);

  const goTo = useCallback((p: Phase, autoStart: boolean) => {
    setPhase(p);
    setRemaining(durationOf(p));
    setRunning(autoStart);
    if (autoStart) endRef.current = Date.now() + durationOf(p);
    level(p, autoStart);
    spotifyFollow(p, autoStart);
  }, [durationOf, level, spotifyFollow]);

  // Counts down to a fixed end time, so it stays right even if the tab sleeps.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      const left = endRef.current - Date.now();
      if (left > 0) { setRemaining(left); return; }
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
  }, [running, phase, done, settings.every, settings.autoNext, goTo]);

  useEffect(() => {
    document.title = scene === null ? "Focus room · Undercurrent" : `${fmt(remaining)} · ${PHASE_LABEL[phase]}`;
  }, [remaining, phase, scene]);

  const start = async () => {
    await ensureAudio();
    endRef.current = Date.now() + remaining;
    setRunning(true);
    level(phase, true, 4000);
    spotifyFollow(phase, true);
  };
  const pause = useCallback(() => {
    setRunning(false);
    level(phase, false, 1500);
    spotifyFollow(phase, false);
  }, [phase, level, spotifyFollow]);
  const reset = () => {
    pause();
    setRemaining(durationOf(phase));
  };

  // ------------------------------------------------------------------ navigation (URL is the source of truth)

  const closeSession = useCallback(() => {
    pause();
    setScene(null);
    setPanel(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, [pause]);
  const closeRef = useRef(closeSession);
  useEffect(() => { closeRef.current = closeSession; }, [closeSession]);

  const openMood = useCallback((i: number) => {
    setScene(i);
    setTrack(SCENES[i].track);
    audioRef.current?.setTrack(SCENES[i].track);
  }, []);

  const enter = (i: number) => {
    window.history.pushState({ mood: SCENES[i].id }, "", `?mood=${SCENES[i].id}`);
    openMood(i);
  };
  const leave = useCallback(() => {
    if (window.history.state?.mood) window.history.back(); // keeps the Back button and this button in agreement
    else {
      window.history.replaceState(null, "", window.location.pathname);
      closeRef.current();
    }
  }, []);

  // Open the mood in the URL once on load, then follow Back/Forward.
  useEffect(() => {
    const fromUrl = () => {
      const i = SCENES.findIndex((sc) => sc.id === new URLSearchParams(window.location.search).get("mood"));
      return i >= 0 ? i : null;
    };
    const first = fromUrl();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opens a mood linked in the URL, once after mount
    if (first !== null) openMood(first);
    const onPop = () => {
      const i = fromUrl();
      if (i === null) closeRef.current();
      else openMood(i);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [openMood]);

  // Esc closes an open panel, otherwise leaves the session.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.fullscreenElement) return;
      if (panel) setPanel(null);
      else if (new URLSearchParams(window.location.search).get("mood")) leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave, panel]);

  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ------------------------------------------------------------------ controls

  const pickTrack = (id: string) => {
    setTrack(id);
    audioRef.current?.setTrack(id);
  };
  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    audioRef.current?.setVolume(m ? 0 : settings.volume);
  };
  const setSource = (source: Source) => {
    update({ source });
    // Swap immediately if a session is running.
    const a = audioRef.current;
    if (a) a.setLevel(source === "undercurrent" && running ? (phase === "focus" ? 0 : -10) : -48, 1500);
  };
  const connectSpotify = () => {
    const uri = toSpotifyUri(spotifyInput);
    if (!uri) {
      setSpotifyError("Paste a Spotify playlist, album or track link, like open.spotify.com/playlist/…");
      return;
    }
    setSpotifyError("");
    update({ spotify: spotifyInput.trim(), source: "spotify" });
  };
  const chooseBgFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) { setBgError("Choose an image or a video file."); return; }
    setBgError("");
    if (bg.kind !== "scene" && bg.fromFile) URL.revokeObjectURL(bg.url);
    await saveBackgroundFile(file);
    update({ bgUrl: "" });
    setBg({ kind: file.type.startsWith("video") ? "video" : "image", url: URL.createObjectURL(file), fromFile: true });
  };
  const chooseBgUrl = () => {
    const url = bgUrlInput.trim();
    if (!/^https:\/\//i.test(url)) { setBgError("Use an https:// link to an image or video file."); return; }
    setBgError("");
    clearBackgroundFile();
    update({ bgUrl: url });
    setBg({ kind: isVideo(url) ? "video" : "image", url, fromFile: false });
  };
  const useScene = () => {
    if (bg.kind !== "scene" && bg.fromFile) URL.revokeObjectURL(bg.url);
    clearBackgroundFile();
    update({ bgUrl: "" });
    setBg({ kind: "scene" });
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
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-fog hover:text-white">
            <ArrowLeft className="size-4" /> Undercurrent
          </Link>
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
                className="group relative aspect-[3/2] overflow-hidden rounded-2xl text-left ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-black/50 hover:ring-white/40"
              >
                <Image src={`/scenes/${s.id}.jpg`} alt="" fill sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <Icon className="absolute left-5 top-5 size-6 text-white/90" aria-hidden />
                <div className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-xl font-semibold text-white">{s.name}</p>
                    <p className="text-sm text-white/70">{s.line}</p>
                  </div>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-ink opacity-80 shadow-lg transition group-hover:scale-110 group-hover:opacity-100">
                    <Play className="size-4 fill-current" aria-hidden />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="mx-auto mt-8 max-w-6xl text-center text-sm text-mist">
          Pick a mood. Press start. Bring your own Spotify or background inside.
        </p>
      </main>
    );
  }

  // ------------------------------------------------------------------ session
  const s = SCENES[scene];
  const progress = 1 - remaining / durationOf(phase);

  return (
    <main className="relative h-dvh overflow-hidden bg-ink text-fog">
      {bg.kind === "scene" && <SceneCanvas scene={scene} className="absolute inset-0" />}
      {bg.kind === "image" && (
        // eslint-disable-next-line @next/next/no-img-element -- user-supplied file or URL, not in next.config remotePatterns
        <img src={bg.url} alt="" className="absolute inset-0 h-full w-full object-cover" onError={() => setBgError("That background couldn't be loaded.")} />
      )}
      {bg.kind === "video" && (
        <video src={bg.url} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" onError={() => setBgError("That background couldn't be loaded.")} />
      )}
      <div className="absolute inset-0 bg-black/25" aria-hidden />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 p-4 sm:p-6">
        <button type="button" onClick={leave} className="glass flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-white hover:bg-white/15">
          <ArrowLeft className="size-4" /> Moods
        </button>
        <p className="hidden font-display text-lg font-semibold text-white/90 sm:block">{bg.kind === "scene" ? s.name : "Your background"}</p>
        <div className="flex gap-2">
          <Tip label="Change background">
            <button type="button" onClick={() => setPanel(panel === "background" ? null : "background")} aria-label="Change background" aria-expanded={panel === "background"} className={iconBtn}>
              <ImagePlus className="size-4" />
            </button>
          </Tip>
          <Tip label={full ? "Exit full screen" : "Full screen"}>
            <button type="button" onClick={toggleFull} aria-label={full ? "Exit full screen" : "Full screen"} className={iconBtn}>
              {full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
          </Tip>
        </div>
      </header>

      <section className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 px-4 pb-24 [&>*]:pointer-events-auto">
        <div className="glass flex rounded-full p-1 text-sm" role="tablist" aria-label="Timer mode">
          {(["focus", "short", "long"] as Phase[]).map((p) => (
            <button key={p} type="button" role="tab" aria-selected={phase === p} onClick={() => goTo(p, false)}
              className={cn("rounded-full px-4 py-1.5", phase === p ? "bg-white text-ink" : "text-white/80 hover:bg-white/10 hover:text-white")}>
              {PHASE_LABEL[p]}
            </button>
          ))}
        </div>

        <p className="font-display text-[clamp(5rem,18vw,11rem)] font-bold leading-none tracking-tight text-white tabular-nums [text-shadow:0_4px_40px_rgba(0,0,0,0.35)]">
          {fmt(remaining)}
        </p>

        <div className="h-1 w-56 overflow-hidden rounded-full bg-white/15" aria-hidden>
          <div className="h-full rounded-full bg-warm transition-[width] duration-300" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={running ? pause : start}
            className="flex min-w-36 items-center justify-center gap-2 rounded-full bg-white px-8 py-3 font-medium text-ink shadow-lg shadow-black/30 hover:bg-fog">
            {running ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
            {running ? "Pause" : "Start"}
          </button>
          <Tip label="Reset timer">
            <button type="button" onClick={reset} aria-label="Reset timer" className={iconBtn}><RotateCcw className="size-4" /></button>
          </Tip>
          <Tip label="Timer settings">
            <button type="button" onClick={() => setPanel(panel === "settings" ? null : "settings")} aria-label="Timer settings" aria-expanded={panel === "settings"} className={iconBtn}>
              <Settings2 className="size-4" />
            </button>
          </Tip>
        </div>

        <div className="flex gap-2" aria-label={`${done % settings.every} of ${settings.every} sessions before a long break`}>
          {Array.from({ length: settings.every }, (_, i) => (
            <span key={i} className={cn("size-2 rounded-full", i < done % settings.every ? "bg-warm" : "bg-white/25")} />
          ))}
        </div>

        {panel === "settings" && (
          <div className="glass grid w-full max-w-sm gap-4 rounded-2xl p-5 text-sm text-white">
            {([["focus", "Focus", [25, 50, 90]], ["short", "Short break", [5, 10]], ["long", "Long break", [15, 20, 30]]] as const).map(([key, label, opts]) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-white/80">{label}</span>
                <div className="flex gap-1">
                  {opts.map((m) => (
                    <button key={m} type="button" onClick={() => { update({ [key]: m } as Partial<Settings>); if (!running && phase === key) setRemaining(m * 60_000); }}
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

        {panel === "background" && (
          <div className="glass grid w-full max-w-sm gap-4 rounded-2xl p-5 text-sm text-white">
            <div className="flex items-center justify-between">
              <span className="font-medium">Background</span>
              <button type="button" onClick={() => setPanel(null)} aria-label="Close" className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"><X className="size-4" /></button>
            </div>
            <label htmlFor="bg-file" className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 font-medium text-ink hover:bg-fog">
              <ImagePlus className="size-4" /> Upload an image or video
            </label>
            <input id="bg-file" type="file" accept="image/*,video/*" className="sr-only" onChange={(e) => chooseBgFile(e.target.files?.[0])} />
            <div className="flex gap-2">
              <label htmlFor="bg-url" className="sr-only">Image or video link</label>
              <input id="bg-url" value={bgUrlInput} onChange={(e) => setBgUrlInput(e.target.value)} placeholder="…or paste an https:// link"
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none" />
              <button type="button" onClick={chooseBgUrl} className="rounded-xl bg-white/15 px-3 py-2 hover:bg-white/25" aria-label="Use this link"><Link2 className="size-4" /></button>
            </div>
            {bgError && <p className="text-xs text-red-300">{bgError}</p>}
            {bg.kind !== "scene" && (
              <button type="button" onClick={useScene} className="rounded-xl border border-white/15 px-4 py-2 text-white/85 hover:bg-white/10">
                Back to the {s.name} scene
              </button>
            )}
            <p className="text-xs text-white/50">Uploads stay on this device. Nothing is sent anywhere.</p>
          </div>
        )}
      </section>

      <footer className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 p-4 sm:p-6">
        {settings.source === "spotify" && (
          <div className="w-full max-w-sm">
            <div ref={spotifyEl} className="overflow-hidden rounded-xl [&_iframe]:block [&_iframe]:rounded-xl" />
            {toSpotifyUri(settings.spotify) && !spotifyReady && (
              <div className="glass rounded-2xl px-4 py-3 text-sm text-white/85">
                {spotifyError ? <span className="text-red-200">{spotifyError}</span> : "Loading Spotify…"}
              </div>
            )}
            {!toSpotifyUri(settings.spotify) && (
              <div className="glass grid gap-2 rounded-2xl p-3 text-sm text-white">
                <label htmlFor="spotify-link" className="text-white/80">Paste a Spotify playlist, album or track link</label>
                <div className="flex gap-2">
                  <input id="spotify-link" value={spotifyInput} onChange={(e) => setSpotifyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connectSpotify()}
                    placeholder="https://open.spotify.com/playlist/…"
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/30 px-3 py-2 text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none" />
                  <button type="button" onClick={connectSpotify} className="rounded-xl bg-[#1ed760] px-3 py-2 font-medium text-black hover:brightness-110">Connect</button>
                </div>
                {spotifyError && <p className="text-xs text-red-300">{spotifyError}</p>}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-center gap-3 sm:justify-between">
          <div className="flex max-w-full flex-wrap items-center justify-center gap-2">
            <div className="glass flex rounded-full p-1 text-xs" role="tablist" aria-label="Music source">
              <button type="button" role="tab" aria-selected={settings.source === "undercurrent"} onClick={() => setSource("undercurrent")}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5", settings.source === "undercurrent" ? "bg-white text-ink" : "text-white/80 hover:bg-white/10 hover:text-white")}>
                <Music2 className="size-3.5" /> Undercurrent
              </button>
              <button type="button" role="tab" aria-selected={settings.source === "spotify"} onClick={() => setSource("spotify")}
                className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5", settings.source === "spotify" ? "bg-[#1ed760] text-black" : "text-white/80 hover:bg-white/10 hover:text-white")}>
                Spotify
              </button>
            </div>
            {settings.source === "undercurrent" ? (
              <div className="glass flex max-w-full items-center gap-1 overflow-x-auto rounded-full p-1 text-xs">
                {TRACKS.map(([id, name]) => (
                  <button key={id} type="button" onClick={() => pickTrack(id)}
                    className={cn("shrink-0 rounded-full px-3 py-1.5", track === id ? "bg-white text-ink" : "text-white/80 hover:bg-white/10 hover:text-white")}>
                    {name}
                  </button>
                ))}
              </div>
            ) : (
              <div className="glass flex items-center gap-3 rounded-full px-4 py-2 text-xs text-white/85">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.pauseSpotifyOnBreak} onChange={(e) => update({ pauseSpotifyOnBreak: e.target.checked })} className="accent-[#1ed760]" />
                  Pause on breaks
                </label>
                {toSpotifyUri(settings.spotify) && (
                  <button type="button" onClick={() => { update({ spotify: "" }); setSpotifyInput(""); spotifyRef.current?.destroy(); spotifyRef.current = null; if (spotifyEl.current) spotifyEl.current.innerHTML = ""; }}
                    className="rounded-full px-2 py-0.5 text-white/70 hover:bg-white/10 hover:text-white">
                    Change link
                  </button>
                )}
              </div>
            )}
          </div>
          {settings.source === "undercurrent" && (
            <div className="glass flex items-center gap-3 rounded-full px-4 py-2 text-white">
              <Tip label={muted ? "Unmute" : "Mute"} side="top">
                <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} className="rounded-full p-0.5 hover:text-warm">
                  {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                </button>
              </Tip>
              <label htmlFor="focus-volume" className="sr-only">Volume</label>
              <input id="focus-volume" type="range" min={0} max={1} step={0.01} value={settings.volume}
                onChange={(e) => { const v = Number(e.target.value); update({ volume: v }); if (!muted) audioRef.current?.setVolume(v); }}
                className="w-28 accent-[#e2b46a]" />
            </div>
          )}
        </div>
      </footer>
    </main>
  );
}

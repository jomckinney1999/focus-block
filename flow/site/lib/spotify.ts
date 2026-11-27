/** Spotify's official embed player (no account setup or API keys needed). */

export type SpotifyController = {
  loadUri(uri: string): void;
  play(): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  addListener(event: "ready" | "playback_update", cb: (e: { data: { isPaused: boolean; position: number } }) => void): void;
};
type IFrameAPI = {
  createController(el: HTMLElement, opts: { uri: string; width?: string | number; height?: string | number }, cb: (c: SpotifyController) => void): void;
};

/** Turns a Spotify link or URI into spotify:<type>:<id>, or null if it isn't one. */
export function toSpotifyUri(input: string): string | null {
  const s = input.trim();
  const uri = /^spotify:(playlist|album|track|episode|show|artist):([A-Za-z0-9]+)$/.exec(s);
  if (uri) return s;
  try {
    const u = new URL(s);
    if (u.hostname !== "open.spotify.com") return null;
    const m = /^\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/.exec(u.pathname);
    return m ? `spotify:${m[1]}:${m[2]}` : null;
  } catch {
    return null;
  }
}

let api: Promise<IFrameAPI> | null = null;
/** Loads Spotify's iFrame API script once. */
export function loadSpotifyApi(): Promise<IFrameAPI> {
  if (api) return api;
  api = new Promise((resolve, reject) => {
    const w = window as unknown as { onSpotifyIframeApiReady?: (a: IFrameAPI) => void };
    w.onSpotifyIframeApiReady = (a) => resolve(a);
    const script = document.createElement("script");
    script.src = "https://open.spotify.com/embed/iframe-api/v1";
    script.async = true;
    script.onerror = () => { api = null; reject(new Error("Couldn't reach Spotify")); };
    document.body.appendChild(script);
  });
  return api;
}

export {};
declare global {
  interface FlowAudioTrack { id: string; name: string; kind: string; credit: string; blurb: string }
  class FlowAudio {
    constructor(opts?: { volume?: number; track?: string });
    static readonly tracks: Record<string, FlowAudioTrack>;
    ctx: AudioContext | null;
    trackId: string;
    readonly running: boolean;
    unlock(): Promise<boolean>;
    setTrack(id: string): void;
    setVolume(v: number): void;
    setLevel(db: number, rampMs: number, fromDb?: number): Promise<void>;
    meter(): number;
  }
  interface Window { FlowAudio: typeof FlowAudio }
}

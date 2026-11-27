// Types for the shared plain-JS engine (synced from flow/engine; don't edit the .js copies here).
export interface FlowTransition { state: FlowState; from: FlowState; db: number; rampMs: number; fromDb?: number; reason: string }
export type FlowState = "flow" | "soft" | "resting" | "paused";

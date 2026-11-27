import type { FlowState, FlowTransition } from "./index";
declare class FlowModel {
  constructor(options?: Record<string, unknown>, saved?: unknown, now?: number);
  state: FlowState;
  lastEdit: number;
  o: Record<string, number> & { restAfterMs: number; softDb: number };
  edit(now?: number): FlowTransition | null;
  presence(now?: number): FlowTransition | null;
  tick(now?: number): FlowTransition | null;
  play(now?: number): FlowTransition | null;
  pause(now?: number): FlowTransition | null;
  setOptions(o: Record<string, unknown>): void;
  grace(): number;
  lastActivity(): number;
  level(): number;
  static DEFAULTS: Record<string, number>;
}
export default FlowModel;

/** External nondeterminism is supplied by the host, never read by game rules. */
export interface SimulationEnvironment {
  /** Existing epoch-based gameplay deadlines, in milliseconds. */
  nowMs(): number;
  /** Uniform sample in [0, 1); callers preserve the historical draw order. */
  random(): number;
}

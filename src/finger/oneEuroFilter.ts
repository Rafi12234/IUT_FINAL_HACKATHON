/**
 * One Euro Filter — adaptive low-pass filter for noisy continuous signals.
 *
 * Reference: Géry Casiez, Nicolas Roussel, Daniel Vogel (2012).
 * "1€ Filter: A Simple Speed-based Low-pass Filter for Noisy Input in Interactive Systems."
 *
 * Properties:
 * - Small jitter → strong smoothing (low β, high filtering)
 * - Fast intentional motion → responsive tracking (high β, less filtering)
 * - Fully deterministic and side-effect free
 */

export interface OneEuroFilterOptions {
  /** Minimum cutoff frequency (Hz). Lower = more smoothing when stationary. */
  readonly minCutoff: number;
  /** Speed coefficient. Higher = more responsive during fast movement. */
  readonly beta: number;
  /** Cutoff for the derivative (speed) estimate. */
  readonly derivativeCutoff: number;
}

export interface OneEuroFilterState {
  readonly prevFiltered: number | null;
  readonly prevDerivative: number | null;
  readonly prevTimestamp: number | null;
}

export function createOneEuroState(): OneEuroFilterState {
  return { prevFiltered: null, prevDerivative: null, prevTimestamp: null };
}

function alpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * Apply one step of the One Euro Filter.
 *
 * Returns the filtered value and the updated state. Rejects non-finite
 * input — returns the previous filtered value (or raw value if no history).
 */
export function oneEuroStep(
  raw: number,
  timestamp: number,
  state: OneEuroFilterState,
  opts: OneEuroFilterOptions,
): { filtered: number; nextState: OneEuroFilterState } {
  if (!Number.isFinite(raw)) {
    // Pass through previous or fallback to 0
    const filtered = state.prevFiltered ?? 0;
    return { filtered, nextState: state };
  }

  if (state.prevFiltered === null || state.prevTimestamp === null) {
    // First sample — initialise
    const nextState: OneEuroFilterState = {
      prevFiltered: raw,
      prevDerivative: 0,
      prevTimestamp: timestamp,
    };
    return { filtered: raw, nextState };
  }

  const dt = Math.max((timestamp - state.prevTimestamp) / 1000, 1e-4); // seconds, clamp > 0

  // Estimate derivative
  const dRaw = (raw - state.prevFiltered) / dt;
  const aD = alpha(opts.derivativeCutoff, dt);
  const derivative = aD * dRaw + (1 - aD) * (state.prevDerivative ?? 0);

  // Adaptive cutoff based on speed
  const cutoff = opts.minCutoff + opts.beta * Math.abs(derivative);
  const aMin = alpha(cutoff, dt);
  const filtered = aMin * raw + (1 - aMin) * state.prevFiltered;

  const nextState: OneEuroFilterState = {
    prevFiltered: filtered,
    prevDerivative: derivative,
    prevTimestamp: timestamp,
  };
  return { filtered, nextState };
}

/** Convenience stateful class wrapping the pure functions above. */
export class OneEuroFilter {
  private state: OneEuroFilterState = createOneEuroState();
  private readonly opts: OneEuroFilterOptions;

  constructor(opts: OneEuroFilterOptions) {
    this.opts = opts;
  }

  filter(raw: number, timestamp: number): number {
    const { filtered, nextState } = oneEuroStep(raw, timestamp, this.state, this.opts);
    this.state = nextState;
    return filtered;
  }

  reset(): void {
    this.state = createOneEuroState();
  }

  get hasHistory(): boolean {
    return this.state.prevFiltered !== null;
  }
}

/**
 * Per-hand One Euro Filter bank.
 * Filters key landmark positions to remove jitter before gesture/command logic.
 */

import {
  ONE_EURO_BETA,
  ONE_EURO_DCUTOFF,
  ONE_EURO_MIN_CUTOFF,
  LM_INDEX_MCP,
  LM_INDEX_TIP,
  LM_MIDDLE_MCP,
  LM_PINKY_MCP,
  LM_THUMB_TIP,
  LM_WRIST,
} from './fingerConfig';
import { OneEuroFilter } from './oneEuroFilter';
import type { NormalizedLandmark } from './fingerTypes';

const FILTERED_INDICES = [
  LM_WRIST,
  LM_THUMB_TIP,
  LM_INDEX_MCP,
  LM_INDEX_TIP,
  LM_MIDDLE_MCP,
  LM_PINKY_MCP,
];

/** A bank of filters for one hand (x, y, z per landmark + palm-size scalar). */
export class HandFilterBank {
  private readonly xFilters: Map<number, OneEuroFilter> = new Map();
  private readonly yFilters: Map<number, OneEuroFilter> = new Map();
  private readonly zFilters: Map<number, OneEuroFilter> = new Map();
  private readonly palmSizeFilter: OneEuroFilter;

  constructor() {
    const opts = { minCutoff: ONE_EURO_MIN_CUTOFF, beta: ONE_EURO_BETA, derivativeCutoff: ONE_EURO_DCUTOFF };
    for (const idx of FILTERED_INDICES) {
      this.xFilters.set(idx, new OneEuroFilter(opts));
      this.yFilters.set(idx, new OneEuroFilter(opts));
      this.zFilters.set(idx, new OneEuroFilter(opts));
    }
    this.palmSizeFilter = new OneEuroFilter(opts);
  }

  /**
   * Apply filters to landmarks. Returns a new array with filtered values at
   * the FILTERED_INDICES positions; all other positions pass through unchanged.
   * Non-finite input values are rejected — the previous filtered value is used.
   */
  filter(landmarks: readonly NormalizedLandmark[], timestamp: number): NormalizedLandmark[] {
    const out: NormalizedLandmark[] = landmarks.map((lm) => ({ ...lm }));
    for (const idx of FILTERED_INDICES) {
      const lm = landmarks[idx];
      if (!lm) continue;
      out[idx] = {
        x: this.xFilters.get(idx)!.filter(lm.x, timestamp),
        y: this.yFilters.get(idx)!.filter(lm.y, timestamp),
        z: this.zFilters.get(idx)!.filter(lm.z, timestamp),
        visibility: lm.visibility,
      };
    }
    return out;
  }

  /** Filter the palm-size scalar (palm width in normalized coords). */
  filterPalmSize(raw: number, timestamp: number): number {
    if (!Number.isFinite(raw)) return this.palmSizeFilter.hasHistory ? 0 : raw;
    return this.palmSizeFilter.filter(raw, timestamp);
  }

  reset(): void {
    for (const f of [...this.xFilters.values(), ...this.yFilters.values(), ...this.zFilters.values()]) {
      f.reset();
    }
    this.palmSizeFilter.reset();
  }
}

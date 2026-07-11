/**
 * Normalized pinch detector.
 *
 * Uses palm-normalized distance between thumb tip (LM 4) and index tip (LM 8)
 * to detect and release pinches with hysteresis. All logic is pure and
 * independently testable — no DOM, no React.
 */

import {
  LM_INDEX_MCP,
  LM_INDEX_TIP,
  LM_PINKY_MCP,
  LM_THUMB_TIP,
  MIN_HANDEDNESS_CONFIDENCE,
  PINCH_RELEASE_RATIO,
  PINCH_STABLE_FRAMES_RELEASE,
  PINCH_STABLE_FRAMES_START,
  PINCH_START_RATIO,
} from './fingerConfig';
import type { NormalizedLandmark, PinchState } from './fingerTypes';

function dist2d(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function computePinchRatio(landmarks: readonly NormalizedLandmark[]): number {
  if (landmarks.length < 18) return 1; // not enough data → treat as open
  const thumbTip = landmarks[LM_THUMB_TIP];
  const indexTip = landmarks[LM_INDEX_TIP];
  const indexMcp = landmarks[LM_INDEX_MCP];
  const pinkyMcp = landmarks[LM_PINKY_MCP];
  if (!thumbTip || !indexTip || !indexMcp || !pinkyMcp) return 1;

  // Guard against NaN landmarks
  for (const lm of [thumbTip, indexTip, indexMcp, pinkyMcp]) {
    if (!Number.isFinite(lm.x) || !Number.isFinite(lm.y)) return 1;
  }

  const pinchDist = dist2d(thumbTip, indexTip);
  const palmWidth = dist2d(indexMcp, pinkyMcp);
  return pinchDist / Math.max(palmWidth, 1e-6);
}

export function createPinchState(): PinchState {
  return { active: false, ratio: 1, startedAt: null, stableFrames: 0 };
}

export interface PinchDetectorOptions {
  readonly startRatio?: number;
  readonly releaseRatio?: number;
  readonly stableFramesStart?: number;
  readonly stableFramesRelease?: number;
  readonly minConfidence?: number;
}

/**
 * Update pinch state given new landmarks and handedness confidence.
 * Returns the new immutable PinchState.
 */
export function updatePinch(
  prev: PinchState,
  landmarks: readonly NormalizedLandmark[],
  handednessScore: number,
  now: number,
  opts: PinchDetectorOptions = {},
): PinchState {
  const startRatio = opts.startRatio ?? PINCH_START_RATIO;
  const releaseRatio = opts.releaseRatio ?? PINCH_RELEASE_RATIO;
  const stableStart = opts.stableFramesStart ?? PINCH_STABLE_FRAMES_START;
  const stableRelease = opts.stableFramesRelease ?? PINCH_STABLE_FRAMES_RELEASE;
  const minConf = opts.minConfidence ?? MIN_HANDEDNESS_CONFIDENCE;

  // Low confidence → do not update state (preserves current active/inactive)
  if (handednessScore < minConf) {
    return { ...prev, stableFrames: 0 };
  }

  const ratio = computePinchRatio(landmarks);

  if (!prev.active) {
    // Waiting to start a pinch
    if (ratio < startRatio) {
      const frames = prev.stableFrames + 1;
      if (frames >= stableStart) {
        return { active: true, ratio, startedAt: now, stableFrames: frames };
      }
      return { ...prev, ratio, stableFrames: frames };
    }
    // Not pinching — reset stability counter
    return { ...prev, ratio, stableFrames: 0 };
  } else {
    // Currently pinched — check for release
    if (ratio > releaseRatio) {
      const frames = prev.stableFrames + 1;
      if (frames >= stableRelease) {
        return { active: false, ratio, startedAt: null, stableFrames: 0 };
      }
      return { ...prev, ratio, stableFrames: frames };
    }
    // Still pinching — reset release counter
    return { ...prev, ratio, stableFrames: 0 };
  }
}

/** Stateful pinch detector class for convenience. */
export class PinchDetector {
  private state: PinchState = createPinchState();
  private readonly opts: PinchDetectorOptions;

  constructor(opts: PinchDetectorOptions = {}) {
    this.opts = opts;
  }

  update(landmarks: readonly NormalizedLandmark[], handednessScore: number, now: number): PinchState {
    this.state = updatePinch(this.state, landmarks, handednessScore, now, this.opts);
    return this.state;
  }

  getState(): PinchState {
    return this.state;
  }

  reset(): void {
    this.state = createPinchState();
  }
}

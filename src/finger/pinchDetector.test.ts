import { describe, it, expect } from 'vitest';
import {
  createPinchState,
  updatePinch,
  computePinchRatio,
  PinchDetector,
} from './pinchDetector';
import type { NormalizedLandmark } from './fingerTypes';

function makeLandmarks(thumbTipX: number, indexTipX: number): NormalizedLandmark[] {
  // 21 landmarks, only thumb tip (4), index tip (8), index MCP (5), pinky MCP (17) matter
  const lms: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lms[4] = { x: thumbTipX, y: 0.5, z: 0 };  // thumb tip
  lms[8] = { x: indexTipX, y: 0.5, z: 0 };  // index tip
  lms[5] = { x: 0.3, y: 0.5, z: 0 };         // index MCP
  lms[17] = { x: 0.6, y: 0.5, z: 0 };        // pinky MCP (palm width = 0.3)
  return lms;
}

const PINCH_LMS = makeLandmarks(0.51, 0.51); // very close → pinch ratio ~0.03 / 0.3 = 0.1
const OPEN_LMS = makeLandmarks(0.3, 0.7);    // far apart → pinch ratio ~0.4 / 0.3 = 1.33

describe('computePinchRatio', () => {
  it('returns ~1 for too few landmarks', () => {
    expect(computePinchRatio([])).toBe(1);
  });

  it('returns low ratio when thumb and index are close', () => {
    expect(computePinchRatio(PINCH_LMS)).toBeLessThan(0.28);
  });

  it('returns high ratio when hand is open', () => {
    expect(computePinchRatio(OPEN_LMS)).toBeGreaterThan(0.38);
  });
});

describe('updatePinch', () => {
  it('activates after enough stable frames', () => {
    let s = createPinchState();
    const opts = { stableFramesStart: 2, stableFramesRelease: 1 };
    s = updatePinch(s, PINCH_LMS, 0.9, 100, opts);
    expect(s.active).toBe(false);
    s = updatePinch(s, PINCH_LMS, 0.9, 116, opts);
    expect(s.active).toBe(true);
  });

  it('releases after stable open frames', () => {
    let s = createPinchState();
    const opts = { stableFramesStart: 1, stableFramesRelease: 1 };
    s = updatePinch(s, PINCH_LMS, 0.9, 100, opts);
    expect(s.active).toBe(true);
    s = updatePinch(s, OPEN_LMS, 0.9, 116, opts);
    expect(s.active).toBe(false);
  });

  it('ignores low confidence frames', () => {
    let s = createPinchState();
    s = updatePinch(s, PINCH_LMS, 0.4, 100, {});
    expect(s.active).toBe(false);
    expect(s.stableFrames).toBe(0);
  });

  it('records startedAt timestamp on activation', () => {
    let s = createPinchState();
    const opts = { stableFramesStart: 1 };
    s = updatePinch(s, PINCH_LMS, 0.9, 500, opts);
    expect(s.startedAt).toBe(500);
  });
});

describe('PinchDetector class', () => {
  it('resets state', () => {
    const d = new PinchDetector({ stableFramesStart: 1 });
    d.update(PINCH_LMS, 0.9, 100);
    expect(d.getState().active).toBe(true);
    d.reset();
    expect(d.getState().active).toBe(false);
  });
});

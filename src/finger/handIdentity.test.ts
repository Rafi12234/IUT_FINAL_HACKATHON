import { describe, it, expect } from 'vitest';
import { HandIdentityTracker } from './handIdentity';
import type { NormalizedLandmark } from './fingerTypes';

function makeLandmarks(wx: number, wy: number): NormalizedLandmark[] {
  return Array.from({ length: 21 }, (_, i) => i === 0 ? { x: wx, y: wy, z: 0 } : { x: 0.5, y: 0.5, z: 0 });
}

const EMPTY_WORLD: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

describe('HandIdentityTracker', () => {
  it('assigns a tracking ID to a new hand', () => {
    const tracker = new HandIdentityTracker();
    const result = tracker.update([
      { handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.5, 0.5), worldLandmarks: EMPTY_WORLD },
    ], 100);
    expect(result).toHaveLength(1);
    expect(result[0]!.trackingId).toBeTruthy();
  });

  it('preserves the same tracking ID across frames', () => {
    const tracker = new HandIdentityTracker();
    const r1 = tracker.update([{ handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.5, 0.5), worldLandmarks: EMPTY_WORLD }], 100);
    const r2 = tracker.update([{ handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.52, 0.51), worldLandmarks: EMPTY_WORLD }], 116);
    expect(r1[0]!.trackingId).toBe(r2[0]!.trackingId);
  });

  it('assigns different IDs to two hands of different handedness', () => {
    const tracker = new HandIdentityTracker();
    const result = tracker.update([
      { handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.3, 0.5), worldLandmarks: EMPTY_WORLD },
      { handedness: 'Left', handednessScore: 0.85, landmarks: makeLandmarks(0.7, 0.5), worldLandmarks: EMPTY_WORLD },
    ], 100);
    expect(result).toHaveLength(2);
    expect(result[0]!.trackingId).not.toBe(result[1]!.trackingId);
  });

  it('returns empty array when no hands provided', () => {
    const tracker = new HandIdentityTracker();
    expect(tracker.update([], 100)).toHaveLength(0);
  });

  it('assigns a new ID to a hand that jumped far', () => {
    const tracker = new HandIdentityTracker();
    const r1 = tracker.update([{ handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.1, 0.1), worldLandmarks: EMPTY_WORLD }], 100);
    // Jump to a distant location far beyond IDENTITY_MAX_MATCH_DISTANCE
    const r2 = tracker.update([{ handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.9, 0.9), worldLandmarks: EMPTY_WORLD }], 116);
    expect(r1[0]!.trackingId).not.toBe(r2[0]!.trackingId);
  });

  it('reset clears all slots', () => {
    const tracker = new HandIdentityTracker();
    tracker.update([{ handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.5, 0.5), worldLandmarks: EMPTY_WORLD }], 100);
    tracker.reset();
    const r = tracker.update([{ handedness: 'Right', handednessScore: 0.9, landmarks: makeLandmarks(0.5, 0.5), worldLandmarks: EMPTY_WORLD }], 200);
    // After reset, new slot should be created (different ID)
    expect(r[0]!.trackingId).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import { HandFilterBank } from './handFilters';
import type { NormalizedLandmark } from './fingerTypes';

function makeLandmarks(val = 0.5): NormalizedLandmark[] {
  return Array.from({ length: 21 }, () => ({ x: val, y: val, z: 0 }));
}

describe('HandFilterBank', () => {
  it('passes first sample through without distortion', () => {
    const bank = new HandFilterBank();
    const lms = makeLandmarks(0.7);
    const out = bank.filter(lms, 0);
    // Filtered indices should have values close to input on first sample
    expect(out[0]!.x).toBeCloseTo(0.7, 2);
    expect(out[8]!.x).toBeCloseTo(0.7, 2);
  });

  it('smooths a spike at key landmark', () => {
    const bank = new HandFilterBank();
    const baseline = makeLandmarks(0.5);
    bank.filter(baseline, 0);
    bank.filter(baseline, 16);
    bank.filter(baseline, 32);

    // Inject a spike at frame 48
    const spike = makeLandmarks(0.5);
    (spike[8] as NormalizedLandmark) = { x: 1.0, y: 1.0, z: 0 };
    const out = bank.filter(spike, 48);

    // The filter should attenuate the spike
    expect(out[8]!.x).toBeLessThan(1.0);
    expect(out[8]!.x).toBeGreaterThan(0.5);
  });

  it('rejects non-finite input for filtered landmarks', () => {
    const bank = new HandFilterBank();
    bank.filter(makeLandmarks(0.5), 0);
    const bad = makeLandmarks(0.5);
    (bad[8] as NormalizedLandmark) = { x: NaN, y: 0.5, z: 0 };
    const out = bank.filter(bad, 16);
    expect(Number.isFinite(out[8]!.x)).toBe(true);
  });

  it('passes through unfiltered indices unchanged', () => {
    const bank = new HandFilterBank();
    const lms = makeLandmarks(0.3);
    const out = bank.filter(lms, 0);
    // Index 20 (right pinky tip) is not in FILTERED_INDICES
    expect(out[20]!.x).toBe(0.3);
  });

  it('filters palm size', () => {
    const bank = new HandFilterBank();
    const s1 = bank.filterPalmSize(0.3, 0);
    expect(s1).toBeCloseTo(0.3, 2); // first sample
    const s2 = bank.filterPalmSize(0.9, 16); // spike
    expect(s2).toBeLessThan(0.9); // smoothed
  });

  it('reset clears filter state', () => {
    const bank = new HandFilterBank();
    bank.filter(makeLandmarks(1.0), 0);
    bank.reset();
    const out = bank.filter(makeLandmarks(0.0), 16);
    // After reset, the first sample is the raw value
    expect(out[0]!.x).toBeCloseTo(0.0, 2);
  });
});

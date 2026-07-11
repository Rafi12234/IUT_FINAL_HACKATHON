import { describe, it, expect } from 'vitest';
import {
  oneEuroStep,
  createOneEuroState,
  OneEuroFilter,
} from './oneEuroFilter';

const OPTS = { minCutoff: 1.0, beta: 0.015, derivativeCutoff: 1.0 };

describe('oneEuroStep', () => {
  it('returns raw value on first call', () => {
    const state = createOneEuroState();
    const { filtered } = oneEuroStep(1.5, 0, state, OPTS);
    expect(filtered).toBe(1.5);
  });

  it('smooths toward stable value over time', () => {
    let state = createOneEuroState();
    let filtered = 0;
    for (let i = 0; i < 20; i++) {
      const result = oneEuroStep(1.0, i * 16, state, OPTS);
      filtered = result.filtered;
      state = result.nextState;
    }
    expect(filtered).toBeGreaterThan(0.9);
    expect(filtered).toBeLessThanOrEqual(1.0);
  });

  it('rejects non-finite input and returns previous value', () => {
    let state = createOneEuroState();
    const r1 = oneEuroStep(2.0, 0, state, OPTS);
    state = r1.nextState;
    const r2 = oneEuroStep(NaN, 16, state, OPTS);
    expect(r2.filtered).toBeCloseTo(2.0, 1);
    expect(r2.nextState).toBe(state); // state unchanged
  });
});

describe('OneEuroFilter class', () => {
  it('starts with no history', () => {
    const f = new OneEuroFilter(OPTS);
    expect(f.hasHistory).toBe(false);
  });

  it('has history after first sample', () => {
    const f = new OneEuroFilter(OPTS);
    f.filter(1.0, 0);
    expect(f.hasHistory).toBe(true);
  });

  it('reset clears history', () => {
    const f = new OneEuroFilter(OPTS);
    f.filter(1.0, 0);
    f.reset();
    expect(f.hasHistory).toBe(false);
  });

  it('produces different output from raw after multiple samples', () => {
    const f = new OneEuroFilter(OPTS);
    const raw = [0, 0, 10, 0, 0, 0, 0, 0, 0, 0];
    const outputs = raw.map((v, i) => f.filter(v, i * 16));
    // The spike should be attenuated
    expect(outputs[2]).toBeLessThan(10);
    expect(outputs[2]).toBeGreaterThan(0);
  });
});

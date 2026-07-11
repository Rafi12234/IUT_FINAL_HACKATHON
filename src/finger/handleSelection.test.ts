import { describe, it, expect } from 'vitest';
import { createHandleSelectionState, selectHandle } from './handleSelection';
import type { FingerHandleProjection } from './fingerTypes';

function makeHandle(id: string, sx: number, sy: number, kind: 'joint' | 'tcp' = 'joint'): FingerHandleProjection {
  return {
    id,
    kind,
    jointName: kind === 'joint' ? id : undefined,
    worldPosition: [0, 0, 0],
    screenPosition: [sx, sy],
    screenTangent: [1, 0],
    visible: true,
    distanceFromCamera: 1,
  };
}

const H1 = makeHandle('joint:joint_1', 100, 100);
const H2 = makeHandle('joint:joint_2', 300, 300);
const H3 = makeHandle('tcp:stylus_tip', 500, 100, 'tcp');

describe('selectHandle', () => {
  it('selects closest handle within radius', () => {
    const state = createHandleSelectionState();
    const { id } = selectHandle(102, 102, [H1, H2], state, new Set(), 60);
    expect(id).toBe('joint:joint_1');
  });

  it('returns null when no handle is within radius', () => {
    const state = createHandleSelectionState();
    const { id } = selectHandle(900, 900, [H1, H2], state, new Set(), 60);
    expect(id).toBe(null);
  });

  it('returns null when handles array is empty', () => {
    const state = createHandleSelectionState();
    const { id } = selectHandle(100, 100, [], state);
    expect(id).toBe(null);
  });

  it('applies hysteresis — does not switch to marginally closer handle', () => {
    const state = { currentId: 'joint:joint_1' };
    // joint_1 at 100,100; cursor at 105,100 (5px away); joint_2 at 106,100 (1px closer)
    const h2Near = makeHandle('joint:joint_2', 106, 100);
    const { id } = selectHandle(105, 100, [H1, h2Near], state, new Set(), 60, 10);
    expect(id).toBe('joint:joint_1'); // hysteresis holds
  });

  it('switches to handle that is clearly much closer', () => {
    const state = { currentId: 'joint:joint_1' };
    // joint_2 is way closer — should switch
    const h2Close = makeHandle('joint:joint_2', 301, 300);
    const { id } = selectHandle(300, 300, [H1, h2Close], state, new Set(), 60, 5);
    expect(id).toBe('joint:joint_2');
  });

  it('excludes blocked handles', () => {
    const state = createHandleSelectionState();
    const { id } = selectHandle(102, 102, [H1, H2, H3], state, new Set(['joint:joint_1']));
    expect(id).not.toBe('joint:joint_1');
  });

  it('skips invisible handles', () => {
    const hidden: FingerHandleProjection = { ...H1, visible: false };
    const state = createHandleSelectionState();
    const { id } = selectHandle(102, 102, [hidden], state);
    expect(id).toBe(null);
  });
});

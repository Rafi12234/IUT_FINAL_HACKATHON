import { describe, it, expect, vi } from 'vitest';
import {
  createJointGrabState,
  startJointGrab,
  tickJointGrab,
  endJointGrab,
  computeJointTangent,
} from './jointGrabController';
import type { JointMeta } from './jointGrabController';

const META: JointMeta[] = [
  { name: 'joint_1', lower: -3.14, upper: 3.14 },
];

describe('startJointGrab', () => {
  it('returns active state with correct fields', () => {
    const s = startJointGrab({
      handleId: 'joint:joint_1',
      jointName: 'joint_1',
      currentAngle: 0.5,
      cursorX: 100,
      cursorY: 200,
      tangentX: 1,
      tangentY: 0,
      now: 1000,
    });
    expect(s.active).toBe(true);
    expect(s.jointName).toBe('joint_1');
    expect(s.startAngle).toBe(0.5);
    expect(s.accumulated).toBe(0);
  });
});

describe('tickJointGrab', () => {
  it('emits command on sufficient cursor movement', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startJointGrab({
      handleId: 'joint:joint_1', jointName: 'joint_1',
      currentAngle: 0, cursorX: 100, cursorY: 100,
      tangentX: 1, tangentY: 0, now: 0,
    });
    s = tickJointGrab(s, {
      cursorX: 200, cursorY: 100, now: 100,
      speedMode: 'normal', jointMeta: META, submit,
      minInterval: 0, deadZone: 0,
    });
    expect(submit).toHaveBeenCalledOnce();
    const cmd = submit.mock.calls[0]![0] as { type: string; source: string; joints: Record<string, number> };
    expect(cmd.type).toBe('move_joints');
    expect(cmd.source).toBe('finger');
    expect(cmd.joints['joint_1']).toBeTypeOf('number');
  });

  it('respects rate limiting (min interval)', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startJointGrab({
      handleId: 'joint:joint_1', jointName: 'joint_1',
      currentAngle: 0, cursorX: 100, cursorY: 100,
      tangentX: 1, tangentY: 0, now: 0,
    });
    s = tickJointGrab(s, { cursorX: 200, cursorY: 100, now: 10, speedMode: 'normal', jointMeta: META, submit, minInterval: 100, deadZone: 0 });
    expect(submit).not.toHaveBeenCalled();
  });

  it('clamps joint target to URDF limits', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startJointGrab({
      handleId: 'joint:joint_1', jointName: 'joint_1',
      currentAngle: 3.13, cursorX: 0, cursorY: 100,
      tangentX: 1, tangentY: 0, now: 0,
    });
    s = tickJointGrab(s, { cursorX: 5000, cursorY: 100, now: 200, speedMode: 'fast', jointMeta: META, submit, minInterval: 0, deadZone: 0 });
    const cmd = submit.mock.calls[0]?.[0] as { joints: Record<string, number> };
    if (cmd) {
      expect(cmd.joints['joint_1']).toBeLessThanOrEqual(3.14);
    }
  });

  it('does nothing when inactive', () => {
    const submit = vi.fn();
    const s = createJointGrabState();
    const out = tickJointGrab(s, { cursorX: 200, cursorY: 100, now: 100, speedMode: 'normal', jointMeta: META, submit });
    expect(out).toBe(s);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('endJointGrab', () => {
  it('returns inactive state', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startJointGrab({ handleId: 'h1', jointName: 'joint_1', currentAngle: 0, cursorX: 0, cursorY: 0, tangentX: 1, tangentY: 0, now: 0 });
    s = endJointGrab(s, submit, 'READY', null);
    expect(s.active).toBe(false);
    expect(submit).not.toHaveBeenCalled(); // no stop needed when READY
  });

  it('submits stop when EXECUTING and source is finger', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startJointGrab({ handleId: 'h1', jointName: 'joint_1', currentAngle: 0, cursorX: 0, cursorY: 0, tangentX: 1, tangentY: 0, now: 0 });
    s = endJointGrab(s, submit, 'EXECUTING', 'finger');
    expect(submit).toHaveBeenCalledWith({ type: 'stop', source: 'system' });
  });
});

describe('computeJointTangent', () => {
  it('normalizes the screen tangent', () => {
    const handle = {
      id: 'j', kind: 'joint' as const, worldPosition: [0,0,0] as [number,number,number],
      screenPosition: [0,0] as [number,number], screenTangent: [3, 4] as [number,number],
      visible: true, distanceFromCamera: 1,
    };
    const [tx, ty] = computeJointTangent(handle);
    expect(Math.hypot(tx, ty)).toBeCloseTo(1, 5);
    expect(tx).toBeCloseTo(0.6, 5);
    expect(ty).toBeCloseTo(0.8, 5);
  });

  it('falls back to [1, 0] for zero tangent', () => {
    const handle = {
      id: 'j', kind: 'joint' as const, worldPosition: [0,0,0] as [number,number,number],
      screenPosition: [0,0] as [number,number], screenTangent: [0, 0] as [number,number],
      visible: true, distanceFromCamera: 1,
    };
    const [tx, ty] = computeJointTangent(handle);
    expect(tx).toBe(1);
    expect(ty).toBe(0);
  });
});

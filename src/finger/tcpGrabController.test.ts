import { describe, it, expect, vi } from 'vitest';
import { createTcpGrabState, startTcpGrab, tickTcpGrab, endTcpGrab } from './tcpGrabController';

const BASIS = { right: [1,0,0] as [number,number,number], up: [0,0,1] as [number,number,number], forward: [0,1,0] as [number,number,number] };
const TOOL_AXIS: [number,number,number] = [0, 0, -1];

describe('startTcpGrab', () => {
  it('creates active state', () => {
    const s = startTcpGrab({ indexTipX: 0.5, indexTipY: 0.5, palmSize: 0.3, toolAxis: TOOL_AXIS, cameraBasis: BASIS, now: 0 });
    expect(s.active).toBe(true);
    expect(s.prevX).toBe(0.5);
    expect(s.prevPalmSize).toBe(0.3);
  });
});

describe('tickTcpGrab', () => {
  it('emits cartesian_jog on hand movement', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startTcpGrab({ indexTipX: 0.5, indexTipY: 0.5, palmSize: 0.3, toolAxis: TOOL_AXIS, cameraBasis: BASIS, now: 0 });
    s = tickTcpGrab(s, {
      indexTipX: 0.6, indexTipY: 0.5, palmSize: 0.3,
      mirrored: false, speedMode: 'normal', calibration: null, now: 100,
      submit, minInterval: 0,
    });
    expect(submit).toHaveBeenCalledOnce();
    const cmd = submit.mock.calls[0]![0] as { type: string; source: string; delta: number[] };
    expect(cmd.type).toBe('cartesian_jog');
    expect(cmd.source).toBe('finger');
    expect(cmd.delta).toHaveLength(3);
    expect(Math.abs(cmd.delta[0]!)).toBeGreaterThan(0); // horizontal movement
  });

  it('respects rate limiting', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startTcpGrab({ indexTipX: 0.5, indexTipY: 0.5, palmSize: 0.3, toolAxis: TOOL_AXIS, cameraBasis: BASIS, now: 0 });
    s = tickTcpGrab(s, {
      indexTipX: 0.8, indexTipY: 0.5, palmSize: 0.3,
      mirrored: false, speedMode: 'normal', calibration: null, now: 5,
      submit, minInterval: 100,
    });
    expect(submit).not.toHaveBeenCalled();
  });

  it('mirrors horizontal motion when mirrored=true', () => {
    const submit1 = vi.fn().mockReturnValue({ accepted: true });
    const submit2 = vi.fn().mockReturnValue({ accepted: true });
    const s1 = startTcpGrab({ indexTipX: 0.5, indexTipY: 0.5, palmSize: 0.3, toolAxis: TOOL_AXIS, cameraBasis: BASIS, now: 0 });
    const s2 = startTcpGrab({ indexTipX: 0.5, indexTipY: 0.5, palmSize: 0.3, toolAxis: TOOL_AXIS, cameraBasis: BASIS, now: 0 });
    tickTcpGrab(s1, { indexTipX: 0.6, indexTipY: 0.5, palmSize: 0.3, mirrored: false, speedMode: 'normal', calibration: null, now: 100, submit: submit1, minInterval: 0 });
    tickTcpGrab(s2, { indexTipX: 0.6, indexTipY: 0.5, palmSize: 0.3, mirrored: true, speedMode: 'normal', calibration: null, now: 100, submit: submit2, minInterval: 0 });
    const d1 = (submit1.mock.calls[0]?.[0] as { delta: number[] })?.delta[0] ?? 0;
    const d2 = (submit2.mock.calls[0]?.[0] as { delta: number[] })?.delta[0] ?? 0;
    expect(Math.sign(d1)).toBe(-Math.sign(d2));
  });

  it('does nothing when inactive', () => {
    const submit = vi.fn();
    const s = createTcpGrabState();
    tickTcpGrab(s, { indexTipX: 0.6, indexTipY: 0.5, palmSize: 0.3, mirrored: false, speedMode: 'normal', calibration: null, now: 100, submit });
    expect(submit).not.toHaveBeenCalled();
  });
});

describe('endTcpGrab', () => {
  it('returns inactive state', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startTcpGrab({ indexTipX: 0.5, indexTipY: 0.5, palmSize: 0.3, toolAxis: TOOL_AXIS, cameraBasis: BASIS, now: 0 });
    s = endTcpGrab(s, submit, 'READY', null);
    expect(s.active).toBe(false);
  });

  it('submits system stop when EXECUTING with finger source', () => {
    const submit = vi.fn().mockReturnValue({ accepted: true });
    let s = startTcpGrab({ indexTipX: 0.5, indexTipY: 0.5, palmSize: 0.3, toolAxis: TOOL_AXIS, cameraBasis: BASIS, now: 0 });
    s = endTcpGrab(s, submit, 'EXECUTING', 'finger');
    expect(submit).toHaveBeenCalledWith({ type: 'stop', source: 'system' });
  });
});

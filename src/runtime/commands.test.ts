import { describe, expect, it } from 'vitest';
import { isManualSource, parseCommand, priorityOf, SOURCE_PRIORITY } from './commands';

describe('parseCommand', () => {
  it('accepts a well-formed move_joints command and fills id/issuedAt', () => {
    const r = parseCommand({ type: 'move_joints', source: 'dashboard', joints: { joint_1: 0.5 } }, 1000);
    expect(r.ok).toBe(true);
    expect(r.command?.type).toBe('move_joints');
    expect(r.command?.id).toBeTruthy();
    expect(r.command?.issuedAt).toBe(1000);
  });

  it('rejects an unknown command type', () => {
    const r = parseCommand({ type: 'teleport', source: 'dashboard' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid command/i);
  });

  it('rejects a malformed command (missing source)', () => {
    const r = parseCommand({ type: 'stop' });
    expect(r.ok).toBe(false);
  });

  it('rejects non-finite joint targets', () => {
    const r = parseCommand({
      type: 'move_joints',
      source: 'dashboard',
      joints: { joint_1: Number.POSITIVE_INFINITY },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects an unknown source', () => {
    const r = parseCommand({ type: 'stop', source: 'hacker' });
    expect(r.ok).toBe(false);
  });

  it('accepts finger as a valid command source for move_joints', () => {
    const r = parseCommand({ type: 'move_joints', source: 'finger', joints: { joint_1: 0.3 } });
    expect(r.ok).toBe(true);
    expect(r.command?.source).toBe('finger');
  });

  it('accepts finger as a valid command source for cartesian_jog', () => {
    const r = parseCommand({
      type: 'cartesian_jog',
      source: 'finger',
      delta: [0.001, 0, 0],
      approachAxis: [0, 0, -1],
    });
    expect(r.ok).toBe(true);
    expect(r.command?.source).toBe('finger');
  });
});

describe('priority', () => {
  it('orders system highest and joystick lowest', () => {
    expect(priorityOf('system')).toBe(SOURCE_PRIORITY.system);
    expect(priorityOf('system')).toBeGreaterThan(priorityOf('autonomous'));
    expect(priorityOf('autonomous')).toBeGreaterThan(priorityOf('dashboard'));
    expect(priorityOf('dashboard')).toBeGreaterThan(priorityOf('joystick'));
  });

  it('finger priority is 18 — between keyboard(15) and dashboard(20)', () => {
    expect(priorityOf('finger')).toBe(18);
    expect(priorityOf('finger')).toBeGreaterThan(priorityOf('keyboard'));
    expect(priorityOf('finger')).toBeLessThan(priorityOf('dashboard'));
  });
});

describe('isManualSource', () => {
  it('finger is a manual source', () => {
    expect(isManualSource('finger')).toBe(true);
  });

  it('keyboard, joystick, dashboard are manual sources', () => {
    expect(isManualSource('keyboard')).toBe(true);
    expect(isManualSource('joystick')).toBe(true);
    expect(isManualSource('dashboard')).toBe(true);
  });

  it('autonomous, agent, voice, system are not manual sources', () => {
    expect(isManualSource('autonomous')).toBe(false);
    expect(isManualSource('agent')).toBe(false);
    expect(isManualSource('voice')).toBe(false);
    expect(isManualSource('system')).toBe(false);
  });
});

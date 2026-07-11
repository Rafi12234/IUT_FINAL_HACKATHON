import { describe, expect, it } from 'vitest';
import type { JointMeta } from '../robot/RobotModelAdapter';
import { COMPETITION_6DOF } from '../config/robotProfiles';
import type { IkResult } from '../kinematics/ikTypes';
import { RuntimeController, type RuntimeSnapshot, type Vec3 } from './RuntimeController';

const META: JointMeta[] = [
  { name: 'joint_1', type: 'revolute', axis: [0, 0, 1], lower: -3.1416, upper: 3.1416, effort: 60, velocity: 2.5 },
  { name: 'joint_2', type: 'revolute', axis: [0, 1, 0], lower: -2.0944, upper: 2.0944, effort: 60, velocity: 2.5 },
  { name: 'joint_3', type: 'revolute', axis: [0, 1, 0], lower: -2.618, upper: 2.618, effort: 40, velocity: 3.0 },
  { name: 'joint_4', type: 'revolute', axis: [0, 0, 1], lower: -3.1416, upper: 3.1416, effort: 25, velocity: 3.5 },
  { name: 'joint_5', type: 'revolute', axis: [0, 1, 0], lower: -2.0944, upper: 2.0944, effort: 15, velocity: 4.0 },
  { name: 'joint_6', type: 'revolute', axis: [0, 0, 1], lower: -3.1416, upper: 3.1416, effort: 10, velocity: 4.5 },
  { name: 'stylus_pitch', type: 'revolute', axis: [0, 1, 0], lower: -2.0944, upper: 2.0944, effort: 8, velocity: 5.0 },
];

const INITIAL = { joint_1: 0, joint_2: 0, joint_3: 0, joint_4: 0, joint_5: 0, joint_6: 0, stylus_pitch: 0 };

interface HarnessOpts {
  maxJointJump?: number;
  planningTimeoutMs?: number;
  ikSolve?: (p: Vec3, a: Vec3, seed?: Readonly<Record<string, number>>) => Promise<IkResult>;
}

function harness(opts: HarnessOpts = {}) {
  let time = 0;
  const applied: Record<string, number>[] = [];
  let snapshot: RuntimeSnapshot | null = null;
  const rc = new RuntimeController({
    jointMeta: META,
    profile: COMPETITION_6DOF,
    initialJoints: INITIAL,
    applyJoints: (v) => applied.push({ ...v }),
    now: () => time,
    publish: (s) => (snapshot = s),
    snapshotHz: 1000,
    minDurationMs: 100,
    maxJointJump: opts.maxJointJump ?? Math.PI,
    computeTcp: () => [0, 0, 0] as Vec3,
    ...(opts.planningTimeoutMs !== undefined ? { planningTimeoutMs: opts.planningTimeoutMs } : {}),
    ...(opts.ikSolve ? { ikSolve: opts.ikSolve } : {}),
  });
  rc.bringOnline();
  return {
    rc,
    applied,
    snapshot: () => snapshot,
    tick(ms = 16) {
      time += ms;
      rc.tick(ms);
    },
    runToIdle(step = 50, maxTicks = 400) {
      for (let i = 0; i < maxTicks; i++) {
        time += step;
        rc.tick(step);
        if (rc.getState() === 'READY' && i > 0) break;
      }
    },
  };
}

const move = (joints: Record<string, number>, source = 'dashboard') =>
  ({ type: 'move_joints', source, joints }) as const;

function verifiedIk(solution: Record<string, number>): IkResult {
  return {
    status: 'converged',
    solution,
    jointValues: { ...solution, stylus_pitch: 0 },
    iterations: 1,
    seedIndex: 0,
    positionError: 1e-6,
    tiltRad: 0.01,
    toolAxisDot: 1,
    verified: true,
    jointLimitMargin: 0.5,
    unsafeJump: null,
  };
}

describe('RuntimeController — happy path', () => {
  it('brings the runtime online to READY', () => {
    const h = harness();
    expect(h.rc.getState()).toBe('READY');
  });

  it('executes a joint move through the pipeline and reaches the goal', () => {
    const h = harness();
    expect(h.rc.submit(move({ joint_1: 0.5 })).accepted).toBe(true);
    h.runToIdle();
    expect(h.rc.getState()).toBe('READY');
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(0.5, 4);
  });

  it('respects the joint velocity limit during execution', () => {
    const h = harness();
    h.rc.submit(move({ joint_1: 2.0 })); // limit 2.5 rad/s
    let prev = 0;
    let maxSpeed = 0;
    for (let i = 0; i < 400; i++) {
      h.tick(50);
      const v = h.rc.getJointValues().joint_1!;
      maxSpeed = Math.max(maxSpeed, Math.abs(v - prev) / 0.05);
      prev = v;
      if (h.rc.getState() === 'READY' && i > 0) break;
    }
    expect(maxSpeed).toBeLessThanOrEqual(2.5 * 1.05);
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(2.0, 3);
  });
});

describe('RuntimeController — invalid commands cause zero movement', () => {
  it('rejects malformed/unknown/NaN/locked/limit/jump without moving the robot', () => {
    const h = harness({ maxJointJump: 0.1 });
    expect(h.rc.submit({ type: 'teleport', source: 'dashboard' }).accepted).toBe(false);
    expect(h.rc.submit({ nonsense: true }).accepted).toBe(false);
    expect(h.rc.submit(move({ joint_1: Infinity })).accepted).toBe(false);
    expect(h.rc.submit(move({ stylus_pitch: 0.5 })).accepted).toBe(false);
    expect(h.rc.submit(move({ joint_1: 99 })).accepted).toBe(false);
    expect(h.rc.submit(move({ joint_1: 1.0 })).accepted).toBe(false); // jump > 0.1
    for (let i = 0; i < 10; i++) h.tick(50);
    expect(h.rc.getJointValues().joint_1).toBe(0);
    // Every applied sample kept joints at the initial zero pose.
    for (const s of h.applied) expect(s.joint_1).toBe(0);
  });
});

describe('RuntimeController — E-stop', () => {
  it('is observed by the next tick, cancels motion, and blocks new movement', () => {
    const h = harness();
    h.rc.submit(move({ joint_1: 1.0 }));
    h.tick(50); // start executing
    h.tick(50);
    const mid = h.rc.getJointValues().joint_1!;
    expect(mid).toBeGreaterThan(0);

    h.rc.emergencyStop();
    expect(h.rc.isEStopped()).toBe(true);
    // New movement blocked immediately (before the tick even runs).
    expect(h.rc.submit(move({ joint_1: 0.2 })).accepted).toBe(false);

    h.tick(50);
    expect(h.rc.getState()).toBe('E_STOPPED');
    const frozen = h.rc.getJointValues().joint_1!;
    h.tick(50);
    expect(h.rc.getJointValues().joint_1).toBe(frozen); // no further motion
  });

  it('requires an explicit safe reset before moving again', () => {
    const h = harness();
    h.rc.emergencyStop();
    h.tick(16);
    expect(h.rc.getState()).toBe('E_STOPPED');
    expect(h.rc.submit(move({ joint_1: 0.3 })).accepted).toBe(false);

    // reset only valid from E_STOPPED
    expect(h.rc.resetEStop().accepted).toBe(true);
    h.tick(16);
    expect(h.rc.getState()).toBe('READY');
    expect(h.rc.submit(move({ joint_1: 0.3 })).accepted).toBe(true);
  });

  it('rejects reset when not E-stopped', () => {
    const h = harness();
    expect(h.rc.resetEStop().accepted).toBe(false);
  });

  it('chains queued jogs on completion without bouncing through READY', async () => {
    const ikSolve = async (p: Vec3) => verifiedIk({ joint_1: p[0] });
    const h = harness({ ikSolve });
    const states: string[] = [];

    // First jog: plan + start executing.
    h.rc.submit({ type: 'cartesian_jog', source: 'joystick', delta: [0.1, 0, 0], approachAxis: [0, 0, -1] });
    h.tick(16);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.rc.getState()).toBe('EXECUTING');

    // Second jog arrives while executing → chained (queued, not preempted).
    h.rc.submit({ type: 'cartesian_jog', source: 'joystick', delta: [0.1, 0, 0], approachAxis: [0, 0, -1] });
    expect(h.rc.getState()).toBe('EXECUTING'); // no preemption bounce

    // Drive to completion of the first segment; the runtime must go straight
    // to PLANNING/EXECUTING for the queued jog — never READY.
    for (let i = 0; i < 60; i++) {
      h.tick(16);
      states.push(h.rc.getState());
      await Promise.resolve();
      await Promise.resolve();
      if (i > 3 && h.rc.getState() === 'READY' && states[states.length - 2] === 'READY') break;
    }
    const firstReady = states.indexOf('READY');
    const planningIdx = states.indexOf('PLANNING');
    expect(planningIdx).toBeGreaterThan(-1); // chained second jog planned
    // READY must not appear BEFORE the chained jog started planning.
    expect(firstReady === -1 || firstReady > planningIdx).toBe(true);
  });

  it('dedupes queued manual jogs to depth 1 while chaining', async () => {
    const ikSolve = async (p: Vec3) => verifiedIk({ joint_1: p[0] });
    const h = harness({ ikSolve });
    h.rc.submit({ type: 'cartesian_jog', source: 'joystick', delta: [0.1, 0, 0], approachAxis: [0, 0, -1] });
    h.tick(16);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.rc.getState()).toBe('EXECUTING');
    // Three more jogs stream in — only the LAST should remain queued.
    h.rc.submit({ type: 'cartesian_jog', source: 'joystick', delta: [0.1, 0, 0], approachAxis: [0, 0, -1] });
    h.rc.submit({ type: 'cartesian_jog', source: 'joystick', delta: [0.1, 0, 0], approachAxis: [0, 0, -1] });
    h.rc.submit({ type: 'cartesian_jog', source: 'joystick', delta: [0.1, 0, 0], approachAxis: [0, 0, -1] });
    h.tick(16); // publish a fresh snapshot (trajectory not yet complete)
    expect(h.snapshot()?.queueLength).toBe(1);
  });

  it('watchdog: a hung IK worker cannot wedge the runtime in PLANNING', async () => {
    const ikSolve = () => new Promise<IkResult>(() => {}); // never resolves
    const h = harness({ ikSolve, planningTimeoutMs: 20 });
    h.rc.submit({ type: 'cartesian_move', source: 'dashboard', position: [0.4, 0, 0.4], approachAxis: [0, 0, -1] });
    h.tick(16); // dequeue → PLANNING
    expect(h.rc.getState()).toBe('PLANNING');

    await new Promise((r) => setTimeout(r, 60)); // let the real-time watchdog fire
    h.tick(16);
    expect(h.rc.getState()).toBe('READY'); // recovered — not stuck
    expect(h.snapshot()?.lastRejection).toMatch(/timed out/i);

    // And the runtime accepts new motion immediately afterwards.
    expect(h.rc.submit(move({ joint_1: 0.2 })).accepted).toBe(true);
  });

  it('warm-starts IK with the CURRENT joints so jogs stay on the same branch', async () => {
    const seeds: Array<Readonly<Record<string, number>> | undefined> = [];
    const ikSolve = async (_p: Vec3, _a: Vec3, seed?: Readonly<Record<string, number>>) => {
      seeds.push(seed);
      return verifiedIk({ joint_1: 0.35 });
    };
    const h = harness({ ikSolve });
    // Move joint_1 first so the current pose is non-zero.
    h.rc.submit(move({ joint_1: 0.3 }));
    h.runToIdle();
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(0.3, 9);

    h.rc.submit({ type: 'cartesian_move', source: 'dashboard', position: [0.5, 0, 0.5], approachAxis: [0, 0, -1] });
    h.tick(16); // dequeue → PLANNING
    await Promise.resolve();
    await Promise.resolve();

    expect(seeds).toHaveLength(1);
    expect(seeds[0]).toBeDefined();
    expect(seeds[0]!.joint_1).toBeCloseTo(0.3, 9); // seeded from current joints
    expect(Object.keys(seeds[0]!)).toEqual(
      expect.arrayContaining(['joint_1', 'joint_2', 'joint_3', 'joint_4', 'joint_5', 'joint_6']),
    );
  });

  it('discards a plan when E-stopped during planning (cancellation)', async () => {
    let resolveIk!: (r: IkResult) => void;
    const ikSolve = () => new Promise<IkResult>((res) => (resolveIk = res));
    const h = harness({ ikSolve });
    h.rc.submit({ type: 'cartesian_move', source: 'autonomous', position: [0.5, 0, 0.05], approachAxis: [0, 0, -1] });
    h.tick(16); // dequeue → PLANNING
    expect(h.rc.getState()).toBe('PLANNING');

    h.rc.emergencyStop();
    h.tick(16);
    expect(h.rc.getState()).toBe('E_STOPPED');

    // IK resolves late → must be discarded, no movement.
    resolveIk(verifiedIk({ joint_1: 0.5 }));
    await Promise.resolve();
    await Promise.resolve();
    h.tick(16);
    expect(h.rc.getState()).toBe('E_STOPPED');
    expect(h.rc.getJointValues().joint_1).toBe(0);
  });
});

describe('RuntimeController — stop / pause / resume are distinct', () => {
  it('stop cancels the trajectory, clears the queue, and holds position', () => {
    const h = harness();
    h.rc.submit(move({ joint_1: 1.0 }));
    h.rc.submit(move({ joint_2: 0.5 }));
    h.tick(50);
    h.tick(50);
    const held = h.rc.getJointValues().joint_1!;
    expect(held).toBeGreaterThan(0);

    expect(h.rc.submit({ type: 'stop', source: 'system' }).accepted).toBe(true);
    expect(h.rc.getState()).toBe('READY');
    h.tick(50);
    expect(h.rc.getState()).toBe('READY'); // queue cleared, nothing starts
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(held, 6);
    expect(h.rc.getJointValues().joint_2).toBe(0);
  });

  it('pause freezes motion and resume continues to the goal', () => {
    const h = harness();
    h.rc.submit(move({ joint_1: 1.0 }));
    h.tick(50);
    h.tick(50);
    expect(h.rc.submit({ type: 'pause', source: 'system' }).accepted).toBe(true);
    expect(h.rc.getState()).toBe('PAUSED');
    const paused = h.rc.getJointValues().joint_1!;
    h.tick(200);
    expect(h.rc.getJointValues().joint_1).toBe(paused); // frozen while paused

    expect(h.rc.submit({ type: 'resume', source: 'system' }).accepted).toBe(true);
    expect(h.rc.getState()).toBe('EXECUTING');
    h.runToIdle();
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(1.0, 3);
  });

  it('rejects pause when nothing is executing and resume when not paused', () => {
    const h = harness();
    expect(h.rc.submit({ type: 'pause', source: 'system' }).accepted).toBe(false);
    expect(h.rc.submit({ type: 'resume', source: 'system' }).accepted).toBe(false);
  });
});

describe('RuntimeController — arbitration', () => {
  it('a higher-priority command preempts a lower-priority one', () => {
    const h = harness();
    h.rc.submit(move({ joint_1: 0.8 }, 'joystick'));
    h.tick(50);
    expect(h.snapshot()?.activeCommand?.source).toBe('joystick');

    h.rc.submit(move({ joint_1: -0.8 }, 'autonomous'));
    h.runToIdle();
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(-0.8, 3);
  });

  it('runs two simultaneous same-priority commands in order', () => {
    const h = harness();
    h.rc.submit(move({ joint_1: 0.3 }));
    h.rc.submit(move({ joint_2: 0.4 }));
    h.runToIdle();
    // first completed, then second dequeued
    for (let i = 0; i < 200; i++) h.tick(50);
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(0.3, 3);
    expect(h.rc.getJointValues().joint_2).toBeCloseTo(0.4, 3);
  });
});

describe('RuntimeController — finger source arbitration', () => {
  it('finger move_joints is accepted as a valid manual source', () => {
    const h = harness();
    const r = h.rc.submit({ type: 'move_joints', source: 'finger', joints: { joint_1: 0.4 } });
    expect(r.accepted).toBe(true);
    h.runToIdle();
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(0.4, 3);
  });

  it('finger cannot submit commands when E-stopped', () => {
    const h = harness();
    h.rc.emergencyStop();
    h.tick(16);
    const r = h.rc.submit({ type: 'move_joints', source: 'finger', joints: { joint_1: 0.3 } });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/E-stopped/i);
  });

  it('finger cannot seize ownership from autonomous execution', () => {
    const h = harness();
    h.rc.submit(move({ joint_1: 1.0 }, 'autonomous'));
    h.tick(50); // start executing
    expect(h.snapshot()?.activeCommand?.source).toBe('autonomous');

    const r = h.rc.submit({ type: 'move_joints', source: 'finger', joints: { joint_2: 0.5 } });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/autonomous.*owns/i);
  });

  it('finger can replace its own active move_joints (same-source slider replace)', () => {
    const h = harness();
    h.rc.submit({ type: 'move_joints', source: 'finger', joints: { joint_1: 1.0 } });
    h.tick(50);
    expect(h.snapshot()?.activeCommand?.source).toBe('finger');

    // A new finger command replaces the in-flight one
    const r = h.rc.submit({ type: 'move_joints', source: 'finger', joints: { joint_1: 0.3 } });
    expect(r.accepted).toBe(true);
    h.runToIdle();
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(0.3, 2);
  });

  it('system stop overrides an active finger command', () => {
    const h = harness();
    h.rc.submit({ type: 'move_joints', source: 'finger', joints: { joint_1: 1.5 } });
    // Tick until executing or 10 tries
    for (let i = 0; i < 10; i++) {
      h.tick(50);
      if (h.rc.getState() === 'EXECUTING') break;
    }
    expect(h.rc.getState()).toBe('EXECUTING');

    const r = h.rc.submit({ type: 'stop', source: 'system' });
    expect(r.accepted).toBe(true);
    expect(h.rc.getState()).toBe('READY');
    const held = h.rc.getJointValues().joint_1!;
    h.tick(50);
    expect(h.rc.getJointValues().joint_1).toBeCloseTo(held, 5);
  });


  it('finger cartesian_jog routes through the IK path correctly', async () => {
    const ikSolve = async (p: Vec3) => verifiedIk({ joint_1: p[0] });
    const h = harness({ ikSolve });
    const r = h.rc.submit({
      type: 'cartesian_jog',
      source: 'finger',
      delta: [0.05, 0, 0],
      approachAxis: [0, 0, -1],
    });
    expect(r.accepted).toBe(true);
    h.tick(16);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.rc.getState()).toBe('EXECUTING');
  });
});


/**
 * Joint grab controller — maps filtered cursor movement to joint angle deltas
 * and submits move_joints commands through the runtime.
 */

import { JOINT_DEAD_ZONE_RAD, JOINT_SENSITIVITY, MIN_COMMAND_INTERVAL_MS } from './fingerConfig';
import type { FingerHandleProjection, SpeedMode } from './fingerTypes';
import type { SubmitResult } from '../runtime/RuntimeController';

export interface JointGrabState {
  readonly active: boolean;
  readonly jointName: string | null;
  readonly handleId: string | null;
  readonly startAngle: number;
  /** Accumulated angle change from grab start. */
  readonly accumulated: number;
  readonly startCursorX: number;
  readonly startCursorY: number;
  readonly prevCursorX: number;
  readonly prevCursorY: number;
  readonly lastCommandAt: number;
  /** Screen-space tangent direction for this grab. */
  readonly tangentX: number;
  readonly tangentY: number;
}

export function createJointGrabState(): JointGrabState {
  return {
    active: false,
    jointName: null,
    handleId: null,
    startAngle: 0,
    accumulated: 0,
    startCursorX: 0,
    startCursorY: 0,
    prevCursorX: 0,
    prevCursorY: 0,
    lastCommandAt: 0,
    tangentX: 1,
    tangentY: 0,
  };
}

export interface JointMeta {
  readonly name: string;
  readonly lower: number;
  readonly upper: number;
}

export interface JointGrabStartOptions {
  readonly handleId: string;
  readonly jointName: string;
  readonly currentAngle: number;
  readonly cursorX: number;
  readonly cursorY: number;
  readonly tangentX: number;
  readonly tangentY: number;
  readonly now: number;
}

export function startJointGrab(opts: JointGrabStartOptions): JointGrabState {
  return {
    active: true,
    jointName: opts.jointName,
    handleId: opts.handleId,
    startAngle: opts.currentAngle,
    accumulated: 0,
    startCursorX: opts.cursorX,
    startCursorY: opts.cursorY,
    prevCursorX: opts.cursorX,
    prevCursorY: opts.cursorY,
    lastCommandAt: opts.now,
    tangentX: opts.tangentX,
    tangentY: opts.tangentY,
  };
}

export interface JointGrabTickOptions {
  readonly cursorX: number;
  readonly cursorY: number;
  readonly now: number;
  readonly speedMode: SpeedMode;
  readonly jointMeta: readonly JointMeta[];
  readonly submit: (cmd: unknown) => SubmitResult | undefined;
  readonly minInterval?: number;
  readonly deadZone?: number;
}

export function tickJointGrab(
  state: JointGrabState,
  opts: JointGrabTickOptions,
): JointGrabState {
  if (!state.active || !state.jointName) return state;

  const minInterval = opts.minInterval ?? MIN_COMMAND_INTERVAL_MS;
  const deadZone = opts.deadZone ?? JOINT_DEAD_ZONE_RAD;
  const sensitivity = JOINT_SENSITIVITY[opts.speedMode];

  const elapsed = opts.now - state.lastCommandAt;
  if (elapsed < minInterval) return { ...state, prevCursorX: opts.cursorX, prevCursorY: opts.cursorY };

  const dragX = opts.cursorX - state.prevCursorX;
  const dragY = opts.cursorY - state.prevCursorY;
  const signedPixels = dragX * state.tangentX + dragY * state.tangentY;
  const deltaAngle = signedPixels * sensitivity;

  if (Math.abs(deltaAngle) < deadZone) {
    return { ...state, prevCursorX: opts.cursorX, prevCursorY: opts.cursorY };
  }

  const meta = opts.jointMeta.find((j) => j.name === state.jointName);
  if (!meta) return state;

  const candidate = state.startAngle + state.accumulated + deltaAngle;
  const target = Math.max(meta.lower, Math.min(meta.upper, candidate));

  opts.submit({
    type: 'move_joints',
    source: 'finger',
    joints: { [state.jointName]: target },
  });

  return {
    ...state,
    accumulated: state.accumulated + deltaAngle,
    prevCursorX: opts.cursorX,
    prevCursorY: opts.cursorY,
    lastCommandAt: opts.now,
  };
}

export function endJointGrab(
  state: JointGrabState,
  submit: (cmd: unknown) => SubmitResult | undefined,
  runtimeState: string,
  activeSource: string | null,
): JointGrabState {
  if (!state.active) return state;
  // Issue guarded stop only if we own the executing trajectory
  if (runtimeState === 'EXECUTING' && (activeSource === null || activeSource === 'finger')) {
    submit({ type: 'stop', source: 'system' });
  }
  return createJointGrabState();
}

/** Compute a camera-aware tangent for a joint in screen space. */
export function computeJointTangent(
  handle: FingerHandleProjection,
): readonly [number, number] {
  // Use the pre-computed screenTangent from FK projection
  const [tx, ty] = handle.screenTangent;
  const len = Math.hypot(tx, ty);
  if (len < 1e-6) return [1, 0];
  return [tx / len, ty / len];
}

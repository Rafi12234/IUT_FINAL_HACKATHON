/**
 * TCP grab controller — incremental camera-relative Cartesian motion.
 */

import { MIN_COMMAND_INTERVAL_MS, TCP_DEPTH_SCALE, TCP_HORIZONTAL_SCALE, TCP_MAX_DELTA_M, TCP_VERTICAL_SCALE } from './fingerConfig';
import type { CameraBasis, FingerCalibration, SpeedMode } from './fingerTypes';
import type { SubmitResult } from '../runtime/RuntimeController';

export interface TcpGrabState {
  readonly active: boolean;
  readonly prevX: number;
  readonly prevY: number;
  readonly prevPalmSize: number;
  readonly lastCommandAt: number;
  readonly toolAxis: readonly [number, number, number];
  readonly cameraBasis: CameraBasis;
}

export function createTcpGrabState(): TcpGrabState {
  return {
    active: false,
    prevX: 0,
    prevY: 0,
    prevPalmSize: 0,
    lastCommandAt: 0,
    toolAxis: [0, 0, -1],
    cameraBasis: { right: [1, 0, 0], up: [0, 0, 1], forward: [0, 1, 0] },
  };
}

export interface TcpGrabStartOptions {
  readonly indexTipX: number;
  readonly indexTipY: number;
  readonly palmSize: number;
  readonly toolAxis: readonly [number, number, number];
  readonly cameraBasis: CameraBasis;
  readonly now: number;
}

export function startTcpGrab(opts: TcpGrabStartOptions): TcpGrabState {
  return {
    active: true,
    prevX: opts.indexTipX,
    prevY: opts.indexTipY,
    prevPalmSize: opts.palmSize,
    lastCommandAt: opts.now,
    toolAxis: opts.toolAxis,
    cameraBasis: opts.cameraBasis,
  };
}

export interface TcpGrabTickOptions {
  readonly indexTipX: number;
  readonly indexTipY: number;
  readonly palmSize: number;
  readonly mirrored: boolean;
  readonly speedMode: SpeedMode;
  readonly calibration: FingerCalibration | null;
  readonly now: number;
  readonly submit: (cmd: unknown) => SubmitResult | undefined;
  readonly minInterval?: number;
}

function clamp(v: number, max: number): number {
  return Math.max(-max, Math.min(max, v));
}

export function tickTcpGrab(
  state: TcpGrabState,
  opts: TcpGrabTickOptions,
): TcpGrabState {
  if (!state.active) return state;

  const minInterval = opts.minInterval ?? MIN_COMMAND_INTERVAL_MS;
  const elapsed = opts.now - state.lastCommandAt;
  if (elapsed < minInterval) return state;

  const maxDelta = TCP_MAX_DELTA_M[opts.speedMode];
  const mirror = opts.mirrored ? -1 : 1;

  // Image-space deltas (normalized coords)
  const imageDx = (opts.indexTipX - state.prevX) * mirror;
  const imageDy = -(opts.indexTipY - state.prevY); // invert Y: up in image = up in world

  // Depth from palm-size change
  let depthDelta = 0;
  if (opts.calibration) {
    const palmDelta = opts.palmSize - state.prevPalmSize;
    depthDelta = palmDelta * TCP_DEPTH_SCALE * opts.calibration.depthSensitivity;
    depthDelta = clamp(depthDelta, maxDelta);
  }

  const hScale = TCP_HORIZONTAL_SCALE * (opts.calibration?.horizontalSensitivity ?? 1);
  const vScale = TCP_VERTICAL_SCALE * (opts.calibration?.verticalSensitivity ?? 1);

  const hMove = clamp(imageDx * hScale, maxDelta);
  const vMove = clamp(imageDy * vScale, maxDelta);

  const { right, up, forward } = state.cameraBasis;

  // Combine into base-frame delta
  const dx = right[0] * hMove + up[0] * vMove + forward[0] * depthDelta;
  const dy = right[1] * hMove + up[1] * vMove + forward[1] * depthDelta;
  const dz = right[2] * hMove + up[2] * vMove + forward[2] * depthDelta;

  // Skip near-zero commands
  if (Math.hypot(dx, dy, dz) < 1e-5) {
    return { ...state, prevX: opts.indexTipX, prevY: opts.indexTipY, prevPalmSize: opts.palmSize };
  }

  // Clamp total magnitude
  const mag = Math.hypot(dx, dy, dz);
  const scale = mag > maxDelta ? maxDelta / mag : 1;

  opts.submit({
    type: 'cartesian_jog',
    source: 'finger',
    delta: [dx * scale, dy * scale, dz * scale] as [number, number, number],
    approachAxis: state.toolAxis,
  });

  return {
    ...state,
    prevX: opts.indexTipX,
    prevY: opts.indexTipY,
    prevPalmSize: opts.palmSize,
    lastCommandAt: opts.now,
  };
}

export function endTcpGrab(
  state: TcpGrabState,
  submit: (cmd: unknown) => SubmitResult | undefined,
  runtimeState: string,
  activeSource: string | null,
): TcpGrabState {
  if (!state.active) return state;
  if (runtimeState === 'EXECUTING' && (activeSource === null || activeSource === 'finger')) {
    submit({ type: 'stop', source: 'system' });
  }
  return createTcpGrabState();
}

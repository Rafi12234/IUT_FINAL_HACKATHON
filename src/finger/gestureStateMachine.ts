/**
 * Gesture state machine — explicit FSM for finger teleoperation.
 * No React, no DOM. Pure state transitions driven by the engine.
 */

import type { GestureState } from './fingerTypes';

export type GestureEvent =
  | 'camera_started'
  | 'model_ready'
  | 'hand_detected'
  | 'hand_lost'
  | 'near_joint'
  | 'near_tcp'
  | 'left_handle'
  | 'dominant_pinch'
  | 'nondominant_pinch'
  | 'pinch_released'
  | 'nondominant_released'
  | 'tracking_timeout'
  | 'error'
  | 'reset';

type Transition = { [E in GestureEvent]?: GestureState };

const TRANSITIONS: Record<GestureState, Transition> = {
  idle: {
    camera_started: 'idle',
    model_ready: 'searching',
    reset: 'idle',
  },
  searching: {
    hand_detected: 'tracking',
    error: 'idle',
    reset: 'searching',
  },
  tracking: {
    near_joint: 'hovering_joint',
    near_tcp: 'hovering_tcp',
    hand_lost: 'tracking_lost',
    nondominant_pinch: 'holding_joint',
    error: 'idle',
    reset: 'searching',
  },
  hovering_joint: {
    dominant_pinch: 'grabbing_joint',
    left_handle: 'tracking',
    hand_lost: 'tracking_lost',
    near_tcp: 'hovering_tcp',
    reset: 'searching',
  },
  hovering_tcp: {
    dominant_pinch: 'grabbing_tcp',
    left_handle: 'tracking',
    hand_lost: 'tracking_lost',
    near_joint: 'hovering_joint',
    reset: 'searching',
  },
  grabbing_joint: {
    pinch_released: 'tracking',
    hand_lost: 'tracking_lost',
    error: 'tracking',
    reset: 'searching',
  },
  grabbing_tcp: {
    pinch_released: 'tracking',
    hand_lost: 'tracking_lost',
    error: 'tracking',
    reset: 'searching',
  },
  holding_joint: {
    nondominant_released: 'tracking',
    near_joint: 'hovering_joint',
    near_tcp: 'hovering_tcp',
    hand_lost: 'tracking_lost',
    reset: 'searching',
  },
  tracking_lost: {
    hand_detected: 'tracking',
    tracking_timeout: 'searching',
    reset: 'searching',
    error: 'idle',
  },
};

export interface GestureMachineState {
  readonly current: GestureState;
  readonly enteredAt: number;
}

export function createGestureMachine(now: number): GestureMachineState {
  return { current: 'idle', enteredAt: now };
}

export function transitionGesture(
  state: GestureMachineState,
  event: GestureEvent,
  now: number,
): GestureMachineState {
  const next = TRANSITIONS[state.current]?.[event];
  if (!next || next === state.current) return state;
  return { current: next, enteredAt: now };
}

/** True when the dominant hand may be commanding motion. */
export function isActiveGrab(state: GestureState): boolean {
  return state === 'grabbing_joint' || state === 'grabbing_tcp';
}

/** True when any motion should immediately stop. */
export function requiresImmediateStop(from: GestureState, to: GestureState): boolean {
  return isActiveGrab(from) && !isActiveGrab(to);
}

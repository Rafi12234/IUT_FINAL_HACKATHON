import { describe, it, expect } from 'vitest';
import {
  createGestureMachine,
  transitionGesture,
  isActiveGrab,
  requiresImmediateStop,
} from './gestureStateMachine';

describe('transitionGesture', () => {
  it('starts in idle', () => {
    const m = createGestureMachine(0);
    expect(m.current).toBe('idle');
  });

  it('idle → searching on model_ready', () => {
    const m = createGestureMachine(0);
    expect(transitionGesture(m, 'model_ready', 10).current).toBe('searching');
  });

  it('searching → tracking on hand_detected', () => {
    let m = createGestureMachine(0);
    m = transitionGesture(m, 'model_ready', 10);
    m = transitionGesture(m, 'hand_detected', 20);
    expect(m.current).toBe('tracking');
  });

  it('tracking → hovering_joint on near_joint', () => {
    let m = createGestureMachine(0);
    m = transitionGesture(m, 'model_ready', 10);
    m = transitionGesture(m, 'hand_detected', 20);
    m = transitionGesture(m, 'near_joint', 30);
    expect(m.current).toBe('hovering_joint');
  });

  it('hovering_joint → grabbing_joint on dominant_pinch', () => {
    let m = createGestureMachine(0);
    m = transitionGesture(m, 'model_ready', 10);
    m = transitionGesture(m, 'hand_detected', 20);
    m = transitionGesture(m, 'near_joint', 30);
    m = transitionGesture(m, 'dominant_pinch', 40);
    expect(m.current).toBe('grabbing_joint');
  });

  it('grabbing_joint → tracking on pinch_released', () => {
    let m = createGestureMachine(0);
    m = transitionGesture(m, 'model_ready', 10);
    m = transitionGesture(m, 'hand_detected', 20);
    m = transitionGesture(m, 'near_joint', 30);
    m = transitionGesture(m, 'dominant_pinch', 40);
    m = transitionGesture(m, 'pinch_released', 50);
    expect(m.current).toBe('tracking');
  });

  it('any state → searching on reset', () => {
    let m = createGestureMachine(0);
    m = transitionGesture(m, 'model_ready', 10);
    m = transitionGesture(m, 'hand_detected', 20);
    m = transitionGesture(m, 'near_joint', 30);
    m = transitionGesture(m, 'reset', 40);
    expect(m.current).toBe('searching');
  });

  it('records enteredAt timestamp for new states', () => {
    const m = createGestureMachine(0);
    const next = transitionGesture(m, 'model_ready', 999);
    expect(next.enteredAt).toBe(999);
  });

  it('ignores unknown transitions (stays in current state)', () => {
    const m = createGestureMachine(0); // idle
    // 'near_joint' is not defined for idle
    const next = transitionGesture(m, 'near_joint', 10);
    expect(next.current).toBe('idle');
  });

  it('tracking → tracking_lost on hand_lost', () => {
    let m = createGestureMachine(0);
    m = transitionGesture(m, 'model_ready', 10);
    m = transitionGesture(m, 'hand_detected', 20);
    m = transitionGesture(m, 'hand_lost', 30);
    expect(m.current).toBe('tracking_lost');
  });
});

describe('isActiveGrab', () => {
  it('grabbing_joint is active', () => expect(isActiveGrab('grabbing_joint')).toBe(true));
  it('grabbing_tcp is active', () => expect(isActiveGrab('grabbing_tcp')).toBe(true));
  it('tracking is not active', () => expect(isActiveGrab('tracking')).toBe(false));
  it('hovering_joint is not active', () => expect(isActiveGrab('hovering_joint')).toBe(false));
});

describe('requiresImmediateStop', () => {
  it('grabbing → tracking requires stop', () => {
    expect(requiresImmediateStop('grabbing_joint', 'tracking')).toBe(true);
  });
  it('tracking → tracking_lost does not require stop', () => {
    expect(requiresImmediateStop('tracking', 'tracking_lost')).toBe(false);
  });
  it('grabbing_tcp → tracking_lost requires stop', () => {
    expect(requiresImmediateStop('grabbing_tcp', 'tracking_lost')).toBe(true);
  });
});

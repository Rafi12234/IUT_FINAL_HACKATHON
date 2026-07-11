/**
 * FingerControlEngine — framework-independent core that orchestrates:
 * hand identity, filtering, pinch detection, gesture FSM, handle selection,
 * joint/TCP grab controllers, two-hand hold, rate-limited command emission.
 *
 * Never touches the DOM, URDF, or React. Receives deps via constructor options.
 */

import {
  IDENTITY_FULL_RESET_MS,
  LM_INDEX_MCP,
  LM_INDEX_TIP,
  LM_PINKY_MCP,
  MIN_STORE_UPDATE_INTERVAL_MS,
  TRACKING_LOSS_STOP_MS,
} from './fingerConfig';
import type {
  CameraBasis,
  FingerEngineSnapshot,
  FingerHandleProjection,
  Handedness,
  SpeedMode,
  TrackedHand,
} from './fingerTypes';
import { HandFilterBank } from './handFilters';
import { HandIdentityTracker } from './handIdentity';
import { PinchDetector } from './pinchDetector';
import {
  createGestureMachine,
  requiresImmediateStop,
  transitionGesture,
} from './gestureStateMachine';
import { createHandleSelectionState, selectHandle } from './handleSelection';
import type { HandleSelectionState } from './handleSelection';
import {
  computeJointTangent,
  createJointGrabState,
  endJointGrab,
  startJointGrab,
  tickJointGrab,
} from './jointGrabController';
import type { JointGrabState } from './jointGrabController';
import { createTcpGrabState, endTcpGrab, startTcpGrab, tickTcpGrab } from './tcpGrabController';
import type { TcpGrabState } from './tcpGrabController';
import type { FingerCalibration } from './fingerTypes';
import type { SubmitResult } from '../runtime/RuntimeController';
import type { KinematicChain } from '../kinematics/chainTypes';
import type { JointMeta } from '../robot/RobotModelAdapter';
import type { Vec3Tuple } from '../scene/coordinates';

type Vec3 = readonly [number, number, number];

export interface FingerControlEngineOptions {
  submit: (command: unknown) => SubmitResult | undefined;
  getRuntimeSnapshot: () => { state: string; activeCommand: { source: string } | null } | null;
  getRobotState: () => {
    chain: KinematicChain | null;
    jointMeta: JointMeta[];
    toolAxis: Vec3Tuple | null;
  };
  getHandleProjections: () => readonly FingerHandleProjection[];
  getCameraBasis: () => CameraBasis | null;
  publish: (snapshot: FingerEngineSnapshot) => void;
}

interface PerHandState {
  filterBank: HandFilterBank;
  pinchDetector: PinchDetector;
  selectionState: HandleSelectionState;
  lastSeenAt: number;
}

export class FingerControlEngine {
  private readonly opts: FingerControlEngineOptions;
  private handStates = new Map<string, PerHandState>();
  private identity = new HandIdentityTracker();
  private gestureMachine = createGestureMachine(performance.now());
  private jointGrab: JointGrabState = createJointGrabState();
  private tcpGrab: TcpGrabState = createTcpGrabState();
  private heldJoints: Record<string, number> = {};
  private hoveredHandleId: string | null = null;
  private lastPublishAt = 0;
  private commandCount = 0;
  private commandCountWindowStart = 0;
  private commandRate = 0;
  private lastRejection: string | null = null;
  private lastError: string | null = null;
  private workerReady = false;
  private usingFallback = false;
  private inferenceFps = 0;
  private inferenceMs = 0;
  private inferenceTimestamps: number[] = [];

  // Settings (updated from store)
  dominantHand: Handedness = 'Right';
  speedMode: SpeedMode = 'normal';
  mode: 'joint' | 'tcp' = 'joint';
  mirrored = false;
  calibration: FingerCalibration | null = null;
  cameraEnabled = false;

  constructor(opts: FingerControlEngineOptions) {
    this.opts = opts;
  }

  onWorkerReady(usingFallback: boolean): void {
    this.workerReady = true;
    this.usingFallback = usingFallback;
  }

  onWorkerError(message: string, fatal: boolean): void {
    if (fatal) {
      this.lastError = message;
      this.workerReady = false;
      this.safeStop();
      this.publishSnapshot([]);
    }
    // Non-fatal errors (e.g. not_initialized during model load) are silently dropped.
  }

  onInferenceResult(hands: TrackedHand[], inferenceMs: number, now: number): void {
    this.inferenceMs = inferenceMs;

    // Track inference FPS over a 2s window
    this.inferenceTimestamps = this.inferenceTimestamps.filter(t => now - t < 2000);
    this.inferenceTimestamps.push(now);
    this.inferenceFps = this.inferenceTimestamps.length / 2;

    const identified = this.identity.update(
      hands.map(h => ({
        handedness: h.handedness,
        handednessScore: h.handednessScore,
        landmarks: h.landmarks,
        worldLandmarks: h.worldLandmarks,
      })),
      now,
    );

    // Manage per-hand state
    for (const hand of identified) {
      if (!this.handStates.has(hand.trackingId)) {
        this.handStates.set(hand.trackingId, {
          filterBank: new HandFilterBank(),
          pinchDetector: new PinchDetector(),
          selectionState: createHandleSelectionState(),
          lastSeenAt: now,
        });
      }
      this.handStates.get(hand.trackingId)!.lastSeenAt = now;
    }

    // Expire lost hands
    const activeIds = new Set(identified.map(h => h.trackingId));
    for (const [id, hs] of this.handStates) {
      if (!activeIds.has(id) && now - hs.lastSeenAt > IDENTITY_FULL_RESET_MS) {
        this.handStates.delete(id);
      }
    }

    // Apply filters
    const filteredHands: TrackedHand[] = identified.map(hand => {
      const hs = this.handStates.get(hand.trackingId)!;
      const filtered = hs.filterBank.filter(hand.landmarks as NormalizedLandmark[], now);
      return { ...hand, landmarks: filtered };
    });

    this.processHands(filteredHands, now);
  }

  private processHands(hands: TrackedHand[], now: number): void {
    const rts = this.opts.getRuntimeSnapshot();
    const handles = this.opts.getHandleProjections();
    const robot = this.opts.getRobotState();

    const dominant = hands.find(h => h.handedness === this.dominantHand) ?? null;
    const nonDominant = hands.find(h => h.handedness !== this.dominantHand) ?? null;

    const prevGestureState = this.gestureMachine.current;

    // Tracking loss check
    if (hands.length === 0) {
      const wasTracking = this.gestureMachine.current !== 'searching' && this.gestureMachine.current !== 'idle';
      if (wasTracking) {
        this.gestureMachine = transitionGesture(this.gestureMachine, 'hand_lost', now);
        if (requiresImmediateStop(prevGestureState, this.gestureMachine.current)) {
          this.safeStop();
        }
        setTimeout(() => {
          if (this.gestureMachine.current === 'tracking_lost') {
            this.gestureMachine = transitionGesture(this.gestureMachine, 'tracking_timeout', now);
            this.jointGrab = createJointGrabState();
            this.tcpGrab = createTcpGrabState();
          }
        }, TRACKING_LOSS_STOP_MS);
      }
      this.publishSnapshot(hands);
      return;
    }

    // Hand detected
    if (this.gestureMachine.current === 'searching' || this.gestureMachine.current === 'tracking_lost') {
      this.gestureMachine = transitionGesture(this.gestureMachine, 'hand_detected', now);
    }

    // Non-dominant pinch → hold
    if (nonDominant) {
      const nhState = this.handStates.get(nonDominant.trackingId);
      if (nhState) {
        const pinch = nhState.pinchDetector.update(nonDominant.landmarks, nonDominant.handednessScore, now);
        if (pinch.active && this.gestureMachine.current === 'tracking') {
          // Find nearest handle to non-dominant cursor
          const ndTipX = (nonDominant.landmarks[LM_INDEX_TIP]?.x ?? 0.5);
          const ndTipY = (nonDominant.landmarks[LM_INDEX_TIP]?.y ?? 0.5);
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const { id } = selectHandle(ndTipX * vw, ndTipY * vh, handles, nhState.selectionState, new Set(Object.keys(this.heldJoints)));
          if (id) {
            const proj = handles.find(h => h.id === id);
            if (proj?.jointName) {
              const currentAngle = rts?.activeCommand ? 0 : 0; // use current joint value
              this.heldJoints[proj.jointName] = currentAngle;
              this.gestureMachine = transitionGesture(this.gestureMachine, 'nondominant_pinch', now);
            }
          }
        } else if (!pinch.active && Object.keys(this.heldJoints).length > 0) {
          this.heldJoints = {};
          this.gestureMachine = transitionGesture(this.gestureMachine, 'nondominant_released', now);
        }
      }
    }

    // Dominant hand processing
    if (dominant) {
      const hs = this.handStates.get(dominant.trackingId);
      if (hs) {
        const pinch = hs.pinchDetector.update(dominant.landmarks, dominant.handednessScore, now);

        const tipX = this.mirrored
          ? (1 - (dominant.landmarks[LM_INDEX_TIP]?.x ?? 0)) * window.innerWidth
          : (dominant.landmarks[LM_INDEX_TIP]?.x ?? 0) * window.innerWidth;
        const tipY = (dominant.landmarks[LM_INDEX_TIP]?.y ?? 0) * window.innerHeight;

        const blockedIds = new Set(Object.keys(this.heldJoints).map(j => `joint:${j}`));
        const { id: hovered, nextState } = selectHandle(tipX, tipY, handles, hs.selectionState, blockedIds);
        hs.selectionState = nextState;
        this.hoveredHandleId = hovered;

        // Gesture transitions
        if (hovered) {
          const proj = handles.find(h => h.id === hovered);
          if (proj?.kind === 'joint' && this.gestureMachine.current === 'tracking') {
            this.gestureMachine = transitionGesture(this.gestureMachine, 'near_joint', now);
          } else if (proj?.kind === 'tcp' && this.gestureMachine.current === 'tracking') {
            this.gestureMachine = transitionGesture(this.gestureMachine, 'near_tcp', now);
          }
        } else if (this.gestureMachine.current === 'hovering_joint' || this.gestureMachine.current === 'hovering_tcp') {
          this.gestureMachine = transitionGesture(this.gestureMachine, 'left_handle', now);
        }

        // Pinch start → grab
        if (pinch.active && hovered &&
          (this.gestureMachine.current === 'hovering_joint' || this.gestureMachine.current === 'hovering_tcp')) {
          const proj = handles.find(h => h.id === hovered);
          if (proj?.kind === 'joint' && proj.jointName && this.mode === 'joint') {
            const [tx, ty] = computeJointTangent(proj);
            const currentAngle = rts ? 0 : 0; // runtime will have actual value
            this.jointGrab = startJointGrab({
              handleId: hovered,
              jointName: proj.jointName,
              currentAngle,
              cursorX: tipX,
              cursorY: tipY,
              tangentX: tx,
              tangentY: ty,
              now,
            });
            this.gestureMachine = transitionGesture(this.gestureMachine, 'dominant_pinch', now);
          } else if (proj?.kind === 'tcp') {
            const palmSize = this.palmSize(dominant.landmarks);
            const basis = this.opts.getCameraBasis() ?? { right: [1,0,0] as Vec3, up: [0,0,1] as Vec3, forward: [0,1,0] as Vec3 };
            this.tcpGrab = startTcpGrab({
              indexTipX: dominant.landmarks[LM_INDEX_TIP]?.x ?? 0.5,
              indexTipY: dominant.landmarks[LM_INDEX_TIP]?.y ?? 0.5,
              palmSize,
              toolAxis: robot.toolAxis ?? [0, 0, -1],
              cameraBasis: basis,
              now,
            });
            this.gestureMachine = transitionGesture(this.gestureMachine, 'dominant_pinch', now);
          }
        }

        // Active grab ticking
        if (this.gestureMachine.current === 'grabbing_joint' && this.jointGrab.active) {
          if (pinch.active) {
            this.jointGrab = tickJointGrab(this.jointGrab, {
              cursorX: tipX,
              cursorY: tipY,
              now,
              speedMode: this.speedMode,
              jointMeta: robot.jointMeta,
              submit: this.wrappedSubmit,
            });
          } else {
            const state = rts?.state ?? '';
            const source = rts?.activeCommand?.source ?? null;
            this.jointGrab = endJointGrab(this.jointGrab, this.opts.submit, state, source);
            this.gestureMachine = transitionGesture(this.gestureMachine, 'pinch_released', now);
          }
        }

        if (this.gestureMachine.current === 'grabbing_tcp' && this.tcpGrab.active) {
          if (pinch.active) {
            this.tcpGrab = tickTcpGrab(this.tcpGrab, {
              indexTipX: dominant.landmarks[LM_INDEX_TIP]?.x ?? 0.5,
              indexTipY: dominant.landmarks[LM_INDEX_TIP]?.y ?? 0.5,
              palmSize: this.palmSize(dominant.landmarks),
              mirrored: this.mirrored,
              speedMode: this.speedMode,
              calibration: this.calibration,
              now,
              submit: this.wrappedSubmit,
            });
          } else {
            const state = rts?.state ?? '';
            const source = rts?.activeCommand?.source ?? null;
            this.tcpGrab = endTcpGrab(this.tcpGrab, this.opts.submit, state, source);
            this.gestureMachine = transitionGesture(this.gestureMachine, 'pinch_released', now);
          }
        }
      }
    }

    this.publishSnapshot(hands);
  }

  private palmSize(landmarks: readonly NormalizedLandmark[]): number {
    const a = landmarks[LM_INDEX_MCP];
    const b = landmarks[LM_PINKY_MCP];
    if (!a || !b) return 0.3;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private wrappedSubmit = (cmd: unknown): SubmitResult | undefined => {
    const result = this.opts.submit(cmd);
    if (result && !result.accepted) {
      this.lastRejection = result.reason ?? 'Rejected';
    }
    const now = performance.now();
    this.commandCount++;
    if (now - this.commandCountWindowStart > 1000) {
      this.commandRate = this.commandCount;
      this.commandCount = 0;
      this.commandCountWindowStart = now;
    }
    return result;
  };

  private safeStop(): void {
    const rts = this.opts.getRuntimeSnapshot();
    if (
      rts?.state === 'EXECUTING' &&
      (rts.activeCommand?.source === null || rts.activeCommand?.source === 'finger')
    ) {
      this.opts.submit({ type: 'stop', source: 'system' });
    }
    this.jointGrab = createJointGrabState();
    this.tcpGrab = createTcpGrabState();
  }

  private publishSnapshot(hands: readonly TrackedHand[]): void {
    const now = performance.now();
    if (now - this.lastPublishAt < MIN_STORE_UPDATE_INTERVAL_MS) return;
    this.lastPublishAt = now;

    const snapshot: FingerEngineSnapshot = {
      trackingStatus: this.cameraEnabled
        ? hands.length > 0 ? 'tracking' : this.workerReady ? 'ready' : 'loading_model'
        : 'off',
      gestureState: this.gestureMachine.current,
      hands,
      hoveredHandleId: this.hoveredHandleId,
      grabbedHandleId: this.jointGrab.active
        ? this.jointGrab.handleId
        : this.tcpGrab.active ? 'tcp:stylus_tip' : null,
      heldJoints: { ...this.heldJoints },
      inferenceFps: this.inferenceFps,
      inferenceMs: this.inferenceMs,
      commandRate: this.commandRate,
      lastRejection: this.lastRejection,
      lastError: this.lastError,
      workerReady: this.workerReady,
      usingFallbackInference: this.usingFallback,
    };

    this.opts.publish(snapshot);
  }

  dispose(): void {
    this.safeStop();
    this.handStates.clear();
    this.identity.reset();
    this.heldJoints = {};
  }
}

// Re-export for worker type narrowing
type NormalizedLandmark = { x: number; y: number; z: number; visibility?: number };

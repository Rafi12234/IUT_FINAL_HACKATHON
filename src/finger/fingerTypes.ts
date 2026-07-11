/**
 * Finger teleoperation data contracts.
 *
 * All types here are plain serializable values (no Three.js, no DOM). They can
 * be safely structured-cloned and sent across Web Worker boundaries.
 */

export type FingerControlMode = 'joint' | 'tcp';

export type FingerTrackingStatus =
  | 'off'
  | 'starting_camera'
  | 'loading_model'
  | 'ready'
  | 'tracking'
  | 'degraded'
  | 'error';

export type GestureState =
  | 'idle'
  | 'searching'
  | 'tracking'
  | 'hovering_joint'
  | 'hovering_tcp'
  | 'grabbing_joint'
  | 'grabbing_tcp'
  | 'holding_joint'
  | 'tracking_lost';


export type Handedness = 'Left' | 'Right';

export type SpeedMode = 'precision' | 'normal' | 'fast';

export interface NormalizedLandmark {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly visibility?: number;
}

export interface TrackedHand {
  readonly trackingId: string;
  readonly handedness: Handedness;
  readonly handednessScore: number;
  readonly landmarks: readonly NormalizedLandmark[];
  readonly worldLandmarks: readonly NormalizedLandmark[];
  readonly timestamp: number;
}

export interface FingerHandleProjection {
  readonly id: string;
  readonly kind: 'joint' | 'tcp';
  readonly jointName?: string;
  readonly worldPosition: readonly [number, number, number];
  readonly screenPosition: readonly [number, number];
  /** Normalized 2D tangent direction in screen space for joint rotation drag. */
  readonly screenTangent: readonly [number, number];
  readonly visible: boolean;
  readonly distanceFromCamera: number;
}

export interface PinchState {
  readonly active: boolean;
  readonly ratio: number;
  readonly startedAt: number | null;
  readonly stableFrames: number;
}

export interface FingerCalibration {
  readonly version: number;
  readonly deviceId: string | null;
  readonly dominantHand: Handedness;
  readonly mirrored: boolean;
  readonly neutralPalmSize: number;
  readonly nearPalmSize: number;
  readonly farPalmSize: number;
  readonly horizontalSensitivity: number;
  readonly verticalSensitivity: number;
  readonly depthSensitivity: number;
}

export interface CameraBasis {
  /** Unit vector pointing camera-right in the robot base frame. */
  readonly right: readonly [number, number, number];
  /** Unit vector pointing camera-up in the robot base frame. */
  readonly up: readonly [number, number, number];
  /** Unit vector pointing camera-forward in the robot base frame. */
  readonly forward: readonly [number, number, number];
}

/** Summary snapshot published from FingerControlEngine to the UI store. */
export interface FingerEngineSnapshot {
  readonly trackingStatus: FingerTrackingStatus;
  readonly gestureState: GestureState;
  readonly hands: readonly TrackedHand[];
  readonly hoveredHandleId: string | null;
  readonly grabbedHandleId: string | null;
  readonly heldJoints: Readonly<Record<string, number>>;
  readonly inferenceFps: number;
  readonly inferenceMs: number;
  readonly commandRate: number;
  readonly lastRejection: string | null;
  readonly lastError: string | null;
  readonly workerReady: boolean;
  readonly usingFallbackInference: boolean;
}

/**
 * Finger teleoperation Zustand store.
 * Separate from robotStore and runtimeStore — UI-only concern.
 */

import { create } from 'zustand';
import type {
  FingerCalibration,
  FingerControlMode,
  FingerEngineSnapshot,
  FingerHandleProjection,
  FingerTrackingStatus,
  GestureState,
  Handedness,
  SpeedMode,
  TrackedHand,
} from './fingerTypes';

interface FingerStoreState {
  // Engine snapshot fields
  trackingStatus: FingerTrackingStatus;
  gestureState: GestureState;
  hands: readonly TrackedHand[];
  hoveredHandleId: string | null;
  grabbedHandleId: string | null;
  heldJoints: Readonly<Record<string, number>>;
  inferenceFps: number;
  inferenceMs: number;
  commandRate: number;
  lastRejection: string | null;
  lastError: string | null;
  workerReady: boolean;
  usingFallbackInference: boolean;

  // UI settings
  cameraEnabled: boolean;
  mode: FingerControlMode;
  speedMode: SpeedMode;
  dominantHand: Handedness;
  mirrored: boolean;

  // 3D handle projections from FingerJointHandles
  handleProjections: readonly FingerHandleProjection[];

  // Calibration
  calibration: FingerCalibration | null;

  // Actions
  applySnapshot: (snap: FingerEngineSnapshot) => void;
  setCameraEnabled: (v: boolean) => void;
  setMode: (mode: FingerControlMode) => void;
  setSpeedMode: (mode: SpeedMode) => void;
  setDominantHand: (hand: Handedness) => void;
  setMirrored: (v: boolean) => void;
  setHandleProjections: (projections: readonly FingerHandleProjection[]) => void;
  setCalibration: (cal: FingerCalibration | null) => void;
  setTrackingStatus: (status: FingerTrackingStatus, error?: string) => void;
}

export const useFingerStore = create<FingerStoreState>((set) => ({
  trackingStatus: 'off',
  gestureState: 'idle',
  hands: [],
  hoveredHandleId: null,
  grabbedHandleId: null,
  heldJoints: {},
  inferenceFps: 0,
  inferenceMs: 0,
  commandRate: 0,
  lastRejection: null,
  lastError: null,
  workerReady: false,
  usingFallbackInference: false,

  cameraEnabled: false,
  mode: 'joint',
  speedMode: 'normal',
  dominantHand: 'Right',
  mirrored: false,

  handleProjections: [],
  calibration: null,

  applySnapshot: (snap) => set({ ...snap }),

  setCameraEnabled: (cameraEnabled) => set({ cameraEnabled }),
  setMode: (mode) => set({ mode }),
  setSpeedMode: (speedMode) => set({ speedMode }),
  setDominantHand: (dominantHand) => set({ dominantHand }),
  setMirrored: (mirrored) => set({ mirrored }),
  setHandleProjections: (handleProjections) => set({ handleProjections }),
  setCalibration: (calibration) => set({ calibration }),
  setTrackingStatus: (trackingStatus, error) =>
    set({ trackingStatus, ...(error !== undefined ? { lastError: error } : {}) }),
}));

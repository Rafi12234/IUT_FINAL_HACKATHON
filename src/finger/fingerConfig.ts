/**
 * Finger teleoperation configuration constants.
 *
 * All tunable values live here. Adjust and re-test rather than hard-coding
 * in individual modules.
 */

import type { SpeedMode } from './fingerTypes';

// ---------------------------------------------------------------------------
// Pinch detection
// ---------------------------------------------------------------------------

/** Pinch starts when ratio falls below this (thumb-index / palm width). */
export const PINCH_START_RATIO = 0.28;
/** Pinch releases when ratio rises above this — hysteresis prevents toggling. */
export const PINCH_RELEASE_RATIO = 0.38;
/** Number of consecutive frames a pinch must hold before it activates. */
export const PINCH_STABLE_FRAMES_START = 3;
/** Number of consecutive frames an open hand must hold before pinch releases. */
export const PINCH_STABLE_FRAMES_RELEASE = 2;
/** Minimum handedness confidence to process tracking. */
export const MIN_HANDEDNESS_CONFIDENCE = 0.7;

// ---------------------------------------------------------------------------
// Landmark indices (MediaPipe Hand Landmarker)
// ---------------------------------------------------------------------------

export const LM_WRIST = 0;
export const LM_THUMB_TIP = 4;
export const LM_INDEX_MCP = 5;
export const LM_INDEX_TIP = 8;
export const LM_MIDDLE_MCP = 9;
export const LM_PINKY_MCP = 17;

// ---------------------------------------------------------------------------
// One Euro Filter defaults
// ---------------------------------------------------------------------------

export const ONE_EURO_MIN_CUTOFF = 1.0;
export const ONE_EURO_BETA = 0.015;
export const ONE_EURO_DCUTOFF = 1.0;

// ---------------------------------------------------------------------------
// Hand identity
// ---------------------------------------------------------------------------

/** Maximum wrist distance (normalized) to match a hand across frames. */
export const IDENTITY_MAX_MATCH_DISTANCE = 0.25;
/** Duration (ms) to preserve identity without fresh landmarks. */
export const IDENTITY_GRACE_PERIOD_MS = 100;
/** Duration (ms) after which filters and identity fully reset. */
export const IDENTITY_FULL_RESET_MS = 500;

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Maximum robot commands per second emitted by finger control. */
export const MAX_COMMAND_RATE_HZ = 15;
/** Minimum interval (ms) between submitted commands. */
export const MIN_COMMAND_INTERVAL_MS = 1000 / MAX_COMMAND_RATE_HZ;
/** Maximum store snapshot updates per second. */
export const MAX_STORE_UPDATE_HZ = 20;
export const MIN_STORE_UPDATE_INTERVAL_MS = 1000 / MAX_STORE_UPDATE_HZ;

// ---------------------------------------------------------------------------
// Tracking loss timeouts
// ---------------------------------------------------------------------------

/** Duration (ms) after which an active grab is ended on tracking loss. */
export const TRACKING_LOSS_STOP_MS = 150;

// ---------------------------------------------------------------------------
// Handle selection
// ---------------------------------------------------------------------------

/** Pixel radius around a handle centre that activates hover. */
export const HANDLE_SELECT_RADIUS_PX = 52;
/** Hysteresis: new handle must be this much closer before switching. */
export const HANDLE_HYSTERESIS_PX = 10;

// ---------------------------------------------------------------------------
// Joint grab sensitivity
// ---------------------------------------------------------------------------

/** Radians-per-effective-pixel-unit for each speed mode. */
export const JOINT_SENSITIVITY: Record<SpeedMode, number> = {
  precision: 0.0025,
  normal: 0.0060,
  fast: 0.0120,
};

/** Minimum accumulated angle change (rad) before a command is emitted. */
export const JOINT_DEAD_ZONE_RAD = 0.003;

// ---------------------------------------------------------------------------
// TCP grab sensitivity
// ---------------------------------------------------------------------------

/** Maximum Cartesian delta magnitude (m) per emitted jog command. */
export const TCP_MAX_DELTA_M: Record<SpeedMode, number> = {
  precision: 0.0015,
  normal: 0.0040,
  fast: 0.0080,
};

/** Scale factor applied to horizontal image-space motion → base-frame metres. */
export const TCP_HORIZONTAL_SCALE = 0.12;
/** Scale factor applied to vertical image-space motion → base-frame metres. */
export const TCP_VERTICAL_SCALE = 0.12;
/** Scale factor applied to palm-size delta → depth metres. */
export const TCP_DEPTH_SCALE = 0.5;

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

export const CALIBRATION_STORAGE_KEY = 'vantage_arm_finger_calibration_v1';
export const CALIBRATION_VERSION = 1;
/** Default calibration used before a guided calibration is performed. */
export const DEFAULT_CALIBRATION = {
  version: CALIBRATION_VERSION,
  deviceId: null,
  dominantHand: 'Right' as const,
  mirrored: false,
  neutralPalmSize: 0.3,
  nearPalmSize: 0.5,
  farPalmSize: 0.15,
  horizontalSensitivity: 1.0,
  verticalSensitivity: 1.0,
  depthSensitivity: 1.0,
};

// ---------------------------------------------------------------------------
// Worker / camera
// ---------------------------------------------------------------------------

/** Desired camera resolution. */
export const CAMERA_WIDTH_IDEAL = 640;
export const CAMERA_HEIGHT_IDEAL = 480;
export const CAMERA_FRAME_RATE_MAX = 30;

/** Worker asset paths (served from public/). */
export const WASM_ROOT = '/mediapipe/wasm';
export const MODEL_ASSET_PATH = '/models/hand_landmarker.task';

/** Max hands tracked simultaneously. */
export const NUM_HANDS = 2;
export const MIN_DETECTION_CONFIDENCE = 0.7;
export const MIN_PRESENCE_CONFIDENCE = 0.7;
export const MIN_TRACKING_CONFIDENCE = 0.7;

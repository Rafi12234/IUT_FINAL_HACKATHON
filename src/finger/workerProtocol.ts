/**
 * Worker ↔ main-thread message protocol for the hand-tracking vision worker.
 *
 * All types are serializable (no DOM objects, no Three.js). ImageBitmap is
 * transferred (not copied) using the structured-clone transfer list.
 */

import type { TrackedHand } from './fingerTypes';

// ---------------------------------------------------------------------------
// Requests (main thread → worker)
// ---------------------------------------------------------------------------

export interface WorkerInitRequest {
  readonly type: 'init';
  readonly wasmRoot: string;
  readonly modelAssetPath: string;
  readonly numHands: number;
  readonly minHandDetectionConfidence: number;
  readonly minHandPresenceConfidence: number;
  readonly minTrackingConfidence: number;
}

export interface WorkerFrameRequest {
  readonly type: 'frame';
  readonly frameId: number;
  readonly timestamp: number;
  /** Transferred — do NOT read after posting. */
  readonly bitmap: ImageBitmap;
}

export interface WorkerDisposeRequest {
  readonly type: 'dispose';
}

export type VisionWorkerRequest =
  | WorkerInitRequest
  | WorkerFrameRequest
  | WorkerDisposeRequest;

// ---------------------------------------------------------------------------
// Responses (worker → main thread)
// ---------------------------------------------------------------------------

export interface WorkerReadyResponse {
  readonly type: 'ready';
  readonly delegate: 'GPU' | 'CPU';
}

export interface WorkerResultResponse {
  readonly type: 'result';
  readonly frameId: number;
  readonly timestamp: number;
  readonly inferenceMs: number;
  readonly hands: TrackedHand[];
}

export interface WorkerErrorResponse {
  readonly type: 'error';
  readonly code: string;
  readonly message: string;
  readonly fatal: boolean;
}

export type VisionWorkerResponse =
  | WorkerReadyResponse
  | WorkerResultResponse
  | WorkerErrorResponse;

/**
 * HandTrackingClient — main-thread MediaPipe runner.
 *
 * MediaPipe tasks-vision calls importScripts() internally which is forbidden
 * in ES module workers. Running on the main thread is the correct approach:
 * the GPU delegate offloads the heavy compute to WebGL anyway.
 *
 * Keeps the exact same callback interface as the previous worker-based version.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark as MpLandmark } from '@mediapipe/tasks-vision';
import {
  MIN_DETECTION_CONFIDENCE,
  MIN_PRESENCE_CONFIDENCE,
  MIN_TRACKING_CONFIDENCE,
  MODEL_ASSET_PATH,
  NUM_HANDS,
  WASM_ROOT,
} from './fingerConfig';
import type { Handedness, NormalizedLandmark, TrackedHand } from './fingerTypes';

export type WorkerDelegate = 'GPU' | 'CPU';

export interface HandTrackingClientCallbacks {
  onReady: (delegate: WorkerDelegate) => void;
  onResult: (hands: TrackedHand[], frameId: number, inferenceMs: number) => void;
  onError: (code: string, message: string, fatal: boolean) => void;
}

function toLandmarks(raw: MpLandmark[]): NormalizedLandmark[] {
  return raw.map(lm => ({ x: lm.x, y: lm.y, z: lm.z }));
}

export class HandTrackingClient {
  private landmarker: HandLandmarker | null = null;
  private modelReady = false;
  private frameInFlight = false;
  private nextFrameId = 0;
  private readonly callbacks: HandTrackingClientCallbacks;

  constructor(callbacks: HandTrackingClientCallbacks) {
    this.callbacks = callbacks;
  }

  /** Asynchronously loads the model. Call once after construction. */
  start(): void {
    this.loadModel().catch((err: unknown) => {
      this.callbacks.onError(
        'init_failed',
        err instanceof Error ? err.message : String(err),
        true,
      );
    });
  }

  private async loadModel(): Promise<void> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

    const opts = {
      runningMode: 'VIDEO' as const,
      numHands: NUM_HANDS,
      minHandDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      minHandPresenceConfidence: MIN_PRESENCE_CONFIDENCE,
      minTrackingConfidence: MIN_TRACKING_CONFIDENCE,
    };

    // Try GPU first, then CPU fallback
    let delegate: WorkerDelegate = 'GPU';
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate: 'GPU' },
        ...opts,
      });
    } catch {
      delegate = 'CPU';
      this.landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate: 'CPU' },
        ...opts,
      });
    }

    this.modelReady = true;
    this.callbacks.onReady(delegate);
  }

  /**
   * Submit a video frame for inference.
   * Returns false (and closes the bitmap) if model isn't ready or busy.
   */
  submitFrame(bitmap: ImageBitmap, timestamp: number): boolean {
    if (!this.modelReady || this.frameInFlight || !this.landmarker) {
      bitmap.close();
      return false;
    }

    this.frameInFlight = true;
    const frameId = this.nextFrameId++;
    const t0 = performance.now();

    let result;
    try {
      result = this.landmarker.detectForVideo(bitmap, timestamp);
    } finally {
      bitmap.close();
      this.frameInFlight = false;
    }

    const inferenceMs = performance.now() - t0;

    const hands: TrackedHand[] = [];
    const n = result.landmarks?.length ?? 0;
    for (let i = 0; i < n; i++) {
      const handedness = result.handednesses?.[i]?.[0];
      if (!handedness) continue;
      hands.push({
        trackingId: '', // filled by HandIdentityTracker
        handedness: handedness.categoryName as Handedness,
        handednessScore: handedness.score,
        landmarks: toLandmarks(result.landmarks[i] ?? []),
        worldLandmarks: toLandmarks(result.worldLandmarks?.[i] ?? []),
        timestamp,
      });
    }

    this.callbacks.onResult(hands, frameId, inferenceMs);
    return true;
  }

  stop(): void {
    try { this.landmarker?.close(); } catch { /* ignore */ }
    this.landmarker = null;
    this.modelReady = false;
    this.frameInFlight = false;
  }

  get isReady(): boolean { return this.modelReady; }
}

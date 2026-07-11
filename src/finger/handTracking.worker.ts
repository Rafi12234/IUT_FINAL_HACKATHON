/**
 * Vision Web Worker — MediaPipe HandLandmarker inference.
 *
 * Runs in a separate module worker. Accepts ImageBitmap frames via transfer,
 * runs inference, returns TrackedHand results. GPU → CPU fallback on init.
 * One frame in-flight at a time (backpressure enforced by HandTrackingClient).
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { VisionWorkerRequest, VisionWorkerResponse } from './workerProtocol';
import type { Handedness, NormalizedLandmark, TrackedHand } from './fingerTypes';

let landmarker: HandLandmarker | null = null;
let delegate: 'GPU' | 'CPU' = 'GPU';

function post(msg: VisionWorkerResponse): void {
  self.postMessage(msg);
}

async function initLandmarker(
  wasmRoot: string,
  modelAssetPath: string,
  numHands: number,
  minHandDetectionConfidence: number,
  minHandPresenceConfidence: number,
  minTrackingConfidence: number,
): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(wasmRoot);

  const tryInit = async (d: 'GPU' | 'CPU') => {
    return HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate: d },
      runningMode: 'VIDEO',
      numHands,
      minHandDetectionConfidence,
      minHandPresenceConfidence,
      minTrackingConfidence,
    });
  };

  try {
    landmarker = await tryInit('GPU');
    delegate = 'GPU';
  } catch {
    landmarker = await tryInit('CPU');
    delegate = 'CPU';
  }

  post({ type: 'ready', delegate });
}

function toLandmarks(raw: { x: number; y: number; z: number }[]): NormalizedLandmark[] {
  return raw.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z }));
}

function processFrame(frameId: number, timestamp: number, bitmap: ImageBitmap): void {
  if (!landmarker) {
    bitmap.close();
    post({ type: 'error', code: 'not_initialized', message: 'Landmarker not ready', fatal: false });
    return;
  }

  const t0 = performance.now();
  let result;
  try {
    result = landmarker.detectForVideo(bitmap, timestamp);
  } finally {
    bitmap.close();
  }
  const inferenceMs = performance.now() - t0;

  const hands: TrackedHand[] = [];
  const n = result.landmarks?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const handedness = result.handednesses?.[i]?.[0];
    if (!handedness) continue;
    hands.push({
      trackingId: '', // filled by HandIdentityTracker on main thread
      handedness: handedness.categoryName as Handedness,
      handednessScore: handedness.score,
      landmarks: toLandmarks(result.landmarks[i] ?? []),
      worldLandmarks: toLandmarks(result.worldLandmarks?.[i] ?? []),
      timestamp,
    });
  }

  post({ type: 'result', frameId, timestamp, inferenceMs, hands });
}

self.addEventListener('message', (ev: MessageEvent<VisionWorkerRequest>) => {
  const msg = ev.data;
  switch (msg.type) {
    case 'init':
      initLandmarker(
        msg.wasmRoot,
        msg.modelAssetPath,
        msg.numHands,
        msg.minHandDetectionConfidence,
        msg.minHandPresenceConfidence,
        msg.minTrackingConfidence,
      ).catch((err: unknown) => {
        post({
          type: 'error',
          code: 'init_failed',
          message: err instanceof Error ? err.message : String(err),
          fatal: true,
        });
      });
      break;
    case 'frame':
      processFrame(msg.frameId, msg.timestamp, msg.bitmap);
      break;
    case 'dispose':
      landmarker?.close();
      landmarker = null;
      self.close();
      break;
  }
});

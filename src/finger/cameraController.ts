/**
 * Camera controller — manages webcam lifecycle outside React.
 * Produces ImageBitmap frames for the vision worker.
 * No React, no DOM creation — just HTMLVideoElement lifecycle.
 */

import { CAMERA_FRAME_RATE_MAX, CAMERA_HEIGHT_IDEAL, CAMERA_WIDTH_IDEAL } from './fingerConfig';

export type CameraErrorCode =
  | 'permission_denied'
  | 'no_device'
  | 'already_in_use'
  | 'insecure_context'
  | 'metadata_timeout'
  | 'invalid_frame_size'
  | 'unknown';

export interface CameraControllerCallbacks {
  onFrame: (bitmap: ImageBitmap, timestamp: number) => void;
  onError: (code: CameraErrorCode, message: string) => void;
  onStarted: (width: number, height: number) => void;
  onStopped: () => void;
}

function classifyError(err: unknown): { code: CameraErrorCode; message: string } {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return { code: 'permission_denied', message: 'Camera permission denied' };
    if (err.name === 'NotFoundError') return { code: 'no_device', message: 'No camera found' };
    if (err.name === 'NotReadableError') return { code: 'already_in_use', message: 'Camera already in use' };
    if (err.name === 'SecurityError') return { code: 'insecure_context', message: 'Insecure context (use HTTPS or localhost)' };
  }
  return { code: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

export class CameraController {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private rvfcId: unknown = null;
  private running = false;
  private lastFrameTime = 0;
  private readonly minFrameInterval = 1000 / CAMERA_FRAME_RATE_MAX;
  private readonly callbacks: CameraControllerCallbacks;

  constructor(callbacks: CameraControllerCallbacks) {
    this.callbacks = callbacks;
  }

  async start(videoEl: HTMLVideoElement, deviceId?: string): Promise<void> {
    if (this.running) return;
    this.video = videoEl;

    if (!navigator.mediaDevices?.getUserMedia) {
      this.callbacks.onError('insecure_context', 'getUserMedia not available');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: CAMERA_WIDTH_IDEAL },
          height: { ideal: CAMERA_HEIGHT_IDEAL },
          frameRate: { ideal: CAMERA_FRAME_RATE_MAX, max: CAMERA_FRAME_RATE_MAX },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (err) {
      const { code, message } = classifyError(err);
      this.callbacks.onError(code, message);
      return;
    }

    this.stream = stream;
    videoEl.srcObject = stream;

    // Wait for metadata
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Video metadata timeout')), 5000);
      videoEl.onloadedmetadata = () => { clearTimeout(timeout); resolve(); };
      videoEl.onerror = () => { clearTimeout(timeout); reject(new Error('Video load error')); };
    }).catch((err: unknown) => {
      this.callbacks.onError('metadata_timeout', err instanceof Error ? err.message : String(err));
      this.stop();
      throw err;
    });

    await videoEl.play().catch((err: unknown) => {
      this.callbacks.onError('unknown', `Video play failed: ${err instanceof Error ? err.message : String(err)}`);
      this.stop();
      throw err;
    });

    if (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      this.callbacks.onError('invalid_frame_size', 'Camera started but returned an invalid frame size');
      this.stop();
      return;
    }

    this.running = true;
    this.callbacks.onStarted(videoEl.videoWidth, videoEl.videoHeight);
    this.scheduleNextFrame();
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.video && this.rvfcId !== null) {
      try { (this.video as unknown as { cancelVideoFrameCallback: (id: unknown) => void }).cancelVideoFrameCallback(this.rvfcId); } catch { /* ignore */ }
      this.rvfcId = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.video) { this.video.srcObject = null; this.video = null; }
    this.callbacks.onStopped();
  }

  private scheduleNextFrame(): void {
    if (!this.running || !this.video) return;

    type VFC = (now: DOMHighResTimeStamp, meta: { mediaTime: number }) => void;
    const videoWithRvfc = this.video as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: VFC) => unknown;
    };

    if (videoWithRvfc.requestVideoFrameCallback) {
      this.rvfcId = videoWithRvfc.requestVideoFrameCallback((now) => {
        this.captureFrame(now);
        this.scheduleNextFrame();
      });
    } else {
      this.rafId = requestAnimationFrame((now) => {
        this.captureFrame(now);
        this.scheduleNextFrame();
      });
    }
  }

  private captureFrame(now: number): void {
    if (!this.running || !this.video) return;
    if (now - this.lastFrameTime < this.minFrameInterval) return;
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (this.video.videoWidth === 0 || this.video.videoHeight === 0) return;

    this.lastFrameTime = now;
    createImageBitmap(this.video)
      .then((bitmap) => this.callbacks.onFrame(bitmap, now))
      .catch(() => { /* frame dropped */ });
  }

  get isRunning(): boolean { return this.running; }
}

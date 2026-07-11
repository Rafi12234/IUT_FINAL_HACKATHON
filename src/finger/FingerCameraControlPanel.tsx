import { useEffect, useRef, useCallback, useState } from 'react';
import { useFingerStore } from './fingerStore';
import { useRuntimeStore } from '../state/runtimeStore';
import { useRobotStore } from '../state/robotStore';
import { getRuntime } from '../runtime/runtimeInstance';
import { CameraController } from './cameraController';
import { HandTrackingClient } from './HandTrackingClient';
import { FingerControlEngine } from './FingerControlEngine';
import { drawHands } from './handSkeletonRenderer';
import { loadCalibration, saveCalibration, resetCalibration, buildDefaultCalibration } from './handCalibration';
import type { FingerEngineSnapshot } from './fingerTypes';

export function FingerCameraControlPanel() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraController | null>(null);
  const clientRef = useRef<HandTrackingClient | null>(null);
  const engineRef = useRef<FingerControlEngine | null>(null);
  const [expanded, setExpanded] = useState(false);

  const store = useFingerStore();
  const snapshot = useRuntimeStore(s => s.snapshot);
  const robot = useRobotStore();

  // Initialize engine once
  useEffect(() => {
    const engine = new FingerControlEngine({
      submit: (cmd) => getRuntime()?.submit(cmd),
      getRuntimeSnapshot: () => snapshot,
      getRobotState: () => ({
        chain: robot.chain,
        jointMeta: robot.jointMeta,
        toolAxis: robot.toolAxis,
      }),
      getHandleProjections: () => useFingerStore.getState().handleProjections,
      getCameraBasis: () => null, // populated from SceneRoot via store
      publish: (snap: FingerEngineSnapshot) => store.applySnapshot(snap),
    });
    engineRef.current = engine;

    // Load persisted calibration
    const cal = loadCalibration();
    store.setCalibration(cal ?? buildDefaultCalibration());

    return () => { engine.dispose(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync engine settings from store
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.dominantHand = store.dominantHand;
    engine.speedMode = store.speedMode;
    engine.mode = store.mode;
    engine.mirrored = store.mirrored;
    engine.calibration = store.calibration;
    engine.cameraEnabled = store.cameraEnabled;
  }, [store.dominantHand, store.speedMode, store.mode, store.mirrored, store.calibration, store.cameraEnabled]);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    store.setTrackingStatus('starting_camera');

    const client = new HandTrackingClient({
      onReady: (delegate) => {
        engineRef.current?.onWorkerReady(delegate === 'CPU');
        store.setTrackingStatus('ready');
      },
      onResult: (hands, _frameId, inferenceMs) => {
        engineRef.current?.onInferenceResult(hands, inferenceMs, performance.now());
        // Draw skeleton
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx && videoRef.current) {
          canvas.width = videoRef.current.videoWidth;
          canvas.height = videoRef.current.videoHeight;
          const dominated = useFingerStore.getState().dominantHand;
          const engineSnap = useFingerStore.getState();
          const dominantHand = hands.find(h => h.handedness === dominated);
          const pinchingIds = new Set(
            hands.filter(h => h.handedness === dominated && engineSnap.grabbedHandleId).map(h => h.trackingId)
          );
          drawHands(ctx, hands, {
            width: canvas.width,
            height: canvas.height,
            mirrored: useFingerStore.getState().mirrored,
            dominantId: dominantHand?.trackingId ?? null,
            pinchingIds,
          });
        }
      },
      onError: (code, message, fatal) => {
        engineRef.current?.onWorkerError(message, fatal);
        // Suppress transient "not_initialized" frames that fire before the model
        // finishes loading — they are expected and non-fatal.
        if (code === 'not_initialized') return;
        store.setTrackingStatus(fatal ? 'error' : store.trackingStatus, fatal ? `${code}: ${message}` : undefined);
      },
    });

    const camera = new CameraController({
      onFrame: (bitmap, ts) => client.submitFrame(bitmap, ts),
      onError: (code, message) => store.setTrackingStatus('error', `${code}: ${message}`),
      onStarted: () => { store.setCameraEnabled(true); store.setTrackingStatus('loading_model'); client.start(); },
      onStopped: () => { store.setCameraEnabled(false); store.setTrackingStatus('off'); },
    });

    cameraRef.current = camera;
    clientRef.current = client;

    await camera.start(videoRef.current);
  }, [store]);

  const stopCamera = useCallback(() => {
    cameraRef.current?.stop();
    clientRef.current?.stop();
    store.setCameraEnabled(false);
    store.setTrackingStatus('off');
  }, [store]);

  // Cleanup on unmount
  useEffect(() => () => { stopCamera(); engineRef.current?.dispose(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Document visibility / blur stop
  useEffect(() => {
    const onHide = () => { if (document.hidden) stopCamera(); };
    const onBlur = () => stopCamera();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('blur', onBlur);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('blur', onBlur);
    };
  }, [stopCamera]);

  const statusColor = store.trackingStatus === 'tracking' ? 'var(--ok)'
    : store.trackingStatus === 'error' ? 'var(--danger)'
    : store.trackingStatus === 'off' ? 'var(--muted)'
    : 'var(--warn)';

  const handsCount = store.hands.length;
  const estopBlocked = snapshot?.eStopped === true;

  return (
    <section className="panel finger-panel" aria-label="Finger control">
      <div className="panel-head">
        <h2>Finger Control</h2>
        <span className="finger-status-dot" style={{ background: statusColor }} aria-label={store.trackingStatus} />
      </div>

      <p className="muted small">
        Camera frames are processed locally in this browser and are not uploaded.
      </p>

      {estopBlocked && (
        <p className="inline-alert" role="alert">E-STOP active — reset before using finger control.</p>
      )}

      {/* Camera preview */}
      <div className="finger-preview">
        <video
          ref={videoRef}
          className="finger-preview-video"
          autoPlay
          playsInline
          muted
          style={{ transform: store.mirrored ? 'scaleX(-1)' : 'none' }}
        />
        <canvas ref={canvasRef} className="finger-preview-overlay" />
      </div>

      {/* Camera controls */}
      <div className="btn-row">
        {!store.cameraEnabled ? (
          <button className="btn btn-accent" onClick={startCamera} disabled={estopBlocked}>
            Start Camera
          </button>
        ) : (
          <button className="btn" onClick={stopCamera}>Stop Camera</button>
        )}
        <label className="finger-toggle">
          <input type="checkbox" checked={store.mirrored} onChange={e => store.setMirrored(e.target.checked)} />
          Mirror
        </label>
      </div>

      {store.lastError && <p className="inline-alert small" role="alert">{store.lastError}</p>}

      {/* Mode */}
      <div className="finger-section-label">Control Mode</div>
      <div className="finger-mode-tabs">
        {(['joint', 'tcp'] as const).map(m => (
          <button
            key={m}
            className={`finger-tab${store.mode === m ? ' is-active' : ''}`}
            onClick={() => store.setMode(m)}
          >
            {m === 'joint' ? 'Joint Grab' : 'TCP Drag'}
          </button>
        ))}
      </div>

      {/* Speed */}
      <div className="finger-section-label">Speed</div>
      <div className="finger-mode-tabs">
        {(['precision', 'normal', 'fast'] as const).map(s => (
          <button
            key={s}
            className={`finger-tab${store.speedMode === s ? ' is-active' : ''}`}
            onClick={() => store.setSpeedMode(s)}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Dominant hand */}
      <div className="finger-section-label">Dominant Hand</div>
      <div className="finger-mode-tabs">
        {(['Right', 'Left'] as const).map(h => (
          <button
            key={h}
            className={`finger-tab${store.dominantHand === h ? ' is-active' : ''}`}
            onClick={() => store.setDominantHand(h)}
          >
            {h}
          </button>
        ))}
      </div>

      {/* Calibration */}
      <div className="finger-section-label">
        Depth Calibration
        {store.calibration ? <span className="ok-text"> ✓</span> : <span className="warn-text"> ⚠ Not calibrated</span>}
      </div>
      <div className="btn-row">
        <button className="btn btn-sm" onClick={() => {
          const cal = buildDefaultCalibration(store.dominantHand);
          store.setCalibration(cal);
          saveCalibration(cal);
        }}>
          Apply Defaults
        </button>
        <button className="btn btn-sm" onClick={() => { resetCalibration(); store.setCalibration(null); }}>
          Reset
        </button>
      </div>

      {/* Diagnostics toggle */}
      <button className="finger-diag-toggle btn btn-sm" onClick={() => setExpanded(e => !e)}>
        {expanded ? 'Hide' : 'Show'} Diagnostics
      </button>

      {expanded && (
        <div className="finger-status-grid">
          <div className="finger-stat"><span className="muted">Status</span><span>{store.trackingStatus}</span></div>
          <div className="finger-stat"><span className="muted">Gesture</span><span>{store.gestureState}</span></div>
          <div className="finger-stat"><span className="muted">Hands</span><span>{handsCount}</span></div>
          <div className="finger-stat"><span className="muted">Hover</span><span>{store.hoveredHandleId ?? '—'}</span></div>
          <div className="finger-stat"><span className="muted">Grabbed</span><span>{store.grabbedHandleId ?? '—'}</span></div>
          <div className="finger-stat"><span className="muted">Held</span><span>{Object.keys(store.heldJoints).join(', ') || '—'}</span></div>
          <div className="finger-stat"><span className="muted">Infer FPS</span><span className="mono">{store.inferenceFps.toFixed(1)}</span></div>
          <div className="finger-stat"><span className="muted">Infer ms</span><span className="mono">{store.inferenceMs.toFixed(1)}</span></div>
          <div className="finger-stat"><span className="muted">Cmd/s</span><span className="mono">{store.commandRate}</span></div>
          <div className="finger-stat"><span className="muted">Worker</span><span>{store.workerReady ? (store.usingFallbackInference ? 'CPU' : 'GPU') : 'Off'}</span></div>
          {store.lastRejection && (
            <div className="finger-stat finger-rejection">
              <span className="muted">Rejected</span>
              <span style={{color:'var(--warn)'}}>{store.lastRejection}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

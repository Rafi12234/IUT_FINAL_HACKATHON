import { useFingerStore } from './fingerStore';

const TRACKING_LABEL: Record<string, string> = {
  tracking: 'Good',
  degraded: 'Weak',
  tracking_lost: 'Lost',
  ready: 'Ready',
  loading_model: 'Loading',
  starting_camera: 'Starting',
  off: 'Off',
  error: 'Error',
};

/**
 * Compact HUD overlay in the main viewport.
 * Shows active finger control state when camera is enabled.
 * pointer-events: none.
 */
export function FingerViewportHud() {
  const cameraEnabled = useFingerStore(s => s.cameraEnabled);
  const trackingStatus = useFingerStore(s => s.trackingStatus);
  const gestureState = useFingerStore(s => s.gestureState);
  const mode = useFingerStore(s => s.mode);
  const dominantHand = useFingerStore(s => s.dominantHand);
  const speedMode = useFingerStore(s => s.speedMode);
  const grabbedHandleId = useFingerStore(s => s.grabbedHandleId);
  const hoveredHandleId = useFingerStore(s => s.hoveredHandleId);
  const heldJoints = useFingerStore(s => s.heldJoints);
  const hands = useFingerStore(s => s.hands);

  if (!cameraEnabled) return null;

  const trackingColor = trackingStatus === 'tracking' ? 'var(--ok)'
    : trackingStatus === 'error' || trackingStatus === 'off' ? 'var(--danger)'
    : 'var(--warn)';

  const heldNames = Object.keys(heldJoints);

  return (
    <div className="finger-hud" aria-label="Finger control status" aria-live="polite">
      <div className="finger-hud-title">FINGER CONTROL</div>
      <div className="finger-hud-row">
        <span className="muted">Mode</span>
        <span>{mode === 'joint' ? 'Joint Grab' : 'TCP Drag'}</span>
      </div>
      <div className="finger-hud-row">
        <span className="muted">Hand</span>
        <span>{dominantHand} · {hands.length} detected</span>
      </div>
      <div className="finger-hud-row">
        <span className="muted">Tracking</span>
        <span style={{ color: trackingColor }}>{TRACKING_LABEL[trackingStatus] ?? trackingStatus}</span>
      </div>
      {hoveredHandleId && !grabbedHandleId && (
        <div className="finger-hud-row">
          <span className="muted">Target</span>
          <span style={{ color: 'var(--warn)' }}>{hoveredHandleId}</span>
        </div>
      )}
      {grabbedHandleId && (
        <div className="finger-hud-row">
          <span className="muted">Grabbed</span>
          <span style={{ color: 'var(--ok)' }}>{grabbedHandleId}</span>
        </div>
      )}
      {heldNames.length > 0 && (
        <div className="finger-hud-row">
          <span className="muted">Held</span>
          <span style={{ color: 'var(--accent)' }}>{heldNames.join(', ')}</span>
        </div>
      )}
      <div className="finger-hud-row">
        <span className="muted">Speed</span>
        <span>{speedMode}</span>
      </div>

      <div className="finger-hud-hint">
        {mode === 'joint' ? (
          gestureState === 'grabbing_joint'
            ? 'Move hand along rotation arc · Release pinch to stop'
            : gestureState === 'hovering_joint'
            ? 'Pinch to grab · Release to cancel'
            : 'Point at a joint handle and pinch to grab'
        ) : (
          gestureState === 'grabbing_tcp'
            ? 'Move hand · closer/farther for depth · Release to stop'
            : 'Pinch the TCP marker to drag'
        )}
      </div>
    </div>
  );
}

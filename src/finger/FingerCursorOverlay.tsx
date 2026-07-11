import { useFingerStore } from './fingerStore';

/**
 * Virtual cursor overlay on the main viewport.
 * pointer-events: none — never blocks interaction with the 3D scene.
 */
export function FingerCursorOverlay() {
  const hoveredHandleId = useFingerStore(s => s.hoveredHandleId);
  const grabbedHandleId = useFingerStore(s => s.grabbedHandleId);
  const gestureState = useFingerStore(s => s.gestureState);
  const cameraEnabled = useFingerStore(s => s.cameraEnabled);
  const hands = useFingerStore(s => s.hands);
  const dominantHand = useFingerStore(s => s.dominantHand);
  const mirrored = useFingerStore(s => s.mirrored);

  if (!cameraEnabled || hands.length === 0) return null;

  const dominant = hands.find(h => h.handedness === dominantHand);
  if (!dominant) return null;

  const tip = dominant.landmarks[8]; // index fingertip
  if (!tip) return null;

  const x = mirrored ? (1 - tip.x) * window.innerWidth : tip.x * window.innerWidth;
  const y = tip.y * window.innerHeight;

  let cursorClass = 'finger-cursor';
  if (grabbedHandleId) cursorClass += ' is-grabbing';
  else if (hoveredHandleId) cursorClass += ' is-hovering';
  else if (gestureState === 'tracking_lost') cursorClass += ' is-blocked';

  return (
    <div
      className={cursorClass}
      style={{ left: x, top: y }}
      aria-hidden="true"
    />
  );
}

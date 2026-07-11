/**
 * Canvas-based hand skeleton renderer.
 * Draws 21 MediaPipe landmarks + connections on a 2D canvas overlay.
 * Pure module — no React, no DOM creation.
 */

import type { NormalizedLandmark, TrackedHand } from './fingerTypes';

// MediaPipe Hand Landmarker connection pairs
const CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],         // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],         // index
  [0, 9], [9, 10], [10, 11], [11, 12],    // middle
  [0, 13], [13, 14], [14, 15], [15, 16], // ring
  [0, 17], [17, 18], [18, 19], [19, 20], // pinky
  [5, 9], [9, 13], [13, 17],              // palm
];

const DOMINANT_COLOR = '#22d3ee';
const NON_DOMINANT_COLOR = '#a78bfa';
const PINCH_COLOR = '#34d399';

export interface DrawHandOptions {
  readonly width: number;
  readonly height: number;
  readonly mirrored: boolean;
  readonly dominantId: string | null;
  readonly pinchingIds: ReadonlySet<string>;
}

function lmX(lm: NormalizedLandmark, w: number, mirrored: boolean): number {
  return mirrored ? (1 - lm.x) * w : lm.x * w;
}
function lmY(lm: NormalizedLandmark, h: number): number {
  return lm.y * h;
}

export function drawHands(
  ctx: CanvasRenderingContext2D,
  hands: readonly TrackedHand[],
  opts: DrawHandOptions,
): void {
  ctx.clearRect(0, 0, opts.width, opts.height);

  for (const hand of hands) {
    const isDominant = hand.trackingId === opts.dominantId;
    const isPinching = opts.pinchingIds.has(hand.trackingId);
    const color = isPinching ? PINCH_COLOR : isDominant ? DOMINANT_COLOR : NON_DOMINANT_COLOR;

    const lms = hand.landmarks;
    if (lms.length < 21) continue;

    // Draw bones
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.75;
    for (const [a, b] of CONNECTIONS) {
      const lA = lms[a];
      const lB = lms[b];
      if (!lA || !lB) continue;
      ctx.beginPath();
      ctx.moveTo(lmX(lA, opts.width, opts.mirrored), lmY(lA, opts.height));
      ctx.lineTo(lmX(lB, opts.width, opts.mirrored), lmY(lB, opts.height));
      ctx.stroke();
    }

    // Draw landmarks
    ctx.globalAlpha = 1;
    for (let i = 0; i < lms.length; i++) {
      const lm = lms[i]!;
      const x = lmX(lm, opts.width, opts.mirrored);
      const y = lmY(lm, opts.height);
      const r = i === 4 || i === 8 ? 5 : 3; // larger for thumb/index tips
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    // Hand label
    const wrist = lms[0]!;
    const lx = lmX(wrist, opts.width, opts.mirrored);
    const ly = lmY(wrist, opts.height);
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    const label = `${hand.handedness}${isDominant ? ' ★' : ''}${isPinching ? ' ✊' : ''}`;
    ctx.fillText(label, lx + 6, ly + 4);
    ctx.globalAlpha = 1;
  }
}

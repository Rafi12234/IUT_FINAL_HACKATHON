/**
 * Hand calibration: guided depth calibration + localStorage persistence.
 */

import { z } from 'zod';
import {
  CALIBRATION_STORAGE_KEY,
  CALIBRATION_VERSION,
  DEFAULT_CALIBRATION,
} from './fingerConfig';
import type { FingerCalibration, Handedness } from './fingerTypes';

const CalibrationSchema = z.object({
  version: z.literal(CALIBRATION_VERSION),
  deviceId: z.string().nullable(),
  dominantHand: z.enum(['Left', 'Right']),
  mirrored: z.boolean(),
  neutralPalmSize: z.number().finite().positive(),
  nearPalmSize: z.number().finite().positive(),
  farPalmSize: z.number().finite().positive(),
  horizontalSensitivity: z.number().finite().positive(),
  verticalSensitivity: z.number().finite().positive(),
  depthSensitivity: z.number().finite().positive(),
});

export function loadCalibration(): FingerCalibration | null {
  try {
    const raw = localStorage.getItem(CALIBRATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = CalibrationSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data as FingerCalibration;
  } catch {
    return null;
  }
}

export function saveCalibration(cal: FingerCalibration): void {
  try {
    localStorage.setItem(CALIBRATION_STORAGE_KEY, JSON.stringify(cal));
  } catch {
    // Storage quota or private mode — ignore
  }
}

export function resetCalibration(): void {
  try {
    localStorage.removeItem(CALIBRATION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function buildDefaultCalibration(dominantHand: Handedness = 'Right'): FingerCalibration {
  return { ...DEFAULT_CALIBRATION, dominantHand };
}

export interface CalibrationSample {
  palmSize: number;
  wristY: number;
}

export interface CalibrationBuilder {
  neutral: CalibrationSample | null;
  near: CalibrationSample | null;
  far: CalibrationSample | null;
}

export function buildCalibration(
  builder: CalibrationBuilder,
  dominantHand: Handedness,
  mirrored: boolean,
  deviceId: string | null,
): FingerCalibration | { error: string } {
  if (!builder.neutral || !builder.near || !builder.far) {
    return { error: 'All three calibration steps must be completed' };
  }
  const { neutral, near, far } = builder;
  if (Math.abs(near.palmSize - far.palmSize) < 0.03) {
    return { error: 'Near and far palm sizes are too similar — move hand further between steps' };
  }
  return {
    version: CALIBRATION_VERSION,
    deviceId,
    dominantHand,
    mirrored,
    neutralPalmSize: neutral.palmSize,
    nearPalmSize: near.palmSize,
    farPalmSize: far.palmSize,
    horizontalSensitivity: 1.0,
    verticalSensitivity: 1.0,
    depthSensitivity: 1.0,
  };
}

/**
 * Normalize current palm size to a [-1, 1] depth signal using calibration.
 * Returns 0 when calibration is unavailable.
 */
export function normalizeDepth(currentPalmSize: number, cal: FingerCalibration): number {
  const range = cal.nearPalmSize - cal.farPalmSize;
  if (Math.abs(range) < 1e-6) return 0;
  const clamped = Math.max(cal.farPalmSize, Math.min(cal.nearPalmSize, currentPalmSize));
  return ((clamped - cal.farPalmSize) / range) * 2 - 1;
}

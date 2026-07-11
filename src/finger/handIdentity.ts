/**
 * Hand identity tracking across frames.
 *
 * MediaPipe handedness may flicker between frames. This module assigns stable
 * tracking IDs (e.g. "hand-left-1") using wrist position matching and a short
 * grace period during brief occlusions.
 */

import { IDENTITY_GRACE_PERIOD_MS, IDENTITY_MAX_MATCH_DISTANCE, LM_WRIST } from './fingerConfig';
import type { Handedness, NormalizedLandmark, TrackedHand } from './fingerTypes';

interface IdentitySlot {
  trackingId: string;
  handedness: Handedness;
  lastWrist: NormalizedLandmark;
  lastSeenAt: number;
}

let slotCounter = 0;
function nextSlotId(h: Handedness): string {
  slotCounter += 1;
  return `hand-${h.toLowerCase()}-${slotCounter}`;
}

function wristDist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class HandIdentityTracker {
  private slots: IdentitySlot[] = [];

  /**
   * Given raw MediaPipe results, assign stable tracking IDs.
   * Returns TrackedHand objects with trackingId filled in.
   */
  update(
    rawHands: Array<{
      handedness: Handedness;
      handednessScore: number;
      landmarks: readonly NormalizedLandmark[];
      worldLandmarks: readonly NormalizedLandmark[];
    }>,
    timestamp: number,
  ): TrackedHand[] {
    // Expire stale slots beyond grace period
    this.slots = this.slots.filter((s) => timestamp - s.lastSeenAt < IDENTITY_GRACE_PERIOD_MS * 3);

    const assigned: TrackedHand[] = [];
    const usedSlotIds = new Set<string>();

    for (const raw of rawHands) {
      const wrist = raw.landmarks[LM_WRIST];
      if (!wrist) continue;

      // Find best matching slot by handedness + wrist proximity
      let bestSlot: IdentitySlot | null = null;
      let bestDist = IDENTITY_MAX_MATCH_DISTANCE;

      for (const slot of this.slots) {
        if (slot.handedness !== raw.handedness) continue;
        if (usedSlotIds.has(slot.trackingId)) continue;
        const d = wristDist(wrist, slot.lastWrist);
        if (d < bestDist) {
          bestDist = d;
          bestSlot = slot;
        }
      }

      if (bestSlot) {
        bestSlot.lastWrist = wrist;
        bestSlot.lastSeenAt = timestamp;
        usedSlotIds.add(bestSlot.trackingId);
        assigned.push({
          trackingId: bestSlot.trackingId,
          handedness: raw.handedness,
          handednessScore: raw.handednessScore,
          landmarks: raw.landmarks,
          worldLandmarks: raw.worldLandmarks,
          timestamp,
        });
      } else {
        // New hand — create a slot
        const newSlot: IdentitySlot = {
          trackingId: nextSlotId(raw.handedness),
          handedness: raw.handedness,
          lastWrist: wrist,
          lastSeenAt: timestamp,
        };
        this.slots.push(newSlot);
        usedSlotIds.add(newSlot.trackingId);
        assigned.push({
          trackingId: newSlot.trackingId,
          handedness: raw.handedness,
          handednessScore: raw.handednessScore,
          landmarks: raw.landmarks,
          worldLandmarks: raw.worldLandmarks,
          timestamp,
        });
      }
    }

    return assigned;
  }

  reset(): void {
    this.slots = [];
  }
}

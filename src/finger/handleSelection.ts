/**
 * Handle selection — pure function mapping cursor position to the closest
 * visible joint/TCP handle with hysteresis to prevent rapid switching.
 */

import { HANDLE_HYSTERESIS_PX, HANDLE_SELECT_RADIUS_PX } from './fingerConfig';
import type { FingerHandleProjection } from './fingerTypes';

export interface HandleSelectionState {
  currentId: string | null;
}

export function createHandleSelectionState(): HandleSelectionState {
  return { currentId: null };
}

function screenDist(
  cx: number,
  cy: number,
  proj: FingerHandleProjection,
): number {
  const dx = cx - proj.screenPosition[0];
  const dy = cy - proj.screenPosition[1];
  return Math.hypot(dx, dy);
}

/**
 * Select the closest visible handle to the cursor, with hysteresis.
 * Returns the new selection state and the selected handle ID.
 */
export function selectHandle(
  cursorX: number,
  cursorY: number,
  handles: readonly FingerHandleProjection[],
  state: HandleSelectionState,
  blockedIds: ReadonlySet<string> = new Set(),
  radiusPx: number = HANDLE_SELECT_RADIUS_PX,
  hysteresisPx: number = HANDLE_HYSTERESIS_PX,
): { id: string | null; nextState: HandleSelectionState } {
  const candidates = handles.filter((h) => h.visible && !blockedIds.has(h.id));

  if (candidates.length === 0) {
    return { id: null, nextState: { currentId: null } };
  }

  // Find closest in radius
  let closestId: string | null = null;
  let closestDist = radiusPx;
  for (const h of candidates) {
    const d = screenDist(cursorX, cursorY, h);
    if (d < closestDist) {
      closestDist = d;
      closestId = h.id;
    }
  }

  if (closestId === null) {
    return { id: null, nextState: { currentId: null } };
  }

  // Hysteresis: only switch if the new handle is meaningfully closer
  if (state.currentId !== null && state.currentId !== closestId) {
    const currentHandle = candidates.find((h) => h.id === state.currentId);
    if (currentHandle) {
      const currentDist = screenDist(cursorX, cursorY, currentHandle);
      if (closestDist > currentDist - hysteresisPx) {
        // Not close enough to switch — keep current
        return { id: state.currentId, nextState: state };
      }
    }
  }

  return { id: closestId, nextState: { currentId: closestId } };
}

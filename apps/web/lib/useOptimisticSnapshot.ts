'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Snapshot } from './api';

// Wraps a patcher in an object so React's setState doesn't confuse it with
// the functional-update form (which would call it with previous state).
type PatcherBox = { fn: (s: Snapshot) => Snapshot } | null;

/**
 * Layers an optimistic patch on top of the live socket snapshot.
 *
 * Usage:
 *   const { display, applyOptimistic, revertOptimistic } = useOptimisticSnapshot(snapshot);
 *
 * - Call `applyOptimistic(s => newState)` immediately on button press.
 * - Fire the REST call in the background (no await needed).
 * - The next socket event auto-clears the optimistic overlay, replacing it
 *   with server truth.
 * - Call `revertOptimistic()` in the error handler to snap back immediately
 *   if the REST call fails.
 */
export function useOptimisticSnapshot(live: Snapshot | null) {
  const [box, setBox] = useState<PatcherBox>(null);

  // New socket snapshot arrived → server truth is here, discard the overlay.
  useEffect(() => {
    setBox(null);
  }, [live]);

  const applyOptimistic = useCallback((fn: (s: Snapshot) => Snapshot) => {
    setBox({ fn });
  }, []);

  const revertOptimistic = useCallback(() => {
    setBox(null);
  }, []);

  const display = box !== null && live !== null ? box.fn(live) : live;

  return { display, applyOptimistic, revertOptimistic };
}

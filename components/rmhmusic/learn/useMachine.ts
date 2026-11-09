'use client';

/**
 * Hold a pure machine (`lib/rmhmusic/learn/machines/*`) for one mounted
 * screen. The state is read with `useSyncExternalStore`, so it is never
 * mirrored in `useState` + refs; `send` transitions synchronously and returns
 * the effects, which the caller carries out with its current props.
 */

import { useState, useSyncExternalStore } from 'react';
import { createRunner, type Machine } from '@/lib/rmhmusic/learn/machines/runner';

export function useMachine<S, E, F>(machine: Machine<S, E, F>): [S, (event: E) => F[]] {
  const [runner] = useState(() => createRunner(machine));
  const state = useSyncExternalStore(runner.subscribe, runner.get, runner.get);
  return [state, runner.send];
}

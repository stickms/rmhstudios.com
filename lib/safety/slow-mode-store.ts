'use client';

import { create } from 'zustand';
import type { Socket } from 'socket.io-client';
import {
  slowModeEvents,
  type SlowModeScope,
  type SlowModeStatePayload,
  type SlowModeRejectedPayload,
} from './slow-mode-events';

interface Entry {
  cooldownMs: number;
  autoEngaged: boolean;
  blockedUntil: number;
  reason: 'cooldown' | 'new-account' | null;
}
const EMPTY: Entry = { cooldownMs: 0, autoEngaged: false, blockedUntil: 0, reason: null };

interface SlowModeStore {
  scopes: Partial<Record<SlowModeScope, Entry>>;
  applyState: (scope: SlowModeScope, s: SlowModeStatePayload) => void;
  applyRejected: (scope: SlowModeScope, r: SlowModeRejectedPayload) => void;
  reset: (scope: SlowModeScope) => void;
}

export const useSlowModeStore = create<SlowModeStore>((set) => ({
  scopes: {},
  applyState: (scope, s) =>
    set((st) => ({
      scopes: {
        ...st.scopes,
        [scope]: {
          ...(st.scopes[scope] ?? EMPTY),
          cooldownMs: s.cooldownMs,
          autoEngaged: s.autoEngaged,
        },
      },
    })),
  applyRejected: (scope, r) =>
    set((st) => ({
      scopes: {
        ...st.scopes,
        [scope]: {
          ...(st.scopes[scope] ?? EMPTY),
          blockedUntil: r.reason === 'cooldown' ? Date.now() + r.retryInMs : 0,
          reason: r.reason,
        },
      },
    })),
  reset: (scope) => set((st) => ({ scopes: { ...st.scopes, [scope]: EMPTY } })),
}));

/** Attach the three slow-mode listeners to a hub socket (client side). */
export function bindSlowModeEvents(socket: Socket, scope: SlowModeScope): void {
  const ev = slowModeEvents(scope);
  const { applyState, applyRejected, reset } = useSlowModeStore.getState();
  reset(scope);
  socket.on(ev.STATE, (p: SlowModeStatePayload) => applyState(scope, p));
  socket.on(ev.REJECTED, (p: SlowModeRejectedPayload) => applyRejected(scope, p));
}

/**
 * RMHboxShell — RMHbox's root wrapper.
 *
 * Structure and toasts come from the shared `AppShell`; this only supplies the
 * palette class and the persisted appearance. Settings and host-control modals
 * render inline within `RMHboxHeader`, not as floating overlays here.
 */

import AppShell from '@/components/shared/AppShell';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { reconnectNow } from '@/lib/rmhbox/socket';

export default function RMHboxShell({ children }: { children: React.ReactNode }) {
  const theme = useRMHboxStore((s) => s.settings.theme);
  const status = useRMHboxStore((s) => s.connectionStatus);
  return (
    <AppShell
      appClassName="rmhbox-theme"
      theme={theme}
      realtime={{
        status,
        // RMHbox never pauses for a dropped player (games skip their turn,
        // and the coordinator ends a game that falls below its minimum), so
        // the shared "Game paused" takeover was false and blocked everyone's
        // input for up to 15 s while timers ran on. The player list already
        // shows who is offline.
        peersWaiting: null,
        onRetry: reconnectNow,
      }}
    >
      {children}
    </AppShell>
  );
}

/**
 * RmhTubeShell — RMHTube's root wrapper. Palette only; the rest is `AppShell`.
 *
 * RMHTube is the one app that offers a high-contrast appearance; `AppShell`
 * resolves it from the same persisted `theme` value.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useRmhTubeStore } from '@/lib/rmhtube/store';
import { reconnectNow } from '@/lib/rmhtube/socket';

export default function RmhTubeShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhTubeStore((s) => s.settings.theme);
  const status = useRmhTubeStore((s) => s.connectionStatus);
  const peersWaiting = useRmhTubeStore((s) => s.peersWaiting);

  return (
    <AppShell
      appClassName="rmhtube-theme"
      theme={theme}
      realtime={{ status, peersWaiting, onRetry: reconnectNow }}
    >
      {children}
    </AppShell>
  );
}

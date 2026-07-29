/**
 * RmhTypeShell — RMHType's root wrapper. Palette only; the rest is `AppShell`.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useRmhTypeStore } from '@/lib/rmhtype/store';
import { reconnectNow } from '@/lib/rmhtype/socket';

export default function RmhTypeShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhTypeStore((s) => s.settings.theme);
  const status = useRmhTypeStore((s) => s.connectionStatus);
  const peersWaiting = useRmhTypeStore((s) => s.peersWaiting);

  return (
    <AppShell
      appClassName="rmhtype-theme"
      theme={theme}
      realtime={{ status, peersWaiting, onRetry: reconnectNow }}
    >
      {children}
    </AppShell>
  );
}

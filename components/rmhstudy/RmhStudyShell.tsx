/**
 * RmhStudyShell — RMHStudy's root wrapper. Palette only; the rest is `AppShell`.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';
import { reconnectNow } from '@/lib/rmhstudy/socket';

export default function RmhStudyShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhStudyStore((s) => s.settings.theme);
  const status = useRmhStudyStore((s) => s.connectionStatus);
  const peersWaiting = useRmhStudyStore((s) => s.peersWaiting);

  return (
    <AppShell
      appClassName="rmhstudy-theme"
      theme={theme}
      realtime={{ status, peersWaiting, onRetry: reconnectNow }}
    >
      {children}
    </AppShell>
  );
}

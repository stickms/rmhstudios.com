/**
 * RMHboxShell — RMHbox's root wrapper.
 *
 * Structure and toasts come from the shared `AppShell`; this only supplies the
 * palette class and the persisted appearance. Settings and host-control modals
 * render inline within `RMHboxHeader`, not as floating overlays here.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useRMHboxStore } from '@/lib/rmhbox/store';

export default function RMHboxShell({ children }: { children: React.ReactNode }) {
  const theme = useRMHboxStore((s) => s.settings.theme);

  return (
    <AppShell appClassName="rmhbox-theme" theme={theme}>
      {children}
    </AppShell>
  );
}

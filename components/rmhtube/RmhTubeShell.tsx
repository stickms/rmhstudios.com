/**
 * RmhTubeShell — RMHTube's root wrapper. Palette only; the rest is `AppShell`.
 *
 * RMHTube is the one app that offers a high-contrast appearance; `AppShell`
 * resolves it from the same persisted `theme` value.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useRmhTubeStore } from '@/lib/rmhtube/store';

export default function RmhTubeShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhTubeStore((s) => s.settings.theme);

  return (
    <AppShell appClassName="rmhtube-theme" theme={theme}>
      {children}
    </AppShell>
  );
}

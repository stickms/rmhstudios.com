/**
 * RmhTypeShell — RMHType's root wrapper. Palette only; the rest is `AppShell`.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useRmhTypeStore } from '@/lib/rmhtype/store';

export default function RmhTypeShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhTypeStore((s) => s.settings.theme);

  return (
    <AppShell appClassName="rmhtype-theme" theme={theme}>
      {children}
    </AppShell>
  );
}

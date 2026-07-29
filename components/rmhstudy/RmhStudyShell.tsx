/**
 * RmhStudyShell — RMHStudy's root wrapper. Palette only; the rest is `AppShell`.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useRmhStudyStore } from '@/lib/rmhstudy/store';

export default function RmhStudyShell({ children }: { children: React.ReactNode }) {
  const theme = useRmhStudyStore((s) => s.settings.theme);

  return (
    <AppShell appClassName="rmhstudy-theme" theme={theme}>
      {children}
    </AppShell>
  );
}

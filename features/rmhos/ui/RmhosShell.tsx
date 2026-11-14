/**
 * RmhosShell: rmhOS's root wrapper. Palette only; the rest is `AppShell`.
 */
import type { ReactNode } from 'react';
import AppShell from '@/components/shared/AppShell';

export default function RmhosShell({ children }: { children: ReactNode }) {
  return (
    <AppShell appClassName="rmhos-app" theme="dark">
      {children}
    </AppShell>
  );
}

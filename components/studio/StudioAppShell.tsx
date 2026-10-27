/**
 * StudioAppShell — RMH Studio's root wrapper. Palette only; the rest is `AppShell`.
 *
 * Studio has no appearance setting of its own: it is dark in every site theme
 * (see `components/studio/studio.css`). Toasts go through sonner's site toaster,
 * so the app toaster is not mounted.
 */
'use client';

import AppShell from '@/components/shared/AppShell';

export default function StudioAppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell appClassName="studio-theme" theme="dark" toaster={false}>
      {children}
    </AppShell>
  );
}

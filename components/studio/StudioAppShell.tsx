/**
 * StudioAppShell — RMH Studio's root wrapper. Palette only; the rest is `AppShell`.
 *
 * Studio has no appearance setting of its own: it is dark in every site theme
 * (see `components/studio/studio.css`), and takes the app tier's high-contrast
 * ramp when the visitor's site style is High contrast. Toasts go through
 * sonner's site toaster, so the app toaster is not mounted.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useThemeStore } from '@/stores/themeStore';

export default function StudioAppShell({ children }: { children: React.ReactNode }) {
  const highContrast = useThemeStore((s) => s.style === 'high-contrast');

  return (
    <AppShell
      appClassName="studio-theme"
      theme={highContrast ? 'high-contrast' : 'dark'}
      toaster={false}
    >
      {children}
    </AppShell>
  );
}

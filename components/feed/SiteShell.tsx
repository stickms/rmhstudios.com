'use client';

import type { ReactNode } from 'react';
import { RadialShell } from '@/components/radial/RadialShell';
import { ShellLayoutContext } from './shell-context';
import '@/components/radial/radial.css';

interface SiteShellProps {
  children: ReactNode;
  /** Global dialogs/notices that must share the shell's floating-stack context. */
  overlays?: ReactNode;
}

/**
 * Mobile-first application frame shared by every standard route.
 *
 * The chrome is the RMH radial UI: a fixed monochrome backdrop, a slim utility
 * top bar, and the central RMH hub that blooms navigation outward on demand.
 * The public API (`children` + `overlays`) is unchanged, so `_site.tsx` and the
 * router's shell-aware pending fallback keep working untouched.
 */
export function SiteShell({ children, overlays }: SiteShellProps) {
  return (
    <ShellLayoutContext.Provider value>
      <RadialShell overlays={overlays}>{children}</RadialShell>
    </ShellLayoutContext.Provider>
  );
}

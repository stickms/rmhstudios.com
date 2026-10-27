/**
 * Tf2HudShell — the editor's root wrapper. One fixed TF2 palette (no theme switching); the rest is `AppShell`.
 */
'use client';

import AppShell from '@/components/shared/AppShell';

export default function Tf2HudShell({ children }: { children: React.ReactNode }) {
  return <AppShell appClassName="tf2hud-theme">{children}</AppShell>;
}

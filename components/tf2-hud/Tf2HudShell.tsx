/**
 * Tf2HudShell — the editor's root wrapper. Palette only; the rest is `AppShell`.
 */
'use client';

import AppShell from '@/components/shared/AppShell';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';

export default function Tf2HudShell({ children }: { children: React.ReactNode }) {
  const theme = useTf2HudPrefs((s) => s.theme);
  return (
    <AppShell appClassName="tf2hud-theme" theme={theme}>
      {children}
    </AppShell>
  );
}

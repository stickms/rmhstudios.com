/**
 * AppShell — the root wrapper for a full-screen app.
 *
 * RMHbox, RMHType, RMHStudy and RMHTube each had their own four-line shell
 * that did the same three things: put the app's theme class on a div, resolve
 * a light/dark/high-contrast modifier, and mount a toaster. This is that,
 * once, plus the pieces each copy was missing — a `color-scheme` hint for
 * form controls, and the shared `.app-theme` structure class.
 *
 *   <AppShell theme={theme} appClassName="rmhbox-theme">…</AppShell>
 *
 * `appClassName` is the app's palette class (see `components/shared/
 * app-theme.css`); `theme` picks the appearance modifier.
 */
'use client';

import type { ReactNode } from 'react';
import AppToaster from './AppToaster';

export type AppAppearance = 'dark' | 'light' | 'high-contrast';

/** Density is RMHTube's for now, but it is a shared token so it lives here. */
export type AppDensity = 'compact' | 'comfortable' | 'spacious';

const APPEARANCE_CLASS: Record<AppAppearance, string> = {
  dark: '',
  light: 'app-light',
  'high-contrast': 'app-high-contrast',
};

const DENSITY_CLASS: Record<AppDensity, string> = {
  compact: 'app-compact',
  comfortable: '',
  spacious: 'app-spacious',
};

export interface AppShellProps {
  children: ReactNode;
  /** The app's palette class, e.g. `rmhbox-theme`. */
  appClassName: string;
  /** Appearance modifier. Unknown values fall back to dark. */
  theme?: string | null;
  density?: AppDensity;
  /** Skip the toaster for apps that render their own notification surface. */
  toaster?: boolean;
  className?: string;
}

export default function AppShell({
  children,
  appClassName,
  theme,
  density = 'comfortable',
  toaster = true,
  className,
}: AppShellProps) {
  // A persisted preference from an older build (or a hand-edited localStorage
  // value) shouldn't strand the app in an undefined palette.
  const appearance: AppAppearance =
    theme === 'light' || theme === 'high-contrast' ? theme : 'dark';

  return (
    <div
      className={[
        'app-theme',
        appClassName,
        APPEARANCE_CLASS[appearance],
        DENSITY_CLASS[density],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-app-theme={appearance}
    >
      {toaster && <AppToaster />}
      {children}
    </div>
  );
}

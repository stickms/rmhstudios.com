'use client';

/**
 * Auto / Light / Dark, in the page header.
 *
 * A segmented control rather than a single sun-moon button, because a two-state
 * button cannot express the state that matters most: "follow my phone". Every
 * OS-level toggle worth copying (iOS Appearance, macOS System Settings) shows
 * the automatic option as a peer of the two fixed ones, and a visitor who wants
 * their calendar to go dark at sunset needs to be able to pick it.
 *
 * It sits beside Add a session / Settings / Refresh instead of inside the
 * settings sheet: the sheet holds the BOARD's settings, which are shared by
 * everyone at the table and need an account to change. This is a per-device
 * display preference that anyone — signed in or not — can flip, so burying it
 * behind a sheet that half the visitors cannot save from would be wrong.
 *
 * `usePf2eTheme` owns the persistence and the repaint; this is only the control.
 */

import { useTranslation } from 'react-i18next';
import { Segmented } from './ios';
import { usePf2eTheme, type Pf2eThemeMode } from './theme';

export function ThemeToggle() {
  const { t } = useTranslation('r-pf2ecal');
  const { mode, setMode } = usePf2eTheme();

  const segments: ReadonlyArray<{ value: Pf2eThemeMode; label: string }> = [
    { value: 'auto', label: t('theme-auto', { defaultValue: 'Auto' }) },
    { value: 'light', label: t('theme-light', { defaultValue: 'Light' }) },
    { value: 'dark', label: t('theme-dark', { defaultValue: 'Dark' }) },
  ];

  return (
    <div className="pf2e-theme-toggle">
      <Segmented
        segments={segments}
        value={mode}
        onChange={setMode}
        label={t('theme-label', { defaultValue: 'Appearance' })}
      />
    </div>
  );
}

'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleRow } from '@/components/settings/AppearancePanel';
import { useDesktopNavStore } from '@/stores/desktopNavStore';

/**
 * Settings → Layout → Desktop navigation: the docked liquid globe (default) or
 * the text navigation panel in the left column on wide screens. Applies live and
 * is stored per device — see `stores/desktopNavStore.ts`.
 */
export function DesktopNavSetting() {
  const { t } = useTranslation('c-layout');
  const hydrate = useDesktopNavStore((s) => s.hydrate);
  const mode = useDesktopNavStore((s) => s.mode);
  const setMode = useDesktopNavStore((s) => s.setMode);

  useEffect(() => hydrate(), [hydrate]);

  return (
    <ToggleRow
      label={t('desktop-nav-panel', { defaultValue: 'Show the navigation panel' })}
      description={t('desktop-nav-panel-desc', {
        defaultValue:
          'Off: the liquid globe stays docked in the left column, always ready to spin. On: a list of links takes its place, and the globe opens from the button at the bottom of the screen. Wide screens only; saved on this device.',
      })}
      checked={mode === 'rail'}
      onChange={(on) => setMode(on ? 'rail' : 'globe')}
    />
  );
}

/**
 * ModeToggle — the header's light / dark switch: one labelled button, pressed while the app is
 * dark. Until the app's root has resolved the mode (the server render and the hydrating render)
 * it is a placeholder of exactly the same size, so the header does not move when it appears.
 */

import { Moon, Sun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setMode, useMode } from '../useRmhMusicMode';

const BOX = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-(--app-radius-sm)';

export function ModeToggle() {
  const { t } = useTranslation('c-rmhmusic');
  const mode = useMode();

  if (mode === null) return <span className={BOX} aria-hidden="true" />;

  const dark = mode === 'dark';
  const Icon = dark ? Moon : Sun;
  return (
    <button
      type="button"
      aria-pressed={dark}
      aria-label={t('mode-dark-toggle', { defaultValue: 'Dark mode' })}
      title={t('mode-dark-toggle', { defaultValue: 'Dark mode' })}
      onClick={() => setMode(dark ? 'light' : 'dark')}
      className={`${BOX} border border-(--app-border-bright) text-(--app-text-muted) transition-colors hover:bg-(--app-surface-hover) hover:text-(--app-text)`}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

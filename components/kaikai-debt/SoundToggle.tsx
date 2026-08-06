'use client';

import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  getMutedServerSnapshot,
  isMuted,
  subscribeMuted,
  toggleMuted,
} from '@/lib/kaikai-debt/sound';

/**
 * Mute switch for the page's sound effects.
 *
 * `useSyncExternalStore` rather than `useState` + an effect: the preference
 * lives in `localStorage` and is read by non-React code (every `play*` call
 * gates on it), so React has to *subscribe* to it rather than own a copy that
 * could disagree. The server snapshot is a hardcoded "unmuted" so SSR and the
 * hydrating client render the same label — reading storage during hydration is
 * how you get a text mismatch and a thrown-away tree.
 *
 * Icon-only, so it carries both an `aria-label` and an `aria-pressed` state: a
 * screen-reader user needs to know it is a toggle and which way it is currently
 * set, not just what pressing it does.
 */
export function SoundToggle() {
  const { t } = useTranslation('c-kaikai-debt');
  const muted = useSyncExternalStore(subscribeMuted, isMuted, getMutedServerSnapshot);

  const label = muted
    ? t('sound.unmute', { defaultValue: 'Turn sound on' })
    : t('sound.mute', { defaultValue: 'Mute sound' });

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => toggleMuted()}
      aria-label={label}
      aria-pressed={!muted}
      title={label}
    >
      {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
      <span className="sr-only">{label}</span>
    </Button>
  );
}

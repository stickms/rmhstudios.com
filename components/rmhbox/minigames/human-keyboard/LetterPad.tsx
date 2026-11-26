/**
 * LetterPad — the player's own letters, and only those.
 *
 * An on-screen grid of the letters the player holds, each a 44 px target, so a
 * phone fits it without scrolling; there is no full QWERTY. The hardware
 * keyboard is read by the game area that wraps this pad (only while it has
 * focus), never globally, so it cannot collide with the site shortcuts.
 */

import { useTranslation } from 'react-i18next';
import { ARRIVE } from '@/components/ui/arrive';

interface LetterPadProps {
  letters: readonly string[];
  /** Presses are accepted now. */
  enabled: boolean;
  onPress: (letter: string) => void;
  /** Changes with every deal; the pad fades in on a new one. */
  dealKey: number;
}

export default function LetterPad({ letters, enabled, onPress, dealKey }: LetterPadProps) {
  const { t } = useTranslation('human-keyboard');

  if (letters.length === 0) {
    return (
      <p className="text-sm text-app-text-muted" data-testid="hk-pad-empty">
        {t('pad-empty', { defaultValue: 'You hold no letters right now. You get some at the next reshuffle.' })}
      </p>
    );
  }

  return (
    <div
      key={dealKey}
      role="group"
      aria-label={t('pad-label', { defaultValue: 'Your letters. Press one on your keyboard or tap it.' })}
      className={`grid grid-cols-5 gap-2 ${ARRIVE}`}
      data-testid="hk-pad"
    >
      {letters.map((letter) => (
        <button
          key={letter}
          type="button"
          aria-disabled={!enabled}
          aria-label={t('pad-key', { defaultValue: 'Letter {{letter}}', letter })}
          onClick={() => enabled && onPress(letter)}
          className={`flex size-11 items-center justify-center rounded-app border-2 border-app-border bg-app-surface font-mono text-lg font-semibold uppercase text-app-text transition-colors duration-100 ${
            enabled ? 'cursor-pointer' : 'cursor-default text-app-text-muted'
          }`}
        >
          {letter}
        </button>
      ))}
    </div>
  );
}

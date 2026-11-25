/**
 * PadGrid — the four named pads of Sequence Sam.
 *
 * Each pad has a colour, a shape and a name (circle, square, triangle,
 * diamond), so none depends on colour alone. A pad lights by a solid fill
 * change and nothing else: no flash, glow or scale. Keys 1 to 4 tap the pads
 * while the grid has focus (never globally, so they cannot collide with the
 * site shortcuts), and each shown step is announced politely by name.
 */

import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Circle, Diamond, Square, Triangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { padName } from './pad-names';

const SHAPES: readonly LucideIcon[] = [Circle, Square, Triangle, Diamond];

/** Unlit and lit classes per pad: the lit pad is the solid colour, the unlit one a plain surface. */
const PAD_STYLES = [
  {
    rest: 'border-app-accent bg-app-surface text-app-accent',
    lit: 'border-app-accent bg-app-accent text-app-accent-fg',
  },
  {
    rest: 'border-app-success bg-app-surface text-app-success',
    lit: 'border-app-success bg-app-success text-app-accent-fg',
  },
  {
    rest: 'border-app-warning bg-app-surface text-app-warning',
    lit: 'border-app-warning bg-app-warning text-app-accent-fg',
  },
  {
    rest: 'border-app-danger bg-app-surface text-app-danger',
    lit: 'border-app-danger bg-app-danger text-app-accent-fg',
  },
] as const;

interface PadGridProps {
  /** The pad that is lit now (a shown step or the player's own tap), or null. */
  litPad: number | null;
  /** Pads accept taps. */
  enabled: boolean;
  onTap: (pad: number) => void;
  /** The name of the step just shown, for the screen reader; empty when none. */
  announcement: string;
}

export default function PadGrid({ litPad, enabled, onTap, announcement }: PadGridProps) {
  const { t } = useTranslation('sequence-sam');

  // Keys 1-4 act only while a pad in this grid has focus
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const pad = ['1', '2', '3', '4'].indexOf(event.key);
    if (pad < 0) return;
    event.preventDefault();
    if (enabled) onTap(pad);
  };

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div
        role="group"
        aria-label={t('pads-label', { defaultValue: 'Pads. Press 1 to 4 to tap a pad.' })}
        onKeyDown={handleKeyDown}
        className="grid w-full max-w-sm grid-cols-2 gap-3"
        data-testid="ss-pads"
      >
        {SHAPES.map((Shape, pad) => {
          const lit = litPad === pad;
          const style = PAD_STYLES[pad]!;
          const name = padName(t, pad);
          return (
            <button
              key={pad}
              type="button"
              aria-disabled={!enabled}
              aria-label={t('pad-button', { defaultValue: '{{name}}, key {{hotkey}}', name, hotkey: pad + 1 })}
              onClick={() => enabled && onTap(pad)}
              className={`flex aspect-square min-h-24 flex-col items-center justify-center gap-2 rounded-app border-2 transition-colors duration-100 pointer-coarse:min-h-28 ${
                lit ? style.lit : style.rest
              } ${enabled ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <Shape className="size-10" fill="currentColor" aria-hidden="true" />
              <span className="text-sm font-medium">{name}</span>
              <span className="font-mono text-xs opacity-80" aria-hidden="true">
                {pad + 1}
              </span>
            </button>
          );
        })}
      </div>
      <p className="sr-only" role="status" aria-live="polite" data-testid="ss-announcer">
        {announcement}
      </p>
    </div>
  );
}

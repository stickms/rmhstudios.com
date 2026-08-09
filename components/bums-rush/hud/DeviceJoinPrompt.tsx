'use client';

/**
 * "Player 3, press Grab to join."
 *
 * §4.6, and the one rule that matters: **never pause the game to add a
 * player.** The card slides in over a running level, the world keeps moving,
 * and the new character is sketched in at the checkpoint. Pausing four people
 * because a fifth walked into the room is how a party game stops being one.
 *
 * The prompt names the button in the DETECTED pad's own language (§4.1) — a
 * PlayStation player is never told to press "A".
 *
 * **Hidden on touch-only devices.** Two people cannot share one phone's
 * screen (§12.1), so on a device whose only pointer is a finger this card would
 * be advertising something the hardware cannot do. The exception is a pad
 * paired to that phone — which is a second physical device, and makes the offer
 * true again. Since the prompt is only ever RAISED by a pad, that exception is
 * the normal case and the suppression only ever affects a stray phantom.
 */

import { useTranslation } from 'react-i18next';
import { Gamepad2 } from 'lucide-react';
import { glyphForGamepadAction, type PadBrand } from '@/lib/bums-rush/input';
import { PaperCard } from '../paper/PaperSurface';
import { InkButton } from '../paper/InkControls';
import type { SeatIndex } from '@/lib/bums-rush/types';
import { SeatMark } from '../paper/InkControls';

interface DeviceJoinPromptProps {
  brand: PadBrand;
  /** The seat this pad would take, for the card's own copy. */
  seat: SeatIndex;
  onAccept: () => void;
  onDismiss: () => void;
}

export function DeviceJoinPrompt({ brand, seat, onAccept, onDismiss }: DeviceJoinPromptProps) {
  const { t } = useTranslation('c-bums-rush');
  const grab = glyphForGamepadAction(brand, 'triggerR');

  return (
    <div
      className="pointer-events-none absolute inset-x-0 z-30 flex justify-center-safe"
      style={{ bottom: 'calc(var(--safe-bottom) + clamp(4rem, 14vmin, 7rem))' }}
      role="status"
    >
      <PaperCard
        tilt={1.4}
        taped
        className="pointer-events-auto mx-[clamp(0.5rem,3vw,1.5rem)] max-w-sm px-4 py-3"
      >
        <div className="flex items-start gap-3">
          <Gamepad2 className="mt-0.5 size-6 shrink-0 text-bum-ink" aria-hidden="true" />
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-bum-ink">
              <SeatMark seat={seat} className="size-4" />
              {t('join.title', { defaultValue: 'Player {{n}}, join in?', n: seat + 1 })}
            </p>
            <p className="mt-1 text-xs text-bum-graphite">
              {t('join.body', {
                defaultValue: 'Press {{button}} and you will be drawn in at the last checkpoint.',
                button: t(grab.labelKey, { defaultValue: grab.label }),
              })}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <InkButton size="sm" variant="primary" onClick={onAccept}>
                {t('join.accept', { defaultValue: 'Join' })}
              </InkButton>
              <InkButton size="sm" onClick={onDismiss}>
                {t('join.dismiss', { defaultValue: 'Not now' })}
              </InkButton>
            </div>
          </div>
        </div>
      </PaperCard>
    </div>
  );
}

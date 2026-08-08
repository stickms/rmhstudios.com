'use client';

/**
 * What this seat is playing with.
 *
 * §4.7: assists are per-player and **visible**, so nobody in a party is
 * secretly playing a different game. That is the whole reason this chip exists
 * — not as a scold, which is why it is a neutral note in graphite rather than a
 * warning, and why it says what is on rather than what is "cheating".
 *
 * Renders nothing when nothing is on, so the default game has no chip at all.
 */

import { useTranslation } from 'react-i18next';
import type { Assists } from '@/lib/bums-rush/types';
import { SeatMark } from '../paper/InkControls';
import type { SeatIndex } from '@/lib/bums-rush/types';

interface AssistChipProps {
  seat: SeatIndex;
  assists: Assists;
  /** Hide the seat mark where the chip already sits next to one. */
  showSeat?: boolean;
}

export function AssistChip({ seat, assists, showSeat = true }: AssistChipProps) {
  const { t } = useTranslation('c-bums-rush');

  const active: string[] = [];
  if (assists.grabAssist) active.push(t('assist.grab', { defaultValue: 'Grab assist' }));
  if (assists.stickyGrip) active.push(t('assist.sticky', { defaultValue: 'Sticky grip' }));
  if (assists.autoGrab) active.push(t('assist.auto', { defaultValue: 'Auto-grab' }));
  if (assists.slowMo) active.push(t('assist.slowmo', { defaultValue: 'Slow-mo' }));
  if (assists.extraCheckpoints) active.push(t('assist.checkpoints', { defaultValue: 'Extra checkpoints' }));
  if (assists.noFallDamage) active.push(t('assist.nofall', { defaultValue: 'No fall damage' }));
  if (assists.oneHanded) active.push(t('assist.onehanded', { defaultValue: 'One-handed' }));

  if (active.length === 0) return null;

  return (
    <span
      className="pointer-events-none inline-flex max-w-full items-center gap-1 rounded-bum border border-bum-paper-edge bg-bum-surface-2 px-1.5 py-0.5 text-bum-graphite"
      style={{ fontSize: 'clamp(0.55rem, 1.3vmin, 0.7rem)' }}
    >
      {showSeat ? <SeatMark seat={seat} className="size-[clamp(0.55rem,1.4vmin,0.75rem)] shrink-0" /> : null}
      <span className="truncate">{active.join(' · ')}</span>
    </span>
  );
}

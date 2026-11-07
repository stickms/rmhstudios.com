'use client';

import { Play, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Pressings } from '@/components/slice-it/Pressings';
import { calculateScoreMultiplier } from '@/lib/slice-it/scoring';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { SliceSong } from '@/lib/slice-it/types';

interface PhoneRecordProps {
  song: SliceSong;
  onStart: (song: SliceSong) => void;
  /** Opens the full record (modifiers, leaderboard, comments) as a sheet. */
  onDetails: () => void;
}

/**
 * The picked record, compact, above the tracklist on a phone.
 *
 * On a wide screen the record is the sleeve's whole left column. A phone has no
 * column to give it, and the old answer — picking a row slid a full-height sheet
 * over the list — put a screen between "that one" and "start". This keeps the cover,
 * the pressings and START in one strip that is always in reach, and leaves
 * everything else (modifiers, scores, comments) one tap away on the sheet.
 */
export function PhoneRecord({ song, onStart, onDetails }: PhoneRecordProps) {
  const { t } = useTranslation('c-game');
  const modifiers = useSliceItStore((s) => s.modifiers);
  const multiplier = calculateScoreMultiplier(modifiers);

  return (
    <section className="slice-prec" aria-label={song.title}>
      <div className="slice-prec__row">
        <div className="slice-prec__cover slice-duotone">
          {song.coverUrl ? (
            <img src={song.coverUrl} alt="" />
          ) : (
            <span className="slice-dots-cyan absolute inset-0" aria-hidden />
          )}
        </div>
        <div className="slice-prec__text">
          <div className="slice-label">{t('side-a', { defaultValue: 'Side A' })}</div>
          <h2 className="slice-prec__title">{song.title}</h2>
          <div className="slice-prec__meta">
            <span className="slice-rec__artist">{song.artist}</span>
            <span className="slice-label">
              <b>{Math.round(song.bpm)}</b> {t('bpm-label', { defaultValue: 'BPM' })}
            </span>
          </div>
        </div>
      </div>

      <Pressings className="mt-3" />

      <div className="slice-prec__go">
        <Button className="slice-btn-primary" onClick={() => onStart(song)}>
          <Play className="size-4 fill-current" aria-hidden />
          {t('start-game', { defaultValue: 'Start Game' })}
        </Button>
        <button
          type="button"
          className="slice-sq"
          onClick={onDetails}
          aria-label={t('record-details', { defaultValue: 'Modifiers, scores and comments' })}
        >
          <SlidersHorizontal className="size-5" aria-hidden />
          <span className="slice-sq__n">×{multiplier.toFixed(2)}</span>
        </button>
      </div>
    </section>
  );
}

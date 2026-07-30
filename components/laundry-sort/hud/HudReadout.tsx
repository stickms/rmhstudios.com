'use client';

/**
 * Score, clock and combo — updated **without** React.
 *
 * These three values change on almost every simulation tick. Pushing them
 * through state would re-render the overlay 60 times a second and stall the
 * frame the cloth solver needs, so this component renders its markup once and
 * then writes to its own text nodes from a `requestAnimationFrame` loop.
 *
 * Screen readers get a separate, throttled live region instead: announcing a
 * score that changes every 16ms would be unusable, so the polite region is
 * refreshed once a second with the state that actually matters (time left and
 * current score).
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer, Trophy, Flame } from 'lucide-react';
import type { LaundryMatch } from '@/lib/laundry-sort/match';

interface Props {
  matchRef: React.RefObject<LaundryMatch | null>;
  running: boolean;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function HudReadout({ matchRef, running }: Props) {
  const { t } = useTranslation('c-laundry-sort');
  const scoreRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const comboRef = useRef<HTMLDivElement>(null);
  const comboValueRef = useRef<HTMLSpanElement>(null);
  const clockBoxRef = useRef<HTMLDivElement>(null);

  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let lastScore = -1;
    let lastClock = '';
    let lastCombo = -1;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const match = matchRef.current;
      if (!match) return;

      const { score, combo } = match.stats;
      if (score !== lastScore && scoreRef.current) {
        lastScore = score;
        scoreRef.current.textContent = score.toLocaleString();
      }

      const clock = formatClock(match.remaining);
      if (clock !== lastClock && clockRef.current) {
        lastClock = clock;
        clockRef.current.textContent = clock;
        // The last ten seconds turn amber. Set via a data attribute so the
        // styling stays in CSS rather than being written from JS.
        clockBoxRef.current?.setAttribute('data-urgent', match.remaining <= 10 ? 'true' : 'false');
      }

      if (combo !== lastCombo) {
        lastCombo = combo;
        if (comboValueRef.current) comboValueRef.current.textContent = `${combo}`;
        comboRef.current?.setAttribute('data-visible', combo >= 2 ? 'true' : 'false');
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [matchRef, running]);

  // One announcement a second, not sixty.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const match = matchRef.current;
      if (!match) return;
      setAnnouncement(
        t('sr-status', {
          defaultValue: '{{seconds}} seconds left. Score {{score}}.',
          seconds: Math.ceil(match.remaining),
          score: match.stats.score,
        }),
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, [matchRef, running, t]);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-2 p-2 sm:p-4">
        <div className="ls-panel px-3 py-2 sm:px-4">
          <div className="ls-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest sm:text-xs">
            <Trophy className="size-3 sm:size-3.5" aria-hidden="true" />
            {t('score', { defaultValue: 'Score' })}
          </div>
          <span
            ref={scoreRef}
            className="ls-numeric block text-xl font-black leading-tight sm:text-3xl"
          >
            0
          </span>
        </div>

        <div
          ref={comboRef}
          data-visible="false"
          className="ls-panel px-3 py-2 opacity-0 transition-opacity duration-200 data-[visible=true]:opacity-100 sm:px-4"
        >
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--ls-warn)] sm:text-xs">
            <Flame className="size-3 sm:size-3.5" aria-hidden="true" />
            {t('combo', { defaultValue: 'Combo' })}
          </div>
          <div className="ls-numeric text-xl font-black leading-tight sm:text-3xl">
            ×<span ref={comboValueRef}>0</span>
          </div>
        </div>

        <div
          ref={clockBoxRef}
          data-urgent="false"
          className="ls-panel px-3 py-2 data-[urgent=true]:border-[var(--ls-warn)] sm:px-4"
        >
          <div className="ls-muted flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest sm:text-xs">
            <Timer className="size-3 sm:size-3.5" aria-hidden="true" />
            {t('time', { defaultValue: 'Time' })}
          </div>
          <span
            ref={clockRef}
            className="ls-numeric block text-xl font-black leading-tight sm:text-3xl"
          >
            0:00
          </span>
        </div>
      </div>

      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
    </>
  );
}

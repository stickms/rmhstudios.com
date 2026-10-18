'use client';

/** Spell practice: replay any boss card a real run has reached, alone, with attempt/capture stats. */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { STAGES } from '@/lib/dream-rift/data/stages';
import { DIFFICULTIES } from '@/lib/dream-rift/constants';
import { useDreamRift } from '@/lib/dream-rift/store';
import {
  loadPractice,
  practiceId,
  type PracticeOutcome,
  type PracticeTarget,
} from '@/lib/dream-rift/practice';
import { useRuntime } from './runtime';

const btn =
  'dr-plaque rounded-sm px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40';

/** Title-screen entry button. */
export function PracticeEntry({ onOpen }: { onOpen: () => void }) {
  const { t } = useTranslation('f-action');
  const { sfx } = useRuntime();
  return (
    <button
      type="button"
      className={`${btn} w-full`}
      onClick={() => {
        sfx.play('menuMove');
        onOpen();
      }}
    >
      {t('dr-practice-entry', { defaultValue: 'Spell Practice' })}
    </button>
  );
}

export function SpellPracticeMenu({
  onStart,
  onBack,
  last,
}: {
  onStart: (t: PracticeTarget) => void;
  onBack: () => void;
  last: PracticeOutcome | null;
}) {
  const { t } = useTranslation('f-action');
  const difficulty = useDreamRift((s) => s.difficulty);
  const setDifficulty = useDreamRift((s) => s.setDifficulty);
  const [data, setData] = useState(() => loadPractice());
  useEffect(() => setData(loadPractice()), [last]);

  const rows = STAGES.flatMap((st) =>
    (['mid', 'boss'] as const).map((key) => {
      const def = key === 'mid' ? st.midboss : st.boss;
      return { stage: st.index, key, title: `${st.name}: ${def.name}`, cards: def.cards };
    }),
  );

  return (
    <div className="relative flex min-h-full flex-col gap-4 bg-gradient-to-b from-[#0a0612] to-[#120a20] p-6">
      <h2 className="dr-serif text-2xl font-semibold tracking-[0.1em] text-[color:var(--dr-gold)]">
        {t('dr-practice-title', { defaultValue: 'Spell Practice' })}
      </h2>
      <p className="dr-serif-body text-sm italic text-[color:var(--dr-cream-dim)]">
        {t('dr-practice-hint', {
          defaultValue:
            'Cards unlock once a real run has reached them. Practice never affects scores or leaderboards.',
        })}
      </p>
      <div
        className="flex gap-2"
        role="group"
        aria-label={t('dr-practice-difficulty', { defaultValue: 'Difficulty' })}
      >
        {DIFFICULTIES.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={difficulty === d}
            onClick={() => setDifficulty(d)}
            className={`dr-serif flex-1 rounded-sm border px-2 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${difficulty === d ? 'border-[color:var(--dr-gold)] text-[color:var(--dr-gold)]' : 'border-[rgba(231,205,140,0.25)] text-[color:var(--dr-cream-dim)]'}`}
          >
            {d}
          </button>
        ))}
      </div>
      {last && (
        <p role="status" className="dr-serif text-sm text-[color:var(--dr-gold-soft)]">
          {last.captured
            ? t('dr-practice-captured', { defaultValue: 'Captured.' })
            : last.reason === 'timeout'
              ? t('dr-practice-timeout', { defaultValue: 'Time ran out.' })
              : t('dr-practice-died', { defaultValue: 'You were hit.' })}
        </p>
      )}
      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <section key={`${r.stage}.${r.key}`} className="flex flex-col gap-2">
            <h3 className="dr-serif text-xs uppercase tracking-[0.2em] text-[color:var(--dr-gold-soft)]">
              {r.title}
            </h3>
            {r.cards.map((c, i) => {
              const target = { stage: r.stage, boss: r.key, card: i };
              const id = practiceId(target);
              const reached = !!data.reached[id];
              const st = data.stats[id];
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!reached}
                  onClick={() => onStart(target)}
                  className={`${btn} flex items-center justify-between gap-3 text-left`}
                >
                  <span>
                    {reached
                      ? c.name
                      : t('dr-practice-locked', { defaultValue: 'Not yet reached' })}
                  </span>
                  {reached && (
                    <span className="text-xs tabular-nums text-[color:var(--dr-cream-dim)]">
                      {t('dr-practice-stats', {
                        defaultValue: '{{captures}} / {{attempts}} captured',
                        captures: st?.captures ?? 0,
                        attempts: st?.attempts ?? 0,
                      })}
                    </span>
                  )}
                </button>
              );
            })}
          </section>
        ))}
      </div>
      <button type="button" className={`${btn} self-start`} onClick={onBack}>
        {t('dr-practice-back', { defaultValue: 'Back' })}
      </button>
    </div>
  );
}

'use client';

/**
 * A recommended modifier loadout, with one button that applies it. (Feature 5.)
 *
 * The apply button is the feature. A recommendation you then reproduce by hand
 * across eight toggles is a paragraph; the same recommendation as one press is
 * a thing people use. It routes through the store's own `setModifiers`, which
 * runs `applyExclusions` — so a combination the game forbids is resolved by the
 * same code that resolves it when a player sets it manually, and the advisor
 * cannot talk the game into an illegal state.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { LoadoutAdvice } from '@/lib/slice-it/ai/types';
import type { TimingSummary } from '@/lib/slice-it/integrity';
import type { Difficulty } from '@/lib/slice-it/types';
import { AiPanel } from './AiPanel';
import { useSliceAi } from './useSliceAi';

const OPTIONAL: [keyof LoadoutAdvice, string][] = [
  ['invisible', 'Invisible'],
  ['bombs', 'Bombs'],
  ['switching', 'Switching'],
  ['spin', 'Spin'],
  ['strictTiming', 'Strict Timing'],
  ['oneTrack', 'One Track'],
];

export function LoadoutPanel({
  songId,
  difficulty,
  timing,
}: {
  songId: string;
  difficulty: Difficulty;
  timing?: TimingSummary | null;
}) {
  const { t } = useTranslation('c-game');
  const modifiers = useSliceItStore((s) => s.modifiers);
  const setModifiers = useSliceItStore((s) => s.setModifiers);
  const [applied, setApplied] = React.useState(false);

  const ai = useSliceAi<
    LoadoutAdvice,
    { songId: string; difficulty: Difficulty; timing?: TimingSummary }
  >('loadout', (body) => (body as { loadout: LoadoutAdvice | null }).loadout);

  const apply = () => {
    if (!ai.data) return;
    setModifiers({
      ...modifiers,
      difficulty: ai.data.difficulty,
      speed: ai.data.speed,
      invisible: ai.data.invisible,
      bombs: ai.data.bombs,
      switching: ai.data.switching,
      spin: ai.data.spin,
      strictTiming: ai.data.strictTiming,
      oneTrack: ai.data.oneTrack,
      // Never handed out by an advisor. See `loadoutSchema`.
      suddenDeath: false,
    });
    setApplied(true);
  };

  const on = ai.data
    ? OPTIONAL.filter(([key]) => ai.data![key] === true).map(([, label]) => label)
    : [];

  return (
    <AiPanel
      title={t('ai-loadout-title', { defaultValue: 'Suggested loadout' })}
      actionLabel={t('ai-loadout-action', { defaultValue: 'Suggest' })}
      state={ai.state}
      onRun={() => {
        setApplied(false);
        ai.run({ songId, difficulty, ...(timing ? { timing } : {}) });
      }}
    >
      {ai.data ? (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slice-text uppercase tracking-wide">
            {ai.data.difficulty} · {ai.data.speed}x{on.length > 0 ? ` · ${on.join(', ')}` : ''}
          </p>
          <p className="text-[11px] text-slice-text-muted leading-relaxed">{ai.data.reason}</p>
          <Button
            size="sm"
            onClick={apply}
            disabled={applied}
            className="h-8 px-3 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest border-none transition-colors"
          >
            {applied ? (
              <>
                <Check className="w-3 h-3 mr-1" aria-hidden="true" />
                {t('ai-loadout-applied', { defaultValue: 'Applied' })}
              </>
            ) : (
              t('ai-loadout-apply', { defaultValue: 'Apply these' })
            )}
          </Button>
        </div>
      ) : null}
    </AiPanel>
  );
}

'use client';

/**
 * How to overtake the score above you. (Feature 12.)
 *
 * The computed gap breakdown is the fallback line, and it carries the single
 * most useful fact on its own: how much of the deficit is the rival's
 * *modifiers* rather than their playing. "You are 2,400 behind, and 0.35x of
 * that is their speed setting" reframes the whole board — it is the difference
 * between "play better" and "you are both fine, they are running Expert at
 * 1.2x".
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { RivalPlan } from '@/lib/slice-it/ai/types';
import { AiLine, AiPanel } from './AiPanel';
import { useSliceAi } from './useSliceAi';

interface RunDiff {
  scoreGap: number;
  comboGap: number;
  accuracyGap: number | null;
  playerMultiplier: number;
  rivalMultiplier: number;
  multiplierGap: number;
}

export function RivalPanel({ songId, rivalRank }: { songId: string; rivalRank: number }) {
  const { t } = useTranslation('c-game');
  const [diff, setDiff] = React.useState<RunDiff | null>(null);

  const ai = useSliceAi<RivalPlan, { songId: string; rivalRank: number }>('rival', (body) => {
    const payload = body as { diff: RunDiff | null; plan: RivalPlan | null };
    setDiff(payload.diff);
    return payload.plan;
  });

  const fallback = diff
    ? t('ai-rival-gap', {
        defaultValue: '{{score}} points behind, {{combo}} combo behind.',
        score: diff.scoreGap.toLocaleString(),
        combo: diff.comboGap,
      }) +
      (diff.multiplierGap > 0
        ? ' ' +
          t('ai-rival-multiplier', {
            defaultValue: '{{gap}}x of that is their modifiers, not their playing.',
            gap: diff.multiplierGap,
          })
        : '')
    : null;

  return (
    <AiPanel
      title={t('ai-rival-title', { defaultValue: 'Catch the row above' })}
      actionLabel={t('ai-rival-action', { defaultValue: 'How?' })}
      state={ai.state}
      onRun={() => ai.run({ songId, rivalRank })}
      {...(fallback ? { fallback } : {})}
    >
      {ai.data ? (
        <div className="space-y-2">
          <p className="text-sm font-black text-slice-text-darker leading-snug">
            {ai.data.headline}
          </p>
          <p className="text-[11px] text-slice-text-muted leading-relaxed">{ai.data.gap}</p>
          {ai.data.steps.length > 0 && (
            <ul className="space-y-2 list-none pt-1">
              {ai.data.steps.map((step, index) => (
                <AiLine key={index} text={step.step} evidence={step.worth} />
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </AiPanel>
  );
}

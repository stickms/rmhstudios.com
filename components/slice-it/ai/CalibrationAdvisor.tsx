'use client';

/**
 * Read the player's timing and, when it is warranted, change their offset.
 * (Feature 3.)
 *
 * The apply button only appears on the `offset` verdict, and the verdict is
 * arithmetic from `deriveVerdict` — never the model's opinion. That ordering is
 * the point of the whole feature: this is the one AI surface in the game that
 * writes a persisted setting, so what it writes has to come from a computation
 * with a unit test, not from a sentence.
 *
 * On the other two verdicts the panel says so and offers nothing to press.
 * "Your spread is 41 ms, that is consistency rather than calibration" is the
 * correct and most common answer, and a button next to it would invite the
 * player to change a setting that is already right.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSliceItStore } from '@/lib/slice-it/store';
import type { TimingSummary } from '@/lib/slice-it/integrity';
import type { CalibrationAdvice } from '@/lib/slice-it/ai/types';
import { AiPanel } from './AiPanel';
import { useSliceAi } from './useSliceAi';

/** One finished run's contribution, as the caller collected it. */
export interface CalibrationRunInput {
  songTitle: string;
  durationSec: number;
  accuracy: number;
  timing: TimingSummary;
}

interface Derived {
  verdict: 'offset' | 'practice' | 'inconclusive';
  suggestedOffsetMs: number;
  pooled: TimingSummary | null;
}

export function CalibrationAdvisor({ runs }: { runs: CalibrationRunInput[] }) {
  const { t } = useTranslation('c-game');
  const audioOffset = useSliceItStore((s) => s.audioOffset);
  const setAudioOffset = useSliceItStore((s) => s.setAudioOffset);
  const [derived, setDerived] = React.useState<Derived | null>(null);
  const [applied, setApplied] = React.useState(false);

  const ai = useSliceAi<
    CalibrationAdvice,
    { currentOffsetMs: number; runs: CalibrationRunInput[] }
  >('calibration', (body) => {
    const payload = body as { derived: Derived; advice: CalibrationAdvice | null };
    setDerived(payload.derived);
    return payload.advice;
  });

  const pooled = derived?.pooled;

  // Hoisted out of the interpolation below rather than called inline inside it:
  // `i18next-parser` does not follow a `t()` nested in another `t()`'s options
  // object, so as arguments these two keys never reached `locales/` and every
  // non-English build silently served the English default.
  const lateLabel = t('ai-late', { defaultValue: 'late' });
  const earlyLabel = t('ai-early', { defaultValue: 'early' });

  const fallback = pooled
    ? t('ai-calibration-pooled', {
        defaultValue:
          'Across {{runs}} runs: {{mean}} ms {{direction}} on average, {{spread}} ms spread.',
        runs: runs.length,
        mean: Math.abs(Math.round(pooled.meanMs)),
        direction: pooled.meanMs > 0 ? lateLabel : earlyLabel,
        spread: Math.round(pooled.stdDevMs),
      })
    : null;

  // Nothing to analyse. Saying so beats a button that returns "inconclusive".
  if (runs.length === 0) {
    return (
      <AiPanel
        title={t('ai-calibration-title', { defaultValue: 'Offset check' })}
        actionLabel={t('ai-calibration-action', { defaultValue: 'Check' })}
        state="unavailable"
        onRun={() => {}}
        fallback={t('ai-calibration-none', {
          defaultValue: 'Finish a run or two and this can tell you whether your offset is off.',
        })}
      />
    );
  }

  return (
    <AiPanel
      title={t('ai-calibration-title', { defaultValue: 'Offset check' })}
      actionLabel={t('ai-calibration-action', { defaultValue: 'Check' })}
      state={ai.state}
      onRun={() => {
        setApplied(false);
        ai.run({ currentOffsetMs: audioOffset, runs });
      }}
      {...(fallback ? { fallback } : {})}
    >
      {ai.data ? (
        <div className="space-y-2">
          <p className="text-xs text-slice-text leading-relaxed">{ai.data.explanation}</p>
          {ai.data.verdict === 'offset' && (
            <Button
              size="sm"
              disabled={applied}
              onClick={() => {
                setAudioOffset(ai.data!.suggestedOffsetMs);
                setApplied(true);
              }}
              className="h-8 px-3 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-60 text-white text-[10px] font-black uppercase tracking-widest border-none transition-colors"
            >
              {applied ? (
                <>
                  <Check className="w-3 h-3 mr-1" aria-hidden="true" />
                  {t('ai-calibration-applied', { defaultValue: 'Offset set' })}
                </>
              ) : (
                t('ai-calibration-apply', {
                  defaultValue: 'Set offset to {{ms}} ms',
                  ms: ai.data.suggestedOffsetMs,
                })
              )}
            </Button>
          )}
        </div>
      ) : null}
    </AiPanel>
  );
}

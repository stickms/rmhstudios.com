'use client';

/**
 * Post-run coaching on the results card. (Features 1 and 2.)
 *
 * Tips and drills come back from one call, so they cannot disagree about where
 * the run came apart — see `lib/slice-it/ai/coach.server.ts`.
 *
 * A drill is a button, not a sentence. "Practise 1:40–1:55 at 0.8x" that you
 * then have to set up by hand is a suggestion; the same text that starts the
 * run is a feature. `onPractise` is optional so the panel still renders its
 * drills as readable spans on a screen that has nowhere to send them (the
 * multiplayer results card, where retrying a section mid-lobby makes no sense).
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { mmss } from '@/lib/slice-it/ai/facts';
import type { PracticeDrill, SliceCoachAdvice } from '@/lib/slice-it/ai/types';
import type { Modifiers, RunStats } from '@/lib/slice-it/types';
import type { SectionResult } from '@/lib/slice-it/ai/facts';
import type { TimingSummary } from '@/lib/slice-it/integrity';
import { AiLine, AiPanel } from './AiPanel';
import { useSliceAi } from './useSliceAi';

export interface CoachPanelProps {
  songId: string;
  score: number;
  maxCombo: number;
  accuracy: number;
  notesResolved: number;
  modifiers: Modifiers;
  timing?: TimingSummary | null;
  sections?: SectionResult[] | null;
  judgements?: RunStats['judgements'] | null;
  /** Start a practice run over a drill's span. Omitted where that is not possible. */
  onPractise?: (drill: PracticeDrill) => void;
}

interface CoachBody {
  songId: string;
  score: number;
  maxCombo: number;
  accuracy: number;
  notesResolved: number;
  modifiers: Modifiers;
  timing?: TimingSummary;
  sections?: SectionResult[];
  judgements?: RunStats['judgements'];
}

export function CoachPanel(props: CoachPanelProps) {
  const { t } = useTranslation('c-game');
  const coach = useSliceAi<SliceCoachAdvice, CoachBody>(
    'coach',
    (body) => (body as { advice: SliceCoachAdvice | null }).advice,
  );

  const run = () =>
    coach.run({
      songId: props.songId,
      score: props.score,
      maxCombo: props.maxCombo,
      accuracy: props.accuracy,
      notesResolved: props.notesResolved,
      modifiers: props.modifiers,
      ...(props.timing ? { timing: props.timing } : {}),
      ...(props.sections?.length ? { sections: props.sections } : {}),
      ...(props.judgements ? { judgements: props.judgements } : {}),
    });

  return (
    <AiPanel
      title={t('ai-coach-title', { defaultValue: 'Coach' })}
      actionLabel={t('ai-coach-action', { defaultValue: 'Analyse run' })}
      state={coach.state}
      onRun={run}
    >
      {coach.data ? (
        <div className="space-y-3">
          <p className="text-sm font-black text-slice-text-darker leading-snug">
            {coach.data.headline}
          </p>

          {coach.data.tips.length > 0 && (
            <ul className="space-y-2 list-none">
              {coach.data.tips.map((tip, index) => (
                <AiLine key={index} text={tip.tip} evidence={tip.evidence} />
              ))}
            </ul>
          )}

          {coach.data.drills.length > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-slice-text-light">
                {t('ai-drills', { defaultValue: 'Practise' })}
              </p>
              {coach.data.drills.map((drill, index) => (
                <DrillRow
                  key={index}
                  drill={drill}
                  {...(props.onPractise ? { onPractise: props.onPractise } : {})}
                />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </AiPanel>
  );
}

function DrillRow({
  drill,
  onPractise,
}: {
  drill: PracticeDrill;
  onPractise?: (drill: PracticeDrill) => void;
}) {
  const { t } = useTranslation('c-game');
  const span = `${mmss(drill.startSec)}–${mmss(drill.endSec)}`;
  const speed = drill.suggestedSpeed < 1 ? ` · ${drill.suggestedSpeed}x` : '';

  const body = (
    <>
      <span className="font-mono text-[10px] text-slice-text-light shrink-0">
        {span}
        {speed}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-slice-text truncate">{drill.label}</span>
        {drill.why ? (
          <span className="block text-[10px] text-slice-text-muted leading-snug">{drill.why}</span>
        ) : null}
      </span>
    </>
  );

  if (!onPractise) {
    return (
      <div className="flex items-start gap-3 p-2.5 rounded-xl bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]">
        {body}
      </div>
    );
  }

  return (
    <Button
      variant="ghost"
      onClick={() => onPractise(drill)}
      aria-label={t('ai-drill-start', {
        defaultValue: 'Practise {{label}}, {{span}}',
        label: drill.label,
        span,
      })}
      className="w-full h-auto flex items-start gap-3 p-2.5 rounded-xl bg-slice-bg text-left border-none justify-start shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)] hover:bg-slice-shadow-dark/10 transition-colors"
    >
      {body}
      <Play className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
    </Button>
  );
}

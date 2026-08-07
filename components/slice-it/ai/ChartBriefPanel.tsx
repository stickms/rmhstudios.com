'use client';

/**
 * What a chart will ask of you, before you press start. (Feature 4.)
 *
 * The `plain` line — computed density, no model — is passed to `AiPanel` as its
 * fallback, so this panel says something useful in every state including the
 * one where no provider is configured. That is the whole reason the route
 * returns both halves.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { mmss } from '@/lib/slice-it/ai/facts';
import type { ChartBrief } from '@/lib/slice-it/ai/types';
import type { Difficulty } from '@/lib/slice-it/types';
import { AiPanel } from './AiPanel';
import { useSliceAi } from './useSliceAi';

interface BriefResponse {
  plain: string | null;
  brief: ChartBrief | null;
}

export function ChartBriefPanel({
  songId,
  difficulty,
}: {
  songId: string;
  difficulty: Difficulty;
}) {
  const { t } = useTranslation('c-game');
  const [plain, setPlain] = React.useState<string | null>(null);

  const ai = useSliceAi<ChartBrief, { songId: string; difficulty: Difficulty }>(
    'chart-brief',
    (body) => {
      const payload = body as BriefResponse;
      // The computed line is kept even when the model half is null, because it
      // is what the panel falls back to.
      setPlain(payload.plain);
      return payload.brief;
    },
  );

  // A brief describes one chart at one difficulty. Switching either makes the
  // one on screen wrong, so it is cleared rather than left to mislead.
  // `reset` is destructured because it is the only part of `ai` this depends
  // on, and it is a stable `useCallback` — depending on the whole object would
  // re-run this on every state change the hook makes, including the one that
  // delivers the brief.
  const { reset } = ai;
  React.useEffect(() => {
    reset();
    setPlain(null);
  }, [songId, difficulty, reset]);

  return (
    <AiPanel
      title={t('ai-brief-title', { defaultValue: 'Chart brief' })}
      actionLabel={t('ai-brief-action', { defaultValue: 'Read chart' })}
      state={ai.state}
      onRun={() => ai.run({ songId, difficulty })}
      {...(plain ? { fallback: plain } : {})}
    >
      {ai.data ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slice-text leading-relaxed">{ai.data.summary}</p>

          {ai.data.watchFor.length > 0 && (
            <ul className="space-y-1 list-none">
              {ai.data.watchFor.map((item, index) => (
                <li key={index} className="flex gap-2 text-[11px] leading-relaxed">
                  {item.atSec !== undefined ? (
                    <span className="font-mono text-slice-text-light shrink-0">
                      {mmss(item.atSec)}
                    </span>
                  ) : null}
                  <span className="text-slice-text-muted">{item.note}</span>
                </li>
              ))}
            </ul>
          )}

          {ai.data.difficultyNote ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-slice-text-light pt-1">
              {ai.data.difficultyNote}
            </p>
          ) : null}
        </div>
      ) : null}
    </AiPanel>
  );
}

'use client';

/**
 * A written recap of a finished versus match. (Feature 10.)
 *
 * The standings table on the results card answers "who won" and hides
 * everything else: the margin, the player who had the best accuracy in the room
 * and finished third, whether it was close. All of that is in the table and
 * none of it is legible at a glance.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import type { MatchRecap } from '@/lib/slice-it/ai/types';
import type { MatchStanding } from '@/lib/slice-it/ai/match.server';
import { AiPanel } from './AiPanel';
import { useSliceAi } from './useSliceAi';

export function MatchRecapPanel({
  songId,
  standings,
}: {
  songId: string;
  standings: MatchStanding[];
}) {
  const { t } = useTranslation('c-game');
  const ai = useSliceAi<MatchRecap, { songId: string; standings: MatchStanding[] }>(
    'match-recap',
    (body) => (body as { recap: MatchRecap | null }).recap,
  );

  // A one-player "match" is a solo run; the route refuses it and so does this.
  if (standings.length < 2) return null;

  return (
    <AiPanel
      title={t('ai-recap-title', { defaultValue: 'Match recap' })}
      actionLabel={t('ai-recap-action', { defaultValue: 'Write it up' })}
      state={ai.state}
      onRun={() => ai.run({ songId, standings })}
    >
      {ai.data ? (
        <div className="space-y-2">
          <p className="text-sm font-black text-slice-text-darker leading-snug">
            {ai.data.headline}
          </p>
          <p className="text-xs text-slice-text-muted leading-relaxed">{ai.data.story}</p>
          {ai.data.standout ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500">
              {ai.data.standout}
            </p>
          ) : null}
        </div>
      ) : null}
    </AiPanel>
  );
}

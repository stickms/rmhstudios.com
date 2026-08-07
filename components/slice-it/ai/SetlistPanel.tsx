'use client';

/**
 * Build an ordered practice set. (Feature 7.)
 *
 * The ordering is the product, not the selection — a player can already find
 * songs. What they cannot do without having played everything is decide which
 * of forty tracks to warm up on and which to put in the middle when their hands
 * are working but not tired yet.
 *
 * Each row starts that song, so the setlist is playable rather than a list to
 * copy out. Every id in it was resolved against the candidate rows server-side,
 * so a row here always points at a song that exists.
 */

import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ListMusic, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { mmss } from '@/lib/slice-it/ai/facts';
import type { ResolvedSetlistItem, Setlist } from '@/lib/slice-it/ai/types';
import { AiPanel } from './AiPanel';
import { useSliceAi } from './useSliceAi';

interface SetlistResponse {
  setlist: Setlist | null;
  items: ResolvedSetlistItem[] | null;
}

export function SetlistPanel({ onPick }: { onPick: (songId: string) => void }) {
  const { t } = useTranslation('c-game');
  const [goal, setGoal] = React.useState('');
  const [minutes, setMinutes] = React.useState(20);
  const [items, setItems] = React.useState<ResolvedSetlistItem[]>([]);

  const ai = useSliceAi<Setlist, { goal: string; minutes: number }>('setlist', (body) => {
    const payload = body as SetlistResponse;
    setItems(payload.items ?? []);
    return payload.setlist;
  });

  const total = items.reduce((sum, item) => sum + item.durationSec, 0);

  return (
    <AiPanel
      title={t('ai-setlist-title', { defaultValue: 'Build a set' })}
      actionLabel={t('ai-setlist-action', { defaultValue: 'Build' })}
      state={ai.state}
      onRun={() => {
        const trimmed = goal.trim();
        if (trimmed) ai.run({ goal: trimmed, minutes });
      }}
    >
      {ai.data ? (
        <div className="space-y-2">
          <p className="text-sm font-black text-slice-text-darker leading-snug">{ai.data.title}</p>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slice-text-light">
            {t('ai-setlist-total', {
              defaultValue: '{{count}} tracks · {{time}}',
              count: items.length,
              time: mmss(total),
            })}
          </p>
          <ol className="space-y-2 list-none">
            {items.map((item, index) => (
              <li key={item.songId}>
                <Button
                  variant="ghost"
                  onClick={() => onPick(item.songId)}
                  className="w-full h-auto flex items-start gap-3 p-2.5 rounded-xl bg-slice-bg text-left border-none justify-start shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] active:shadow-[inset_2px_2px_4px_var(--slice-shadow-dark),inset_-2px_-2px_4px_var(--slice-shadow-light)] hover:bg-slice-shadow-dark/10 transition-colors"
                >
                  <span className="font-mono text-[10px] text-slice-text-light shrink-0 pt-0.5">
                    {index + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-slice-text truncate">
                      {item.title}
                      <span className="font-normal text-slice-text-muted"> — {item.artist}</span>
                    </span>
                    <span className="block text-[10px] text-slice-text-muted leading-snug">
                      {mmss(item.durationSec)}
                      {item.difficulty ? ` · ${item.difficulty}` : ''}
                      {item.why ? ` · ${item.why}` : ''}
                    </span>
                  </span>
                  <Play className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/*
        The inputs live below the output rather than above it: once a set is
        built, the list is what the player is reading, and pushing it down the
        panel behind a form they have already filled in would bury it.
      */}
      <div className="flex gap-2 pt-3">
        <div className="relative flex-1">
          <ListMusic
            className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slice-text-light pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            maxLength={200}
            placeholder={t('ai-setlist-goal', { defaultValue: 'Warm up for expert charts' })}
            aria-label={t('ai-setlist-goal-label', { defaultValue: 'What is the set for?' })}
            className="pl-9 h-9 bg-slice-input-bg border-slice-input-border text-slice-text text-xs rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
          />
        </div>
        <Input
          type="number"
          min={5}
          max={120}
          value={minutes}
          onChange={(event) => setMinutes(Number(event.target.value) || 20)}
          aria-label={t('ai-setlist-minutes', { defaultValue: 'Minutes' })}
          className="w-20 h-9 bg-slice-input-bg border-slice-input-border text-slice-text text-xs rounded-xl text-center shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]"
        />
      </div>
    </AiPanel>
  );
}

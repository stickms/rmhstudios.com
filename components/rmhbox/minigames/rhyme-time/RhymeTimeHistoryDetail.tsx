/**
 * RhymeTimeHistoryDetail — Expanded history view for Rhyme Time games.
 *
 * Renders each round with root word, submissions grouped by rarity,
 * per-player score breakdown, and round winners.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §1.16
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function RhymeTimeHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const submissions = gameLog.actions.filter((a) => a.type === 'submission');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');

  return (
    <div className="space-y-4" data-testid="rhyme-time-history-detail">
      {roundStarts.map((round, idx) => {
        const roundNum = (round.payload.round as number) ?? idx + 1;
        const rootWord = round.payload.rootWord as string;
        const roundSubs = submissions.filter(
          (s) => {
            // Match submissions to rounds by sequence ordering
            const nextRound = roundStarts[idx + 1];
            return s.seq > round.seq && (!nextRound || s.seq < nextRound.seq);
          },
        );
        const roundEnd = roundEnds[idx];
        const roundWinner = roundEnd?.payload.roundWinner as string | undefined;

        // Group submissions by rarity
        const byRarity: Record<string, typeof roundSubs> = {
          rare: [], uncommon: [], common: [], invalid: [],
        };
        for (const sub of roundSubs) {
          const tier = (sub.payload.rarityTier as string) ?? 'common';
          if (byRarity[tier]) byRarity[tier].push(sub);
          else byRarity[tier] = [sub];
        }

        return (
          <div
            key={roundNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Round {roundNum}
              </h4>
              <span className="text-lg font-bold text-(--rmhbox-accent)">
                &ldquo;{rootWord}&rdquo;
              </span>
            </div>

            {/* Submissions by rarity */}
            {(['rare', 'uncommon', 'common', 'invalid'] as const).map((tier) => {
              const tierSubs = byRarity[tier] ?? [];
              if (tierSubs.length === 0) return null;
              const tierColors: Record<string, string> = {
                rare: 'text-yellow-500',
                uncommon: 'text-blue-400',
                common: 'text-(--rmhbox-text)',
                invalid: 'text-red-400 line-through',
              };
              return (
                <div key={tier} className="mb-2">
                  <span className={`text-xs font-medium uppercase ${tierColors[tier]}`}>
                    {tier} ({tierSubs.length})
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tierSubs.map((sub, si) => {
                      const isMe = sub.payload.userId === currentUserId;
                      return (
                        <span
                          key={si}
                          className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                            isMe
                              ? 'bg-(--rmhbox-accent)/20 text-(--rmhbox-accent) font-semibold'
                              : 'bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted)'
                          } ${tier === 'invalid' ? 'line-through' : ''}`}
                        >
                          {sub.payload.word as string}
                          <span className="ml-1 opacity-60">
                            ({sub.payload.score as number > 0 ? '+' : ''}
                            {sub.payload.score as number})
                          </span>
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Round winner */}
            {roundWinner && (
              <div className="mt-2 text-xs text-(--rmhbox-text-muted)">
                Round winner:{' '}
                <span className="font-semibold text-(--rmhbox-accent)">
                  {players.find((p) => p.userId === roundWinner)?.userName ?? roundWinner}
                </span>
              </div>
            )}
          </div>
        );
      })}

      {/* Final scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Final Scores</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <div
                key={p.userId}
                className={`flex justify-between text-sm ${
                  p.userId === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                }`}
              >
                <span>
                  #{p.rank} {p.userName}
                </span>
                <span className="font-mono">{p.score}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

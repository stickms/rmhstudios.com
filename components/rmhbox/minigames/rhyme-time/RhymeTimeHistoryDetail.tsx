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

interface SubmissionEntry {
  userId: string;
  word: string;
  valid: boolean;
  rarityTier: string;
  score: number;
  isMultiSyllable?: boolean;
}

export default function RhymeTimeHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');
  const allSubmissions = gameLog.actions.filter((a) => a.type === 'submission');

  return (
    <div className="space-y-4" data-testid="rhyme-time-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Rounds: {(gameLog.initialState.rounds as number) ?? roundStarts.length}</span>
            {gameLog.initialState.secondsPerRound && (
              <span>Time per Round: {gameLog.initialState.secondsPerRound as number}s</span>
            )}
            {gameLog.initialState.maxSubmissionsPerRound && (
              <span>Max Submissions: {gameLog.initialState.maxSubmissionsPerRound as number}</span>
            )}
          </div>
        </div>
      )}

      {/* Rounds */}
      {roundStarts.map((round, idx) => {
        const roundNum = (round.payload.round as number) ?? idx + 1;
        const rootWord = round.payload.rootWord as string;
        const validRhymeCount = round.payload.validRhymeCount as number | undefined;
        const roundEnd = roundEnds[idx];
        const roundWinner = roundEnd?.payload.roundWinner as string | undefined;

        // Get submissions from round_end (enriched with rarity/score) if available
        const enrichedSubs = (roundEnd?.payload.submissions as SubmissionEntry[] | undefined) ?? [];

        // Fall back to per-action submissions if round_end doesn't have them
        const fallbackSubs: SubmissionEntry[] = enrichedSubs.length > 0
          ? []
          : allSubmissions
            .filter((s) => {
              const nextRound = roundStarts[idx + 1];
              return s.seq > round.seq && (!nextRound || s.seq < nextRound.seq);
            })
            .map((s) => ({
              userId: s.payload.userId as string,
              word: s.payload.word as string,
              valid: (s.payload.valid as boolean) ?? (s.payload.isValid as boolean) ?? true,
              rarityTier: (s.payload.rarityTier as string) ?? 'common',
              score: (s.payload.score as number) ?? 0,
              isMultiSyllable: s.payload.isMultiSyllable as boolean | undefined,
            }));

        const roundSubs = enrichedSubs.length > 0 ? enrichedSubs : fallbackSubs;

        // Group submissions by rarity tier
        const byRarity: Record<string, SubmissionEntry[]> = {
          rare: [], uncommon: [], common: [], invalid: [],
        };
        for (const sub of roundSubs) {
          const tier = sub.valid === false ? 'invalid' : (sub.rarityTier ?? 'common');
          if (byRarity[tier]) byRarity[tier].push(sub);
          else byRarity[tier] = [sub];
        }

        // Compute per-player scores for this round
        const playerScores: Record<string, number> = {};
        for (const sub of roundSubs) {
          if (sub.valid !== false) {
            playerScores[sub.userId] = (playerScores[sub.userId] ?? 0) + (sub.score ?? 0);
          }
        }

        return (
          <div
            key={roundNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            {/* Round header */}
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Round {roundNum}
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-(--rmhbox-accent)">
                  &ldquo;{rootWord}&rdquo;
                </span>
                {validRhymeCount != null && (
                  <span className="text-xs text-(--rmhbox-text-muted)">
                    ({validRhymeCount} valid rhymes)
                  </span>
                )}
              </div>
            </div>

            {/* Submissions by rarity tier */}
            {(['rare', 'uncommon', 'common', 'invalid'] as const).map((tier) => {
              const tierSubs = byRarity[tier] ?? [];
              if (tierSubs.length === 0) return null;
              const tierColors: Record<string, string> = {
                rare: 'text-yellow-500',
                uncommon: 'text-blue-400',
                common: 'text-(--rmhbox-text)',
                invalid: 'text-red-400',
              };
              const tierLabels: Record<string, string> = {
                rare: '★ Rare',
                uncommon: 'Uncommon',
                common: 'Common',
                invalid: 'Invalid',
              };
              return (
                <div key={tier} className="mb-2">
                  <span className={`text-xs font-medium uppercase ${tierColors[tier]}`}>
                    {tierLabels[tier]} ({tierSubs.length})
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tierSubs.map((sub, si) => {
                      const isMe = sub.userId === currentUserId;
                      const playerName = players.find((p) => p.userId === sub.userId)?.userName;
                      return (
                        <span
                          key={si}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                            isMe
                              ? 'bg-(--rmhbox-accent)/20 text-(--rmhbox-accent) font-semibold'
                              : 'bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted)'
                          } ${tier === 'invalid' ? 'line-through' : ''}`}
                          title={playerName ? `Submitted by ${playerName}` : undefined}
                        >
                          {sub.word}
                          {sub.isMultiSyllable && <span className="ml-0.5 text-yellow-400">✦</span>}
                          <span className="ml-1 opacity-60">
                            {sub.score > 0 ? '+' : ''}{sub.score}
                          </span>
                          {playerName && (
                            <span className="ml-1 opacity-40 text-[10px]">
                              ({playerName})
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Per-player round scores */}
            {Object.keys(playerScores).length > 0 && (
              <div className="mt-3 pt-2 border-t border-(--rmhbox-border)">
                <span className="text-xs font-medium text-(--rmhbox-text-muted) uppercase">Round Scores</span>
                <div className="flex flex-wrap gap-3 mt-1">
                  {Object.entries(playerScores)
                    .sort(([, a], [, b]) => b - a)
                    .map(([userId, score]) => {
                      const name = players.find((p) => p.userId === userId)?.userName ?? userId;
                      const isMe = userId === currentUserId;
                      return (
                        <span
                          key={userId}
                          className={`text-xs ${isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text-muted)'}`}
                        >
                          {name}: {score > 0 ? '+' : ''}{score}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Round winner */}
            {roundWinner && (
              <div className="mt-2 text-xs text-(--rmhbox-text-muted)">
                🏆 Round winner:{' '}
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

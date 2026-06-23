/**
 * RhymeTimeHistoryDetail — Expanded history view for Rhyme Time games.
 *
 * Renders each round with root word, submissions grouped by rarity.
 * Each unique word is displayed once with all submitters listed.
 * A ⚡ icon appears next to the player who received the speed bonus.
 * Per-player score breakdown and round winners are shown.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §1.16
 */
'use client';

import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface SubmissionEntry {
  userId: string;
  word: string;
  valid: boolean;
  rarityTier: string;
  score: number;
  isMultiSyllable?: boolean;
}

interface DeduplicatedWord {
  word: string;
  tier: string;
  score: number;
  isMultiSyllable: boolean;
  submitters: Array<{ userId: string; isSpeedBonus: boolean }>;
}

/** Deduplicate submissions: group by word, merge submitters, mark the first submitter for speed bonus. */
function deduplicateSubmissions(subs: SubmissionEntry[]): DeduplicatedWord[] {
  const map = new Map<string, DeduplicatedWord>();
  // Track submission order to determine who was first per word
  const wordFirstSubmitter = new Map<string, string>();
  for (const sub of subs) {
    if (sub.valid === false) continue;
    if (!wordFirstSubmitter.has(sub.word)) {
      wordFirstSubmitter.set(sub.word, sub.userId);
    }
  }

  for (const sub of subs) {
    const key = `${sub.word}::${sub.valid}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.submitters.some((s) => s.userId === sub.userId)) {
        existing.submitters.push({ userId: sub.userId, isSpeedBonus: false });
      }
    } else {
      map.set(key, {
        word: sub.word,
        tier: sub.valid === false ? 'invalid' : (sub.rarityTier ?? 'common'),
        score: sub.score,
        isMultiSyllable: sub.isMultiSyllable ?? false,
        submitters: [{ userId: sub.userId, isSpeedBonus: false }],
      });
    }
  }

  // Mark speed bonus: for non-unique valid words (>1 submitter), the first submitter gets the icon
  for (const dw of map.values()) {
    if (dw.tier !== 'invalid' && dw.submitters.length > 1) {
      const first = wordFirstSubmitter.get(dw.word);
      if (first) {
        const s = dw.submitters.find((s) => s.userId === first);
        if (s) s.isSpeedBonus = true;
      }
    }
  }

  return Array.from(map.values());
}

export default function RhymeTimeHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const { t } = useTranslation("c-rmhbox");
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');
  const allSubmissions = gameLog.actions.filter((a) => a.type === 'submission');

  return (
    <div className="space-y-4" data-testid="rhyme-time-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">{t("game-settings", { defaultValue: "Game Settings" })}</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>{t("rounds-count", { defaultValue: "Rounds: {{count}}", count: (gameLog.initialState.rounds as number) ?? roundStarts.length })}</span>
            {gameLog.initialState.secondsPerRound != null && (
              <span>{t("time-per-round", { defaultValue: "Time per Round: {{seconds}}s", seconds: String(gameLog.initialState.secondsPerRound) })}</span>
            )}
            {gameLog.initialState.maxSubmissionsPerRound != null && (
              <span>{t("max-submissions", { defaultValue: "Max Submissions: {{count}}", count: String(gameLog.initialState.maxSubmissionsPerRound) })}</span>
            )}
          </div>
        </div>
      )}

      {/* Rounds */}
      {roundStarts.map((round, idx) => {
        const roundNum = (round.payload.round as number) ?? idx + 1;
        const rootWord = round.payload.rootWord as string;
        const difficulty = round.payload.difficulty as string | undefined;
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
        const dedupedWords = deduplicateSubmissions(roundSubs);

        // Group deduplicated words by rarity tier
        const byRarity: Record<string, DeduplicatedWord[]> = {
          rare: [], uncommon: [], common: [], invalid: [],
        };
        for (const dw of dedupedWords) {
          if (byRarity[dw.tier]) byRarity[dw.tier].push(dw);
          else byRarity[dw.tier] = [dw];
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
                {t("round-num", { defaultValue: "Round {{num}}", num: roundNum })}
              </h4>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-(--rmhbox-accent)">
                  &ldquo;{rootWord}&rdquo;
                </span>
                {difficulty != null && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    difficulty === 'hard' ? 'bg-red-500/20 text-red-400' :
                    difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>
                    {difficulty}
                  </span>
                )}
              </div>
            </div>

            {/* Submissions by rarity tier */}
            {(['rare', 'uncommon', 'common', 'invalid'] as const).map((tier) => {
              const tierWords = byRarity[tier] ?? [];
              if (tierWords.length === 0) return null;
              const tierColors: Record<string, string> = {
                rare: 'text-yellow-500',
                uncommon: 'text-blue-400',
                common: 'text-(--rmhbox-text)',
                invalid: 'text-red-400',
              };
              const tierLabels: Record<string, string> = {
                rare: t("tier-rare", { defaultValue: "★ Rare" }),
                uncommon: t("tier-uncommon", { defaultValue: "Uncommon" }),
                common: t("tier-common", { defaultValue: "Common" }),
                invalid: t("tier-invalid", { defaultValue: "Invalid" }),
              };
              return (
                <div key={tier} className="mb-2">
                  <span className={`text-xs font-medium uppercase ${tierColors[tier]}`}>
                    {tierLabels[tier]} ({tierWords.length})
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {tierWords.map((dw) => {
                      const isMe = dw.submitters.some((s) => s.userId === currentUserId);
                      const submitterNames = dw.submitters.map((s) => {
                        const name = players.find((p) => p.userId === s.userId)?.userName ?? s.userId;
                        return { name, isSpeedBonus: s.isSpeedBonus };
                      });
                      return (
                        <span
                          key={dw.word}
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                            isMe
                              ? 'bg-(--rmhbox-accent)/20 text-(--rmhbox-accent) font-semibold'
                              : 'bg-(--rmhbox-surface-hover) text-(--rmhbox-text-muted)'
                          } ${tier === 'invalid' ? 'line-through' : ''}`}
                        >
                          {dw.word}
                          {dw.isMultiSyllable && <span className="ml-0.5 text-yellow-400">✦</span>}
                          <span className="ml-1 opacity-60">
                            {dw.score > 0 ? '+' : ''}{dw.score}
                          </span>
                          <span className="ml-1 opacity-40 text-[10px]">
                            ({submitterNames.map((s, i) => (
                              <span key={i}>
                                {i > 0 && ', '}{s.name}
                                {s.isSpeedBonus && <Zap className="inline h-2.5 w-2.5 text-yellow-400 ml-0.5" />}
                              </span>
                            ))})
                          </span>
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
                <span className="text-xs font-medium text-(--rmhbox-text-muted) uppercase">{t("round-scores", { defaultValue: "Round Scores" })}</span>
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
                {t("round-winner", { defaultValue: "🏆 Round winner:" })}{' '}
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
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">{t("final-scores", { defaultValue: "Final Scores" })}</h4>
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

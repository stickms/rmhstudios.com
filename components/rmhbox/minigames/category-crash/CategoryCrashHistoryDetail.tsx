/**
 * CategoryCrashHistoryDetail — Expanded history view for Category Crash games.
 *
 * Shows per-round breakdown with letter, categories, player answers,
 * crashed answers highlighted, crash details, and per-round scores.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §3.15
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface AnswerEntry {
  category: string;
  answer: string;
}

interface RoundScoreEntry {
  userId: string;
  points: number;
  validAnswers?: number;
  crashedAnswers?: number;
}

export default function CategoryCrashHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const answersLocked = gameLog.actions.filter((a) => a.type === 'answers_locked');
  const crashActions = gameLog.actions.filter((a) => a.type === 'crash' || a.type === 'crash_result');
  const roundEnds = gameLog.actions.filter((a) => a.type === 'round_end');

  function getPlayerName(userId: string): string {
    return players.find((p) => p.userId === userId)?.userName ?? userId;
  }

  return (
    <div className="space-y-4" data-testid="category-crash-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Rounds: {(gameLog.initialState.rounds as number) ?? roundStarts.length}</span>
            {gameLog.initialState.categoriesPerRound != null && (
              <span>Categories per Round: {String(gameLog.initialState.categoriesPerRound)}</span>
            )}
          </div>
        </div>
      )}

      {/* Rounds */}
      {roundStarts.map((round, idx) => {
        const roundNum = (round.payload.round as number) ?? idx + 1;
        const letter = round.payload.letter as string;
        const categories = (round.payload.categories as string[]) ?? [];

        // Answers for this round
        const nextRound = roundStarts[idx + 1];
        const roundAnswers = answersLocked.filter(
          (a) => a.seq > round.seq && (!nextRound || a.seq < nextRound.seq),
        );
        const roundCrashes = crashActions.filter(
          (c) => c.seq > round.seq && (!nextRound || c.seq < nextRound.seq),
        );
        const roundEnd = roundEnds[idx];
        const roundScores = (roundEnd?.payload.scores as RoundScoreEntry[] | undefined) ?? [];

        // Build set of crashed answers for quick lookup
        // Supports both old format (crash_result with crashedPlayers) and new format (crash with targetUserId)
        const crashedSet = new Set<string>();
        const crashDetails: Array<{ category: string; crashedAnswer: string; crasher: string; target: string }> = [];

        for (const crash of roundCrashes) {
          if (crash.type === 'crash_result') {
            // Old format: crash_result with crashedPlayers array
            const crashedPlayers = (crash.payload.crashedPlayers as string[]) ?? [];
            const category = crash.payload.category as string;
            for (const playerId of crashedPlayers) {
              crashedSet.add(`${playerId}:${category}`);
            }
          } else {
            // New format: crash with targetUserId and category
            const targetUserId = crash.payload.targetUserId as string;
            const category = (crash.payload.category as string) ?? categories[crash.payload.categoryIndex as number] ?? '';
            crashedSet.add(`${targetUserId}:${category}`);
            crashDetails.push({
              category,
              crashedAnswer: (crash.payload.crashedAnswer as string) ?? '',
              crasher: crash.payload.crasherId as string,
              target: targetUserId,
            });
          }
        }

        return (
          <div
            key={roundNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            {/* Round header */}
            <div className="flex items-center gap-3 mb-3">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Round {roundNum}
              </h4>
              <span className="text-2xl font-bold text-(--rmhbox-accent)">{letter}</span>
            </div>

            {/* Category × Player matrix */}
            {categories.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-(--rmhbox-text-muted)">
                      <th className="pb-1 pr-2 font-medium">Category</th>
                      {players.map((p) => (
                        <th
                          key={p.userId}
                          className={`pb-1 px-2 font-medium ${
                            p.userId === currentUserId ? 'text-(--rmhbox-accent)' : ''
                          }`}
                        >
                          {p.userName}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((cat) => (
                      <tr key={cat} className="border-t border-(--rmhbox-border)">
                        <td className="py-1 pr-2 font-medium text-(--rmhbox-text)">{cat}</td>
                        {players.map((p) => {
                          const playerAnswer = roundAnswers.find(
                            (a) => a.payload.userId === p.userId,
                          );
                          const answers = (playerAnswer?.payload.answers as AnswerEntry[]) ?? [];
                          const answer = answers.find((a) => a.category === cat)?.answer ?? '—';
                          const isCrashed = crashedSet.has(`${p.userId}:${cat}`);

                          return (
                            <td
                              key={p.userId}
                              className={`py-1 px-2 ${
                                isCrashed
                                  ? 'line-through text-red-400'
                                  : answer !== '—'
                                    ? 'text-(--rmhbox-accent)'
                                    : 'text-(--rmhbox-text-muted)'
                              }`}
                            >
                              {answer}
                              {isCrashed && <span className="ml-1 text-[10px] no-underline">💥</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Crash details */}
            {crashDetails.length > 0 && (
              <div className="mt-3 pt-2 border-t border-(--rmhbox-border)">
                <span className="text-xs font-medium text-(--rmhbox-text-muted) uppercase">Crashes</span>
                <div className="space-y-0.5 mt-1">
                  {crashDetails.map((c, i) => (
                    <div key={i} className="text-xs text-(--rmhbox-text-muted)">
                      <span className="text-red-400">💥</span>{' '}
                      <span className={c.crasher === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : ''}>
                        {getPlayerName(c.crasher)}
                      </span>
                      {' crashed '}
                      <span className={c.target === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : ''}>
                        {getPlayerName(c.target)}
                      </span>
                      {c.crashedAnswer && <>{'\'s \u201C'}{c.crashedAnswer}{'\u201D'}</>}
                      {' in '}{c.category}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-round scores */}
            {roundScores.length > 0 && (
              <div className="mt-3 pt-2 border-t border-(--rmhbox-border)">
                <span className="text-xs font-medium text-(--rmhbox-text-muted) uppercase">Round Scores</span>
                <div className="flex flex-wrap gap-3 mt-1">
                  {roundScores
                    .sort((a, b) => b.points - a.points)
                    .map((s) => {
                      const isMe = s.userId === currentUserId;
                      return (
                        <span
                          key={s.userId}
                          className={`text-xs ${isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text-muted)'}`}
                        >
                          {getPlayerName(s.userId)}: +{s.points}
                          {s.validAnswers != null && s.crashedAnswers != null && (
                            <span className="opacity-60 ml-0.5">
                              ({s.validAnswers}✓ {s.crashedAnswers}💥)
                            </span>
                          )}
                        </span>
                      );
                    })}
                </div>
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

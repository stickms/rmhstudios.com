/**
 * CategoryCrashHistoryDetail — Expanded history view for Category Crash games.
 *
 * Shows per-round breakdown with letter, categories, player answers,
 * crashed answers highlighted, and per-round scores.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md §3.15
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function CategoryCrashHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const roundStarts = gameLog.actions.filter((a) => a.type === 'round_start');
  const answersLocked = gameLog.actions.filter((a) => a.type === 'answers_locked');
  const crashResults = gameLog.actions.filter((a) => a.type === 'crash_result');

  return (
    <div className="space-y-4" data-testid="category-crash-history-detail">
      {roundStarts.map((round, idx) => {
        const roundNum = (round.payload.round as number) ?? idx + 1;
        const letter = round.payload.letter as string;
        const categories = (round.payload.categories as string[]) ?? [];

        // Answers for this round
        const nextRound = roundStarts[idx + 1];
        const roundAnswers = answersLocked.filter(
          (a) => a.seq > round.seq && (!nextRound || a.seq < nextRound.seq),
        );
        const roundCrashes = crashResults.filter(
          (c) => c.seq > round.seq && (!nextRound || c.seq < nextRound.seq),
        );

        // Build set of crashed answers for quick lookup
        const crashedSet = new Set<string>();
        for (const crash of roundCrashes) {
          const crashedPlayers = (crash.payload.crashedPlayers as string[]) ?? [];
          const category = crash.payload.category as string;
          for (const playerId of crashedPlayers) {
            crashedSet.add(`${playerId}:${category}`);
          }
        }

        return (
          <div
            key={roundNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
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
                          const answers = (playerAnswer?.payload.answers as Array<{ category: string; answer: string }>) ?? [];
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
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
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

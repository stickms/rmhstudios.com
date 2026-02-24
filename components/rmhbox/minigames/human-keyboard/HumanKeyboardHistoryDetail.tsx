/**
 * HumanKeyboardHistoryDetail — History detail view for Human Keyboard games.
 *
 * Renders the game log with sentence display and per-player stats
 * reconstructed from logged actions.
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

export default function HumanKeyboardHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const sentence = (gameLog.initialState?.sentence as string) ?? '';
  const keyPresses = gameLog.actions.filter(
    (a) => a.type === 'key_correct' || a.type === 'key_wrong',
  );

  // Aggregate per-player stats
  const statsMap: Record<string, { correct: number; wrong: number }> = {};
  for (const action of keyPresses) {
    const uid = action.payload.userId as string;
    if (!statsMap[uid]) statsMap[uid] = { correct: 0, wrong: 0 };
    if (action.type === 'key_correct') statsMap[uid].correct++;
    else statsMap[uid].wrong++;
  }

  return (
    <div className="space-y-4" data-testid="human-keyboard-history-detail">
      {/* Sentence */}
      {sentence && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">
            Sentence
          </h4>
          <p className="font-mono text-sm text-(--rmhbox-text)">&ldquo;{sentence}&rdquo;</p>
        </div>
      )}

      {/* Per-player stats */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Player Stats</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => {
              const stats = statsMap[p.userId];
              const correct = stats?.correct ?? 0;
              const wrong = stats?.wrong ?? 0;
              const total = correct + wrong;
              const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
              const isMe = p.userId === currentUserId;

              return (
                <div
                  key={p.userId}
                  className={`flex items-center justify-between text-sm ${
                    isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                  }`}
                >
                  <span>
                    #{p.rank} {p.userName}
                  </span>
                  <span className="font-mono text-xs text-(--rmhbox-text-muted)">
                    ✓{correct} ✗{wrong} ({accuracy}%)
                  </span>
                </div>
              );
            })}
        </div>
      </div>

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
                  p.userId === currentUserId
                    ? 'text-(--rmhbox-accent) font-semibold'
                    : 'text-(--rmhbox-text)'
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

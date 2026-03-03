/**
 * HumanKeyboardResults — End-of-game results display.
 *
 * Shows team aggregate stats, individual player stats with
 * accuracy, typing speed, effective speed, and score.
 */
'use client';

export interface PlayerResult {
  userId: string;
  userName: string;
  correctPresses: number;
  wrongPresses: number;
  wrongPlayerPresses: number;
  /** Accuracy as a percentage (0-100). */
  accuracy: number;
  /** Average typing speed in letters/sec. */
  typingSpeed: number;
  /** Effective typing speed = accuracy/100 × typingSpeed. */
  effectiveSpeed: number;
  score: number;
}

export interface TeamAggregate {
  teamAccuracy: number;
  teamTypingSpeed: number;
  teamEffectiveSpeed: number;
  completionTimeSec: number | null;
  sentence: string;
}

interface HumanKeyboardResultsProps {
  playerResults: PlayerResult[];
  teamAggregate: TeamAggregate | null;
  completed: boolean;
}

export default function HumanKeyboardResults({
  playerResults,
  teamAggregate,
  completed,
}: HumanKeyboardResultsProps) {
  const sorted = [...playerResults].sort((a, b) => b.score - a.score);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto text-(--rmhbox-text)">
      {/* Team aggregate stats */}
      {teamAggregate && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-bg) p-5 w-full text-center">
          <p className="text-xs uppercase tracking-wider text-(--rmhbox-text-muted)">
            {completed ? 'Sentence Completed!' : 'Time Expired'}
          </p>
          <div className="flex gap-6 text-sm mt-2">
            <div className="flex flex-col items-center">
              <span className="text-2xl font-extrabold text-(--rmhbox-accent)">{teamAggregate.teamAccuracy}%</span>
              <span className="text-xs text-(--rmhbox-text-muted)">Team Accuracy</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-extrabold text-(--rmhbox-accent)">{teamAggregate.teamTypingSpeed}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">Team Speed (l/s)</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-2xl font-extrabold text-(--rmhbox-accent)">{teamAggregate.teamEffectiveSpeed}</span>
              <span className="text-xs text-(--rmhbox-text-muted)">Effective Speed</span>
            </div>
          </div>
          {teamAggregate.completionTimeSec != null && (
            <p className="text-xs text-(--rmhbox-text-muted) mt-1">
              ⏱ Completed in {teamAggregate.completionTimeSec}s
            </p>
          )}
          <p className="text-xs text-(--rmhbox-text-muted) mt-1 font-mono">
            &ldquo;{teamAggregate.sentence}&rdquo;
          </p>
        </div>
      )}

      {/* Individual stats table */}
      <div className="w-full rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--rmhbox-border) text-xs text-(--rmhbox-text-muted) uppercase">
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">Accuracy</th>
              <th className="px-3 py-2 text-right">Speed</th>
              <th className="px-3 py-2 text-right">Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, idx) => (
              <tr
                key={p.userId}
                className="border-b border-(--rmhbox-border) last:border-0"
              >
                <td className="px-3 py-2 font-medium">
                  {idx === 0 && <span className="mr-1" title="Top scorer">🏆</span>}
                  {p.userName}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  <span className={p.accuracy >= 90 ? 'text-green-400' : p.accuracy >= 70 ? 'text-yellow-400' : 'text-red-400'}>
                    {p.accuracy}%
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono text-(--rmhbox-text-muted)">
                  {p.typingSpeed} l/s
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold text-(--rmhbox-accent)">
                  {p.score}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

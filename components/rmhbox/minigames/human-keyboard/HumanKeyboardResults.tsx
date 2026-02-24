/**
 * HumanKeyboardResults — End-of-game results display.
 *
 * Shows team performance badge, individual stats table,
 * and MVP indicator.
 */
'use client';

export interface PlayerResult {
  userId: string;
  userName: string;
  keysPressed: number;
  correctKeys: number;
  wrongKeys: number;
  accuracy: number;
  isMvp?: boolean;
}

export interface TeamPerformance {
  sentence: string;
  completionTimeSec: number;
  totalErrors: number;
  grade: string;
}

interface HumanKeyboardResultsProps {
  playerResults: PlayerResult[];
  teamPerformance: TeamPerformance | null;
  completed: boolean;
}

const GRADE_COLORS: Record<string, string> = {
  S: 'text-yellow-400',
  A: 'text-green-400',
  B: 'text-blue-400',
  C: 'text-(--rmhbox-text)',
  D: 'text-orange-400',
  F: 'text-red-400',
};

export default function HumanKeyboardResults({
  playerResults,
  teamPerformance,
  completed,
}: HumanKeyboardResultsProps) {
  const sorted = [...playerResults].sort((a, b) => b.correctKeys - a.correctKeys);

  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-lg mx-auto text-(--rmhbox-text)">
      {/* Team performance badge */}
      {teamPerformance && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-bg) p-5 w-full text-center">
          <p className="text-xs uppercase tracking-wider text-(--rmhbox-text-muted)">
            {completed ? 'Sentence Completed!' : 'Time Expired'}
          </p>
          <span className={`text-5xl font-extrabold ${GRADE_COLORS[teamPerformance.grade] ?? 'text-(--rmhbox-text)'}`}>
            {teamPerformance.grade}
          </span>
          <div className="flex gap-4 text-xs text-(--rmhbox-text-muted)">
            <span>⏱ {teamPerformance.completionTimeSec.toFixed(1)}s</span>
            <span>❌ {teamPerformance.totalErrors} errors</span>
          </div>
          <p className="text-xs text-(--rmhbox-text-muted) mt-1 font-mono">
            &ldquo;{teamPerformance.sentence}&rdquo;
          </p>
        </div>
      )}

      {/* Individual stats table */}
      <div className="w-full rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-(--rmhbox-border) text-xs text-(--rmhbox-text-muted) uppercase">
              <th className="px-3 py-2 text-left">Player</th>
              <th className="px-3 py-2 text-right">Correct</th>
              <th className="px-3 py-2 text-right">Wrong</th>
              <th className="px-3 py-2 text-right">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr
                key={p.userId}
                className="border-b border-(--rmhbox-border) last:border-0"
              >
                <td className="px-3 py-2 font-medium">
                  {p.isMvp && <span className="mr-1" title="MVP">🏆</span>}
                  {p.userName}
                </td>
                <td className="px-3 py-2 text-right font-mono text-green-400">
                  {p.correctKeys}
                </td>
                <td className="px-3 py-2 text-right font-mono text-red-400">
                  {p.wrongKeys}
                </td>
                <td className="px-3 py-2 text-right font-mono">
                  {Math.round(p.accuracy * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

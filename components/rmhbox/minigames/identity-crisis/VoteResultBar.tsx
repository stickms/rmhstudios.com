/**
 * VoteResultBar — Horizontal stacked bar showing vote distribution.
 *
 * Displays yes/no/maybe vote counts as colored segments in a horizontal bar,
 * with the majority answer highlighted.
 *
 * Props:
 *   votes: { yes: number; no: number; maybe: number } — Vote tallies
 *   majorityAnswer: string — The winning vote category
 */
'use client';

interface VoteResultBarProps {
  votes: { yes: number; no: number; maybe: number };
  majorityAnswer: string;
}

export default function VoteResultBar({ votes, majorityAnswer }: VoteResultBarProps) {
  const total = votes.yes + votes.no + votes.maybe;
  if (total === 0) return null;

  const segments = [
    { key: 'yes', count: votes.yes, color: 'bg-(--rmhbox-success)', label: 'Yes' },
    { key: 'no', count: votes.no, color: 'bg-(--rmhbox-danger)', label: 'No' },
    { key: 'maybe', count: votes.maybe, color: 'bg-(--rmhbox-warning)', label: 'Maybe' },
  ];

  return (
    <div className="flex w-full max-w-sm flex-col gap-2">
      {/* Majority label */}
      <p className="text-center text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
        Answer: <span className="text-(--rmhbox-text)">{majorityAnswer}</span>
      </p>

      {/* Stacked bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-full">
        {segments.map(({ key, count, color }) =>
          count > 0 ? (
            <div
              key={key}
              className={`flex items-center justify-center text-xs font-bold text-white ${color} ${
                key === majorityAnswer.toLowerCase() ? 'opacity-100' : 'opacity-60'
              }`}
              style={{ width: `${(count / total) * 100}%` }}
            >
              {count}
            </div>
          ) : null,
        )}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 text-[10px] text-(--rmhbox-text-muted)">
        {segments.map(({ key, count, label }) => (
          <span key={key}>
            {label}: {count}
          </span>
        ))}
      </div>
    </div>
  );
}

'use client';

import MovieReveal from './MovieReveal';

interface PlayerResult {
  userId: string;
  userName: string;
  guessedCorrectly: boolean;
  points: number;
  guessNumber?: number;
}

interface RoundResultsProps {
  movieTitle: string;
  emojis: string[];
  producerName: string;
  producerPoints: number;
  results: PlayerResult[];
  roundNumber: number;
}

export default function RoundResults({
  movieTitle,
  emojis,
  producerName,
  producerPoints,
  results,
  roundNumber,
}: RoundResultsProps) {
  const sorted = [...results].sort((a, b) => b.points - a.points);

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full max-w-md mx-auto">
      <p className="text-xs uppercase tracking-wider text-(--rmhbox-text-muted)">
        Round {roundNumber} Results
      </p>

      <MovieReveal title={movieTitle} />

      <div className="flex gap-1 text-2xl">
        {emojis.map((e, i) => (
          <span key={i}>{e}</span>
        ))}
      </div>

      <div className="text-sm text-(--rmhbox-text-muted)">
        Producer: <span className="font-semibold text-(--rmhbox-text)">{producerName}</span>
        {' '}— {producerPoints} pts
      </div>

      <div className="w-full flex flex-col gap-1">
        <span className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase tracking-wide">
          Audience Results
        </span>
        {sorted.map((r) => (
          <div
            key={r.userId}
            className="flex items-center justify-between px-3 py-2 rounded-lg bg-(--rmhbox-surface) text-sm"
          >
            <div className="flex items-center gap-2">
              <span>{r.guessedCorrectly ? '✅' : '❌'}</span>
              <span className="text-(--rmhbox-text)">{r.userName}</span>
              {r.guessNumber != null && (
                <span className="text-xs text-(--rmhbox-text-muted)">
                  (guess #{r.guessNumber})
                </span>
              )}
            </div>
            <span className="font-semibold text-(--rmhbox-accent)">{r.points} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

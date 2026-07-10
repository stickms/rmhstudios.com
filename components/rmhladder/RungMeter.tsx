/**
 * RungMeter — Signature relevance indicator.
 *
 * Renders 5 horizontal rungs filled bottom-up.
 * Filled color: --brass; all-5 + score ≥ 80 → --ledger.
 */

interface RungMeterProps {
  score: number;
  size?: 'sm' | 'lg';
}

export function RungMeter({ score, size = 'sm' }: RungMeterProps) {
  const clamped = Math.max(0, Math.min(100, score));
  const filledCount = Math.min(5, Math.ceil(clamped / 20));
  const tone: 'brass' | 'ledger' = filledCount === 5 && clamped >= 80 ? 'ledger' : 'brass';

  // Rungs are numbered 1 (bottom) to 5 (top); render top-to-bottom via column-reverse CSS
  const rungs = Array.from({ length: 5 }, (_, i) => i + 1); // [1,2,3,4,5]

  return (
    <div
      className={`rl-rung-meter rl-rung-meter--${size}`}
      aria-label={`relevance ${clamped} of 100`}
      data-tone={tone}
    >
      {rungs.map((rungNum) => (
        <div
          key={rungNum}
          className="rl-rung-meter__rung"
          data-filled={rungNum <= filledCount ? 'true' : 'false'}
        />
      ))}
    </div>
  );
}

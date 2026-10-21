import { cn } from '@/lib/utils';

interface SparklineProps {
  values: number[];
  /** Accessible description, e.g. "Requests per minute, latest 142". */
  label: string;
  className?: string;
}

const W = 160;
const H = 36;
const PAD = 2;

/**
 * A dependency-free trend line: one `<path>` in a `viewBox`, painted in
 * `currentColor` so the caller chooses the ink (a site token class). Scales to
 * any width without a resize observer, same approach as the Sohum tracker's
 * charts. The baseline is pinned at zero — a sparkline that rescales to its own
 * minimum turns noise into drama.
 */
export function Sparkline({ values, label, className }: SparklineProps) {
  if (values.length < 2) {
    return (
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${W} ${H}`}
        className={cn('h-9 w-full', className)}
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H - PAD}
          y2={H - PAD}
          stroke="currentColor"
          strokeOpacity={0.3}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }
  const max = Math.max(...values, 1e-9);
  const x = (i: number) => PAD + (i / (values.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / max) * (H - PAD * 2);
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(' ');
  const area = `${line} L${x(values.length - 1).toFixed(1)} ${H - PAD} L${x(0).toFixed(1)} ${H - PAD} Z`;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${W} ${H}`}
      className={cn('h-9 w-full', className)}
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(values.length - 1)}
        cy={y(values[values.length - 1])}
        r={2.2}
        fill="currentColor"
      />
    </svg>
  );
}

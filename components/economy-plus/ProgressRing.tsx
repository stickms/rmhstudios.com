'use client';

/**
 * A static SVG progress ring. No animation loop and no per-frame state — the
 * arc is a single `stroke-dashoffset`, so a wallet full of goals costs nothing
 * at rest.
 */
export function ProgressRing({
  value,
  size = 72,
  stroke = 7,
  label,
}: {
  /** 0–1. */
  value: number;
  size?: number;
  stroke?: number;
  /** Text in the centre, e.g. "64%". */
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-[var(--site-border)]"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="stroke-[var(--site-accent)]"
        />
      </svg>
      {label ? (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold tabular-nums text-site-text">
          {label}
        </span>
      ) : null}
    </div>
  );
}

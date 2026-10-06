'use client';

/**
 * The Windows 7 busy indicator: a ring of glowing blue dots chasing each other.
 * Pure CSS animation (no frame loop); under reduced motion it holds still and
 * the label carries the meaning.
 */

export function BusySpinner({ label, size = 32 }: { label: string; size?: number }) {
  return (
    <div className="ds-busy" role="status">
      <span className="ds-busy-ring" style={{ width: size, height: size }} aria-hidden="true">
        {Array.from({ length: 8 }, (_, i) => (
          <span
            key={i}
            style={{ transform: `rotate(${i * 45}deg)`, animationDelay: `${(i - 8) * 0.1}s` }}
          />
        ))}
      </span>
      <span className="ds-busy-label">{label}</span>
    </div>
  );
}

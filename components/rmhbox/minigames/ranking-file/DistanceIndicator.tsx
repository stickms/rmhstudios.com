/**
 * DistanceIndicator — Visual gauge showing how far a player's ranking
 * deviated from the group average.
 *
 * Color gradient: green (low distance) → yellow → red (high distance).
 * Special labels for exact matches and outliers.
 *
 * Props:
 *   distance     — Player's total distance from average
 *   maxDistance   — Maximum possible distance for normalization
 *   isExactMatch — Whether the player matched the consensus perfectly
 *   isOutlier    — Whether this was the most unique ranking
 */
'use client';

interface DistanceIndicatorProps {
  distance: number;
  maxDistance: number;
  isExactMatch: boolean;
  isOutlier: boolean;
}

export default function DistanceIndicator({
  distance,
  maxDistance,
  isExactMatch,
  isOutlier,
}: DistanceIndicatorProps) {
  const ratio = maxDistance > 0 ? Math.min(distance / maxDistance, 1) : 0;
  const percentage = Math.round(ratio * 100);

  // Interpolate color: green → yellow → red
  const hue = Math.round((1 - ratio) * 120); // 120=green, 60=yellow, 0=red

  return (
    <div className="flex flex-col gap-1">
      {/* Label */}
      {isExactMatch && (
        <span className="text-xs font-bold text-green-400">🎯 Perfect Match!</span>
      )}
      {isOutlier && !isExactMatch && (
        <span className="text-xs font-bold text-red-400">🦄 Most Unique!</span>
      )}

      {/* Gauge bar */}
      <div className="h-3 w-full rounded-full bg-(--rmhbox-border) overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${Math.max(percentage, 4)}%`,
            backgroundColor: `hsl(${hue}, 80%, 50%)`,
          }}
        />
      </div>

      {/* Distance value */}
      <span className="text-xs text-(--rmhbox-text-muted)">
        Distance: {distance.toFixed(1)}
      </span>
    </div>
  );
}

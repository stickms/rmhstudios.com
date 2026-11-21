/** A flat progress bar for an achievement: `--site-text` on `--site-bg-subtle` (Steel), with the progressbar role. */
export function AchievementProgress({
  name,
  progress,
  target,
  className,
}: {
  name: string;
  progress: number;
  target: number;
  className?: string;
}) {
  const value =
    Math.max(
      0,
      Math.min(
        progress,
        target,
      ),
    );
  return (
    <div
      role="progressbar"
      aria-label={
        name
      }
      aria-valuemin={
        0
      }
      aria-valuemax={
        target
      }
      aria-valuenow={
        value
      }
      className={`h-1.5 w-full overflow-hidden rounded-site-sm bg-site-bg-subtle ${className ?? ''}`}
    >
      <div
        className="h-full bg-site-text"
        style={{
          width: `${target > 0 ? (value / target) * 100 : 0}%`,
        }}
      />
    </div>
  );
}

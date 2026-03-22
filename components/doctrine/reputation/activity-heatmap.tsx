/**
 * GitHub-style contribution heatmap for Doctrine activity.
 */

interface HeatmapProps {
  /** Map of YYYY-MM-DD → activity count */
  data: Record<string, number>;
  weeks?: number;
}

export function ActivityHeatmap({ data, weeks = 20 }: HeatmapProps) {
  const today = new Date();
  const cells: Array<{ date: string; count: number; dayOfWeek: number }> = [];

  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    cells.push({ date: dateStr, count: data[dateStr] ?? 0, dayOfWeek: d.getDay() });
  }

  const maxCount = Math.max(1, ...cells.map(c => c.count));

  function getColor(count: number): string {
    if (count === 0) return 'rgba(255,255,255,0.04)';
    const intensity = count / maxCount;
    if (intensity > 0.75) return 'var(--doctrine-accent, #F97316)';
    if (intensity > 0.5) return 'rgba(249,115,22,0.7)';
    if (intensity > 0.25) return 'rgba(249,115,22,0.4)';
    return 'rgba(249,115,22,0.2)';
  }

  // Group into weeks
  const weekGroups: typeof cells[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weekGroups.push(cells.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-[3px]">
        {weekGroups.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map(cell => (
              <div
                key={cell.date}
                className="w-2.5 h-2.5 rounded-[2px]"
                style={{ backgroundColor: getColor(cell.count) }}
                title={`${cell.date}: ${cell.count} actions`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

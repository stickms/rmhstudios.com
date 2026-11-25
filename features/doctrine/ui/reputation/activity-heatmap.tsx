/**
 * GitHub-style contribution heatmap for Doctrine activity.
 */

import { useTranslation } from 'react-i18next';
import { dayOf } from '@/lib/calendar/tz';
import { resolveTimeZone } from '@features/doctrine/engine/ledger';

interface HeatmapProps {
  /** Map of YYYY-MM-DD → activity count */
  data: Record<string, number>;
  weeks?: number;
  /** The zone the day keys are in (the one the activity read was bucketed in); UTC when omitted. */
  tz?: string;
}

export function ActivityHeatmap({ data, weeks = 20, tz }: HeatmapProps) {
  const { t } = useTranslation('doctrine-ledger');
  const zone = resolveTimeZone(tz);
  const today = new Date();
  const cells: Array<{
    date: string;
    count: number;
    dayOfWeek: number;
  }> = [];

  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = dayOf(d.getTime(), zone);
    cells.push({
      date: dateStr,
      count: data[dateStr] ?? 0,
      dayOfWeek: d.getDay(),
    });
  }

  const maxCount = Math.max(1, ...cells.map((c) => c.count));

  function getColor(count: number): string {
    if (count === 0) return 'rgba(255,255,255,0.04)';
    const intensity = count / maxCount;
    if (intensity > 0.75) return 'var(--doctrine-accent, #F97316)';
    if (intensity > 0.5) return 'rgba(249,115,22,0.7)';
    if (intensity > 0.25) return 'rgba(249,115,22,0.4)';
    return 'rgba(249,115,22,0.2)';
  }

  const activeDays = cells.filter((c) => c.count > 0).length;

  // Group into weeks
  const weekGroups: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    weekGroups.push(cells.slice(i, i + 7));
  }

  return (
    <div className="overflow-x-auto">
      <p className="sr-only">
        {t('heatmap-summary', {
          defaultValue: 'Active on {{active}} of the last {{total}} days',
          active: activeDays,
          total: cells.length,
        })}
      </p>
      <div className="flex gap-[3px]" aria-hidden="true">
        {weekGroups.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell) => (
              <div
                key={cell.date}
                className="w-2.5 h-2.5 rounded-[2px]"
                style={{
                  backgroundColor: getColor(cell.count),
                }}
                title={`${cell.date}: ${cell.count} actions`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

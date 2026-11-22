import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart } from '@/components/ui/bar-chart';

/**
 * Net follower change per week, drawn by the shared `BarChart` (signed values: gains rise above
 * the zero rule, losses hang below it). `weeks` is oldest first.
 */
export function WeeklyNetBars({
  weeks,
}: {
  weeks: {
    start: string;
    net: number;
  }[];
}) {
  const { t, i18n } = useTranslation('audience');
  const number = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        signDisplay: 'exceptZero',
      }),
    [i18n.language],
  );
  const date = useMemo(() => {
    const f = new Intl.DateTimeFormat(i18n.language, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [i18n.language]);
  const total = weeks.reduce((sum, w) => sum + w.net, 0);

  return (
    <BarChart
      bars={weeks.map((w) => ({
        label: date(w.start),
        value: w.net,
      }))}
      label={t('weekly-label', {
        defaultValue: 'Net follower change per week',
      })}
      summary={t('weekly-summary', {
        count: Number(weeks.length),
        defaultValue_one: 'Net change per week over {{weeks}} week, {{total}} in all.',
        defaultValue: 'Net change per week over {{weeks}} weeks, {{total}} in all.',
        weeks: weeks.length,
        total: number.format(total),
      })}
      columns={{
        label: t('weekly-week', {
          defaultValue: 'Week starting',
        }),
        value: t('weekly-net', {
          defaultValue: 'Net',
        }),
      }}
      format={(n) => number.format(n)}
    />
  );
}

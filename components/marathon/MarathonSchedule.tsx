import { useTranslation } from 'react-i18next';
import { itemId, planMarathon, type MarathonItem } from '@/lib/dunesday/marathon';
import { formatMinutes, localToday } from '@/lib/dunesday/schedule';

/** Day-by-day output of the marathon planner for a custom list. */
export function MarathonSchedule({ items, deadline }: { items: MarathonItem[]; deadline: string }) {
  const { t } = useTranslation('f-tools');
  const today = localToday();
  if (items.length === 0 || !deadline) return null;
  if (deadline < today) {
    return (
      <p className="text-sm text-site-text-muted">
        {t('marathon-past', {
          defaultValue: 'That deadline has passed - pick a later date to see a schedule.',
        })}
      </p>
    );
  }
  const plan = planMarathon(items, deadline, today);
  const name = (id: string) => items.find((_, i) => itemId(i) === id)?.title ?? id;
  return (
    <section
      className="space-y-3"
      aria-label={t('marathon-schedule', { defaultValue: 'Schedule' })}
    >
      <p role="status" className="glass-fill rounded-site p-3 text-sm">
        {plan.impossible
          ? t('marathon-impossible', {
              defaultValue: 'Even watching around the clock this does not fit before the deadline.',
            })
          : t('marathon-summary', {
              defaultValue: '{{total}} in total - about {{perDay}} a day finishes on {{date}}.',
              total: formatMinutes(plan.totalMinutes),
              perDay: formatMinutes(plan.minutesPerDay),
              date: plan.finishDate ?? deadline,
            })}
      </p>
      <ol className="space-y-2">
        {plan.days
          .filter((d) => d.entries.length > 0)
          .map((d) => (
            <li key={d.date} className="glass-fill rounded-site p-3">
              <h3 className="mb-1.5 flex justify-between text-sm font-semibold">
                <span>
                  {new Date(`${d.date}T00:00:00`).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span className="font-normal text-site-text-muted">{formatMinutes(d.minutes)}</span>
              </h3>
              <ul className="space-y-1 text-sm">
                {d.entries.map((e, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span>{name(e.titleId)}</span>
                    <span className="text-site-text-muted">{formatMinutes(e.minutes)}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ol>
    </section>
  );
}

import { useTranslation } from 'react-i18next';

/**
 * The monthly spending budget's meter (s04-07): a 4 px bar of ink on the subtle
 * fill, flat. Shared by the privacy panel and the wallet; `role="meter"` with a
 * text equivalent in `aria-valuetext`, so the figure is not conveyed by length
 * alone.
 */
export function SpendBudgetMeter({
  spent,
  cap,
  month,
  caption = true,
}: {
  spent: number;
  cap: number;
  /** `YYYY-MM`, the UTC month the figures are for. */
  month: string;
  /** Show "1,240 of 2,000 coins spent in November" under the bar. */
  caption?: boolean;
}) {
  const { t, i18n } = useTranslation('spending-budget');
  const used = Math.min(spent, cap);
  const monthName = new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  const text = t('spent-of-cap', {
    defaultValue: '{{spent}} of {{cap}} coins spent in {{month}}',
    spent: spent.toLocaleString(i18n.language),
    cap: cap.toLocaleString(i18n.language),
    month: monthName,
  });
  return (
    <div className="space-y-2">
      <div
        role="meter"
        aria-label={t('meter-label', { defaultValue: 'Monthly spending budget' })}
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={used}
        aria-valuetext={text}
        className="h-1 w-full rounded-site-sm bg-site-bg-subtle"
      >
        <div className="h-full rounded-site-sm bg-site-text" style={{ width: `${(used / cap) * 100}%` }} />
      </div>
      {caption && <p className="t-meta">{text}</p>}
    </div>
  );
}

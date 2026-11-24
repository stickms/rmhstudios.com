import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cycleLabelIsolated } from '../../engine/cycle';
import { cycleRanges } from '../../engine/secondaries/cycle-ranges';

/**
 * How the cycles a prompt was observed in read, in the site's `2026–2027` style: runs of consecutive cycles collapse and a
 * gap starts a new range ("2023–2024 to 2025–2026, 2027–2028"). Each cycle is its own left-to-right isolate
 * (`cycleLabelIsolated`), so in `ar` the years keep their order and en dashes while "to" and the list separators follow the
 * page's direction.
 */
export function useCycleRangeText(): (cycles: readonly number[]) => string {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const list = new Intl.ListFormat(locale, { type: 'unit', style: 'short' });
  return (cycles) =>
    list.format(
      cycleRanges(cycles).map((r) =>
        r.from === r.to
          ? cycleLabelIsolated(r.from)
          : t('secondaries-cycles-range', {
              defaultValue: '{{from}} to {{to}}',
              from: cycleLabelIsolated(r.from),
              to: cycleLabelIsolated(r.to),
            }),
      ),
    );
}

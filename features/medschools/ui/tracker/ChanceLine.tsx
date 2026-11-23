import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import type { ChanceDto } from '../../medschools.contract';

/**
 * One application's invite chance, as `t-meta` lines under a rule (R3): a row per horizon, then where the estimate comes
 * from. Calendar dates through the page locale, whole percents, never "day N". A closed application (rejected,
 * withdrawn, accepted) says nothing: the estimate is for someone still waiting.
 */
export function ChanceLine({ chance }: { chance: ChanceDto | undefined }) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  if (!chance || chance.status === 'closed') return null;
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const nf = new Intl.NumberFormat(locale);

  const lines: string[] = [];
  switch (chance.status) {
    case 'estimate':
      for (const p of chance.points) {
        lines.push(
          t('chance-estimate', {
            defaultValue:
              'If you have not heard by today, the chance of an interview invite is {{percent}} by {{date}}',
            percent: pct.format(p.percent / 100),
            date: formatUtcDay(p.on, locale),
          }),
        );
      }
      if (chance.asOf && chance.basis !== null) {
        lines.push(
          t('chance-basis', {
            defaultValue: "Estimate as of {{date}}, from at least {{n}} members' applications at this school.",
            date: formatUtcDay(chance.asOf, locale),
            n: nf.format(chance.basis),
          }),
        );
      }
      break;
    case 'thin':
      lines.push(
        t('chance-thin', {
          defaultValue: 'Not enough data yet for an estimate here. It needs at least 20 members at this school.',
        }),
      );
      break;
    case 'no-complete':
      lines.push(
        t('chance-no-complete', { defaultValue: 'Add the date your application was complete to see an estimate.' }),
      );
      break;
    case 'invited':
      lines.push(
        t('chance-invited', {
          defaultValue: 'Invited on {{date}}.',
          date: chance.invitedOn ? formatUtcDay(chance.invitedOn, locale) : '',
        }),
      );
      break;
    case 'beyond':
      lines.push(
        t('chance-beyond', {
          defaultValue: 'Too few comparable applications are still waiting at this point for an estimate.',
        }),
      );
      break;
  }
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 border-t border-site-border pt-2" data-chance={chance.status}>
      {lines.map((line) => (
        <p key={line} className="t-meta m-0 mt-1 first:mt-0">
          {line}
        </p>
      ))}
    </div>
  );
}

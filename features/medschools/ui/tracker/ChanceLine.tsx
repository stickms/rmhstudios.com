import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import type { ChanceDto } from '../../medschools.contract';

/**
 * One application's invite chance, as a `t-meta` lead line under a rule (R3), a row per horizon ("by Nov 30 · 12%"), then where the estimate comes
 * from. Calendar dates through the page locale, whole percents, never "day N". A closed application (rejected,
 * withdrawn, accepted) says nothing: the estimate is for someone still waiting.
 */
export function ChanceLine({ chance }: { chance: ChanceDto | undefined }) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  if (!chance || chance.status === 'closed') return null;
  const pct = new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 });
  const nf = new Intl.NumberFormat(locale);

  // Numbers and dates sit in first-strong isolates so a right-to-left sentence does not reorder "12%" or "Nov 30".
  const iso = (v: string) => `\u2068${v}\u2069`;

  const lines: string[] = [];
  let lead: string | null = null;
  let horizons: string[] = [];
  switch (chance.status) {
    case 'estimate':
      lead = t('chance-lead', { defaultValue: 'If you have not heard by today, the chance of an interview invite:' });
      horizons = chance.points.map((p) =>
        t('chance-horizon', {
          defaultValue: 'by {{date}} · {{percent}}',
          percent: iso(pct.format(p.percent / 100)),
          date: iso(formatUtcDay(p.on, locale)),
        }),
      );
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
  if (lines.length === 0 && horizons.length === 0) return null;
  return (
    <div className="mt-2 border-t border-site-border pt-2" data-chance={chance.status}>
      {lead ? <p className="t-meta m-0">{lead}</p> : null}
      {horizons.length > 0 ? (
        <ul className="m-0 mt-1 list-none p-0">
          {horizons.map((h) => (
            <li key={h} className="t-body border-b border-site-border py-1 last:border-b-0">
              {h}
            </li>
          ))}
        </ul>
      ) : null}
      {lines.map((line) => (
        <p key={line} className="t-meta m-0 mt-1">
          {line}
        </p>
      ))}
    </div>
  );
}

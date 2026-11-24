import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { textFragmentUrl } from '../../engine/text-fragment';
import { SourceRef } from '../SourceRef';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { MedRollingEntryDto, MedRollingGuidanceRes } from '../../medschools.contract';
import { useMedLabels } from '../labels';

/**
 * "Where applying early matters": what each of a member's schools says about rolling decisions, one row per school and
 * program, in the order the server sends (rolling, then set dates, then unknown). Always "the school says", with the
 * school's own sentence quoted and its page linked with the day it was checked. Nothing here tells the member what to do.
 * Presentational: the caller owns the query and the open state, and passes how a school is linked.
 */
export function RollingView({
  data,
  school,
}: {
  data: MedRollingGuidanceRes;
  /** The school's name as a link to its page for this program. */
  school: (slug: string, program: 'REG' | 'PHD', name: string) => ReactNode;
}) {
  const { t } = useTranslation('medschools');
  if (data.entries.length === 0) {
    return (
      <p className="medapp-meta">
        {t('rolling-empty', { defaultValue: 'Add schools to see what each one says about rolling decisions.' })}
      </p>
    );
  }
  return (
    <ul className="medapp-list">
      {data.entries.map((e) => (
        <Row key={`${e.slug}:${e.program}`} entry={e} school={school} tracker={data.source === 'tracker'} />
      ))}
    </ul>
  );
}

function Row({
  entry: e,
  school,
  tracker,
}: {
  entry: MedRollingEntryDto;
  school: (slug: string, program: 'REG' | 'PHD', name: string) => ReactNode;
  tracker: boolean;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const { locale } = useLocaleFormat();
  const program = programFilterLabel(e.program, e.degree);
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(iso),
    );
  const says =
    e.kind === 'rolling'
      ? t('rolling-says-rolling', { defaultValue: 'Rolling: the school says offers are made on a rolling basis.' })
      : e.kind === 'set-dates'
        ? t('rolling-says-set-dates', { defaultValue: 'Set dates: the school says decisions are made on set dates.' })
        : e.program === 'PHD'
          ? t('rolling-says-unknown-program', {
              defaultValue: 'The school’s {{program}} page does not say.',
              program,
            })
          : t('rolling-says-unknown', { defaultValue: 'The school’s page does not say.' });
  return (
    <li className="flex flex-col gap-1">
      <div className="medapp-srcrow">
        <p className="medapp-text break-words">
          <span className="font-medium">{school(e.slug, e.program, e.schoolName)}</span>
          {' · '}
          {program}
        </p>
        {e.url && e.checkedOn ? (
          <SourceRef
            name={t('admissions-source-name', { defaultValue: '{{school}} admissions page', school: e.schoolName })}
            detail={t('source-checked', { defaultValue: 'Checked {{date}}', date: day(e.checkedOn) })}
            quote={e.evidence}
            href={textFragmentUrl(e.url, e.evidence)}
            attribution={t('admissions-source', {
              defaultValue: 'Source: {{school}} admissions page, checked {{date}}',
              school: e.schoolName,
              date: day(e.checkedOn),
            })}
          />
        ) : null}
      </div>
      <p className="medapp-text">{says}</p>
      {e.evidence ? (
        <p className="medapp-meta break-words">
          {t('admissions-quote', { defaultValue: '“{{text}}”', text: e.evidence })}
        </p>
      ) : null}
      {tracker && e.submitted === false ? (
        <p className="medapp-meta">{t('rolling-not-started', { defaultValue: 'No step recorded here yet.' })}</p>
      ) : null}
    </li>
  );
}

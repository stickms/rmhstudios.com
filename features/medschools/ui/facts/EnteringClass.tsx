import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import { isPhdOnlyQualifier, profileQualifierNote, type ProfileKindId } from '../../engine/school-facts';
import { isPdfUrl, textFragmentUrl, textFragmentsUrl } from '../../engine/text-fragment';
import type { MedClassProfileDto, MedClassProfileStatDto } from '../../medschools.contract';
import { schoolFactsQuery } from '../../medschools.queries';
import { SourceRef } from '../SourceRef';

/**
 * "Entering class" (phase C step 2): the newest entering class as the school's OWN class-profile page states it, first
 * on the Facts tab. Its label ("Class of 2030 · entered 2026", or the page's own words and "Year not stated"), compact
 * figure tiles for MCAT, GPA, science GPA, applicants, interviewed, class size and in state, then the page's other
 * figures as definition rows named by their qualifier, and a figure for the MD-PhD (DO-PhD) program only in its own
 * group. A previous class is a native disclosure with the same layout. Only what the page states, exactly as written:
 * nothing is computed (no acceptance rate, no ratio) and no figure is rounded or reformatted.
 *
 * Each group's source is the book icon at the end of its row: the page with the group's words highlighted (text
 * fragments; a PDF opens plain). A school with no profile renders nothing. Shares the school-facts query with the other
 * Facts panels, so the tab still makes one request.
 */
export function EnteringClass({ slug, schoolName, degree }: { slug: string; schoolName: string; degree: 'MD' | 'DO' }) {
  const query = useQuery(schoolFactsQuery(slug));
  const classes = query.data?.classes;
  if (!classes || classes.length === 0) return null;
  return <EnteringClassView classes={classes} schoolName={schoolName} degree={degree} />;
}

/** The tiles' order: MCAT, GPA, science GPA, then the counts. A kind not listed here is shown as a definition row. */
const TILE_ORDER: ProfileKindId[] = [
  'MCAT_MEDIAN',
  'MCAT_MEAN',
  'MCAT_RANGE',
  'MCAT_10_90',
  'GPA_MEDIAN',
  'GPA_MEAN',
  'GPA_RANGE',
  'SGPA_MEDIAN',
  'SGPA_MEAN',
  'APPLICANTS',
  'INTERVIEWED',
  'MATRICULANTS',
  'IN_STATE_PCT',
  'IN_STATE_COUNT',
];
const tileRank = (k: string): number => TILE_ORDER.indexOf(k as ProfileKindId);

/** A deep link to the words: every quote highlighted on a web page; a PDF opens as it is. */
const sourceHref = (url: string, quotes: string[]): string =>
  isPdfUrl(url) ? url : quotes.length === 1 ? textFragmentUrl(url, quotes[0]) : textFragmentsUrl(url, quotes);

export function EnteringClassView({
  classes,
  schoolName,
  degree,
}: {
  classes: MedClassProfileDto[];
  schoolName: string;
  degree: 'MD' | 'DO';
}) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const newest = classes[0];
  if (!newest) return null;
  const previous = classes[1];
  const checkedText = formatUtcDay(newest.checkedOn, locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const sourceLine = t('profile-source', {
    defaultValue: 'Source: {{school}}’s class profile, checked {{date}}',
    school: schoolName,
    date: checkedText,
  });
  const asPublished = t('profile-as-published', { defaultValue: 'Figures as the school publishes them.' });
  return (
    <section className="medapp-section medapp-section--panel medapp-profile" aria-labelledby="school-profile-heading">
      <h2 id="school-profile-heading" className="medapp-h2">
        <span className="medapp-headicon">
          <Users aria-hidden="true" className="size-5" />
          {t('profile-heading', { defaultValue: 'Entering class' })}
        </span>
      </h2>
      <ClassFigures cls={newest} schoolName={schoolName} degree={degree} sourceLine={sourceLine} note={asPublished} />
      {previous ? (
        <details className="medapp-disclosure medapp-profile__prev">
          <summary>{t('profile-previous', { defaultValue: 'Previous class' })}</summary>
          <ClassFigures
            cls={previous}
            schoolName={schoolName}
            degree={degree}
            sourceLine={t('profile-source', {
              defaultValue: 'Source: {{school}}’s class profile, checked {{date}}',
              school: schoolName,
              date: formatUtcDay(previous.checkedOn, locale, { year: 'numeric', month: 'long', day: 'numeric' }),
            })}
            note={asPublished}
          />
        </details>
      ) : null}
      <p className="medapp-source">
        {sourceLine}. {asPublished}
      </p>
    </section>
  );
}

function useKindLabel() {
  const { t } = useTranslation('medschools');
  return (kind: string): string => {
    switch (kind) {
      case 'MCAT_MEDIAN':
        return t('profile-mcat-median', { defaultValue: 'Median MCAT' });
      case 'MCAT_MEAN':
        return t('profile-mcat-mean', { defaultValue: 'Mean MCAT' });
      case 'MCAT_RANGE':
        return t('profile-mcat-range', { defaultValue: 'MCAT range' });
      case 'MCAT_10_90':
        return t('profile-mcat-10-90', { defaultValue: 'MCAT 10th–90th percentile' });
      case 'GPA_MEDIAN':
        return t('profile-gpa-median', { defaultValue: 'Median GPA' });
      case 'GPA_MEAN':
        return t('profile-gpa-mean', { defaultValue: 'Mean GPA' });
      case 'GPA_RANGE':
        return t('profile-gpa-range', { defaultValue: 'GPA range' });
      case 'SGPA_MEDIAN':
        return t('profile-sgpa-median', { defaultValue: 'Median science GPA' });
      case 'SGPA_MEAN':
        return t('profile-sgpa-mean', { defaultValue: 'Mean science GPA' });
      case 'APPLICANTS':
        return t('profile-applicants', { defaultValue: 'Applicants' });
      case 'INTERVIEWED':
        return t('profile-interviewed', { defaultValue: 'Interviewed' });
      case 'MATRICULANTS':
        return t('profile-class-size', { defaultValue: 'Class size' });
      default:
        return t('profile-in-state', { defaultValue: 'In state' });
    }
  };
}

function ClassFigures({
  cls,
  schoolName,
  degree,
  sourceLine,
  note,
}: {
  cls: MedClassProfileDto;
  schoolName: string;
  degree: 'MD' | 'DO';
  sourceLine: string;
  note: string;
}) {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const checked = t('profile-checked', {
    defaultValue: 'Checked {{date}}',
    date: formatUtcDay(cls.checkedOn, locale, { year: 'numeric', month: 'long', day: 'numeric' }),
  });
  const name = t('profile-source-name', { defaultValue: '{{school}} class profile', school: schoolName });
  const classLine =
    cls.enteringYear === null
      ? t('profile-class-undated', { defaultValue: '{{label}} · Year not stated', label: cls.label })
      : t('profile-class-dated', {
          defaultValue: '{{label}} · entered {{year}}',
          label: cls.label,
          year: String(cls.enteringYear),
        });
  const ref = (stats: MedClassProfileStatDto[]) => {
    const quotes = [...new Set(stats.map((s) => s.evidence))];
    return (
      <SourceRef
        name={name}
        detail={checked}
        quote={quotes.length === 1 ? quotes[0] : undefined}
        note={note}
        href={sourceHref(cls.url, quotes)}
        attribution={`${sourceLine}. ${note}`}
      />
    );
  };
  const reg = cls.stats.filter((s) => s.program === 'REG');
  const phd = cls.stats.filter((s) => s.program === 'PHD');
  const regTiles = tilesOf(reg);
  return (
    <div className="medapp-profile__class">
      <div className="medapp-srcrow">
        <p className="medapp-profile__label">{classLine}</p>
        {regTiles.length > 0 ? ref(regTiles) : null}
      </div>
      <FigureGroup stats={reg} refFor={ref} />
      {phd.length > 0 ? (
        <div className="medapp-profile__phd">
          <div className="medapp-srcrow">
            <h3 className="medapp-h3">
              {degree === 'DO'
                ? t('profile-phd-heading-do', { defaultValue: 'DO-PhD program' })
                : t('profile-phd-heading', { defaultValue: 'MD-PhD program' })}
            </h3>
            {tilesOf(phd).length > 0 ? ref(tilesOf(phd)) : null}
          </div>
          <FigureGroup stats={phd} refFor={ref} />
        </div>
      ) : null}
    </div>
  );
}

/** The page's words as a row label: only the first letter raised ("students are California residents"). */
const firstUpper = (v: string | null): string => (v ? v.charAt(0).toUpperCase() + v.slice(1) : '');

const tilesOf = (stats: MedClassProfileStatDto[]): MedClassProfileStatDto[] =>
  stats.filter((s) => tileRank(s.kind) !== -1).sort((a, b) => tileRank(a.kind) - tileRank(b.kind));

function FigureGroup({
  stats,
  refFor,
}: {
  stats: MedClassProfileStatDto[];
  refFor: (stats: MedClassProfileStatDto[]) => ReactNode;
}) {
  const label = useKindLabel();
  const tiles = tilesOf(stats);
  const others = stats.filter((s) => tileRank(s.kind) === -1);
  return (
    <>
      {tiles.length > 0 ? (
        <dl className="medapp-figs">
          {tiles.map((s, i) => {
            // In the MD-PhD group its heading already says what an "MD-PhD (MSTP)" qualifier would.
            const qualifier =
              s.program === 'PHD' && isPhdOnlyQualifier(s.qualifier) ? null : profileQualifierNote(s.qualifier);
            return (
              <div key={`${s.kind}-${i}`} className="medapp-fig" data-kind={s.kind}>
                <dt>{label(s.kind)}</dt>
                <dd className="medapp-fig__value">{s.value}</dd>
                {qualifier ? <dd className="medapp-fig__note">{qualifier}</dd> : null}
              </div>
            );
          })}
        </dl>
      ) : null}
      {others.length > 0 ? (
        <dl className="medapp-defs medapp-defs--facts medapp-profile__other">
          {others.map((s, i) => (
            <div key={`${s.kind}-${i}`}>
              <dt>{firstUpper(s.qualifier)}</dt>
              <dd>
                <span className="medapp-srcrow medapp-profile__othervalue">
                  <span>{s.value}</span>
                  {refFor([s])}
                </span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}

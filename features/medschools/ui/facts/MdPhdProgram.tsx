import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BadgeCheck, CircleDashed, FlaskConical, Info, Microscope } from 'lucide-react';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import {
  TYPICAL_TIMELINE,
  barModel,
  isDrawableTimeline,
  segmentShares,
  statedTotal,
  type BarModel,
  type BarPhase,
  type BarSegment,
} from '../../engine/mdphd';
import { textFragmentUrl } from '../../engine/text-fragment';
import type { MedMdPhdDto } from '../../medschools.contract';
import { schoolFactsQuery } from '../../medschools.queries';
import { SourceRef } from '../SourceRef';

/**
 * The school's combined MD-PhD (DO-PhD at a DO school) program on the Facts tab (owner 2026-11-24): the program's name,
 * its NIH MSTP (T32) status from RePORTER, and its timeline as a horizontal bar of phases with names and lengths under
 * it. Each row's source is the book icon at its far end; the timeline's opens the program page with the quoted sentence
 * highlighted (a text fragment) and shows the quote.
 *
 * - No program row stored: nothing renders. A page that says there is no combined program: one quiet row.
 * - A timeline the page states (and that was found verbatim on re-fetch) is the school's; widths follow the years only
 *   when every phase has one, else the phases are equal and say "Length not stated" (or the range the page gives).
 * - A program with no stated layout shows the typical 2-4-2, dashed, under "Typical layout; the program does not publish
 *   its own", never as the school's statement. A length the page does state still shows, on its own row with its source.
 * - MSTP: "Funded" with the grant and fiscal year, or "Not listed as an NIH MSTP" and the day RePORTER was read; never
 *   a bare "No".
 * Shares the school-facts query with the other Facts panels, so the tab still makes one request.
 */
export function MdPhdProgram({ slug, degree }: { slug: string; degree: 'MD' | 'DO' }) {
  const query = useQuery(schoolFactsQuery(slug));
  const mdphd = query.data?.mdphd;
  if (!mdphd) return null;
  return <MdPhdView data={mdphd} degree={degree} />;
}

/** The words for a phase, as a name under the bar and inside the spoken sentence. Literal `t()` calls, so extraction finds them. */
function usePhaseWords() {
  const { t } = useTranslation('medschools');
  return {
    name: (p: BarPhase): string =>
      p === 'preclinical'
        ? t('mdphd-phase-preclinical', { defaultValue: 'Preclinical' })
        : p === 'research'
          ? t('mdphd-phase-research', { defaultValue: 'PhD research' })
          : t('mdphd-phase-clinical', { defaultValue: 'Clinical' }),
    inSentence: (p: BarPhase): string =>
      p === 'preclinical'
        ? t('mdphd-phase-preclinical-lc', { defaultValue: 'preclinical' })
        : p === 'research'
          ? t('mdphd-phase-research-lc', { defaultValue: 'PhD research' })
          : t('mdphd-phase-clinical-lc', { defaultValue: 'clinical' }),
  };
}

export function MdPhdView({ data, degree }: { data: MedMdPhdDto; degree: 'MD' | 'DO' }) {
  const { t } = useTranslation('medschools');
  const { number, locale } = useLocaleFormat();
  const words = usePhaseWords();
  const dateText = (d: string) => formatUtcDay(d, locale, { year: 'numeric', month: 'long', day: 'numeric' });
  const short = degree === 'DO' ? 'DO-PhD' : 'MD-PhD';

  const pageSource = (checkedOn: string, href: string, quote?: string) => (
    <SourceRef
      name={t('mdphd-source-school-page', { defaultValue: 'The school’s program page' })}
      detail={t('mdphd-checked', { defaultValue: 'Checked {{date}}', date: dateText(checkedOn) })}
      quote={quote}
      href={href}
      attribution={t('mdphd-attribution-page', {
        defaultValue: 'Source: the school’s own program page, checked {{date}}',
        date: dateText(checkedOn),
      })}
    />
  );

  if (!data.program.exists) {
    return (
      <section className="medapp-section medapp-section--panel medapp-mdphd" aria-label={short}>
        <dl className="medapp-defs medapp-defs--facts medapp-mdphd__rows">
          <div className="medapp-mdphd__row">
            <dt>{short}</dt>
            <dd>
              <span className="medapp-mdphd__value">{t('mdphd-none', { defaultValue: 'No combined program' })}</span>
              {pageSource(data.program.checkedOn, data.program.sourceUrl)}
            </dd>
          </div>
        </dl>
      </section>
    );
  }

  const years = (n: number) =>
    n === 1
      ? t('mdphd-one-year', { defaultValue: '1 year' })
      : t('mdphd-years', { defaultValue: '{{years}} years', years: number(n) });
  const range = (r: [number, number]) =>
    t('mdphd-years-range', { defaultValue: '{{from}}–{{to}} years', from: number(r[0]), to: number(r[1]) });
  const lengthOf = (s: BarSegment) =>
    s.years !== null
      ? years(s.years)
      : s.range
        ? range(s.range)
        : t('mdphd-length-not-stated', { defaultValue: 'Length not stated' });

  const notStatedInSentence = t('mdphd-length-not-stated-lc', { defaultValue: 'length not stated' });
  const spokenLength = (s: BarSegment) => (s.years === null && !s.range ? notStatedInSentence : lengthOf(s));

  const tl = data.timeline;
  const own = tl && isDrawableTimeline(tl.phases) ? tl : null;
  const typical = !own;
  const model = barModel(own ? own.phases : TYPICAL_TIMELINE.phases);
  // When no phase has a length, say so once under the bar instead of under every segment.
  const noLengths = model.segments.every((s) => s.years === null && !s.range);
  const total = tl ? statedTotal(tl.totalYears, tl.evidence) : null;
  const totalWords = total ? ('years' in total ? years(total.years) : range(total.range)) : null;
  const sentence = model.segments
    .map((s, i) =>
      t('mdphd-step', {
        defaultValue: '{{phase}} {{length}}',
        phase: i === 0 ? words.name(s.phase) : words.inSentence(s.phase),
        length: spokenLength(s),
      }),
    )
    .join(t('mdphd-then', { defaultValue: ', then ' }));
  const barLabel = typical
    ? t('mdphd-typical-label', { defaultValue: 'Typical layout: {{steps}}', steps: sentence })
    : sentence;

  const mstp = data.mstp;
  return (
    <section className="medapp-section medapp-section--panel medapp-mdphd" aria-labelledby="school-mdphd-heading">
      <h2 id="school-mdphd-heading" className="medapp-h2">
        <span className="medapp-headicon">
          <Microscope aria-hidden="true" className="size-5" />
          {degree === 'DO'
            ? t('mdphd-heading-do', { defaultValue: 'DO-PhD program' })
            : t('mdphd-heading', { defaultValue: 'MD-PhD program' })}
        </span>
      </h2>
      <dl className="medapp-defs medapp-defs--facts medapp-mdphd__rows">
        {data.program.source === 'SCHOOL_PAGE' && data.program.name ? (
          <div className="medapp-mdphd__row">
            <dt>{t('mdphd-program', { defaultValue: 'Program' })}</dt>
            <dd>
              <span className="medapp-mdphd__value">{data.program.name}</span>
              {pageSource(data.program.checkedOn, data.program.sourceUrl)}
            </dd>
          </div>
        ) : null}
        {mstp ? (
          <div className="medapp-mdphd__row">
            <dt>{t('mdphd-mstp', { defaultValue: 'NIH MSTP (T32)' })}</dt>
            <dd>
              {mstp.listed ? (
                <span className="medapp-mdphd__value medapp-mdphd__mark is-funded">
                  <BadgeCheck aria-hidden="true" className="size-4" />
                  <span>
                    {t('mdphd-mstp-funded', { defaultValue: 'Funded' })}
                    {mstp.grant ? <span className="medapp-meta">{` · ${mstp.grant}`}</span> : null}
                    {mstp.fiscalYear ? (
                      <span className="medapp-meta">
                        {` · ${t('mdphd-fiscal-year', { defaultValue: 'FY {{year}}', year: String(mstp.fiscalYear) })}`}
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : (
                <span className="medapp-mdphd__value medapp-mdphd__mark">
                  <CircleDashed aria-hidden="true" className="size-4" />
                  <span>
                    {t('mdphd-mstp-not-listed', { defaultValue: 'Not listed as an NIH MSTP' })}
                    <span className="medapp-meta medapp-mdphd__checked">
                      {t('mdphd-checked-lc', { defaultValue: 'checked {{date}}', date: dateText(mstp.checkedOn) })}
                    </span>
                  </span>
                </span>
              )}
              <SourceRef
                name={t('mdphd-source-reporter', { defaultValue: 'NIH RePORTER' })}
                detail={
                  mstp.listed
                    ? t('mdphd-reporter-detail', {
                        defaultValue: 'NIGMS T32 Medical Scientist Training Program grant, checked {{date}}',
                        date: dateText(mstp.checkedOn),
                      })
                    : t('mdphd-reporter-none', {
                        defaultValue: 'No active NIGMS T32 MSTP grant found for this school, checked {{date}}',
                        date: dateText(mstp.checkedOn),
                      })
                }
                href={mstp.sourceUrl}
                attribution={t('mdphd-attribution-reporter', {
                  defaultValue: 'Source: NIH RePORTER, checked {{date}}',
                  date: dateText(mstp.checkedOn),
                })}
              />
            </dd>
          </div>
        ) : null}
        {typical && tl && totalWords ? (
          <div className="medapp-mdphd__row">
            <dt>{t('mdphd-length', { defaultValue: 'Length' })}</dt>
            <dd>
              <span className="medapp-mdphd__value">{totalWords}</span>
              {pageSource(tl.checkedOn, textFragmentUrl(tl.sourceUrl, tl.evidence), tl.evidence)}
            </dd>
          </div>
        ) : null}
        <div className="medapp-mdphd__row is-timeline">
          <dt>{t('mdphd-timeline', { defaultValue: 'Timeline' })}</dt>
          <dd>
            <div className="medapp-mdphd__timeline">
              {own ? (
                <div className="medapp-mdphd__head">
                  <span className="medapp-mdphd__summary">
                    {own.pattern ? <span className="medapp-mdphd__pattern">{own.pattern}</span> : null}
                    {totalWords ? (
                      <span className="medapp-meta">
                        {t('mdphd-total', { defaultValue: '{{length}} in all', length: totalWords })}
                      </span>
                    ) : null}
                  </span>
                  {pageSource(own.checkedOn, textFragmentUrl(own.sourceUrl, own.evidence), own.evidence)}
                </div>
              ) : (
                <div className="medapp-mdphd__head">
                  <span className="medapp-mdphd__summary">
                    <span className="medapp-mdphd__pattern is-typical">{TYPICAL_TIMELINE.pattern}</span>
                    <span className="medapp-mdphd__typical medapp-meta">
                      <Info aria-hidden="true" className="size-4" />
                      {t('mdphd-typical', { defaultValue: 'Typical layout; the program does not publish its own' })}
                    </span>
                  </span>
                </div>
              )}
              <PhaseBar model={model} typical={typical} label={barLabel} lengthOf={noLengths ? () => '' : lengthOf} />
              {model.extras.length > 0 ? (
                <ul className="medapp-mdphd__extras">
                  {model.extras.map((x) => (
                    <li key={x}>
                      <FlaskConical aria-hidden="true" className="size-4" />
                      <span>{x.charAt(0).toUpperCase() + x.slice(1)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {own && noLengths ? (
                <p className="medapp-meta medapp-mdphd__note">
                  {t('mdphd-no-lengths', {
                    defaultValue: 'The page gives the order of the phases, not their lengths.',
                  })}
                </p>
              ) : own && !model.complete ? (
                <p className="medapp-meta medapp-mdphd__note">
                  {t('mdphd-partial', { defaultValue: 'Only what the page states; it does not give every phase.' })}
                </p>
              ) : null}
            </div>
          </dd>
        </div>
      </dl>
    </section>
  );
}

/**
 * The bar and the names and lengths under it, one grid so each label sits under its own segment. The whole figure is
 * one image for assistive technology, named by the sentence ("Preclinical 2 years, then PhD research 4 years, then
 * clinical 2 years"); the words under the bar are the same facts for the eye.
 */
export function PhaseBar({
  model,
  typical,
  label,
  lengthOf,
}: {
  model: BarModel;
  typical: boolean;
  label: string;
  lengthOf: (s: BarSegment) => string;
}) {
  const words = usePhaseWords();
  const shares = segmentShares(model);
  const columns = shares.map((s) => `minmax(3.5rem, ${s}fr)`).join(' ');
  const total = shares.reduce((a, b) => a + b, 0);
  // A segment under 15% of the bar cannot hold "Preclinical" on one line at any width the panel has: list the
  // phases under the bar instead. A narrow panel (a phone) gets the same list from the container query in the CSS.
  const legend = shares.some((s) => total > 0 && s / total < 0.15);
  return (
    <div className="medapp-phasefig">
      <div
        role="img"
        aria-label={label}
        className={['medapp-phasebar', typical ? 'is-typical' : '', legend ? 'is-legend' : ''].filter(Boolean).join(' ')}
        data-proportional={model.proportional ? 'true' : 'false'}
        style={{ gridTemplateColumns: columns }}
      >
        {model.segments.map((s, i) => (
          <span key={`bar-${i}`} className={`medapp-phasebar__seg medapp-phase--${s.phase}`} data-share={shares[i]} />
        ))}
        {model.segments.map((s, i) => (
          <span key={`label-${i}`} className="medapp-phasebar__label">
            <span className="medapp-phasebar__name">{words.name(s.phase)}</span>
            {lengthOf(s) ? <span className="medapp-phasebar__years">{lengthOf(s)}</span> : null}
          </span>
        ))}
      </div>
      {/* The same facts as the labels, for a bar too narrow to carry them; the bar's label already speaks them. */}
      <ul className={legend ? 'medapp-phasebar__legend is-legend' : 'medapp-phasebar__legend'} aria-hidden="true">
        {model.segments.map((s, i) => (
          <li key={`legend-${i}`}>
            <span className={`medapp-phasebar__swatch medapp-phase--${s.phase}${typical ? ' is-typical' : ''}`} />
            <span className="medapp-phasebar__name">{words.name(s.phase)}</span>
            {lengthOf(s) ? <span className="medapp-phasebar__years">{lengthOf(s)}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

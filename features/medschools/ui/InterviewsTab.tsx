import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { SearchField } from '@/components/ui/search-field';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { InterviewProfileDto, MedSchoolDetailDto, MedSourceId, SchoolStatsDto } from '../medschools.contract';
import { PRIMARY_ORDER } from '../engine/public-read';
import { INTERVIEW_TABS, Q_MAX, type InterviewTab } from '../engine/search';
import { activityQuery } from '../medschools.queries';
import { CATEGORY_COLOR } from './charts/chartColors';
import { useMedLabels } from './labels';
import { OptionGroup } from './OptionGroup';
import type { SchoolSearch, SetSchoolSearch } from './school-search';
import { PracticePanel } from './practice/PracticePanel';
import { SourceLinks } from './SourceLinks';

type Row = { key: string; label: string; value: string };

function RowList({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <dl className="m-0">
      {rows.map((r) => (
        <div key={r.key} className="flex items-baseline justify-between gap-4 border-b border-site-border py-2">
          <dt className="t-meta">{r.label}</dt>
          <dd className="t-body m-0 min-w-0 break-words text-end">{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The ADMIT yearly interview count, when it is known: the global (not in-state) row that carries one. */
export function admitInterviewsPerYear(stats: readonly SchoolStatsDto[]): number | null {
  const row = stats.find((s) => s.source === 'ADMIT' && s.residence === 'GLOBAL' && (s.interviewCount ?? 0) > 0);
  return row?.interviewCount ?? null;
}

/** How full the bar is: 0 to 1, never past full (reports can outnumber a projection). */
export const fillOf = (reported: number, perYear: number): number =>
  perYear > 0 ? Math.min(1, Math.max(0, reported / perYear)) : 0;

/**
 * Interviews, in three sub-tabs (`?itab=`, an `OptionGroup`): Overview (reported invites this cycle against about as
 * many interviews a year, plus the stats that survived the k floor), Questions (searchable) and Format and feedback
 * (the profiles). Each sub-tab says plainly when this school has nothing for it. A "School info" sub-tab is not in
 * this pass.
 */
export function InterviewsTab({
  slug,
  detail,
  search,
  setSearch,
}: {
  slug: string;
  detail: MedSchoolDetailDto;
  search: SchoolSearch;
  setSearch: SetSchoolSearch;
}) {
  const { t } = useTranslation('medschools');
  const itab: InterviewTab = search.itab;
  const label = (id: InterviewTab): string => {
    switch (id) {
      case 'overview':
        return t('interviews-tab-overview', { defaultValue: 'Overview' });
      case 'questions':
        return t('interviews-tab-questions', { defaultValue: 'Questions' });
      case 'format':
        return t('interviews-tab-format', { defaultValue: 'Format and feedback' });
      case 'practice':
        return t('interviews-tab-practice', { defaultValue: 'Practice' });
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <OptionGroup
        label={t('interviews-tabs-label', { defaultValue: 'Interview sections' })}
        value={itab}
        options={INTERVIEW_TABS.map((id) => ({ value: id, label: label(id) }))}
        onChange={(next) => setSearch({ itab: next })}
      />
      {itab === 'overview' ? (
        <Overview slug={slug} detail={detail} search={search} />
      ) : itab === 'questions' ? (
        <Questions detail={detail} />
      ) : itab === 'practice' ? (
        <Practice slug={slug} detail={detail} />
      ) : (
        <FormatAndFeedback detail={detail} />
      )}
      <SourceLinks links={detail.links} />
    </div>
  );
}

const NONE = (t: ReturnType<typeof useTranslation>['t']) =>
  t('interviews-empty', { defaultValue: 'No interview data has been collected for this school yet.' });

function Overview({ slug, detail, search }: { slug: string; detail: MedSchoolDetailDto; search: SchoolSearch }) {
  const { t } = useTranslation('medschools');
  const { sourceName, programLabel } = useMedLabels();
  const { locale } = useLocaleFormat();
  const nf = new Intl.NumberFormat(locale);
  const n = (v: number | null) => (v === null ? null : nf.format(v));
  const activity = useQuery(activityQuery(slug, { program: search.program, cycle: undefined }));
  const programOk = (p: SchoolStatsDto['program']) => search.program === 'ALL' || p === null || p === search.program;
  const stats = detail.stats.filter((s) => programOk(s.program));

  const interview = activity.data?.types.find((x) => x.eventType === 'INTERVIEW');
  const reported = interview?.sources.find((s) => s.source === interview.primary)?.total ?? 0;
  const perYear = admitInterviewsPerYear(detail.stats);
  const hasInvites = reported > 0;

  const range = (mid: number | null, lo: number | null, hi: number | null): string | null =>
    mid === null
      ? null
      : lo !== null && hi !== null
        ? t('school-range', {
            defaultValue: '{{mid}} ({{lo}} to {{hi}})',
            mid: nf.format(mid),
            lo: nf.format(lo),
            hi: nf.format(hi),
          })
        : nf.format(mid);

  const statRows = (s: SchoolStatsDto): Row[] => {
    const rows: [string, string, string | null][] = [
      ['gpa', t('school-stat-gpa', { defaultValue: 'GPA median' }), range(s.gpaMedian, s.gpaLow, s.gpaHigh)],
      ['mcat', t('school-stat-mcat', { defaultValue: 'MCAT median' }), range(s.mcatMedian, s.mcatLow, s.mcatHigh)],
      ['apps', t('school-stat-applications', { defaultValue: 'Applications' }), n(s.applicationCount)],
      ['ints', t('school-stat-interviews', { defaultValue: 'Interviews' }), n(s.interviewCount)],
      ['adm', t('school-stat-admitted', { defaultValue: 'Admitted' }), n(s.admittedCount)],
      [
        'a2i',
        t('school-stat-app-to-int', { defaultValue: 'Application to interview' }),
        s.applicationToInterviewPct === null ? null : `${nf.format(s.applicationToInterviewPct)}%`,
      ],
      [
        'i2a',
        t('school-stat-int-to-acc', { defaultValue: 'Interview to acceptance' }),
        s.interviewToAcceptancePct === null ? null : `${nf.format(s.interviewToAcceptancePct)}%`,
      ],
      ['res', t('school-stat-research', { defaultValue: 'Research hours' }), n(s.researchHours)],
      ['clin', t('school-stat-clinical', { defaultValue: 'Clinical hours' }), n(s.clinicalHours)],
      ['nonclin', t('school-stat-nonclinical', { defaultValue: 'Non-clinical hours' }), n(s.nonClinicalHours)],
    ];
    return rows.flatMap(([key, label, value]) => (value ? [{ key, label, value }] : []));
  };
  const statHeading = (s: SchoolStatsDto): string => {
    const base = s.allCycles
      ? t('school-stats-all-cycles', { defaultValue: '{{source}}, all reported cycles', source: sourceName(s.source) })
      : t('school-stats-cycle', {
          defaultValue: '{{source}}, {{year}} cycle',
          source: sourceName(s.source),
          year: String(s.cycleYear),
        });
    const extra = [
      s.program ? programLabel(s.program, detail.school.degree) : null,
      s.residence === 'IN_STATE'
        ? t('school-profile-in-state', { defaultValue: 'In-state' })
        : s.residence === 'OUT_OF_STATE'
          ? t('school-profile-out-of-state', { defaultValue: 'Out-of-state' })
          : null,
    ].filter(Boolean);
    return extra.length ? `${base} · ${extra.join(' · ')}` : base;
  };
  const statSources = PRIMARY_ORDER.filter((s) => stats.some((x) => x.source === s));
  const hasStats = stats.some((s) => statRows(s).length > 0);

  if (!hasInvites && perYear === null && !hasStats) return <EmptyState title={NONE(t)} />;

  const pct = perYear ? fillOf(reported, perYear) : 0;
  return (
    <div className="flex flex-col gap-6">
      {hasInvites || perYear !== null ? (
        <section aria-labelledby="medschools-int-compare" className="flex flex-col gap-2">
          <h2 id="medschools-int-compare" className="t-heading m-0">
            {t('interviews-reported-heading', {
              count: reported,
              n: nf.format(reported),
              defaultValue_one: '{{n}} reported interview invite this cycle',
              defaultValue_other: '{{n}} reported interview invites this cycle',
              defaultValue: '{{n}} reported interview invites this cycle',
            })}
          </h2>
          {perYear !== null ? (
            <>
              <p className="t-body m-0">
                {t('interviews-per-year', {
                  defaultValue: 'About {{m}} interviews a year',
                  m: nf.format(perYear),
                })}
              </p>
              <div
                role="progressbar"
                aria-label={t('interviews-progress-label', {
                  defaultValue: 'Reported invites against interviews a year',
                })}
                aria-valuemin={0}
                aria-valuemax={perYear}
                aria-valuenow={Math.min(reported, perYear)}
                className="h-2 w-full overflow-hidden rounded-site-sm border border-site-border bg-site-bg-subtle"
              >
                <div
                  className="h-full"
                  style={{ inlineSize: `${Math.round(pct * 100)}%`, background: CATEGORY_COLOR.INTERVIEW }}
                />
              </div>
              <p className="t-meta m-0">
                {t('interviews-projected', {
                  defaultValue: 'Projected from the number of interviews reported over all cycles. Source: Admit.org',
                })}
              </p>
            </>
          ) : null}
        </section>
      ) : null}
      {statSources.map((src: MedSourceId) =>
        stats
          .filter((s) => s.source === src)
          .map((s, i) => {
            const rows = statRows(s);
            return rows.length === 0 ? null : (
              <div key={`${src}-${i}`}>
                <h3 className="t-label m-0">{statHeading(s)}</h3>
                <RowList rows={rows} />
              </div>
            );
          }),
      )}
    </div>
  );
}

/** Practice mode over this school's stored questions. Notes and the clock stay in the page. */
function Practice({ slug, detail }: { slug: string; detail: MedSchoolDetailDto }) {
  const { t } = useTranslation('medschools');
  const questions = useMemo(
    () => detail.questions.map((q, i) => ({ key: `q-${i}`, text: q.text })),
    [detail.questions],
  );
  return (
    <div className="flex flex-col gap-4">
      {questions.length === 0 ? (
        <EmptyState
          title={t('practice-school-empty', { defaultValue: 'No questions have been collected for this school yet.' })}
        />
      ) : (
        <PracticePanel questions={questions} slug={slug} />
      )}
      <p className="t-meta m-0">
        <Link to="/rmh-medschool/practice" className="underline">
          {t('practice-general-link', { defaultValue: 'General questions for any school' })}
        </Link>
      </p>
    </div>
  );
}

function Questions({ detail }: { detail: MedSchoolDetailDto }) {
  const { t } = useTranslation('medschools');
  const { sourceName } = useMedLabels();
  const [text, setText] = useState('');
  const needle = text.trim().toLowerCase();
  const all = detail.questions;
  if (all.length === 0) return <EmptyState title={NONE(t)} />;
  const shown = needle ? all.filter((q) => q.text.toLowerCase().includes(needle)) : all;
  return (
    <div className="flex flex-col gap-3">
      <SearchField
        aria-label={t('interviews-questions-search', { defaultValue: 'Search questions' })}
        placeholder={t('interviews-questions-search', { defaultValue: 'Search questions' })}
        maxLength={Q_MAX}
        value={text}
        onValueChange={setText}
      />
      {shown.length === 0 ? (
        <p className="t-meta m-0">{t('interviews-questions-none', { defaultValue: 'No question matches.' })}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {shown.map((q, i) => (
            <li key={`q-${i}`} className="border-b border-site-border py-2">
              <p className="t-body m-0 break-words">{q.text}</p>
              <p className="t-meta m-0">
                {[
                  sourceName(q.source),
                  q.cycleYear === null ? null : String(q.cycleYear),
                  q.votes === null
                    ? null
                    : t('school-question-votes', {
                        count: q.votes,
                        defaultValue_one: '{{count}} vote',
                        defaultValue_other: '{{count}} votes',
                        defaultValue: '{{count}} votes',
                      }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FormatAndFeedback({ detail }: { detail: MedSchoolDetailDto }) {
  const { t } = useTranslation('medschools');
  const { sourceName } = useMedLabels();
  const { locale } = useLocaleFormat();
  const nf = new Intl.NumberFormat(locale);
  const n = (v: number | null) => (v === null ? null : nf.format(v));
  const sources = PRIMARY_ORDER.filter((s) => detail.profiles.some((p) => p.source === s));
  if (sources.length === 0) return <EmptyState title={NONE(t)} />;

  const profileRows = (p: InterviewProfileDto): Row[] => {
    const rows: [string, string, string | null][] = [
      ['format', t('school-profile-format', { defaultValue: 'Format' }), p.format],
      ['file', t('school-profile-file', { defaultValue: 'Invitation' }), p.fileType],
      ['style', t('school-profile-style', { defaultValue: 'Style' }), p.interviewStyle],
      ['length', t('school-profile-length', { defaultValue: 'Length' }), p.interviewLength],
      ['difficulty', t('school-profile-difficulty', { defaultValue: 'Difficulty' }), n(p.avgDifficulty)],
      ['stress', t('school-profile-stress', { defaultValue: 'Stress' }), n(p.avgStress)],
      ['impression', t('school-profile-impression', { defaultValue: 'Impression' }), n(p.avgImpression)],
      ['count', t('school-profile-count', { defaultValue: 'Interviews reported' }), n(p.interviewCount)],
    ];
    if (p.split) {
      rows.push(
        ['in', t('school-profile-in-state', { defaultValue: 'In-state' }), nf.format(p.split.inState)],
        ['out', t('school-profile-out-of-state', { defaultValue: 'Out-of-state' }), nf.format(p.split.outOfState)],
      );
    }
    return rows.flatMap(([key, label, value]) => (value ? [{ key, label, value }] : []));
  };

  return (
    <div className="flex flex-col gap-8">
      {sources.map((src) => (
        <section key={src} className="flex flex-col gap-4" aria-labelledby={`medschools-int-${src}`}>
          <h2 id={`medschools-int-${src}`} className="t-heading m-0">
            {sourceName(src)}
          </h2>
          {detail.profiles
            .filter((p) => p.source === src)
            .map((p, i) => (
              <div key={`p-${i}`}>
                <RowList rows={profileRows(p)} />
                {[
                  ...p.feedbackBefore.map((x) => ['before', x] as const),
                  ...p.feedbackPositive.map((x) => ['pos', x] as const),
                  ...p.feedbackNegative.map((x) => ['neg', x] as const),
                ].map(([kind, text], j) => (
                  <p key={`${kind}-${j}`} className="t-body m-0 border-b border-site-border py-2">
                    <span className="t-meta">
                      {kind === 'before'
                        ? t('school-feedback-before', { defaultValue: 'Before' })
                        : kind === 'pos'
                          ? t('school-feedback-positive', { defaultValue: 'Positive' })
                          : t('school-feedback-negative', { defaultValue: 'Negative' })}
                    </span>
                    {'  '}
                    {text}
                  </p>
                ))}
              </div>
            ))}
        </section>
      ))}
    </div>
  );
}

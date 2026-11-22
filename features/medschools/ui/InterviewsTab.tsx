import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import type { InterviewProfileDto, MedSchoolDetailDto, MedSourceId, SchoolStatsDto } from '../medschools.contract';
import { PRIMARY_ORDER } from '../engine/public-read';
import { useMedLabels } from './labels';
import type { SchoolSearch } from './school-search';
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

/** Interviews: per source, the interview profile, the stats that survived the k floor, and the top questions. */
export function InterviewsTab({ detail, search }: { detail: MedSchoolDetailDto; search: SchoolSearch }) {
  const { t } = useTranslation('medschools');
  const { sourceName, programLabel } = useMedLabels();
  const { locale } = useLocaleFormat();
  const nf = new Intl.NumberFormat(locale);
  const n = (v: number | null) => (v === null ? null : nf.format(v));
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

  const programOk = (p: SchoolStatsDto['program']) => search.program === 'ALL' || p === null || p === search.program;
  const stats = detail.stats.filter((s) => programOk(s.program));
  const sources = PRIMARY_ORDER.filter(
    (s) =>
      detail.profiles.some((p) => p.source === s) ||
      stats.some((x) => x.source === s) ||
      detail.questions.some((q) => q.source === s),
  );
  if (sources.length === 0) {
    return (
      <>
        <EmptyState title={t('school-interviews-empty', { defaultValue: 'No interview details reported yet.' })} />
        <SourceLinks links={detail.links} />
      </>
    );
  }

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

  return (
    <div className="flex flex-col gap-8">
      {sources.map((src: MedSourceId) => {
        const profiles = detail.profiles.filter((p) => p.source === src);
        const srcStats = stats.filter((s) => s.source === src);
        const questions = detail.questions.filter((q) => q.source === src);
        return (
          <section key={src} className="flex flex-col gap-4" aria-labelledby={`medschools-int-${src}`}>
            <h2 id={`medschools-int-${src}`} className="t-heading m-0">
              {sourceName(src)}
            </h2>
            {profiles.map((p, i) => (
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
            {srcStats.map((s, i) => (
              <div key={`s-${i}`}>
                <h3 className="t-label m-0">{statHeading(s)}</h3>
                <RowList rows={statRows(s)} />
              </div>
            ))}
            {questions.length > 0 ? (
              <div>
                <h3 className="t-label m-0">{t('school-questions-title', { defaultValue: 'Questions reported' })}</h3>
                <ul className="m-0 list-none p-0">
                  {questions.map((q, i) => (
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
              </div>
            ) : null}
          </section>
        );
      })}
      <SourceLinks links={detail.links} />
    </div>
  );
}

import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import type { FactKindId } from '../../engine/school-facts';
import type { MedSchoolFactDto, MedSchoolFactsRes } from '../../medschools.contract';
import { schoolFactsQuery } from '../../medschools.queries';
import { MedEmpty } from '../MedEmpty';
import { ListSkeleton, SkeletonSwap } from '../skeletons';

/**
 * Admissions facts: what the AAMC MSAR reports say about the school (who it accepts, MCAT window, interviews, deposit,
 * cost). Rows on rules in a paper panel, one block per report and each block ends with its own source line and a link to
 * the page the reports are listed on. Presentational over `AdmissionsFactsView`; it states what a report prints, it gives
 * no advice and draws no conclusion across blocks. It sits on the school page's Facts tab, under `Curriculum`. Only an MD school has these reports: for a DO school nothing renders.
 * MCAT and GPA figures are not here (they come from the schools' own class-profile pages, a later step).
 */
export function AdmissionsFacts({ slug, degree }: { slug: string; degree: 'MD' | 'DO' }) {
  const { t } = useTranslation('medschools');
  const query = useQuery({ ...schoolFactsQuery(slug), enabled: degree === 'MD' });
  if (degree !== 'MD') return null;
  if (query.isError) {
    return (
      <MedEmpty
        title={t('facts-load-failed', { defaultValue: 'Could not load the admissions facts.' })}
        onRetry={() => void query.refetch()}
      />
    );
  }
  return (
    <SkeletonSwap ready={!!query.data} skeleton={<ListSkeleton rows={4} />}>
      {query.data ? <AdmissionsFactsView data={query.data} /> : null}
    </SkeletonSwap>
  );
}

type Block = {
  id: string;
  report: number;
  title: string;
  rows: { kind: FactKindId; label: string; kindOf: 'status' | 'date' | 'usd' | 'text' | 'yesno' }[];
};

export function AdmissionsFactsView({ data }: { data: MedSchoolFactsRes }) {
  const { t } = useTranslation('medschools');
  const { number } = useLocaleFormat();
  const locale = useLocaleFormat().locale;
  const by = new Map(data.facts.map((f) => [f.kind, f]));

  const blocks: Block[] = [
    {
      id: 'who',
      report: 6996,
      title: t('facts-who-title', { defaultValue: 'Who can apply' }),
      rows: [
        {
          kind: 'ACCEPTS_OUT_OF_STATE',
          label: t('facts-out-of-state', { defaultValue: 'Out-of-state applicants' }),
          kindOf: 'status',
        },
        {
          kind: 'ACCEPTS_INTERNATIONAL',
          label: t('facts-international', { defaultValue: 'International applicants' }),
          kindOf: 'status',
        },
        {
          kind: 'ACCEPTS_CANADIAN',
          label: t('facts-canadian', { defaultValue: 'Canadian applicants' }),
          kindOf: 'status',
        },
        { kind: 'ACCEPTS_DACA', label: t('facts-daca', { defaultValue: 'DACA status applicants' }), kindOf: 'status' },
      ],
    },
    {
      id: 'daca',
      report: 7031,
      title: t('facts-daca-title', { defaultValue: 'DACA' }),
      rows: [{ kind: 'DACA_DETAILS', label: t('facts-daca-details', { defaultValue: 'Details' }), kindOf: 'text' }],
    },
    {
      id: 'preview',
      report: 7046,
      title: t('facts-preview-title', { defaultValue: 'PREview' }),
      rows: [{ kind: 'PREVIEW_POLICY', label: t('facts-preview-policy', { defaultValue: 'Policy' }), kindOf: 'text' }],
    },
    {
      id: 'mcat',
      report: 7036,
      title: t('facts-mcat-title', { defaultValue: 'MCAT dates considered' }),
      rows: [
        {
          kind: 'MCAT_LATEST',
          label: t('facts-mcat-latest', { defaultValue: 'Latest administration date' }),
          kindOf: 'date',
        },
        {
          kind: 'MCAT_OLDEST',
          label: t('facts-mcat-oldest', { defaultValue: 'Oldest administration date' }),
          kindOf: 'date',
        },
      ],
    },
    {
      id: 'interviews',
      report: 7051,
      title: t('facts-interviews-title', { defaultValue: 'Interviews' }),
      rows: [
        { kind: 'INTERVIEW_FORMAT', label: t('facts-interview-format', { defaultValue: 'Format' }), kindOf: 'text' },
        {
          kind: 'INTERVIEW_INVITATIONS',
          label: t('facts-interview-invitations', { defaultValue: 'Invitations sent' }),
          kindOf: 'text',
        },
        {
          kind: 'INTERVIEW_REGIONAL',
          label: t('facts-interview-regional', { defaultValue: 'Regional interviews' }),
          kindOf: 'text',
        },
        {
          kind: 'INTERVIEW_VIDEO',
          label: t('facts-interview-video', { defaultValue: 'Video interview' }),
          kindOf: 'text',
        },
      ],
    },
    {
      id: 'secondary',
      report: 7011,
      title: t('facts-secondary-title', { defaultValue: 'Secondary application' }),
      rows: [
        { kind: 'SECONDARY_FEE', label: t('facts-secondary-fee', { defaultValue: 'Fee' }), kindOf: 'usd' },
        {
          kind: 'SECONDARY_FEE_WAIVER',
          label: t('facts-secondary-waiver', { defaultValue: 'Fee waiver available' }),
          kindOf: 'yesno',
        },
        {
          kind: 'SECONDARY_DEADLINE',
          label: t('facts-secondary-deadline', { defaultValue: 'Deadline' }),
          kindOf: 'text',
        },
      ],
    },
    {
      id: 'deposit',
      report: 7066,
      title: t('facts-deposit-title', { defaultValue: 'Deposit' }),
      rows: [
        {
          kind: 'DEPOSIT_REQUIRED',
          label: t('facts-deposit-required', { defaultValue: 'Deposit required' }),
          kindOf: 'yesno',
        },
        { kind: 'DEPOSIT_DUE', label: t('facts-deposit-due', { defaultValue: 'Due' }), kindOf: 'date' },
        {
          kind: 'DEPOSIT_REFUNDABLE_BY',
          label: t('facts-deposit-refundable-by', { defaultValue: 'Refundable until' }),
          kindOf: 'date',
        },
        { kind: 'DEPOSIT_IN_STATE', label: t('facts-deposit-in', { defaultValue: 'In-state amount' }), kindOf: 'usd' },
        {
          kind: 'DEPOSIT_OUT_OF_STATE',
          label: t('facts-deposit-out', { defaultValue: 'Out-of-state amount' }),
          kindOf: 'usd',
        },
        {
          kind: 'DEPOSIT_REFUNDABLE',
          label: t('facts-deposit-refundable', { defaultValue: 'Refundable' }),
          kindOf: 'yesno',
        },
        {
          kind: 'DEPOSIT_APPLIED_TO_TUITION',
          label: t('facts-deposit-applied', { defaultValue: 'Applied to tuition' }),
          kindOf: 'yesno',
        },
      ],
    },
    {
      id: 'cost',
      report: 7071,
      title: t('facts-cost-title', { defaultValue: 'Cost of attendance' }),
      rows: [
        { kind: 'COA_IN_STATE', label: t('facts-coa-in', { defaultValue: 'Total, in-state' }), kindOf: 'usd' },
        { kind: 'COA_OUT_OF_STATE', label: t('facts-coa-out', { defaultValue: 'Total, out-of-state' }), kindOf: 'usd' },
        {
          kind: 'TUITION_IN_STATE',
          label: t('facts-tuition-in', { defaultValue: 'Tuition and fees, in-state' }),
          kindOf: 'usd',
        },
        {
          kind: 'TUITION_OUT_OF_STATE',
          label: t('facts-tuition-out', { defaultValue: 'Tuition and fees, out-of-state' }),
          kindOf: 'usd',
        },
      ],
    },
  ];

  const status = (code: string): string =>
    code === 'YES'
      ? t('facts-yes', { defaultValue: 'Yes' })
      : code === 'NO'
        ? t('facts-no', { defaultValue: 'No' })
        : t('facts-case-by-case', { defaultValue: 'Case by case' });

  const value = (f: MedSchoolFactDto, kindOf: Block['rows'][number]['kindOf']): ReactNode => {
    if (kindOf === 'status' || kindOf === 'yesno') return f.value ? status(f.value) : null;
    if (kindOf === 'usd')
      return f.num === null ? null : number(f.num, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    if (kindOf === 'date') {
      const d = f.value;
      if (!d) return null;
      return d.length === 7
        ? formatUtcDay(`${d}-01`, locale, { year: 'numeric', month: 'long' })
        : formatUtcDay(d, locale, { year: 'numeric', month: 'long', day: 'numeric' });
    }
    return f.printed ?? f.value;
  };

  const shown = blocks
    .map((b) => ({ b, facts: b.rows.flatMap((r) => (by.has(r.kind) ? [{ r, f: by.get(r.kind)! }] : [])) }))
    .filter((x) => x.facts.length > 0);

  if (shown.length === 0) {
    return (
      <MedEmpty
        title={t('facts-empty', { defaultValue: 'No admissions facts for this school yet.' })}
        description={t('facts-empty-body', {
          defaultValue: 'The AAMC reports list MD schools only, and not every school answers every question.',
        })}
      />
    );
  }

  return (
    <section className="medapp-section medapp-section--panel" aria-labelledby="school-facts-heading">
      <h2 id="school-facts-heading" className="medapp-h2">
        {t('facts-heading', { defaultValue: 'Admissions facts' })}
      </h2>
      {shown.map(({ b, facts }) => {
        const first = facts[0]!.f;
        return (
          <div key={b.id} className="medapp-subrule">
            <h3 className="medapp-h3">{b.title}</h3>
            <dl className="medapp-defs medapp-defs--stack">
              {facts.map(({ r, f }) => (
                <div key={r.kind}>
                  <dt>{r.label}</dt>
                  <dd>
                    {value(f, r.kindOf)}
                    {f.note && f.kind.startsWith('ACCEPTS_') ? (
                      <span className="medapp-meta medapp-defs__note">{f.note}</span>
                    ) : null}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="medapp-meta">
              <a href={data.pageUrl} target="_blank" rel="noopener noreferrer">
                {t('facts-source', { defaultValue: 'Source: {{label}}', label: first.sourceLabel })}
              </a>
            </p>
          </div>
        );
      })}
    </section>
  );
}

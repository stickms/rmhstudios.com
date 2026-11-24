import type { ReactNode } from 'react';
import { Check, ClipboardList, Scale, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { formatUtcDay } from '../../engine/public-read';
import { pdfPageUrl } from '../../engine/text-fragment';
import type { FactKindId } from '../../engine/school-facts';
import type { MedSchoolFactDto, MedSchoolFactsRes } from '../../medschools.contract';
import { schoolFactsQuery } from '../../medschools.queries';
import { MedEmpty } from '../MedEmpty';
import { SourceRef } from '../SourceRef';
import { ListSkeleton, SkeletonSwap } from '../skeletons';

/**
 * Admissions facts: what the AAMC MSAR reports say about the school (who it accepts, MCAT window, interviews, deposit,
 * cost). Rows on rules in a paper panel, one block per report, its source the icon at the end of the block's heading row
 * (the full attribution line stays in the HTML; the link opens the report PDF at the fact's page). Labels never repeat
 * the heading ("Due" under "Deposit"), related figures share a line ("In-state $X · Out-of-state $Y"), and a block whose
 * answer makes the rest moot is one line ("Deposit · Not required"). Presentational over `AdmissionsFactsView`; it states what a report prints, it gives
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

/** A yes / no / case-by-case answer: a small mark and the word, never the mark alone. */
function FactAnswer({ code }: { code: string }) {
  const { t } = useTranslation('medschools');
  const [Icon, word] =
    code === 'YES'
      ? [Check, t('facts-yes', { defaultValue: 'Yes' })]
      : code === 'NO'
        ? [X, t('facts-no', { defaultValue: 'No' })]
        : [Scale, t('facts-case-by-case', { defaultValue: 'Case by case' })];
  return (
    <span className="medapp-answer">
      <Icon aria-hidden="true" className="size-4" />
      {word}
    </span>
  );
}

type Row = { key: string; label: string; value: ReactNode; stack?: boolean; note?: string | null };
type Block = {
  id: string;
  report: number;
  title: string;
  /** The whole block as one line: "Deposit · Not required". */
  line?: ReactNode;
  /** One text with no label of its own (DACA details, the PREview policy). */
  text?: string;
  rows: Row[];
  source: MedSchoolFactDto;
};

/** A value is stacked under its label when it is a sentence rather than a word or a figure. */
const isLong = (v: ReactNode): boolean => typeof v === 'string' && v.length > 40;

export function AdmissionsFactsView({ data }: { data: MedSchoolFactsRes }) {
  const { t } = useTranslation('medschools');
  const { number } = useLocaleFormat();
  const locale = useLocaleFormat().locale;
  const by = new Map(data.facts.map((f) => [f.kind, f]));
  const get = (k: FactKindId) => by.get(k);

  const usd = (f: MedSchoolFactDto | undefined): string | null =>
    f && f.num !== null ? number(f.num, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }) : null;
  const date = (f: MedSchoolFactDto | undefined): string | null => {
    const d = f?.value;
    if (!d) return null;
    return d.length === 7
      ? formatUtcDay(`${d}-01`, locale, { year: 'numeric', month: 'long' })
      : formatUtcDay(d, locale, { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const text = (f: MedSchoolFactDto | undefined): string | null => (f ? (f.printed ?? f.value) : null);
  const answer = (f: MedSchoolFactDto | undefined): ReactNode => (f?.value ? <FactAnswer code={f.value} /> : null);
  /** "In-state $69,123 · Out-of-state $74,690", or the one that is given. */
  const inOut = (a: MedSchoolFactDto | undefined, b: MedSchoolFactDto | undefined): string | null => {
    const i = usd(a);
    const o = usd(b);
    if (i && o && i === o) return i;
    if (i && o)
      return t('facts-in-out', {
        defaultValue: 'In-state {{inState}} · Out-of-state {{outState}}',
        inState: i,
        outState: o,
      });
    if (i) return t('facts-in-only', { defaultValue: 'In-state {{amount}}', amount: i });
    if (o) return t('facts-out-only', { defaultValue: 'Out-of-state {{amount}}', amount: o });
    return null;
  };
  const row = (key: string, label: string, value: ReactNode, extra: Partial<Row> = {}): Row[] =>
    value === null || value === undefined || value === ''
      ? []
      : [{ key, label, value, stack: isLong(value), ...extra }];

  const blocks: Block[] = [];
  const push = (b: Omit<Block, 'source'>, kinds: FactKindId[]) => {
    const source = kinds.map((k) => by.get(k)).find((f) => f !== undefined);
    if (!source || (b.rows.length === 0 && !b.line && !b.text)) return;
    blocks.push({ ...b, source });
  };

  const who: [FactKindId, string][] = [
    ['ACCEPTS_OUT_OF_STATE', t('facts-who-out-of-state', { defaultValue: 'Out of state' })],
    ['ACCEPTS_INTERNATIONAL', t('facts-who-international', { defaultValue: 'International' })],
    ['ACCEPTS_CANADIAN', t('facts-who-canadian', { defaultValue: 'Canadian' })],
    ['ACCEPTS_DACA', t('facts-who-daca', { defaultValue: 'DACA' })],
  ];
  push(
    {
      id: 'who',
      report: 6996,
      title: t('facts-who-title', { defaultValue: 'Who can apply' }),
      rows: who.flatMap(([k, label]) => row(k, label, answer(get(k)), { note: get(k)?.note ?? null })),
    },
    who.map(([k]) => k),
  );

  // The DACA report often repeats the sentence the school already gave beside "DACA" above: show it once.
  const squash = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const dacaText = text(get('DACA_DETAILS'));
  const daca = dacaText && squash(dacaText) !== squash(get('ACCEPTS_DACA')?.note) ? dacaText : null;
  push(
    {
      id: 'daca',
      report: 7031,
      title: t('facts-daca-title', { defaultValue: 'DACA' }),
      rows: [],
      ...(daca ? { text: daca } : {}),
    },
    ['DACA_DETAILS'],
  );

  const preview = text(get('PREVIEW_POLICY'));
  push(
    {
      id: 'preview',
      report: 7046,
      title: t('facts-preview-title', { defaultValue: 'PREview' }),
      rows: [],
      ...(preview ? { text: preview } : {}),
    },
    ['PREVIEW_POLICY'],
  );

  push(
    {
      id: 'mcat',
      report: 7036,
      title: t('facts-mcat-title', { defaultValue: 'MCAT dates considered' }),
      rows: [
        ...row('MCAT_LATEST', t('facts-mcat-latest-short', { defaultValue: 'Latest' }), date(get('MCAT_LATEST'))),
        ...row('MCAT_OLDEST', t('facts-mcat-oldest-short', { defaultValue: 'Oldest' }), date(get('MCAT_OLDEST'))),
      ],
    },
    ['MCAT_LATEST', 'MCAT_OLDEST'],
  );

  push(
    {
      id: 'interviews',
      report: 7051,
      title: t('facts-interviews-title', { defaultValue: 'Interviews' }),
      rows: [
        ...row(
          'INTERVIEW_FORMAT',
          t('facts-interview-format', { defaultValue: 'Format' }),
          text(get('INTERVIEW_FORMAT')),
        ),
        ...row(
          'INTERVIEW_INVITATIONS',
          t('facts-interview-invitations', { defaultValue: 'Invitations sent' }),
          text(get('INTERVIEW_INVITATIONS')),
        ),
        ...row(
          'INTERVIEW_REGIONAL',
          t('facts-interview-regional-short', { defaultValue: 'Regional' }),
          text(get('INTERVIEW_REGIONAL')),
        ),
        ...row(
          'INTERVIEW_VIDEO',
          t('facts-interview-video-short', { defaultValue: 'Video' }),
          text(get('INTERVIEW_VIDEO')),
        ),
      ],
    },
    ['INTERVIEW_FORMAT', 'INTERVIEW_INVITATIONS', 'INTERVIEW_REGIONAL', 'INTERVIEW_VIDEO'],
  );

  push(
    {
      id: 'secondary',
      report: 7011,
      title: t('facts-secondary-title', { defaultValue: 'Secondary application' }),
      rows: [
        ...row('SECONDARY_FEE', t('facts-secondary-fee', { defaultValue: 'Fee' }), usd(get('SECONDARY_FEE'))),
        ...row(
          'SECONDARY_FEE_WAIVER',
          t('facts-secondary-waiver-short', { defaultValue: 'Fee waiver' }),
          answer(get('SECONDARY_FEE_WAIVER')),
        ),
        ...row(
          'SECONDARY_DEADLINE',
          t('facts-secondary-deadline', { defaultValue: 'Deadline' }),
          text(get('SECONDARY_DEADLINE')),
        ),
      ],
    },
    ['SECONDARY_FEE', 'SECONDARY_FEE_WAIVER', 'SECONDARY_DEADLINE'],
  );

  // Deposit: "not required" is the whole answer; a required deposit is its amount, due date and refund terms.
  const depositKinds: FactKindId[] = [
    'DEPOSIT_REQUIRED',
    'DEPOSIT_DUE',
    'DEPOSIT_REFUNDABLE_BY',
    'DEPOSIT_IN_STATE',
    'DEPOSIT_OUT_OF_STATE',
    'DEPOSIT_REFUNDABLE',
    'DEPOSIT_APPLIED_TO_TUITION',
  ];
  const required = get('DEPOSIT_REQUIRED')?.value;
  const refundBy = date(get('DEPOSIT_REFUNDABLE_BY'));
  const refundable = get('DEPOSIT_REFUNDABLE')?.value;
  const depositRows: Row[] =
    required === 'NO'
      ? []
      : [
          ...row(
            'DEPOSIT_AMOUNT',
            t('facts-amount', { defaultValue: 'Amount' }),
            inOut(get('DEPOSIT_IN_STATE'), get('DEPOSIT_OUT_OF_STATE')),
          ),
          ...row('DEPOSIT_DUE', t('facts-deposit-due', { defaultValue: 'Due' }), date(get('DEPOSIT_DUE'))),
          ...row(
            'DEPOSIT_REFUNDABLE',
            t('facts-deposit-refundable', { defaultValue: 'Refundable' }),
            refundable !== 'NO' && refundBy
              ? t('facts-until', { defaultValue: 'Until {{date}}', date: refundBy })
              : answer(get('DEPOSIT_REFUNDABLE')),
          ),
          ...row(
            'DEPOSIT_APPLIED_TO_TUITION',
            t('facts-deposit-applied', { defaultValue: 'Applied to tuition' }),
            answer(get('DEPOSIT_APPLIED_TO_TUITION')),
          ),
        ];
  push(
    {
      id: 'deposit',
      report: 7066,
      title: t('facts-deposit-title', { defaultValue: 'Deposit' }),
      rows: depositRows,
      ...(required === 'NO'
        ? { line: t('facts-deposit-not-required', { defaultValue: 'Not required' }) }
        : depositRows.length === 0 && required === 'YES'
          ? { line: t('facts-deposit-is-required', { defaultValue: 'Required' }) }
          : {}),
    },
    depositKinds,
  );

  push(
    {
      id: 'cost',
      report: 7071,
      title: t('facts-cost-title', { defaultValue: 'Cost of attendance' }),
      rows: [
        ...row('COA', t('facts-total', { defaultValue: 'Total' }), inOut(get('COA_IN_STATE'), get('COA_OUT_OF_STATE'))),
        ...row(
          'TUITION',
          t('facts-tuition', { defaultValue: 'Tuition and fees' }),
          inOut(get('TUITION_IN_STATE'), get('TUITION_OUT_OF_STATE')),
        ),
      ],
    },
    ['COA_IN_STATE', 'COA_OUT_OF_STATE', 'TUITION_IN_STATE', 'TUITION_OUT_OF_STATE'],
  );

  if (blocks.length === 0) {
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
        <span className="medapp-headicon">
          <ClipboardList aria-hidden="true" className="size-5" />
          {t('facts-heading', { defaultValue: 'Admissions facts' })}
        </span>
      </h2>
      {blocks.map((b) => {
        const f = b.source;
        return (
          <div key={b.id} className="medapp-group" data-block={b.id}>
            <div className="medapp-srcrow">
              <h3 className="medapp-h3">{b.title}</h3>
              {b.line ? <span className="medapp-factline">{b.line}</span> : null}
              <SourceRef
                name={t('facts-source-name', { defaultValue: 'AAMC MSAR report · {{report}}', report: f.report })}
                detail={t('facts-source-detail', {
                  defaultValue: '{{year}} entering class · checked {{date}}',
                  year: f.cycleYear,
                  date: formatUtcDay(f.checkedOn, locale, { year: 'numeric', month: 'long', day: 'numeric' }),
                })}
                href={pdfPageUrl(f.sourceUrl, f.page)}
                attribution={t('facts-source', { defaultValue: 'Source: {{label}}', label: f.sourceLabel })}
              />
            </div>
            {b.text ? <p className="medapp-text medapp-text--sm">{b.text}</p> : null}
            {b.rows.length > 0 ? (
              <dl className="medapp-defs medapp-defs--facts">
                {b.rows.map((r) => (
                  <div key={r.key} className={r.stack ? 'is-stack' : undefined}>
                    <dt>{r.label}</dt>
                    <dd>{r.value}</dd>
                    {r.note ? <dd className="medapp-defs__note">{r.note}</dd> : null}
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

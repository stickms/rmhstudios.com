import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cycleLabelIsolated } from '../engine/cycle';
import type {
  MedAdmissionsPolicyDto,
  MedSchoolDetailDto,
  MedSchoolSecondariesRes,
  MedSecondaryGroupDto,
  MedSecondaryTurnaroundDto,
} from '../medschools.contract';
import { secondariesQuery } from '../medschools.queries';
import { useMedLabels } from './labels';
import { MedEmpty } from './MedEmpty';
import type { SchoolSearch } from './school-search';
import { useSecondaryLabels, type SecondaryLabels } from './secondaries/labels';
import { SecondaryPromptRow } from './secondaries/SecondaryPromptRow';
import { ListSkeleton, SkeletonSwap } from './skeletons';

/**
 * Secondaries: the school's secondary-application prompts, regular and MD-PhD / DO-PhD apart, each with its limit, whether it
 * is optional, the cycles it was seen in and a year-over-year mark. Beneath: when the school decides (its own admissions
 * page, quoted), how long members take to return a secondary, and where every figure was read. It holds no input: private
 * essay drafts are not stored anywhere. Server rendered (the loader prefetches the same query).
 */
export function SecondariesTab({
  slug,
  detail,
  search,
  programControl,
}: {
  slug: string;
  detail: MedSchoolDetailDto;
  search: SchoolSearch;
  /** The school page's program toggles. */
  programControl: ReactNode;
}) {
  const { t } = useTranslation('medschools');
  const query = useQuery(secondariesQuery(slug, { program: search.program }));
  const data = query.data;
  const controls = <div className="medapp-controls">{programControl}</div>;

  if (query.isError) {
    return (
      <div className="medapp-tab">
        {controls}
        <MedEmpty
          title={t('secondaries-load-failed', { defaultValue: 'Could not load the secondary prompts.' })}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="medapp-tab">
      {controls}
      <SkeletonSwap ready={!!data} skeleton={<ListSkeleton rows={6} />}>
        {data ? <Loaded data={data} detail={detail} /> : null}
      </SkeletonSwap>
    </div>
  );
}

function Loaded({ data, detail }: { data: MedSchoolSecondariesRes; detail: MedSchoolDetailDto }) {
  const { t } = useTranslation('medschools');
  const labels = useSecondaryLabels();
  const schoolName = detail.school.shortName;
  const anyPrompts = data.groups.length > 0;
  return (
    <div className="medapp-tab">
      {anyPrompts ? (
        data.groups.map((g) => (
          <Group key={g.program} group={g} detail={detail} labels={labels} schoolName={schoolName} />
        ))
      ) : (
        <MedEmpty
          title={t('secondaries-empty', { defaultValue: 'No secondary prompts on file for this school yet.' })}
        />
      )}
      <Admissions policies={data.admissions} detail={detail} labels={labels} />
      <Turnaround rows={data.turnaround} detail={detail} labels={labels} />
      <Sources data={data} labels={labels} schoolName={schoolName} />
      {anyPrompts ? (
        <p className="medapp-meta">
          {t('secondaries-cycle-note', {
            defaultValue: 'A cycle such as {{cycle}} is the application year of the class that enters in {{year}}.',
            cycle: cycleLabelIsolated(data.cycleYear),
            year: String(data.cycleYear),
          })}
        </p>
      ) : null}
    </div>
  );
}

function Group({
  group,
  detail,
  labels,
  schoolName,
}: {
  group: MedSecondaryGroupDto;
  detail: MedSchoolDetailDto;
  labels: SecondaryLabels;
  schoolName: string;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const notYet = group.state === 'not-yet';
  // A first year of data has nothing to compare with; before the school publishes, nothing is "gone".
  const showStatus = !notYet && group.prompts.some((p) => p.status !== null);
  return (
    <section className="medapp-section medapp-section--panel" aria-labelledby={`secondaries-group-${group.program}`}>
      <h2 id={`secondaries-group-${group.program}`} className="medapp-h2">
        {group.program === 'REG'
          ? t('secondaries-group-reg', { defaultValue: 'Regular prompts' })
          : t('secondaries-group-phd', {
              defaultValue: '{{program}} prompts',
              program: programFilterLabel('PHD', detail.school.degree),
            })}
      </h2>
      {group.program === 'PHD' ? (
        <p className="medapp-meta">
          {t('secondaries-phd-note', {
            defaultValue:
              "These are in addition to or instead of the regular prompts. Check the school's instructions.",
          })}
        </p>
      ) : null}
      {notYet ? (
        <p className="medapp-meta">
          {t('secondaries-not-yet', {
            defaultValue: "This cycle's prompts are not out yet. These are from the {{cycle}} cycle.",
            cycle: cycleLabelIsolated(group.shownCycle),
          })}
        </p>
      ) : showStatus && group.comparedWith !== null ? (
        <p className="medapp-meta">
          {t('secondaries-compared', {
            defaultValue: 'Compared with the {{cycle}} cycle.',
            cycle: cycleLabelIsolated(group.comparedWith),
          })}
        </p>
      ) : null}
      <ul className="medapp-list">
        {group.prompts.map((p) => (
          <SecondaryPromptRow key={p.id} prompt={p} labels={labels} schoolName={schoolName} showStatus={showStatus} />
        ))}
      </ul>
    </section>
  );
}

function Admissions({
  policies,
  detail,
  labels,
}: {
  policies: MedAdmissionsPolicyDto[];
  detail: MedSchoolDetailDto;
  labels: SecondaryLabels;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  if (policies.length === 0) return null;
  return (
    <section className="medapp-section medapp-section--panel">
      <h2 className="medapp-h2">{t('admissions-heading', { defaultValue: 'When decisions are made' })}</h2>
      <ul className="medapp-list">
        {policies.map((p) => (
          <li key={p.program}>
            <p className="medapp-text">
              {policies.length > 1 ? `${programFilterLabel(p.program, detail.school.degree)}: ` : ''}
              {p.rolling
                ? t('admissions-rolling', { defaultValue: 'Rolling admissions' })
                : t('admissions-set-dates', { defaultValue: 'Decisions on set dates' })}
            </p>
            <p className="medapp-meta">{t('admissions-quote', { defaultValue: '“{{text}}”', text: p.evidence })}</p>
            <p className="medapp-meta">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="medapp-link">
                {t('admissions-source', {
                  defaultValue: 'Source: {{school}} admissions page, checked {{date}}',
                  school: detail.school.shortName,
                  date: labels.date(p.checkedOn),
                })}
              </a>
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Turnaround({
  rows,
  detail,
  labels,
}: {
  rows: MedSecondaryTurnaroundDto[];
  detail: MedSchoolDetailDto;
  labels: SecondaryLabels;
}) {
  const { t } = useTranslation('medschools');
  const { programFilterLabel } = useMedLabels();
  const { number } = useLocaleFormat();
  if (rows.length === 0) return null;
  return (
    <section className="medapp-section medapp-section--panel">
      <h2 className="medapp-h2">{t('turnaround-heading', { defaultValue: 'Turnaround' })}</h2>
      <ul className="medapp-list">
        {rows.map((r) => (
          <li key={r.program}>
            <p className="medapp-text">
              {rows.length > 1 ? `${programFilterLabel(r.program, detail.school.degree)}: ` : ''}
              {t('turnaround-median', {
                count: r.medianDays,
                n: number(r.medianDays),
                defaultValue_one: 'Members return the secondary in a median of {{n}} day.',
                defaultValue_other: 'Members return the secondary in a median of {{n}} days.',
                defaultValue: 'Members return the secondary in a median of {{n}} days.',
              })}
            </p>
            <p className="medapp-meta">
              {t('turnaround-range', {
                defaultValue:
                  'The middle half took {{low}} to {{high}} days, from {{members}} members who shared. Updated {{date}}.',
                low: number(r.p25Days),
                high: number(r.p75Days),
                members: number(r.members),
                date: labels.date(r.asOf),
              })}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Sources({
  data,
  labels,
  schoolName,
}: {
  data: MedSchoolSecondariesRes;
  labels: SecondaryLabels;
  schoolName: string;
}) {
  const { t } = useTranslation('medschools');
  if (data.sources.length === 0) return null;
  return (
    <ul className="medapp-list medapp-list--plain">
      {data.sources.map((s) => {
        const text =
          s.status === 'EMPTY'
            ? t('secondaries-source-empty', {
                defaultValue: 'Source: {{name}}, checked {{date}}, nothing found',
                name: labels.sourceName(s.source, schoolName),
                date: s.checkedAt ? labels.date(s.checkedAt) : '',
              })
            : t('secondaries-source-line', {
                defaultValue: 'Source: {{name}}, checked {{date}}',
                name: labels.sourceName(s.source, schoolName),
                date: s.checkedAt ? labels.date(s.checkedAt) : '',
              });
        return (
          <li key={s.source} className="medapp-meta">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="medapp-link">
                {text}
              </a>
            ) : (
              text
            )}
          </li>
        );
      })}
    </ul>
  );
}

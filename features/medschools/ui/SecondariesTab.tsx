import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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
  const controls = <div className="flex flex-wrap items-center gap-2">{programControl}</div>;

  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {controls}
        <EmptyState
          title={t('secondaries-load-failed', { defaultValue: 'Could not load the secondary prompts.' })}
          action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
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
    <div className="flex flex-col gap-8">
      {anyPrompts ? (
        data.groups.map((g) => (
          <Group key={g.program} group={g} detail={detail} labels={labels} schoolName={schoolName} />
        ))
      ) : (
        <EmptyState
          title={t('secondaries-empty', { defaultValue: 'No secondary prompts on file for this school yet.' })}
        />
      )}
      <Admissions policies={data.admissions} detail={detail} labels={labels} />
      <Turnaround rows={data.turnaround} detail={detail} labels={labels} />
      <Sources data={data} labels={labels} schoolName={schoolName} />
      {anyPrompts ? (
        <p className="t-meta m-0">
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
    <section className="flex flex-col gap-2" aria-labelledby={`secondaries-group-${group.program}`}>
      <h2 id={`secondaries-group-${group.program}`} className="t-heading m-0">
        {group.program === 'REG'
          ? t('secondaries-group-reg', { defaultValue: 'Regular prompts' })
          : t('secondaries-group-phd', {
              defaultValue: '{{program}} prompts',
              program: programFilterLabel('PHD', detail.school.degree),
            })}
      </h2>
      {group.program === 'PHD' ? (
        <p className="t-meta m-0">
          {t('secondaries-phd-note', {
            defaultValue:
              "These are in addition to or instead of the regular prompts. Check the school's instructions.",
          })}
        </p>
      ) : null}
      {notYet ? (
        <p className="t-meta m-0">
          {t('secondaries-not-yet', {
            defaultValue: "This cycle's prompts are not out yet. These are from the {{cycle}} cycle.",
            cycle: cycleLabelIsolated(group.shownCycle),
          })}
        </p>
      ) : showStatus && group.comparedWith !== null ? (
        <p className="t-meta m-0">
          {t('secondaries-compared', {
            defaultValue: 'Compared with the {{cycle}} cycle.',
            cycle: cycleLabelIsolated(group.comparedWith),
          })}
        </p>
      ) : null}
      <ul className="m-0 list-none border-t border-site-border p-0">
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
    <section className="flex flex-col gap-2">
      <h2 className="t-heading m-0">{t('admissions-heading', { defaultValue: 'When decisions are made' })}</h2>
      <ul className="m-0 list-none border-t border-site-border p-0">
        {policies.map((p) => (
          <li key={p.program} className="m-0 flex flex-col gap-1 border-b border-site-border py-3">
            <p className="t-body m-0">
              {policies.length > 1 ? `${programFilterLabel(p.program, detail.school.degree)}: ` : ''}
              {p.rolling
                ? t('admissions-rolling', { defaultValue: 'Rolling admissions' })
                : t('admissions-set-dates', { defaultValue: 'Decisions on set dates' })}
            </p>
            <p className="t-meta m-0 break-words">
              {t('admissions-quote', { defaultValue: '“{{text}}”', text: p.evidence })}
            </p>
            <p className="t-meta m-0">
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="underline">
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
    <section className="flex flex-col gap-2">
      <h2 className="t-heading m-0">{t('turnaround-heading', { defaultValue: 'Turnaround' })}</h2>
      <ul className="m-0 list-none border-t border-site-border p-0">
        {rows.map((r) => (
          <li key={r.program} className="m-0 flex flex-col gap-1 border-b border-site-border py-3">
            <p className="t-body m-0">
              {rows.length > 1 ? `${programFilterLabel(r.program, detail.school.degree)}: ` : ''}
              {t('turnaround-median', {
                count: r.medianDays,
                n: number(r.medianDays),
                defaultValue_one: 'Members return the secondary in a median of {{n}} day.',
                defaultValue_other: 'Members return the secondary in a median of {{n}} days.',
                defaultValue: 'Members return the secondary in a median of {{n}} days.',
              })}
            </p>
            <p className="t-meta m-0">
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
    <ul className="m-0 list-none p-0">
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
          <li key={s.source} className="t-meta">
            {s.url ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
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

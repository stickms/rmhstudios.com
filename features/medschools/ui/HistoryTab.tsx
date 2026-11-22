import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { CHARTED_TYPES, PRIMARY_ORDER, overlaySource } from '../engine/public-read';
import { historyQuery } from '../medschools.queries';
import type { MedChartedTypeId, MedSchoolDetailDto, MedSourceId } from '../medschools.contract';
import { CycleOverlay } from './charts/CycleOverlay';
import { useChartLabels } from './chartLabels';
import { useMedLabels } from './labels';
import type { SchoolSearch, SetSchoolSearch } from './school-search';
import { ChartSkeleton, SkeletonSwap } from './skeletons';
import { SourceLinks } from './SourceLinks';

/** History: one source's cumulative line per cycle, newest first (D4: never cross-source). */
export function HistoryTab({
  slug,
  detail,
  search,
  setSearch,
  programControl,
}: {
  slug: string;
  detail: MedSchoolDetailDto;
  search: SchoolSearch;
  setSearch: SetSchoolSearch;
  /** The school page's program select: one controls row with the category and source selects. */
  programControl: ReactNode;
}) {
  const { t } = useTranslation('medschools');
  const { eventLabel, sourceName } = useMedLabels();
  const chartLabels = useChartLabels();
  const type = search.type as MedChartedTypeId;
  const query = useQuery(historyQuery(slug, { program: search.program, type }));

  if (query.isError) {
    return (
      <EmptyState
        title={t('school-history-failed', { defaultValue: 'Could not load the history.' })}
        action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
      />
    );
  }

  const cycles = [...(query.data?.cycles ?? [])].sort((a, b) => b.cycleYear - a.cycleYear);
  const present = new Set<MedSourceId>(cycles.flatMap((c) => c.sources.map((s) => s.source)));
  const options = PRIMARY_ORDER.filter((s) => present.has(s));
  const auto = overlaySource(cycles.map((c) => ({ cycleYear: c.cycleYear, sources: c.sources.map((s) => s.source) })));
  const chosen: MedSourceId | null = search.source && present.has(search.source) ? search.source : auto;
  const lines = chosen
    ? cycles.flatMap((c) => {
        const s = c.sources.find((x) => x.source === chosen);
        return s ? [{ cycleYear: c.cycleYear, points: s.points, estimated: c.dayZeroEstimated }] : [];
      })
    : [];
  const sharedLinks = detail.links.filter((l) => l.cycleYear === null);

  return (
    <SkeletonSwap ready={!!query.data} skeleton={<ChartSkeleton />}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          {programControl}
          <Select
            controlSize="sm"
            aria-label={t('school-type-label', { defaultValue: 'Category' })}
            value={type}
            onChange={(e) => setSearch({ type: e.target.value as MedChartedTypeId })}
          >
            {CHARTED_TYPES.map((ty) => (
              <option key={ty} value={ty}>
                {eventLabel(ty as MedChartedTypeId)}
              </option>
            ))}
          </Select>
          {options.length > 1 && chosen ? (
            <Select
              controlSize="sm"
              aria-label={t('school-source-label', { defaultValue: 'Source' })}
              value={chosen}
              onChange={(e) => setSearch({ source: e.target.value as MedSourceId })}
            >
              {options.map((s) => (
                <option key={s} value={s}>
                  {sourceName(s)}
                </option>
              ))}
            </Select>
          ) : null}
        </div>
        {lines.length === 0 || !chosen ? (
          <EmptyState title={t('school-history-empty', { defaultValue: 'No earlier cycles have data yet.' })} />
        ) : (
          <>
            <CycleOverlay
              cycles={lines.slice(0, 4)}
              sourceName={sourceName(chosen)}
              labels={chartLabels(
                t('school-history-title', {
                  defaultValue: '{{type}} by cycle',
                  type: eventLabel(type),
                }),
              )}
            />
            <div>
              {lines.some((l) => l.estimated) ? (
                <p className="t-meta m-0">
                  {t('school-history-estimated', {
                    defaultValue: '{{year}}: cycle start estimated as June 1.',
                    year: lines
                      .filter((l) => l.estimated)
                      .map((l) => String(l.cycleYear))
                      .join(', '),
                  })}
                </p>
              ) : null}
              {lines.map((l) => (
                <SourceLinks key={l.cycleYear} links={detail.links.filter((k) => k.cycleYear === l.cycleYear)} />
              ))}
              <SourceLinks links={sharedLinks} />
            </div>
          </>
        )}
      </div>
    </SkeletonSwap>
  );
}

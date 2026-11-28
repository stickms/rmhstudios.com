import { useState } from 'react';
import { Link, useSearch } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { MedSearch } from './controls/MedSearch';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import { schoolProgramOf } from '../engine/programs';
import { Q_MAX, SCHOOL_SEARCH_DEFAULTS, parseIndexSearch } from '../engine/search';
import { indexQuery, schoolsQuery } from '../medschools.queries';
import { MineSelect, MineSignedOutNote, useMineEmptyText } from './MineSelect';
import { PrefsNote } from './PrefsNote';
import { clearSavedFilters } from './useSavedFilters';
import { useSourcePref } from './useSourcePref';
import { useSchoolListFilters } from './useSchoolListFilters';
import { ProgramMultiSelect, StateMultiSelect } from './ProgramMultiSelect';
import { SaveToList } from './SaveToList';
import { SchoolCrest } from './SchoolCrest';
import { SkeletonSwap } from './skeletons';
import { useLiveSignal } from './useLiveSignal';
import { useMedLabels } from './labels';
import { LatestStatus } from './LatestStatus';
import { StatusIcon } from './status/StatusIcon';
import { statusOfEvent } from './status/status';
import { MedEmpty } from './MedEmpty';

/**
 * /med: the school index. A paper panel of rows (the redesign's list, D14). A school with no
 * reported figure prints nothing in the figure slot: ~200 "no data" lines were noise.
 */
export function IndexPage() {
  const { t } = useTranslation('medschools');
  const { locale } = useLocaleFormat();
  const { sourceName } = useMedLabels();
  const search = parseIndexSearch(useSearch({ strict: false }) as Record<string, unknown>);
  const nf = new Intl.NumberFormat(locale);
  const [text, setText] = useState(search.q ?? '');

  const { view, setView, states, mine, fromDevice, setSearch, setStates, setMine } = useSchoolListFilters('index', search);
  // The header's CycleTrack / Admit.org choice: each row's reported count is that source's where the school has one.
  const source = useSourcePref();
  const schools = useQuery(schoolsQuery(indexQuery({ q: search.q, states, source: source.value }, view)));
  // A link that named the source hands it on to the school pages (a device choice needs no help: it is read there).
  const schoolSearch =
    source.from === 'url' && source.value === 'admit'
      ? { ...SCHOOL_SEARCH_DEFAULTS, source: 'ADMIT' as const }
      : SCHOOL_SEARCH_DEFAULTS;
  // The live signal refetches the list in place (each row's newest status), at every width; the rail is separate.
  useLiveSignal();
  const mineEmpty = useMineEmptyText();

  const pushQuery = useDebouncedCallback((q: string) => setSearch({ q: q.trim() || undefined }), 250);

  // "My schools" (D15, owner 2026-11-24): a client filter over the schools the public endpoint already returned, so
  // the public cache key never carries a user. A signed-out viewer of a `?list=` link sees every school and is told why.
  const listSlugs = mine.slugs;
  const rows = (schools.data?.schools ?? []).filter((s) => !listSlugs || listSlugs.has(s.slug));

  return (
    <div className="medapp-index medapp-fill">
      <div className="medapp-filters">
        <div className="medapp-toolbar">
          <MedSearch
            containerClassName="medapp-toolbar__grow"
            aria-label={t('index-search-label', { defaultValue: 'Search schools' })}
            placeholder={t('index-search-placeholder', { defaultValue: 'Search schools' })}
            maxLength={Q_MAX}
            value={text}
            onValueChange={(v) => {
              setText(v);
              pushQuery(v);
            }}
          />
          <StateMultiSelect states={schools.data?.states ?? []} value={states} onChange={setStates} />
          <ProgramMultiSelect value={view.programs} onChange={(programs) => setView({ programs })} />
          {mine.signedIn ? <MineSelect value={mine.choice} lists={mine.lists} onChange={setMine} /> : null}
        </div>
        {mine.signedIn ? null : <MineSignedOutNote search={search} />}
        <PrefsNote fromPrefs={view.fromPrefs} fromDevice={fromDevice} onClearSaved={() => clearSavedFilters('page')} />
      </div>

      <div className="medapp-fill">
        {schools.isError ? (
          <MedEmpty
            title={t('index-load-failed', { defaultValue: 'Could not load the schools.' })}
            onRetry={() => void schools.refetch()}
          />
        ) : (
          <SkeletonSwap ready={!!schools.data} stale={schools.isPlaceholderData}>
            {schools.data && rows.length === 0 ? (
              <MedEmpty
                title={
                  mine.choice && listSlugs?.size === 0
                    ? mineEmpty(mine.choice)
                    : t('index-empty', { defaultValue: 'No schools match.' })
                }
              />
            ) : (
              <ul className="medapp-panel medapp-rows">
                {rows.map((s) => (
                  <li key={s.slug} className="medapp-row medapp-schoolrow">
                    {/* On a phone the decision is a badge on the crest's corner (as in the live rows); from 600px it is the disc
                        at the row's end, so one of the two is hidden by CSS. */}
                    <span className="medapp-crestbadge">
                      <SchoolCrest slug={s.slug} name={s.name} size={40} />
                      {s.latest ? (
                        <StatusIcon
                          status={statusOfEvent(s.latest.eventType)}
                          size="xs"
                          className="medapp-crestbadge__badge medapp-schoolrow__badge"
                        />
                      ) : null}
                    </span>
                    <div className="medapp-row__body">
                      <p className="medapp-row__name">
                        <Link to="/med/$slug" params={{ slug: s.slug }} search={schoolSearch}>
                          {s.name}
                        </Link>
                      </p>
                      <p className="medapp-row__meta">
                        {t('index-school-meta', {
                          defaultValue: '{{degree}} · {{city}}, {{state}}',
                          degree: s.degree,
                          city: s.city,
                          state: s.state,
                        })}
                      </p>
                      {s.reported?.source === 'ADMIT' && s.accounted ? (
                        // Admit's own total for the school is the denominator, so this reads only when the figures
                        // are Admit's: the dated interviews we hold of the ones Admit says were reported.
                        <p className="medapp-row__meta medapp-row__reported">
                          {t('index-accounted', {
                            n: nf.format(s.accounted.counted),
                            of: nf.format(s.accounted.of),
                            source: sourceName('ADMIT'),
                            defaultValue: '{{n}} of {{of}} interviews accounted for, {{source}}',
                          })}
                        </p>
                      ) : s.reported ? (
                        <p className="medapp-row__meta medapp-row__reported">
                          {t('index-reported', {
                            count: s.reported.count,
                            n: nf.format(s.reported.count),
                            defaultValue_one: '{{n}} reported invite, {{source}}',
                            defaultValue_other: '{{n}} reported invites, {{source}}',
                            defaultValue: '{{n}} reported invites, {{source}}',
                            source: sourceName(s.reported.source),
                          })}
                        </p>
                      ) : null}
                    </div>
                    {s.latest ? <LatestStatus latest={s.latest} /> : null}
                    <SaveToList
                      school={{ slug: s.slug, name: s.name }}
                      program={schoolProgramOf(view.programs, s.degree)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SkeletonSwap>
        )}
      </div>
    </div>
  );
}

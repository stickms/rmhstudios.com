import { notFound } from '@tanstack/react-router';
import { keepPreviousData, type QueryClient } from '@tanstack/react-query';
import { HttpError } from '@/lib/http';
import { contractQuery, prefetchRouteQuery } from '@/lib/route/route-query';
import type { QueryOf } from '@/lib/contract/endpoint';
import {
  getMedListsApi,
  getMedLiveApi,
  getMedLiveSummaryApi,
  getMedAskStatusApi,
  getMedQaLimitRequestApi,
  getMedChancesApi,
  getMedPrefsApi,
  getMedSchoolActivityApi,
  getMedSchoolApi,
  getMedSchoolArrivalsApi,
  getMedSchoolForecastApi,
  getMedSchoolHistoryApi,
  getMedSchoolFactsApi,
  getMedSchoolSecondariesApi,
  getMedRollingGuidanceApi,
  getMedSecondaryOverlapApi,
  getMedTrackerApi,
  listMedSchoolsApi,
  type MedChartedTypeId,
  type MedDegreeId,
  type MedProgramFilter,
} from './medschools.contract';
import { programPair, programsQueryValue, type ProgramKey } from './engine/programs';
import { applyPrefs, type Prefs } from './engine/prefs';
import type { ProgramFilter } from './engine/search';
import type { SchoolTab } from './engine/public-read';

const CHARTED: readonly string[] = ['INTERVIEW', 'SECONDARY', 'WAITLIST', 'REJECTION', 'ACCEPTANCE'];

/** Client-safe option factories for the public pages. No server functions here (queries-server-fn-ratchet). */

export type IndexQuery = QueryOf<typeof listMedSchoolsApi>;

/**
 * A filter or setting change keeps the last answer on screen until the new one lands (owner 2026-11-24: never blank the
 * page, never show a skeleton for a change of filter); the page dims it meanwhile through `isPlaceholderData`. A school
 * keeps only its own answers: moving to another school never shows the previous school's figures.
 */
/** A query's options with what it shows while a new key loads (`contractQuery` takes only the cache options). */
const keeping = <O extends object, P>(options: O, placeholderData: P) => ({ ...options, placeholderData });

/**
 * A school's public figures change at most once a day (the ingest jobs, the daily forecast), so a school page and its
 * tabs stay fresh for 5 minutes and in memory for 30: going back to a school or a tab, or a tab the page fetched in the
 * background (`ui/prefetch-tabs.ts`), renders straight from the cache (owner 2026-11-24). The live feed keeps its own.
 */
const SCHOOL_STALE = 5 * 60_000;
const SCHOOL_GC = 30 * 60_000;
const schoolScoped = <O extends object>(options: O, slug: string) => ({
  ...options,
  gcTime: SCHOOL_GC,
  placeholderData: keepWithinSchool(slug),
});

const keepWithinSchool =
  (slug: string) =>
  <T>(previous: T | undefined, previousQuery?: { queryKey: readonly unknown[] }): T | undefined =>
    previousQuery?.queryKey[2] === slug ? previous : undefined;

/** A route loader's wait: a search change on the same page (`cause: 'stay'`) never waits, so the router's pending
 * frame never replaces the page; the query fills in behind the old content. A first visit waits, so the HTML is whole. */
export async function waitUnlessStay(cause: 'enter' | 'stay' | 'preload' | undefined, work: Promise<unknown>) {
  if (cause === 'stay') {
    void work.catch(() => undefined);
    return;
  }
  await work;
}
export type LiveFilters = QueryOf<typeof getMedLiveApi>;

export const schoolsQuery = (q: IndexQuery) =>
  keeping(
    contractQuery(['medschools', 'schools', q], listMedSchoolsApi, { query: q }, { staleTime: 60_000 }),
    keepPreviousData,
  );

export const schoolQuery = (slug: string) => ({
  ...contractQuery(['medschools', 'school', slug], getMedSchoolApi, { params: { slug } }, { staleTime: SCHOOL_STALE }),
  gcTime: SCHOOL_GC,
});

export const activityQuery = (slug: string, q: { program: MedProgramFilter; cycle?: number | undefined }) =>
  schoolScoped(
    contractQuery(
      ['medschools', 'activity', slug, q],
      getMedSchoolActivityApi,
      { params: { slug }, query: q },
      { staleTime: SCHOOL_STALE },
    ),
    slug,
  );

export const historyQuery = (slug: string, q: { program: MedProgramFilter; type: MedChartedTypeId }) =>
  schoolScoped(
    contractQuery(
      ['medschools', 'history', slug, q],
      getMedSchoolHistoryApi,
      { params: { slug }, query: q },
      { staleTime: SCHOOL_STALE },
    ),
    slug,
  );

export const forecastQuery = (slug: string, q: { program: 'REG' | 'PHD'; type: MedChartedTypeId }) =>
  schoolScoped(
    contractQuery(
      ['medschools', 'forecast', slug, q],
      getMedSchoolForecastApi,
      { params: { slug }, query: q },
      { staleTime: SCHOOL_STALE },
    ),
    slug,
  );

/** The Secondaries tab: prompts, marks and attribution. Public, so the loader prefetches the same key as anyone's. */
export const secondariesQuery = (slug: string, q: { program: MedProgramFilter }) =>
  schoolScoped(
    contractQuery(
      ['medschools', 'secondaries', slug, q],
      getMedSchoolSecondariesApi,
      { params: { slug }, query: q },
      { staleTime: SCHOOL_STALE },
    ),
    slug,
  );

/** The Facts tab: Admissions facts (the AAMC MSAR reports) and Curriculum (Admit.org). Public, so the loader prefetches the same key as anyone's. */
export const schoolFactsQuery = (slug: string) => ({
  ...contractQuery(['medschools', 'facts', slug], getMedSchoolFactsApi, { params: { slug } }, { staleTime: SCHOOL_GC }),
  gcTime: SCHOOL_GC,
});

export const arrivalsQuery = (slug: string, q: { program: MedProgramFilter; type: MedChartedTypeId }) =>
  schoolScoped(
    contractQuery(
      ['medschools', 'arrivals', slug, q],
      getMedSchoolArrivalsApi,
      { params: { slug }, query: q },
      { staleTime: SCHOOL_STALE },
    ),
    slug,
  );

export const liveQuery = (q: LiveFilters) =>
  keeping(contractQuery(['medschools', 'live', q], getMedLiveApi, { query: q }, { staleTime: 0 }), keepPreviousData);

export type LiveSummaryFilters = QueryOf<typeof getMedLiveSummaryApi>;

/**
 * The live page's "Today" column: public, refreshed every 60 s like the feed, the previous answer kept (dimmed) while a
 * changed filter loads. The column passes `enabled: false` below 1280px, so nothing (an invalidation included) fetches
 * it on a phone.
 */
export const liveSummaryQuery = (q: LiveSummaryFilters) =>
  keeping(
    contractQuery(['medschools', 'live-summary', q], getMedLiveSummaryApi, { query: q }, { staleTime: 15_000 }),
    keepPreviousData,
  );

/* ------------------------- private (me/**) -------------------------
 * Every personal key starts with `['medschools', 'me']`: the mutations invalidate that prefix and a sign-out clears
 * the query client (plan D16). Signed out, these fail with a 401 and the pages show the sign-in prompt. */

export const ME_KEY = ['medschools', 'me'] as const;

export const listsQuery = () =>
  contractQuery([...ME_KEY, 'lists'] as const, getMedListsApi, undefined, { staleTime: 30_000 });

export const prefsQuery = () =>
  contractQuery([...ME_KEY, 'prefs'] as const, getMedPrefsApi, undefined, { staleTime: 5 * 60_000 });

/**
 * A route loader's first step (plan D13): await the private prefs query into the cache, then read what landed. Signed
 * out, or on any failure, nothing lands and the page is exactly what an anonymous request gets. The public queries
 * that follow carry the resulting view as explicit parameters, so their cache keys are the ones anyone could type.
 */
export async function loadPrefs(queryClient: QueryClient, cause?: 'enter' | 'stay' | 'preload'): Promise<Prefs | null> {
  // A tab or setting change on the same page reads what the cache has and never waits on the private request (signed
  // out it is a 401 that caches nothing, so awaiting it put the router's pending frame up on every change).
  if (cause === 'stay') return queryClient.getQueryData(prefsQuery().queryKey) ?? null;
  await prefetchRouteQuery(queryClient, prefsQuery());
  return queryClient.getQueryData(prefsQuery().queryKey) ?? null;
}

/**
 * The essay overlap of one of the caller's lists, or of their tracker. Under `ME_KEY` and never cached by the server;
 * the list id is a query value, so it never appears in a path another member could share.
 */
export const overlapQuery = (q: { source: 'list'; list: string } | { source: 'tracker' }) =>
  contractQuery(
    [...ME_KEY, 'secondaries-overlap', q] as const,
    getMedSecondaryOverlapApi,
    { query: q },
    { staleTime: 60_000 },
  );

/** What the member's own list or tracker schools say about rolling decisions. Personal, so under `ME_KEY` and never cached by the server. */
export const rollingQuery = (q: { source: 'list'; list: string } | { source: 'tracker' }) =>
  contractQuery([...ME_KEY, 'rolling', q] as const, getMedRollingGuidanceApi, { query: q }, { staleTime: 60_000 });

/** The tracker for one cycle year, or the newest the user has when `cycle` is omitted. Never cached by the server. */
export const trackerQuery = (cycle?: number) =>
  keeping(
    contractQuery(
      [...ME_KEY, 'tracker', cycle ?? null] as const,
      getMedTrackerApi,
      { query: cycle === undefined ? {} : { cycle } },
      { staleTime: 0 },
    ),
    keepPreviousData,
  );

/**
 * The caller's own invite chances (never cached by the server). `school` narrows to one school page; `cycle` to one
 * tracker cycle (the newest when omitted). Under `ME_KEY`, so a tracker change refreshes it.
 */
export const chancesQuery = (q: { school?: string; cycle?: number } = {}) =>
  contractQuery([...ME_KEY, 'chances', q] as const, getMedChancesApi, { query: q }, { staleTime: 0 });

/** Whether Q&A is on and the caller's questions left today. Under `ME_KEY`; refetched after each question. */
export const askStatusQuery = () =>
  contractQuery([...ME_KEY, 'ask-status'] as const, getMedAskStatusApi, {}, { staleTime: 0 });

/** Where the caller stands on a higher Q&A limit (plan R19). Under `ME_KEY`; refreshed after a request. */
export const qaLimitRequestQuery = () =>
  contractQuery([...ME_KEY, 'qa-limit-request'] as const, getMedQaLimitRequestApi, {}, { staleTime: 0 });

/** The schools-list request for a parsed index search and its effective view. */
export function indexQuery(
  search: { q?: string | undefined; states?: readonly string[] | undefined },
  view: { programs: readonly ProgramKey[] },
): IndexQuery {
  const programs = programsQueryValue(view.programs);
  return {
    ...(search.q ? { q: search.q } : {}),
    // Canonical (sorted, deduped by the parser), so one choice is one cache key.
    ...(search.states?.length ? { state: search.states.join(',') } : {}),
    ...(programs ? { programs } : {}),
  };
}

export type LiveSearch = {
  type?: LiveFilters['type'];
  school?: string;
  states?: readonly string[];
  programs: readonly ProgramKey[];
};

/** The live loader's search from the parsed URL and the effective view. */
export function liveSearchOf(
  search: { type?: LiveFilters['type']; school?: string | undefined; states?: readonly string[] | undefined },
  view: { programs: readonly ProgramKey[] },
): LiveSearch {
  return {
    ...(search.type ? { type: search.type } : {}),
    ...(search.school ? { school: search.school } : {}),
    ...(search.states?.length ? { states: search.states } : {}),
    programs: view.programs,
  };
}

/**
 * What the live feed asks the API for, given the page's search and the school list (O5). With one school selected, the
 * set is narrowed to that school's own degree; a set with nothing of its degree is dropped (the feed shows the school).
 */
export function resolveLiveFilters(search: LiveSearch, schoolDegree: MedDegreeId | undefined): LiveFilters {
  let set = [...search.programs];
  if (schoolDegree) set = set.filter((k) => programPair(k).degree === schoolDegree);
  const programs = set.length > 0 ? programsQueryValue(set) : undefined;
  return {
    ...(search.type ? { type: search.type } : {}),
    ...(search.school ? { school: search.school } : {}),
    ...(search.states?.length ? { state: search.states.join(',') } : {}),
    ...(programs ? { programs } : {}),
  };
}

/** The degree of the school the live feed is filtered to, read from the (cached) school list. */
export function schoolDegreeOf(schools: { slug: string; degree: MedDegreeId }[] | undefined, slug: string | undefined) {
  return slug ? schools?.find((s) => s.slug === slug)?.degree : undefined;
}

/** Live route loader: the school list first (it decides the degree filter), then the first page of events. */
export async function prefetchLivePage(queryClient: QueryClient, search: LiveSearch): Promise<undefined> {
  await prefetchRouteQuery(queryClient, schoolsQuery({}));
  const list = queryClient.getQueryData(schoolsQuery({}).queryKey);
  return prefetchRouteQuery(
    queryClient,
    liveQuery(resolveLiveFilters(search, schoolDegreeOf(list?.schools, search.school))),
  );
}

/** What `head()` needs to name a school; the loader returns it so the title is right before the page hydrates. */
export interface SchoolHead {
  slug: string;
  name: string;
  shortName: string;
  degree: MedDegreeId;
  state: string;
  city: string;
}

/**
 * School route loader: the school (a 404 is `notFound()`, any other failure leaves the page's own error state), then
 * the active tab's query so the charts are in the server HTML.
 */
export async function loadSchoolHead(
  queryClient: QueryClient,
  slug: string,
  deps: { tab: SchoolTab; program?: ProgramFilter | undefined; type: string; cycle?: number | undefined },
  prefs: Prefs | null = null,
  cause?: 'enter' | 'stay' | 'preload',
): Promise<SchoolHead | null> {
  let detail;
  try {
    detail = await queryClient.fetchQuery(schoolQuery(slug));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw notFound();
    return null;
  }
  // The URL's program where it speaks, the viewer's preference through the school's own degree where it is silent.
  const program = applyPrefs('school', { program: deps.program }, prefs, {
    schoolDegree: detail.school.degree,
  }).program;
  // The tab's own query: awaited on a first visit (the chart is in the HTML), not on a change of tab or setting.
  let tab: Promise<unknown> = Promise.resolve();
  if (deps.tab === 'activity') {
    tab = prefetchRouteQuery(queryClient, activityQuery(slug, { program, cycle: deps.cycle }));
  } else if (deps.tab === 'history') {
    tab = prefetchRouteQuery(queryClient, historyQuery(slug, { program, type: deps.type as MedChartedTypeId }));
  } else if (deps.tab === 'forecast') {
    // The same key the tab asks for (ALL reads REG, D12; a category the charts do not draw reads Interview).
    const type = (CHARTED.includes(deps.type as MedChartedTypeId) ? deps.type : 'INTERVIEW') as MedChartedTypeId;
    tab = prefetchRouteQuery(queryClient, forecastQuery(slug, { program: program === 'PHD' ? 'PHD' : 'REG', type }));
  } else if (deps.tab === 'secondaries') {
    tab = prefetchRouteQuery(queryClient, secondariesQuery(slug, { program }));
  } else if (deps.tab === 'facts') {
    // One query for both sections (the AAMC reports and Admit's curriculum), for an MD and a DO school alike.
    tab = prefetchRouteQuery(queryClient, schoolFactsQuery(slug));
  }
  await waitUnlessStay(cause, tab);
  const { school } = detail;
  return {
    slug: school.slug,
    name: school.name,
    shortName: school.shortName,
    degree: school.degree,
    state: school.state,
    city: school.city,
  };
}

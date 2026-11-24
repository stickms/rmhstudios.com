import { notFound } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { HttpError } from '@/lib/http';
import { contractQuery, prefetchRouteQuery } from '@/lib/route/route-query';
import type { QueryOf } from '@/lib/contract/endpoint';
import {
  getMedListsApi,
  getMedLiveApi,
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
export type LiveFilters = QueryOf<typeof getMedLiveApi>;

export const schoolsQuery = (q: IndexQuery) =>
  contractQuery(['medschools', 'schools', q], listMedSchoolsApi, { query: q }, { staleTime: 60_000 });

export const schoolQuery = (slug: string) =>
  contractQuery(['medschools', 'school', slug], getMedSchoolApi, { params: { slug } }, { staleTime: 60_000 });

export const activityQuery = (slug: string, q: { program: MedProgramFilter; cycle?: number | undefined }) =>
  contractQuery(
    ['medschools', 'activity', slug, q],
    getMedSchoolActivityApi,
    { params: { slug }, query: q },
    { staleTime: 60_000 },
  );

export const historyQuery = (slug: string, q: { program: MedProgramFilter; type: MedChartedTypeId }) =>
  contractQuery(
    ['medschools', 'history', slug, q],
    getMedSchoolHistoryApi,
    { params: { slug }, query: q },
    { staleTime: 60_000 },
  );

export const forecastQuery = (slug: string, q: { program: 'REG' | 'PHD'; type: MedChartedTypeId }) =>
  contractQuery(
    ['medschools', 'forecast', slug, q],
    getMedSchoolForecastApi,
    { params: { slug }, query: q },
    { staleTime: 5 * 60_000 },
  );

/** The Secondaries tab: prompts, marks and attribution. Public, so the loader prefetches the same key as anyone's. */
export const secondariesQuery = (slug: string, q: { program: MedProgramFilter }) =>
  contractQuery(
    ['medschools', 'secondaries', slug, q],
    getMedSchoolSecondariesApi,
    { params: { slug }, query: q },
    { staleTime: 5 * 60_000 },
  );

/** The Facts tab: Admissions facts (the AAMC MSAR reports) and Curriculum (Admit.org). Public, so the loader prefetches the same key as anyone's. */
export const schoolFactsQuery = (slug: string) =>
  contractQuery(['medschools', 'facts', slug], getMedSchoolFactsApi, { params: { slug } }, { staleTime: 30 * 60_000 });

export const arrivalsQuery = (slug: string, q: { program: MedProgramFilter; type: MedChartedTypeId }) =>
  contractQuery(
    ['medschools', 'arrivals', slug, q],
    getMedSchoolArrivalsApi,
    { params: { slug }, query: q },
    { staleTime: 5 * 60_000 },
  );

export const liveQuery = (q: LiveFilters) =>
  contractQuery(['medschools', 'live', q], getMedLiveApi, { query: q }, { staleTime: 0 });

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
export async function loadPrefs(queryClient: QueryClient): Promise<Prefs | null> {
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
  contractQuery(
    [...ME_KEY, 'tracker', cycle ?? null] as const,
    getMedTrackerApi,
    { query: cycle === undefined ? {} : { cycle } },
    { staleTime: 0 },
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
  search: { q?: string | undefined; state?: string | undefined },
  view: { programs: readonly ProgramKey[] },
): IndexQuery {
  const programs = programsQueryValue(view.programs);
  return {
    ...(search.q ? { q: search.q } : {}),
    ...(search.state ? { state: search.state } : {}),
    ...(programs ? { programs } : {}),
  };
}

export type LiveSearch = {
  type?: LiveFilters['type'];
  school?: string;
  programs: readonly ProgramKey[];
};

/** The live loader's search from the parsed URL and the effective view. */
export function liveSearchOf(
  search: { type?: LiveFilters['type']; school?: string | undefined },
  view: { programs: readonly ProgramKey[] },
): LiveSearch {
  return {
    ...(search.type ? { type: search.type } : {}),
    ...(search.school ? { school: search.school } : {}),
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
  if (deps.tab === 'activity') {
    await prefetchRouteQuery(queryClient, activityQuery(slug, { program, cycle: deps.cycle }));
  } else if (deps.tab === 'history') {
    await prefetchRouteQuery(queryClient, historyQuery(slug, { program, type: deps.type as MedChartedTypeId }));
  } else if (deps.tab === 'forecast') {
    // The same key the tab asks for (ALL reads REG, D12; a category the charts do not draw reads Interview).
    const type = (CHARTED.includes(deps.type as MedChartedTypeId) ? deps.type : 'INTERVIEW') as MedChartedTypeId;
    await prefetchRouteQuery(queryClient, forecastQuery(slug, { program: program === 'PHD' ? 'PHD' : 'REG', type }));
  } else if (deps.tab === 'secondaries') {
    await prefetchRouteQuery(queryClient, secondariesQuery(slug, { program }));
  } else if (deps.tab === 'facts') {
    // One query for both sections (the AAMC reports and Admit's curriculum), for an MD and a DO school alike.
    await prefetchRouteQuery(queryClient, schoolFactsQuery(slug));
  }
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

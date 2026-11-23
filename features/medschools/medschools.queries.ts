import { notFound } from '@tanstack/react-router';
import type { QueryClient } from '@tanstack/react-query';
import { HttpError } from '@/lib/http';
import { contractQuery, prefetchRouteQuery } from '@/lib/route/route-query';
import type { QueryOf } from '@/lib/contract/endpoint';
import {
  getMedListsApi,
  getMedLiveApi,
  getMedPrefsApi,
  getMedSchoolActivityApi,
  getMedSchoolApi,
  getMedSchoolHistoryApi,
  getMedTodayApi,
  getMedTrackerApi,
  listMedSchoolsApi,
  type MedChartedTypeId,
  type MedDegreeId,
  type MedProgramFilter,
} from './medschools.contract';
import type { LiveProgramFilter, ProgramFilter } from './engine/search';
import type { SchoolTab } from './engine/public-read';

/** Client-safe option factories for the public pages. No server functions here (queries-server-fn-ratchet). */

export type IndexQuery = QueryOf<typeof listMedSchoolsApi>;
export type LiveFilters = QueryOf<typeof getMedLiveApi>;

export const schoolsQuery = (q: IndexQuery) =>
  contractQuery(['medschools', 'schools', q], listMedSchoolsApi, { query: q }, { staleTime: 60_000 });

export const todayQuery = (program: MedProgramFilter, degree?: MedDegreeId) =>
  contractQuery(
    ['medschools', 'today', program, degree ?? null],
    getMedTodayApi,
    { query: { program, degree } },
    { staleTime: 60_000 },
  );

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

/** The tracker for one cycle year, or the newest the user has when `cycle` is omitted. Never cached by the server. */
export const trackerQuery = (cycle?: number) =>
  contractQuery(
    [...ME_KEY, 'tracker', cycle ?? null] as const,
    getMedTrackerApi,
    { query: cycle === undefined ? {} : { cycle } },
    { staleTime: 0 },
  );

/** The schools-list request for a parsed index search and its effective view. */
export function indexQuery(
  search: { q?: string | undefined; state?: string | undefined },
  view: { degree?: MedDegreeId | undefined; program: LiveProgramFilter },
): IndexQuery {
  return {
    ...(search.q ? { q: search.q } : {}),
    ...(view.degree ? { degree: view.degree } : {}),
    ...(search.state ? { state: search.state } : {}),
    program: view.program === 'NONE' ? 'ALL' : view.program,
  };
}

/** The live loader's search from the parsed URL and the effective view (`degree=ALL` is already resolved away). */
export function liveSearchOf(
  search: { type?: LiveFilters['type']; school?: string | undefined },
  view: { degree?: MedDegreeId | undefined; program: LiveProgramFilter },
): { type?: LiveFilters['type']; school?: string; degree?: MedDegreeId; program: LiveProgramFilter } {
  return {
    ...(search.type ? { type: search.type } : {}),
    ...(search.school ? { school: search.school } : {}),
    ...(view.degree ? { degree: view.degree } : {}),
    program: view.program,
  };
}

/** What the live feed asks the API for, given the page's search and the school list (O5). */
export function resolveLiveFilters(
  search: { type?: LiveFilters['type']; school?: string; degree?: MedDegreeId; program: LiveProgramFilter },
  schoolDegree: MedDegreeId | undefined,
): LiveFilters {
  // A degree that contradicts the one school the feed is filtered to is dropped.
  const degree = schoolDegree && search.degree !== schoolDegree ? undefined : search.degree;
  // A program belongs to a degree (MD-PhD): with no degree left, only "program not reported" can still filter.
  const program = degree || search.program === 'NONE' ? search.program : 'ALL';
  return { type: search.type, school: search.school, degree, program };
}

/** The degree of the school the live feed is filtered to, read from the (cached) school list. */
export function schoolDegreeOf(schools: { slug: string; degree: MedDegreeId }[] | undefined, slug: string | undefined) {
  return slug ? schools?.find((s) => s.slug === slug)?.degree : undefined;
}

/** Live route loader: the school list first (it decides the degree filter), then the first page of events. */
export async function prefetchLivePage(
  queryClient: QueryClient,
  search: { type?: LiveFilters['type']; school?: string; degree?: MedDegreeId; program: LiveProgramFilter },
): Promise<undefined> {
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
  deps: { tab: SchoolTab; program: ProgramFilter; type: string; cycle?: number | undefined },
): Promise<SchoolHead | null> {
  let detail;
  try {
    detail = await queryClient.fetchQuery(schoolQuery(slug));
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw notFound();
    return null;
  }
  if (deps.tab === 'activity') {
    await prefetchRouteQuery(queryClient, activityQuery(slug, { program: deps.program, cycle: deps.cycle }));
  } else if (deps.tab === 'history') {
    await prefetchRouteQuery(
      queryClient,
      historyQuery(slug, { program: deps.program, type: deps.type as MedChartedTypeId }),
    );
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

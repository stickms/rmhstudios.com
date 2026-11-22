import type { QueryClient } from '@tanstack/react-query';
import { contractQuery, prefetchRouteQuery } from '@/lib/route/route-query';
import type { QueryOf } from '@/lib/contract/endpoint';
import {
  getMedLiveApi,
  getMedSchoolActivityApi,
  getMedSchoolApi,
  getMedSchoolHistoryApi,
  getMedTodayApi,
  listMedSchoolsApi,
  type MedChartedTypeId,
  type MedDegreeId,
  type MedProgramFilter,
} from './medschools.contract';
import type { LiveProgramFilter } from './engine/search';

/** Client-safe option factories for the public pages. No server functions here (queries-server-fn-ratchet). */

export type IndexQuery = QueryOf<typeof listMedSchoolsApi>;
export type LiveFilters = QueryOf<typeof getMedLiveApi>;

export const schoolsQuery = (q: IndexQuery) =>
  contractQuery(['medschools', 'schools', q], listMedSchoolsApi, { query: q }, { staleTime: 60_000 });

export const todayQuery = (program: MedProgramFilter) =>
  contractQuery(['medschools', 'today', program], getMedTodayApi, { query: { program } }, { staleTime: 60_000 });

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

/** What the live feed asks the API for, given the page's search and the school list (O5). */
export function resolveLiveFilters(
  search: { type?: LiveFilters['type']; school?: string; degree?: MedDegreeId; program: LiveProgramFilter },
  schoolDegree: MedDegreeId | undefined,
): LiveFilters {
  // A degree that contradicts the one school the feed is filtered to is dropped.
  const degree = schoolDegree && search.degree !== schoolDegree ? undefined : search.degree;
  return { type: search.type, school: search.school, degree, program: search.program };
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

import { contractQuery } from '@/lib/route/route-query';
import type { QueryOf } from '@/lib/contract/endpoint';
import {
  getMedLiveApi,
  getMedSchoolActivityApi,
  getMedSchoolApi,
  getMedSchoolHistoryApi,
  getMedTodayApi,
  listMedSchoolsApi,
  type MedChartedTypeId,
  type MedProgramFilter,
} from './medschools.contract';

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

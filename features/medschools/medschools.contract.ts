/**
 * Contracts for the med schools admin endpoints. Client-safe: no zod, no server imports.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface AliasMissDto {
  id: string;
  source: string;
  sourceKey: string;
  seenCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
}

export interface SchoolOptionDto {
  id: string;
  name: string;
  shortName: string;
  state: string;
  degree: string;
}

export const listAliasMissesApi = endpoint<{
  res: {
    misses: AliasMissDto[];
    schools: SchoolOptionDto[];
  };
}>()({
  method: 'GET',
  path: '/api/admin/medschools/alias-misses',
});

export const mapAliasMissApi = endpoint<{
  body: {
    missId: string;
    schoolId: string;
  };
  res: {
    aliasId: string;
  };
}>()({
  method: 'POST',
  path: '/api/admin/medschools/alias-misses/map',
});

export const ignoreAliasMissApi = endpoint<{
  body: {
    missId: string;
  };
  res: {
    ok: true;
  };
}>()({
  method: 'POST',
  path: '/api/admin/medschools/alias-misses/ignore',
});

/**
 * Contracts for User Build releases (s04-04). Client-safe: types only, no zod at runtime.
 * Both endpoints accept a session or an rmhcode CLI token, so they bind with `auth: 'none'`
 * and check the build's owner themselves. `$id` is the build's id or its slug.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ReleaseView } from '@/lib/builds/releases';
import type { createReleaseBody } from '@/lib/builds/releases-schema';

/** The latest 20 releases, newest first. A private build answers 404 to anyone but its owner. */
export const listReleasesApi = endpoint<{
  res: { items: ReleaseView[] };
}>()({ method: 'GET', path: '/api/user-builds/$id/releases' });

/** 201. Owner only. A version the build already has is 409. */
export const createReleaseApi = endpoint<{
  body: z.infer<typeof createReleaseBody>;
  res: { release: ReleaseView };
}>()({ method: 'POST', path: '/api/user-builds/$id/releases' });

/** Owner only. Deleting does not notify, and re-publishing the version later does not notify again. */
export const deleteReleaseApi = endpoint<{
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/user-builds/$id/releases/$releaseId' });

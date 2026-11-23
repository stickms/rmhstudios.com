/** Shared HTTP pieces of the private `me/**` modules: rate-limit specs and the error mapping. */
import { refusalBody } from '@/lib/errors/codes';
import { AccountTooNewError, SHARE_MIN_ACCOUNT_AGE_DAYS, SharingUnavailableError } from './share-sync.server';

export const READ_LIMIT = { policy: 'read', scope: 'user', prefix: 'medschools-me-read' } as const;
export const TRACKER_WRITE_LIMIT = { policy: 'write', scope: 'user', prefix: 'mutation:medschools/tracker' } as const;
export const LISTS_WRITE_LIMIT = { policy: 'write', scope: 'user', prefix: 'mutation:medschools/lists' } as const;
export const ADD_TO_TRACKER_LIMIT = {
  limit: 10,
  windowMs: 60_000,
  prefix: 'medschools-add-to-tracker',
  scope: 'user',
} as const;
export const QA_LIMIT_WRITE_LIMIT = { policy: 'write', scope: 'user', prefix: 'mutation:medschools/qa-limit' } as const;
export const SHARE_LIMIT = { limit: 10, windowMs: 60_000, prefix: 'medschools-share', scope: 'user' } as const;

export const badInput = (): Response => Response.json({ error: 'Invalid input' }, { status: 400 });

export const notFound = (): Response => Response.json({ error: 'Not found' }, { status: 404 });

/**
 * Run a handler body that can reach the sharing writer. A missing secret is a 503 with a code the UI can explain (and an
 * error in the log, because sharing is silently off until someone sets it); a too-new account is a 409. Anything else
 * propagates to the wrapper's bare 500.
 */
export async function sharingGuard<T>(run: () => Promise<T>): Promise<T | Response> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof SharingUnavailableError) {
      console.error('[medschools] sharing unavailable: MEDSCHOOLS_DEDUPE_SECRET is unset or too short');
      return Response.json({ ...refusalBody('MEDSCHOOLS_SHARING_UNAVAILABLE') }, { status: 503 });
    }
    if (err instanceof AccountTooNewError) {
      return Response.json(
        { ...refusalBody('MEDSCHOOLS_ACCOUNT_TOO_NEW', { days: SHARE_MIN_ACCOUNT_AGE_DAYS }) },
        { status: 409 },
      );
    }
    throw err;
  }
}

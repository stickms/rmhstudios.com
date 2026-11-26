/**
 * Zod schemas and cursor encoding for the Slice It! developer API (`/api/v1/slice-it/*`, `/api/v1/me/slice-it/runs`;
 * scopes `read:slice-it` and `read:slice-it-runs`). Pure (no server imports) so the limits are testable on their own.
 */
import { z } from 'zod';

export const RUNS_PAGE_MAX = 50;
export const RUNS_PAGE_DEFAULT = 25;
const ID_MAX = 64;
const CURSOR_MAX = 100;

/** `/slice-it/charts/{id}`: a song id. */
export const chartPath = z.object({ id: z.string().min(1).max(ID_MAX) });

/** `/slice-it/players/{handle}`: a handle, never a member id. */
export const playerPath = z.object({ handle: z.string().min(1).max(ID_MAX) });

/** `/me/slice-it/runs?limit&cursor&songId`. */
export const runsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(RUNS_PAGE_MAX).default(RUNS_PAGE_DEFAULT),
  cursor: z.string().min(1).max(CURSOR_MAX).optional(),
  songId: z.string().min(1).max(ID_MAX).optional(),
});

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): string | null => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

/** A position in a member's runs: the `createdAt` instant in milliseconds and the run id (digits) that breaks ties. */
export interface RunCursor {
  ms: number;
  id: string;
}

export const encodeRunCursor = (c: RunCursor): string => b64(`${c.ms}|${c.id}`);

export function decodeRunCursor(raw: string): RunCursor | null {
  const s = unb64(raw);
  if (s === null) return null;
  const [a, id, ...rest] = s.split('|');
  if (rest.length > 0 || !a || !id) return null;
  if (!/^\d{1,16}$/.test(a) || !/^\d{1,18}$/.test(id)) return null;
  return { ms: Number(a), id };
}

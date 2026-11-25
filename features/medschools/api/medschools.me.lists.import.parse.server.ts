import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { parseMedListImportFileApi } from '@features/medschools/medschools.contract';
import { parseListImport, toListRefusal } from './import/list-parse.server';
import { IMPORT_PARSE_LIMIT, NO_STORE, readImportRequest } from './import/request.server';

/**
 * `POST /api/medschools/me/lists/import/parse` (owner 2026-11-24): a member's file (multipart `file`) or pasted text
 * (JSON `{ text }`) read into a PREVIEW of school names for a list. Signed in, never cached, nothing written. The
 * tracker import's ceilings in the same order (`readImportRequest`, then the Q&A's gates in `readUnderGates`), and the
 * same rate bucket, so the two imports share 6 a minute and one daily question each.
 */
export const route = apiRoute('/api/medschools/me/lists/import/parse', {
  POST: implement(
    parseMedListImportFileApi,
    { rateLimit: IMPORT_PARSE_LIMIT, rateLimitExemptAdmin: true },
    async ({ userId, isAdmin, request }) => {
      // The shared reader's size and type refusals, in the list import's own words.
      const input = await readImportRequest(userId, request).catch((err: unknown) => {
        throw toListRefusal(err);
      });
      if (input instanceof Response) return input;
      const preview = await parseListImport({ userId, isAdmin, input, signal: request.signal });
      return Response.json(preview, { headers: NO_STORE });
    },
  ),
});

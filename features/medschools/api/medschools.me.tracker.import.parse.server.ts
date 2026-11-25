import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { parseMedImportFileApi } from '@features/medschools/medschools.contract';
import { parseImport } from './import/parse.server';
import { IMPORT_PARSE_LIMIT, NO_STORE, readImportRequest } from './import/request.server';

/**
 * `POST /api/medschools/me/tracker/import/parse`: a member's file (multipart `file`) or pasted text (JSON `{ text }`)
 * read into a PREVIEW of tracker dates. Signed in, never cached, and nothing is written: no tracker row, no file, no
 * text, no name. Same ceilings as the Q&A, in the Q&A's order, before any model call: the `ai` rate class (6 a minute,
 * an admin exempt), the suspension check and `isAiConfigured` and the capped body (`readImportRequest`), then the shared
 * monthly pause, the member's own allowance, one of the day's questions and the in-flight lease (`parseImport`).
 */
export const route = apiRoute('/api/medschools/me/tracker/import/parse', {
  POST: implement(
    parseMedImportFileApi,
    { rateLimit: IMPORT_PARSE_LIMIT, rateLimitExemptAdmin: true },
    async ({ userId, isAdmin, request }) => {
      const input = await readImportRequest(userId, request);
      if (input instanceof Response) return input;
      const preview = await parseImport({ userId, isAdmin, input, signal: request.signal });
      return Response.json(preview, { headers: NO_STORE });
    },
  ),
});

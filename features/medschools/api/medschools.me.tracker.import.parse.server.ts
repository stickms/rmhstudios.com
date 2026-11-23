import { isAiConfigured } from '@/lib/ai/provider.server';
import { implement } from '@/lib/api/implement.server';
import { apiRoute } from '@/lib/api/route.server';
import { AppError, refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { parseMedImportFileApi } from '@features/medschools/medschools.contract';
import { IMPORT_LIMITS } from '../engine/import';
import { importTextBody } from './import-schemas';
import { parseImport, type ImportInput } from './import/parse.server';

/**
 * `POST /api/medschools/me/tracker/import/parse`: a member's file (multipart `file`) or pasted text (JSON `{ text }`)
 * read into a PREVIEW of tracker dates. Signed in, never cached, and nothing is written: no tracker row, no file, no
 * text, no name. Same ceilings as the Q&A, in the Q&A's order, before any model call: the `ai` rate class (6 a minute,
 * an admin exempt), `isAiConfigured`, the shared monthly pause, the member's own allowance, then one of the day's
 * questions and the in-flight lease (`parseImport`). The body's size is checked before it is buffered.
 */
const IMPORT_PARSE_LIMIT = {
  policy: 'ai',
  limit: 6,
  windowMs: 60_000,
  prefix: 'medschools-import',
  scope: 'user',
} as const;

/** Multipart framing around a 2 MB file. */
const FORM_SLACK_BYTES = 256 * 1024;
const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const badInput = (): Response => Response.json({ error: 'Invalid input' }, { status: 400 });

export const route = apiRoute('/api/medschools/me/tracker/import/parse', {
  POST: implement(
    parseMedImportFileApi,
    { rateLimit: IMPORT_PARSE_LIMIT, rateLimitExemptAdmin: true },
    async ({ userId, isAdmin, request }) => {
      // A suspended account is refused, as it is for the Q&A.
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
      if (user?.bannedUntil && user.bannedUntil > new Date()) {
        return Response.json({ error: 'suspended' }, { status: 403 });
      }
      // No key, no spend: refuse before the body is read or any ledger is.
      if (!isAiConfigured()) return Response.json({ ...refusalBody('AI_UNAVAILABLE') }, { status: 503 });

      const type = (request.headers.get('content-type') ?? '').toLowerCase();
      const declared = Number(request.headers.get('content-length') ?? 0);
      const json = type.startsWith('application/json');
      const ceiling = json ? IMPORT_LIMITS.pasteChars * 4 + 1024 : IMPORT_LIMITS.fileBytes + FORM_SLACK_BYTES;
      // Before `formData()` or `json()` buffers the whole body.
      if (Number.isFinite(declared) && declared > ceiling) throw new AppError('MEDSCHOOLS_IMPORT_TOO_LARGE');

      let input: ImportInput;
      if (json) {
        const parsed = importTextBody.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badInput();
        input = { kind: 'paste', text: parsed.data.text };
      } else if (type.startsWith('multipart/form-data')) {
        const form = await request.formData().catch(() => null);
        const file = form?.get('file');
        if (!(file instanceof File)) return badInput();
        if (file.size > IMPORT_LIMITS.fileBytes) throw new AppError('MEDSCHOOLS_IMPORT_TOO_LARGE');
        input = { kind: 'file', buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type, filename: file.name };
      } else {
        throw new AppError('MEDSCHOOLS_IMPORT_UNSUPPORTED');
      }
      const preview = await parseImport({ userId, isAdmin, input, signal: request.signal });
      return Response.json(preview, { headers: NO_STORE });
    },
  ),
});

/**
 * The imports' request reading, shared by `me/tracker/import/parse` and `me/lists/import/parse`: the same ceilings, the
 * same order, before any model call. A suspended account is refused (as for the Q&A); no AI key means no spend, refused
 * before the body is read or any ledger is; the body is read as a stream with a byte cap (so a chunked request is
 * bounded too), then parsed as pasted text (JSON `{ text }`) or a multipart `file`. Nothing here is kept: the bytes go
 * to the caller in memory, the file's name only to the extension check.
 */
import { isAiConfigured } from '@/lib/ai/provider.server';
import { AppError, refusalBody } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { IMPORT_LIMITS } from '../../engine/import';
import { importTextBody } from '../import-schemas';
import { formFromBytes, readBodyCapped } from './body.server';
import type { ImportInput } from './parse.server';

/** The `ai` rate class both imports share: 6 a minute between them, an admin exempt. */
export const IMPORT_PARSE_LIMIT = {
  policy: 'ai',
  limit: 6,
  windowMs: 60_000,
  prefix: 'medschools-import',
  scope: 'user',
} as const;

/** Multipart framing around a 2 MB file. */
const FORM_SLACK_BYTES = 256 * 1024;
export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const badInput = (): Response => Response.json({ error: 'Invalid input' }, { status: 400 });

/** The member's text or file, or the refusal to send back. */
export async function readImportRequest(userId: string, request: Request): Promise<ImportInput | Response> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
  if (user?.bannedUntil && user.bannedUntil > new Date()) {
    return Response.json({ error: 'suspended' }, { status: 403 });
  }
  if (!isAiConfigured()) return Response.json({ ...refusalBody('AI_UNAVAILABLE') }, { status: 503 });

  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  const json = type.startsWith('application/json');
  const multipart = type.startsWith('multipart/form-data');
  if (!json && !multipart) throw new AppError('MEDSCHOOLS_IMPORT_UNSUPPORTED');
  const ceiling = json ? IMPORT_LIMITS.pasteChars * 4 + 1024 : IMPORT_LIMITS.fileBytes + FORM_SLACK_BYTES;
  // The stream is counted as it arrives and cut at the ceiling: a chunked request has no Content-Length, and
  // `formData()` / `json()` would buffer all of it first.
  const bytes = await readBodyCapped(request, ceiling);

  if (json) {
    let value: unknown;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      value = null;
    }
    const parsed = importTextBody.safeParse(value);
    if (!parsed.success) return badInput();
    return { kind: 'paste', text: parsed.data.text };
  }
  const form = await formFromBytes(bytes, request.headers.get('content-type') ?? '');
  const file = form?.get('file');
  if (!(file instanceof File)) return badInput();
  if (file.size > IMPORT_LIMITS.fileBytes) throw new AppError('MEDSCHOOLS_IMPORT_TOO_LARGE');
  return { kind: 'file', buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type, filename: file.name };
}

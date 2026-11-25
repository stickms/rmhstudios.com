/**
 * The list import's read (owner 2026-11-24): the tracker import's reader, gates and lease (`readUnderGates`), with the
 * list prompt and `validateListImport`. A file or pasted text in, a preview of school names out, nothing kept: the same
 * rules as `parse.server.ts` (no bytes, text or name stored, cached or logged; the only trace is the text-free
 * `AiUsage` row; an unreadable reply refunds the day's question).
 */
import { MEDSCHOOLS_LIST_IMPORT } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import type { MedListImportPreviewRes } from '../../medschools.contract';
import { importDirectory } from './directory.server';
import { importSummary, readUnderGates, type ParseImportArgs } from './parse.server';
import { aiListImportRunner, type ImportRunner } from './runner.server';
import { UnreadableReplyError } from './unreadable';
import { validateListImport } from './list-validate';

/** A school's name has letters in it: a text of only digits and punctuation names none, and nothing is spent. */
const hasWords = (text: string): boolean => /\p{L}{2}/u.test(text);

/**
 * The shared reader refuses in the tracker import's words (its too-large sentence asks for "the sheet with your
 * dates"). A list import says its own: the same failures, re-coded with fixed list sentences. An unreadable reply (the
 * question already refunded) is the list's own "could not be read"; a provider failure stays `AI_UNAVAILABLE`.
 */
export function toListRefusal(err: unknown): unknown {
  if (err instanceof UnreadableReplyError) return new AppError('MEDSCHOOLS_LIST_IMPORT_UNREADABLE');
  if (err instanceof AppError) {
    if (err.code === 'MEDSCHOOLS_IMPORT_TOO_LARGE') return new AppError('MEDSCHOOLS_LIST_IMPORT_TOO_LARGE');
    if (err.code === 'MEDSCHOOLS_IMPORT_UNSUPPORTED') return new AppError('MEDSCHOOLS_LIST_IMPORT_UNSUPPORTED');
  }
  return err;
}

export async function parseListImport(
  i: ParseImportArgs,
  deps: { runner?: ImportRunner; now?: Date } = {},
): Promise<MedListImportPreviewRes> {
  try {
    return await readList(i, deps);
  } catch (err) {
    throw toListRefusal(err);
  }
}

function readList(i: ParseImportArgs, deps: { runner?: ImportRunner; now?: Date }): Promise<MedListImportPreviewRes> {
  return readUnderGates(i, {
    spec: MEDSCHOOLS_LIST_IMPORT,
    runner: deps.runner ?? aiListImportRunner,
    now: deps.now ?? new Date(),
    worthReading: hasWords,
    emptyCode: 'MEDSCHOOLS_LIST_IMPORT_EMPTY',
    finish: async (raw, { text, truncated, gate }) => {
      let directory = await importDirectory();
      let valid = validateListImport(raw, { text, dir: directory.dir, aliases: directory.aliases });
      // A name that matched nothing may be a school the cached directory has not seen yet: read it fresh, once.
      if (valid.rows.some((r) => !r.school)) {
        directory = await importDirectory({ fresh: true });
        valid = validateListImport(raw, { text, dir: directory.dir, aliases: directory.aliases });
      }
      importSummary(valid.rows.length ? 'list-ok' : 'list-empty', {
        rows: valid.rows.length,
        matched: valid.rows.filter((r) => r.school).length,
        dropped: valid.dropped,
      });
      if (valid.rows.length === 0) throw new AppError('MEDSCHOOLS_LIST_IMPORT_EMPTY');
      return {
        truncated: truncated || valid.capped,
        dropped: valid.dropped,
        rows: valid.rows.map((r) => ({
          key: r.key,
          schoolName: r.schoolName,
          school: r.school
            ? {
                slug: r.school.slug,
                name: r.school.name,
                shortName: r.school.shortName,
                degree: r.school.degree,
                state: r.school.state,
              }
            : null,
          program: r.program,
        })),
        ...gate,
      };
    },
  });
}

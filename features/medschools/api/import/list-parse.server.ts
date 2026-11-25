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
import { validateListImport } from './list-validate';

/** A school's name has letters in it: a text of only digits and punctuation names none, and nothing is spent. */
const hasWords = (text: string): boolean => /\p{L}{2}/u.test(text);

export async function parseListImport(
  i: ParseImportArgs,
  deps: { runner?: ImportRunner; now?: Date } = {},
): Promise<MedListImportPreviewRes> {
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

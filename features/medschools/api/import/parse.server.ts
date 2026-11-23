/**
 * The tracker import's read (owner 2026-11-23): a file or pasted text in, a preview out, nothing kept.
 *
 * Order, cheapest first, so a refused file never spends a question: the type, size and magic bytes and the text
 * extraction (`extract.server.ts`; a file with no digits cannot hold a date and ends here as "nothing found"), then every
 * gate the Q&A has, in the Q&A's order and from the Q&A's code (`admitQuestion`: the shared monthly pause, the member's
 * own allowance, then the atomic reservation of one of the day's questions and the in-flight lease), then the ONE model
 * call, then the server's validation of what came back (`validate.ts`). An import is one question against the daily cap
 * and spends from the Q&A share of the monthly budget (`IMPORT_TASK` is summed with Q&A's); an admin skips the cap and
 * the lease exactly as in Q&A.
 *
 * What is kept: nothing. The file's bytes, its text, its name, the prompt and the model's output live in this call's
 * memory. The only trace is the `AiUsage` row the provider writes (user, task, prompt id, tokens, cost, time) and the two
 * zero-token reservation rows, none of which holds text. The log line carries counts and a status, never text.
 */
import { MEDSCHOOLS_IMPORT, asData, systemFor } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import { QA_DEADLINE_MS } from '../../ai-budget';
import type { MedImportPreviewRes } from '../../medschools.contract';
import { admitQuestion } from '../qa/budget.server';
import { assertLive, runUnderLease } from '../qa/lease.server';
import { importDirectory } from './directory.server';
import { extractFile, extractPasted, promptText, type Extracted } from './extract.server';
import { aiImportRunner, type ImportRunner } from './runner.server';
import { validateImport } from './validate';

export type ImportInput =
  | { kind: 'file'; buffer: Buffer; mimeType: string; filename: string }
  | { kind: 'paste'; text: string };

export interface ParseImportArgs {
  userId: string;
  isAdmin?: boolean | undefined;
  input: ImportInput;
  /** The request's signal: a member who leaves ends the work. */
  signal?: AbortSignal | undefined;
}

const summary = (status: string, extra: Record<string, number> = {}) =>
  console.warn('[medschools-import]', JSON.stringify({ status, ...extra }));

export async function parseImport(
  i: ParseImportArgs,
  deps: { runner?: ImportRunner; now?: Date } = {},
): Promise<MedImportPreviewRes> {
  const now = deps.now ?? new Date();
  const extracted: Extracted =
    i.input.kind === 'file' ? await extractFile({ ...i.input, signal: i.signal }) : extractPasted(i.input.text);
  const prepared = promptText(extracted.text);
  // A date has a digit in it: nothing to read, nothing spent.
  if (!/\d/.test(prepared.text)) {
    summary('empty');
    throw new AppError('MEDSCHOOLS_IMPORT_EMPTY');
  }
  const truncated = extracted.truncated || prepared.truncated;

  const gate = await admitQuestion(i.userId, now, { isAdmin: i.isAdmin === true });
  const runner = deps.runner ?? aiImportRunner;
  return runUnderLease(gate, QA_DEADLINE_MS, i.signal, async (signal) => {
    const raw = await runner.run(
      systemFor(MEDSCHOOLS_IMPORT),
      asData(JSON.stringify({ text: prepared.text })),
      i.userId,
      signal,
    );
    assertLive(signal);
    const { dir, aliases } = await importDirectory();
    const valid = validateImport(raw, { text: prepared.text, dir, aliases, now });
    summary(valid.rows.length ? 'ok' : 'empty', {
      rows: valid.rows.length,
      matched: valid.rows.filter((r) => r.school).length,
      dropped: valid.dropped,
    });
    if (valid.rows.length === 0) throw new AppError('MEDSCHOOLS_IMPORT_EMPTY');
    return {
      cycleYear: valid.cycleYear,
      cycleFrom: valid.cycleFrom,
      truncated,
      dropped: valid.dropped,
      rows: valid.rows.map((r) => ({
        key: r.key,
        schoolName: r.schoolName,
        school: r.school
          ? { slug: r.school.slug, name: r.school.name, shortName: r.school.shortName, degree: r.school.degree, state: r.school.state }
          : null,
        program: r.program,
        milestones: r.milestones,
      })),
      tier: gate.tier,
      remainingToday: gate.remainingToday,
      dailyCap: gate.dailyCap,
    };
  });
}

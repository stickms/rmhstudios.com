/**
 * The imports' read (tracker owner 2026-11-23, lists owner 2026-11-24): a file or pasted text in, a preview out, nothing
 * kept.
 *
 * Order, cheapest first, so a refused file never spends a question: the type, size and magic bytes and the text
 * extraction (`extract.server.ts`; a text that cannot hold what is asked for, e.g. no digit for a date, ends here as
 * "nothing found"), then every gate the Q&A has, in the Q&A's order and from the Q&A's code (`admitQuestion`: the shared
 * monthly pause, the member's own allowance, then the atomic reservation of one of the day's questions and the in-flight
 * lease), then the ONE model call, then the server's validation of what came back (`validate.ts`, `list-validate.ts`).
 * An import is one question against the daily cap and spends from the Q&A share of the monthly budget (`IMPORT_TASK` is
 * summed with Q&A's); an admin skips the cap and the lease exactly as in Q&A. `readUnderGates` is that order, once; the
 * tracker import (`parseImport`, below) and the list import (`list-parse.server.ts`) differ only in the prompt, the
 * "anything to read" test and the validator.
 *
 * What is kept: nothing. The file's bytes, its text, its name, the prompt and the model's output live in this call's
 * memory. The only trace is the `AiUsage` row the provider writes (user, task, prompt id, tokens, cost, time) and the two
 * zero-token reservation rows, none of which holds text. A reply the server cannot read as JSON refunds the question
 * and ends in a fixed-message `AI_UNAVAILABLE` (`runner.server.ts`); the member's text never reaches an error. The log line carries counts and a status, never text.
 */
import { MEDSCHOOLS_IMPORT, asData, systemFor, type PromptSpec } from '@/lib/ai/prompts';
import { AppError, type ErrorCode } from '@/lib/errors/codes';
import { QA_DEADLINE_MS } from '../../ai-budget';
import type { MedImportPreviewRes } from '../../medschools.contract';
import { admitQuestion } from '../qa/budget.server';
import { assertLive, runUnderLease } from '../qa/lease.server';
import { importDirectory } from './directory.server';
import { extractFile, extractPasted, promptText, type Extracted } from './extract.server';
import { aiImportRunner, type ImportRunner } from './runner.server';
import { UnreadableReplyError } from './unreadable';
import { validateImport } from './validate';

export type ImportInput =
  { kind: 'file'; buffer: Buffer; mimeType: string; filename: string } | { kind: 'paste'; text: string };

export interface ParseImportArgs {
  userId: string;
  isAdmin?: boolean | undefined;
  input: ImportInput;
  /** The request's signal: a member who leaves ends the work. */
  signal?: AbortSignal | undefined;
}

/** The gate's figures a preview reports back. */
export interface GateFigures {
  tier: MedImportPreviewRes['tier'];
  remainingToday: number | null;
  dailyCap: number | null;
}

export const importSummary = (status: string, extra: Record<string, number> = {}) =>
  console.warn('[medschools-import]', JSON.stringify({ status, ...extra }));

/**
 * Extract, check there is something to read, pass the Q&A's gates, make the one model call under the lease, and hand
 * the reply and the cleaned text to `finish` (still under the lease). A reply that is not JSON refunds the question.
 */
export async function readUnderGates<T>(
  i: ParseImportArgs,
  o: {
    spec: PromptSpec;
    runner: ImportRunner;
    now: Date;
    /** Whether the cleaned text could hold anything worth a question; false ends here, unspent. */
    worthReading: (text: string) => boolean;
    emptyCode: ErrorCode;
    finish: (raw: unknown, ctx: { text: string; truncated: boolean; gate: GateFigures }) => Promise<T>;
  },
): Promise<T> {
  const extracted: Extracted =
    i.input.kind === 'file' ? await extractFile({ ...i.input, signal: i.signal }) : extractPasted(i.input.text);
  const prepared = promptText(extracted.text);
  if (!o.worthReading(prepared.text)) {
    importSummary('empty');
    throw new AppError(o.emptyCode);
  }
  const truncated = extracted.truncated || prepared.truncated;

  const gate = await admitQuestion(i.userId, o.now, { isAdmin: i.isAdmin === true });
  return runUnderLease(gate, QA_DEADLINE_MS, i.signal, async (signal) => {
    let raw: unknown;
    try {
      raw = await o.runner.run(systemFor(o.spec), asData(JSON.stringify({ text: prepared.text })), i.userId, signal);
    } catch (err) {
      // The model answered and the answer cannot be read (cut off at the token limit, or prose): not the member's doing,
      // so the day's question goes back. Any other failure (provider down, deadline) keeps it: the call was made.
      if (err instanceof UnreadableReplyError) {
        await gate.refund();
        importSummary('unreadable');
      }
      throw err;
    }
    assertLive(signal);
    return o.finish(raw, {
      text: prepared.text,
      truncated,
      gate: { tier: gate.tier, remainingToday: gate.remainingToday, dailyCap: gate.dailyCap },
    });
  });
}

export async function parseImport(
  i: ParseImportArgs,
  deps: { runner?: ImportRunner; now?: Date } = {},
): Promise<MedImportPreviewRes> {
  const now = deps.now ?? new Date();
  return readUnderGates(i, {
    spec: MEDSCHOOLS_IMPORT,
    runner: deps.runner ?? aiImportRunner,
    now,
    // A date has a digit in it: nothing to read, nothing spent.
    worthReading: (text) => /\d/.test(text),
    emptyCode: 'MEDSCHOOLS_IMPORT_EMPTY',
    finish: async (raw, { text, truncated, gate }) => {
      let directory = await importDirectory();
      let valid = validateImport(raw, { text, dir: directory.dir, aliases: directory.aliases, now });
      // A name that matched nothing may be a school the cached directory has not seen yet: read it fresh, once.
      if (valid.rows.some((r) => !r.school)) {
        directory = await importDirectory({ fresh: true });
        valid = validateImport(raw, { text, dir: directory.dir, aliases: directory.aliases, now });
      }
      importSummary(valid.rows.length ? 'ok' : 'empty', {
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
            ? {
                slug: r.school.slug,
                name: r.school.name,
                shortName: r.school.shortName,
                degree: r.school.degree,
                state: r.school.state,
              }
            : null,
          program: r.program,
          milestones: r.milestones,
        })),
        ...gate,
      };
    },
  });
}

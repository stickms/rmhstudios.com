/**
 * The Q&A orchestrator (plan R2, R4, R7, R8, R12, R17, R18): gates, route the question, resolve schools, retrieve facts through the
 * public readers, ask the model to write from them, and show only what the grounding validator keeps.
 *
 * Nothing about the question or the answer is stored, cached or logged: they live in memory for this call. The one
 * trace is the `AiUsage` row the provider writes (user, task, prompt id, token counts, cost). Logs carry the intent and
 * counts, never text. The model never sees a tracker row: `mine` comes from the caller's own `getChances` and is
 * returned beside the answer.
 */
import { MEDSCHOOLS_QA_ANSWER, MEDSCHOOLS_QA_ROUTE, asData, systemFor } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import type { ChanceDto, MedAskCitationDto, MedAskRes } from '../../medschools.contract';
import { QA_DEADLINE_MS } from '../../ai-budget';
import { groundAnswer, type SchoolNames } from '../../engine/qa/ground';
import { cleanForPrompt } from '../../engine/qa/sanitize';
import { filterSchools, parseRoute, resolveSchools } from '../../engine/qa/route';
import { getChances } from '../chances.server';
import { admitQuestion } from './budget.server';
import { schoolDirectory } from './freshness.server';
import { retrieve } from './retrieve.server';
import { aiRunner, type QaRunner } from './runner.server';

export interface AskInput {
  userId: string;
  question: string;
  slug?: string | undefined;
  /** The HTTP request's signal: a member who leaves ends the work. */
  signal?: AbortSignal | undefined;
}

const MAX_QUESTION = 400;
type Base = Pick<MedAskRes, 'remainingToday' | 'dailyCap'>;

const empty = (b: Base, over: Partial<MedAskRes>): MedAskRes => ({
  status: 'no-data',
  segments: [],
  citations: [],
  notice: null,
  decline: null,
  schools: [],
  cycleYear: null,
  mine: null,
  ...b,
  ...over,
});

/**
 * The caller's own invite estimates for the resolved schools. Soft: a failure here must not lose the answer, and must not
 * read as "no application" (`[]`), so it is `null` with `failed` set and the response says so.
 */
async function mineFor(
  userId: string,
  slugs: readonly string[],
): Promise<{ mine: ChanceDto[] | null; failed: boolean }> {
  try {
    const per = await Promise.all(slugs.map((school) => getChances(userId, { school })));
    return { mine: per.flatMap((r) => r.chances), failed: false };
  } catch {
    console.error('[medschools-qa] own estimate unavailable');
    return { mine: null, failed: true };
  }
}

class Deadline extends Error {}

export async function answerQuestion(i: AskInput, deps: { runner?: QaRunner; now?: Date } = {}): Promise<MedAskRes> {
  const now = deps.now ?? new Date();
  // Gates and the atomic reservation (daily count and one-in-flight lease, across processes) before any model call.
  const gate = await admitQuestion(i.userId, now);
  // One deadline for the whole question, under the client's own timeout, plus the request's own signal.
  const deadline = AbortSignal.timeout(QA_DEADLINE_MS);
  const signal = i.signal ? AbortSignal.any([i.signal, deadline]) : deadline;
  const work = run(i, deps.runner ?? aiRunner, now, gate, signal);
  // The lease ends when the work really ends, not when the caller stopped waiting.
  const done = work
    .then(
      () => undefined,
      () => undefined,
    )
    .then(() => gate.release());
  let onAbort!: () => void;
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(new Deadline());
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => undefined);
  try {
    return await Promise.race([work, aborted]);
  } catch (e) {
    if (e instanceof Deadline) throw new AppError('AI_UNAVAILABLE');
    throw e;
  } finally {
    signal.removeEventListener('abort', onAbort);
    // When the work ended on its own, the lease is gone before the member can send the next question; when the caller
    // stopped waiting first, it is released as soon as the work really stops.
    if (!signal.aborted) await done;
  }
}

async function run(
  i: AskInput,
  runner: QaRunner,
  now: Date,
  gate: { remainingToday: number; dailyCap: number },
  signal: AbortSignal,
): Promise<MedAskRes> {
  // The reservation already counts this question.
  const base: Base = { remainingToday: gate.remainingToday, dailyCap: gate.dailyCap };
  const live = () => {
    if (signal.aborted) throw new Deadline();
  };
  const question = cleanForPrompt(i.question, MAX_QUESTION);
  const dir = await schoolDirectory();
  const pinned = i.slug ? dir.find((s) => s.slug === i.slug) : undefined;

  const routeSystem = systemFor(MEDSCHOOLS_QA_ROUTE);
  const route = parseRoute(
    await runner.route(
      routeSystem,
      asData(JSON.stringify({ question, ...(pinned ? { pinnedSchool: pinned.shortName } : {}) })),
      i.userId,
      signal,
    ),
  );
  live();
  const summary = (status: string, extra: Record<string, number> = {}) =>
    console.warn('[medschools-qa]', JSON.stringify({ intent: route.intent, status, ...extra }));

  if (route.intent === 'other') {
    summary('declined');
    return empty(base, { status: 'declined', decline: 'out-of-scope' });
  }

  // Names the question gives win; the school page's pinned school stands in when it names none, and leads a comparison.
  const named = resolveSchools(route.schools, dir);
  // A name the router wrote that is no active school (or fits two) ends the question: never answer about the pinned
  // school instead, and a comparison with a name it cannot resolve is not a comparison of what was asked.
  if (named.unresolved.length > 0) {
    summary('no-school');
    return empty(base, { status: 'no-school', decline: 'name-a-school' });
  }
  let slugs =
    named.slugs.length > 0 && route.intent !== 'compare'
      ? named.slugs
      : resolveSchools(route.schools, dir, i.slug).slugs;
  if (slugs.length === 0) slugs = filterSchools(route.filters, dir, 5);
  if (slugs.length === 0) {
    summary('no-school');
    return empty(base, { status: 'no-school', decline: 'name-a-school' });
  }

  const retrieval = await retrieve(route, slugs, now);
  live();
  if (retrieval.schools.length === 0) {
    summary('no-school');
    return empty(base, { status: 'no-school', decline: 'name-a-school' });
  }
  const personal = route.intent === 'my-chance';
  const own = personal
    ? await mineFor(
        i.userId,
        retrieval.schools.map((s) => s.slug),
      )
    : { mine: null, failed: false };
  const mine = own.mine;
  // The member's own estimate missing is named first: it is the part they asked for.
  const mineNotice = own.failed ? ('mine-unavailable' as const) : null;
  const shared = { schools: retrieval.schools, cycleYear: retrieval.cycleYear, mine };

  if (retrieval.thin) {
    summary('thin', { schools: retrieval.schools.length });
    return empty(base, { ...shared, status: 'no-data', notice: mineNotice ?? 'thin' });
  }
  live();

  const answerSystem = systemFor(MEDSCHOOLS_QA_ANSWER);
  const raw = await runner.answer(
    answerSystem,
    asData(
      JSON.stringify({
        question,
        intent: route.intent,
        personal,
        facts: retrieval.facts.map(({ ref, label, text, untrusted }) => ({ ref, label, text, untrusted })),
      }),
    ),
    i.userId,
    signal,
  );
  live();
  const schoolNames: SchoolNames = new Map(
    retrieval.schools.map((s) => {
      const d = dir.find((x) => x.slug === s.slug);
      return [s.slug, [...new Set([s.shortName, d?.name ?? s.shortName])]] as const;
    }),
  );
  const grounded = groundAnswer(raw, retrieval.facts, { secrets: [answerSystem, routeSystem], schoolNames });
  const modelSaidThin = typeof raw === 'object' && raw !== null && (raw as { thin?: unknown }).thin === true;

  const citations: MedAskCitationDto[] = grounded.citedRefs.flatMap((ref) => {
    const f = retrieval.facts.find((x) => x.ref === ref);
    return f
      ? [
          {
            ref: f.ref,
            label: f.label,
            sourceName: f.sourceName,
            schoolSlug: f.schoolSlug,
            updatedAt: f.updatedAt,
            href: f.href,
            sourceHref: f.sourceHref,
          },
        ]
      : [];
  });
  summary(grounded.segments.length ? (grounded.dropped ? 'partial' : 'answered') : 'no-data', {
    schools: retrieval.schools.length,
    facts: retrieval.facts.length,
    kept: grounded.segments.length,
    dropped: grounded.dropped,
  });

  if (grounded.segments.length === 0) {
    return empty(base, {
      ...shared,
      status: 'no-data',
      ...(grounded.dropped > 0
        ? { decline: 'ungrounded' as const, notice: mineNotice }
        : { notice: mineNotice ?? ('thin' as const) }),
    });
  }
  return {
    ...base,
    ...shared,
    status: grounded.dropped > 0 ? 'partial' : 'answered',
    segments: grounded.segments,
    citations,
    notice: mineNotice ?? (grounded.dropped > 0 ? 'removed-ungrounded' : modelSaidThin ? 'thin' : null),
    decline: null,
  };
}

/**
 * The Q&A orchestrator (plan R2, R4, R7, R8, R12): gates, route the question, resolve schools, retrieve facts through the
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
import { groundAnswer } from '../../engine/qa/ground';
import { cleanForPrompt } from '../../engine/qa/sanitize';
import { filterSchools, parseRoute, resolveSchools } from '../../engine/qa/route';
import { getChances } from '../chances.server';
import { assertQaAllowed } from './budget.server';
import { schoolDirectory } from './freshness.server';
import { retrieve } from './retrieve.server';
import { aiRunner, type QaRunner } from './runner.server';

export interface AskInput {
  userId: string;
  question: string;
  slug?: string | undefined;
}

const MAX_QUESTION = 400;
/** Members with a question in flight. Module state: the rate limit is the cross-process bound. */
const inFlight = new Set<string>();

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

/** The caller's own invite estimates for the resolved schools. Soft: a failure here must not lose the answer. */
async function mineFor(userId: string, slugs: readonly string[]): Promise<ChanceDto[]> {
  try {
    const per = await Promise.all(slugs.map((school) => getChances(userId, { school })));
    return per.flatMap((r) => r.chances);
  } catch {
    console.error('[medschools-qa] own estimate unavailable');
    return [];
  }
}

export async function answerQuestion(i: AskInput, deps: { runner?: QaRunner; now?: Date } = {}): Promise<MedAskRes> {
  // Checked and set before the first await, so two requests cannot both pass.
  if (inFlight.has(i.userId)) throw new AppError('RATE_LIMITED');
  inFlight.add(i.userId);
  try {
    return await run(i, deps.runner ?? aiRunner, deps.now ?? new Date());
  } finally {
    inFlight.delete(i.userId);
  }
}

async function run(i: AskInput, runner: QaRunner, now: Date): Promise<MedAskRes> {
  const gate = await assertQaAllowed(i.userId, now);
  // This question's route call will be the day's next counted row.
  const base: Base = { remainingToday: Math.max(0, gate.remainingToday - 1), dailyCap: gate.dailyCap };
  const question = cleanForPrompt(i.question, MAX_QUESTION);
  const dir = await schoolDirectory();
  const pinned = i.slug ? dir.find((s) => s.slug === i.slug) : undefined;

  const routeSystem = systemFor(MEDSCHOOLS_QA_ROUTE);
  const route = parseRoute(
    await runner.route(
      routeSystem,
      asData(JSON.stringify({ question, ...(pinned ? { pinnedSchool: pinned.shortName } : {}) })),
      i.userId,
    ),
  );
  const summary = (status: string, extra: Record<string, number> = {}) =>
    console.warn('[medschools-qa]', JSON.stringify({ intent: route.intent, status, ...extra }));

  if (route.intent === 'other') {
    summary('declined');
    return empty(base, { status: 'declined', decline: 'out-of-scope' });
  }

  // Names the question gives win; the school page's pinned school stands in when it names none, and leads a comparison.
  const named = resolveSchools(route.schools, dir);
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
  if (retrieval.schools.length === 0) {
    summary('no-school');
    return empty(base, { status: 'no-school', decline: 'name-a-school' });
  }
  const personal = route.intent === 'my-chance';
  const mine = personal
    ? await mineFor(
        i.userId,
        retrieval.schools.map((s) => s.slug),
      )
    : null;
  const shared = { schools: retrieval.schools, cycleYear: retrieval.cycleYear, mine };

  if (retrieval.thin) {
    summary('thin', { schools: retrieval.schools.length });
    return empty(base, { ...shared, status: 'no-data', notice: 'thin' });
  }

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
  );
  const grounded = groundAnswer(raw, retrieval.facts, { secrets: [answerSystem, routeSystem] });
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
      ...(grounded.dropped > 0 ? { decline: 'ungrounded' as const } : { notice: 'thin' as const }),
    });
  }
  return {
    ...base,
    ...shared,
    status: grounded.dropped > 0 ? 'partial' : 'answered',
    segments: grounded.segments,
    citations,
    notice: grounded.dropped > 0 ? 'removed-ungrounded' : modelSaidThin ? 'thin' : null,
    decline: null,
  };
}

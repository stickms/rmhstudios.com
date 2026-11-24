/**
 * The interview follow-up generator (roadmap item 6). The Q&A's gates, not a second set: `admitQuestion` runs the shared
 * monthly budget (fail closed), the member's own allowance and the atomic daily reservation, so one generation is one of
 * the member's daily questions. Nothing is stored or cached: the question, notes, prompt and output live in memory for
 * this call; the one trace is the `AiUsage` row the provider writes. Logs carry counts, never text.
 */
import { MEDSCHOOLS_INTERVIEW_FOLLOWUPS, asData, systemFor } from '@/lib/ai/prompts';
import { AppError } from '@/lib/errors/codes';
import { prisma } from '@/lib/prisma.server';
import { qaDeadlineMs } from '../../ai-budget';
import { buildFollowupInput, parseFollowups } from '../../engine/followups';
import type { MedInterviewFollowupsRes } from '../../medschools.contract';
import { admitQuestion } from './budget.server';
import { assertLive, runUnderLease } from './lease.server';
import { aiFollowupRunner, type FollowupRunner } from './runner.server';
import { thinkingAvailable } from './thinking.server';

/**
 * Other stored questions of an ACTIVE school, most voted first, to show as style examples. `null` when the slug is no
 * active school (the endpoint answers 400 before anything is reserved).
 */
export async function schoolExampleQuestions(slug: string): Promise<string[] | null> {
  const school = await prisma.medSchool.findFirst({ where: { slug, active: true }, select: { id: true } });
  if (!school) return null;
  const rows = await prisma.medInterviewQuestion.findMany({
    where: { schoolId: school.id },
    select: { text: true },
    orderBy: [{ votes: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }],
    take: 20,
  });
  return rows.map((r) => r.text);
}

export interface FollowupInput {
  userId: string;
  isAdmin?: boolean | undefined;
  question: string;
  notes?: string | undefined;
  /** The school's stored questions (style only); empty for a general question. */
  stored: readonly string[];
  think?: boolean | undefined;
  signal?: AbortSignal | undefined;
}

export async function generateFollowups(
  i: FollowupInput,
  deps: { runner?: FollowupRunner; now?: Date } = {},
): Promise<MedInterviewFollowupsRes> {
  const now = deps.now ?? new Date();
  const gate = await admitQuestion(i.userId, now, { isAdmin: i.isAdmin === true });
  const think = i.think === true && thinkingAvailable();
  const runner = deps.runner ?? aiFollowupRunner;
  return runUnderLease(gate, qaDeadlineMs(think), i.signal, async (signal) => {
    const input = buildFollowupInput({ question: i.question, notes: i.notes, stored: i.stored });
    const raw = await runner.generate(
      systemFor(MEDSCHOOLS_INTERVIEW_FOLLOWUPS),
      asData(JSON.stringify(input)),
      i.userId,
      signal,
      { think },
    );
    assertLive(signal);
    const followups = parseFollowups(raw, input.question);
    console.warn(
      '[medschools-followups]',
      JSON.stringify({
        status: followups ? 'ok' : 'unreadable',
        kept: followups?.length ?? 0,
        examples: input.examples.length,
        ...(think ? { think: 1 } : {}),
      }),
    );
    if (!followups) {
      // The model answered and nothing in it is usable: not the member's doing, so the day's question goes back.
      await gate.refund();
      throw new AppError('AI_UNAVAILABLE');
    }
    return {
      followups,
      tier: gate.tier,
      remainingToday: gate.remainingToday,
      dailyCap: gate.dailyCap,
      thinking: think,
    };
  });
}

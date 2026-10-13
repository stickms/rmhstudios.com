/**
 * N3 — onboarding questions (server-only).
 *
 * Mods define up to five multiple-choice questions. Each option may carry a
 * cosmetic role label (shown on the member; never a permission — CommunityRole
 * MOD/ADMIN can only be granted by a mod through the members list) and a set of
 * flairs the member will follow, which the community feed then prioritises.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { listFlairs } from '@/lib/communities/flairs.server';
import {
  ONBOARDING_MAX_QUESTIONS,
  type OnboardingOptionDTO,
  type OnboardingQuestionDTO,
  type onboardingSetSchema,
} from '@/lib/communities/plus-schema';
import type { z } from 'zod';

export class OnboardingError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

const TTL_MS = 60_000;
const key = (communityId: string) => `community:onboarding:${communityId}`;

function parseOptions(raw: unknown): OnboardingOptionDTO[] {
  if (!Array.isArray(raw)) return [];
  const out: OnboardingOptionDTO[] = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.label !== 'string') continue;
    out.push({
      id: r.id,
      label: r.label,
      roleTag: typeof r.roleTag === 'string' ? r.roleTag : undefined,
      flairIds: Array.isArray(r.flairIds)
        ? r.flairIds.filter((f): f is string => typeof f === 'string')
        : [],
    });
  }
  return out;
}

export async function getOnboardingQuestions(
  communityId: string,
): Promise<OnboardingQuestionDTO[]> {
  const hit = apiCache.get<OnboardingQuestionDTO[]>(key(communityId));
  if (hit) return hit;
  const rows = await prisma.communityOnboardingQuestion.findMany({
    where: { communityId },
    orderBy: { position: 'asc' },
    take: ONBOARDING_MAX_QUESTIONS,
  });
  const questions = rows.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    options: parseOptions(r.options),
  }));
  apiCache.set(key(communityId), questions, TTL_MS);
  return questions;
}

/** Replace the whole question set (mods). Existing answers go with their questions. */
export async function setOnboardingQuestions(
  communityId: string,
  input: z.infer<typeof onboardingSetSchema>,
): Promise<OnboardingQuestionDTO[]> {
  const valid = new Set((await listFlairs(communityId)).map((f) => f.id));
  const questions = input.questions.map((q, qi) => ({
    prompt: q.prompt,
    position: qi,
    options: q.options.map((o, oi) => ({
      id: `o${oi + 1}`,
      label: o.label,
      ...(o.roleTag ? { roleTag: o.roleTag } : {}),
      flairIds: [...new Set(o.flairIds)].filter((f) => valid.has(f)),
    })),
  }));
  await prisma.$transaction([
    prisma.communityOnboardingQuestion.deleteMany({ where: { communityId } }),
    ...questions.map((q) =>
      prisma.communityOnboardingQuestion.create({
        data: { communityId, prompt: q.prompt, position: q.position, options: q.options },
      }),
    ),
  ]);
  apiCache.invalidate(key(communityId));
  return getOnboardingQuestions(communityId);
}

/** Questions this member has not answered yet. */
export async function getUnansweredQuestions(
  communityId: string,
  userId: string,
): Promise<OnboardingQuestionDTO[]> {
  const questions = await getOnboardingQuestions(communityId);
  if (questions.length === 0) return [];
  const answered = await prisma.communityOnboardingAnswer.findMany({
    where: { communityId, userId },
    select: { questionId: true },
    take: ONBOARDING_MAX_QUESTIONS,
  });
  const done = new Set(answered.map((a) => a.questionId));
  return questions.filter((q) => !done.has(q.id));
}

/**
 * Store a member's answers and apply what they grant: role labels are unioned
 * into `roleTags`, flairs into `followedFlairIds`. Re-answering a question is
 * refused (answers are stored once; a mod edit of the questions resets them).
 */
export async function submitOnboardingAnswers(
  communityId: string,
  userId: string,
  answers: { questionId: string; optionId: string }[],
): Promise<{ roleTags: string[]; followedFlairIds: string[] }> {
  const member = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { id: true, roleTags: true, followedFlairIds: true },
  });
  if (!member) throw new OnboardingError('Join the community first', 404);

  const questions = await getOnboardingQuestions(communityId);
  const byId = new Map(questions.map((q) => [q.id, q]));
  const seen = new Set<string>();
  const picks: { questionId: string; option: OnboardingOptionDTO }[] = [];
  for (const a of answers) {
    const q = byId.get(a.questionId);
    const option = q?.options.find((o) => o.id === a.optionId);
    if (!q || !option) throw new OnboardingError('Unknown question or option', 400);
    if (seen.has(q.id)) throw new OnboardingError('Duplicate answer', 400);
    seen.add(q.id);
    picks.push({ questionId: q.id, option });
  }

  const validFlairs = new Set((await listFlairs(communityId)).map((f) => f.id));
  const tags = new Set(member.roleTags);
  const follows = new Set(member.followedFlairIds);
  for (const p of picks) {
    if (p.option.roleTag) tags.add(p.option.roleTag);
    for (const f of p.option.flairIds) if (validFlairs.has(f)) follows.add(f);
  }

  try {
    await prisma.$transaction([
      prisma.communityOnboardingAnswer.createMany({
        data: picks.map((p) => ({
          communityId,
          questionId: p.questionId,
          userId,
          optionId: p.option.id,
        })),
      }),
      prisma.communityMember.update({
        where: { id: member.id },
        data: { roleTags: [...tags].slice(0, 20), followedFlairIds: [...follows].slice(0, 20) },
      }),
    ]);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new OnboardingError('You have already answered these questions', 409);
    }
    throw e;
  }
  return { roleTags: [...tags], followedFlairIds: [...follows] };
}

/** Set the flairs a member follows (feed priority). */
export async function setFollowedFlairs(
  communityId: string,
  userId: string,
  flairIds: string[],
): Promise<string[]> {
  const valid = new Set((await listFlairs(communityId)).map((f) => f.id));
  const next = [...new Set(flairIds)].filter((f) => valid.has(f));
  const res = await prisma.communityMember.updateMany({
    where: { communityId, userId },
    data: { followedFlairIds: next },
  });
  if (res.count === 0) throw new OnboardingError('Join the community first', 404);
  return next;
}

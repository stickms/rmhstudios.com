/**
 * N6 — community census (server-only). Privacy rules live in census.ts; the
 * one that matters here: an answer is written ONLY as tally increments, in the
 * same transaction that records "this member has answered" (which carries no
 * answers), so no row anywhere links a member to a choice.
 */
import { prisma } from '@/lib/prisma.server';
import {
  CENSUS_MIN_RESPONSES,
  buildCensusQuestions,
  buildCensusResults,
  censusResultsVisible,
  isCensusClosed,
  validateCensusAnswers,
  type CensusQuestion,
  type censusCreateSchema,
} from '@/lib/communities/census';
import type { Prisma } from '@prisma/client';
import type { CensusDTO } from '@/lib/communities/plus-schema';
import type { z } from 'zod';

export class CensusError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export async function createCensus(
  communityId: string,
  userId: string,
  input: z.infer<typeof censusCreateSchema>,
): Promise<{ id: string }> {
  const open = await prisma.communityCensus.findMany({
    where: { communityId, closedAt: null },
    select: { id: true, closesAt: true },
    take: 5,
  });
  if (open.some((c) => !isCensusClosed(c))) {
    throw new CensusError('A census is already open — close it first', 409);
  }
  if (input.closesAt && Date.parse(input.closesAt) <= Date.now()) {
    throw new CensusError('The closing date must be in the future', 400);
  }
  const row = await prisma.communityCensus.create({
    data: {
      communityId,
      title: input.title,
      description: input.description || null,
      questions: buildCensusQuestions(input.questions) as unknown as Prisma.InputJsonValue,
      closesAt: input.closesAt ? new Date(input.closesAt) : null,
      createdById: userId,
    },
    select: { id: true },
  });
  return row;
}

export async function closeCensus(communityId: string, censusId: string): Promise<void> {
  const res = await prisma.communityCensus.updateMany({
    where: { id: censusId, communityId, closedAt: null },
    data: { closedAt: new Date() },
  });
  if (res.count === 0) throw new CensusError('Census not found or already closed', 404);
}

export async function answerCensus(
  communityId: string,
  censusId: string,
  userId: string,
  answers: { questionId: string; optionIds: string[] }[],
): Promise<void> {
  const census = await prisma.communityCensus.findFirst({
    where: { id: censusId, communityId },
    select: { questions: true, closesAt: true, closedAt: true },
  });
  if (!census) throw new CensusError('Census not found', 404);
  if (isCensusClosed(census)) throw new CensusError('This census is closed', 409);
  const checked = validateCensusAnswers(census.questions as unknown as CensusQuestion[], answers);
  if (!checked.ok) throw new CensusError(checked.error, 400);

  try {
    await prisma.$transaction(async (tx) => {
      // The unique key makes "once per member" atomic: a second submit (or a
      // double-click race) fails here and rolls the tallies back with it.
      await tx.communityCensusParticipant.create({ data: { censusId, userId } });
      for (const pick of checked.picks) {
        await tx.communityCensusTally.upsert({
          where: {
            censusId_questionId_optionId: {
              censusId,
              questionId: pick.questionId,
              optionId: pick.optionId,
            },
          },
          create: { censusId, questionId: pick.questionId, optionId: pick.optionId, count: 1 },
          update: { count: { increment: 1 } },
        });
      }
      await tx.communityCensus.update({
        where: { id: censusId },
        data: { responseCount: { increment: 1 } },
      });
    });
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new CensusError('You have already answered this census', 409);
    }
    throw e;
  }
}

/** The latest census, shaped for this viewer (never exposes a live tally). */
export async function getLatestCensus(
  communityId: string,
  viewerId: string | null,
): Promise<CensusDTO | null> {
  const census = await prisma.communityCensus.findFirst({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
  });
  if (!census) return null;
  const closed = isCensusClosed(census);
  const questions = census.questions as unknown as CensusQuestion[];

  const [participant, tallies] = await Promise.all([
    viewerId
      ? prisma.communityCensusParticipant.findUnique({
          where: { censusId_userId: { censusId: census.id, userId: viewerId } },
          select: { userId: true },
        })
      : Promise.resolve(null),
    censusResultsVisible(census)
      ? prisma.communityCensusTally.findMany({ where: { censusId: census.id }, take: 200 })
      : Promise.resolve(null),
  ]);
  const answered = !!participant;
  return {
    id: census.id,
    title: census.title,
    description: census.description,
    closesAt: census.closesAt?.toISOString() ?? null,
    closed,
    responseCount: census.responseCount,
    answered,
    questions: !closed && !answered ? questions : null,
    results: tallies ? buildCensusResults(questions, tallies, census.responseCount) : null,
    minResponses: CENSUS_MIN_RESPONSES,
    withheld: closed && census.responseCount < CENSUS_MIN_RESPONSES,
  };
}

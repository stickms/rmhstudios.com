/** Persistence for the P21 tools: study plans, calculator notebooks, marathon lists. */
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import {
  MAX_LISTS,
  MAX_NOTEBOOKS,
  MAX_PLANS,
  type MarathonListInput,
  type StudyPlanInput,
} from './schemas';

type Out = { ok: true; id: string } | { ok: false; status: number; error: string };
const full = { ok: false as const, status: 409, error: 'Limit reached' };

// ── Study plans ──
export const listStudyPlans = (userId: string) =>
  prisma.studyPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_PLANS,
  });

export async function createStudyPlan(userId: string, d: StudyPlanInput): Promise<Out> {
  if ((await prisma.studyPlan.count({ where: { userId } })) >= MAX_PLANS) return full;
  const row = await prisma.studyPlan.create({
    data: {
      userId,
      title: d.title,
      examDate: d.examDate,
      topics: d.topics,
      hoursByWeekday: d.hoursByWeekday,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function updateStudyPlan(userId: string, id: string, d: StudyPlanInput) {
  const r = await prisma.studyPlan.updateMany({
    where: { id, userId },
    data: {
      title: d.title,
      examDate: d.examDate,
      topics: d.topics,
      hoursByWeekday: d.hoursByWeekday,
    },
  });
  return r.count > 0;
}

export async function deleteStudyPlan(userId: string, id: string) {
  return (await prisma.studyPlan.deleteMany({ where: { id, userId } })).count > 0;
}

// ── Calculator notebooks ──
export const listNotebooks = (userId: string) =>
  prisma.calcNotebook.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_NOTEBOOKS,
    select: { id: true, title: true, body: true, updatedAt: true },
  });

export async function createNotebook(
  userId: string,
  d: { title: string; body: string },
): Promise<Out> {
  if ((await prisma.calcNotebook.count({ where: { userId } })) >= MAX_NOTEBOOKS) return full;
  const row = await prisma.calcNotebook.create({
    data: { userId, title: d.title, body: d.body },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function updateNotebook(
  userId: string,
  id: string,
  d: { title: string; body: string },
) {
  return (await prisma.calcNotebook.updateMany({ where: { id, userId }, data: d })).count > 0;
}

export async function deleteNotebook(userId: string, id: string) {
  return (await prisma.calcNotebook.deleteMany({ where: { id, userId } })).count > 0;
}

// ── Marathon lists ──
export const listMarathons = (userId: string) =>
  prisma.marathonList.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_LISTS,
  });

export async function createMarathon(userId: string, d: MarathonListInput): Promise<Out> {
  if ((await prisma.marathonList.count({ where: { userId } })) >= MAX_LISTS) return full;
  const row = await prisma.marathonList.create({
    data: {
      userId,
      title: d.title,
      deadline: d.deadline,
      items: d.items,
      shareId: randomBytes(9).toString('base64url'),
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function updateMarathon(userId: string, id: string, d: MarathonListInput) {
  return (
    (
      await prisma.marathonList.updateMany({
        where: { id, userId },
        data: { title: d.title, deadline: d.deadline, items: d.items },
      })
    ).count > 0
  );
}

export async function deleteMarathon(userId: string, id: string) {
  return (await prisma.marathonList.deleteMany({ where: { id, userId } })).count > 0;
}

export const getSharedMarathon = (shareId: string) =>
  prisma.marathonList.findUnique({
    where: { shareId },
    select: { title: true, deadline: true, items: true },
  });

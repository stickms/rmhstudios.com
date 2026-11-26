/**
 * s15-08 — a member's saved RMHCalculator graphs.
 *
 * A graph is stored with the validated `GraphResult` the model returned, so reopening it needs no model call. The
 * client could send any JSON as a result, so it is stored only after `graphResultSchema.safeParse` here, and a row
 * whose stored result no longer parses is handed back as `result: null` (the calculator offers "Plot again").
 * Every read and write is scoped to the caller's own `userId`: another member's id is a miss, not a refusal.
 */
import type { Prisma } from '@prisma/client';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { prisma } from '@/lib/prisma.server';
import {
  CALC_GRAPH_LIMIT,
  type CalcGraphFull,
  type CalcGraphSummary,
  type CreateCalcGraphBody,
  type UpdateCalcGraphBody,
} from '@/lib/rmhcalculator/graphs-schema';
import { graphResultSchema, type GraphResult } from '@/lib/rmhcalculator/types';

const SUMMARY = {
  id: true,
  title: true,
  functions: true,
  domainMin: true,
  domainMax: true,
  updatedAt: true,
} as const;

interface SummaryRow {
  id: string;
  title: string;
  functions: string[];
  domainMin: number | null;
  domainMax: number | null;
  updatedAt: Date;
}

const summary = (r: SummaryRow): CalcGraphSummary => ({
  id: r.id,
  title: r.title,
  functions: r.functions,
  domainMin: r.domainMin,
  domainMax: r.domainMax,
  updatedAt: r.updatedAt.toISOString(),
});

/** The stored result if it is still a valid `GraphResult`, else `null`. */
export function readStoredResult(value: unknown): GraphResult | null {
  const parsed = graphResultSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** The caller's saved graphs, newest first, without their points. */
export async function listGraphs(userId: string): Promise<CalcGraphSummary[]> {
  const rows = await prisma.calcGraph.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: CALC_GRAPH_LIMIT,
    select: SUMMARY,
  });
  return rows.map(summary);
}

/** One of the caller's graphs with its result, or `null` when it is not theirs or does not exist. */
export async function getGraph(userId: string, id: string): Promise<CalcGraphFull | null> {
  const row = await prisma.calcGraph.findFirst({ where: { id, userId }, select: { ...SUMMARY, result: true } });
  if (!row) return null;
  return { ...summary(row), result: readStoredResult(row.result) };
}

export type CreateGraphOutcome = { ok: true; id: string } | { ok: false; reason: 'invalid-result' | 'limit' };

/** Save a graph. The cap is checked and the row written under one lock per member, so two saves cannot both be the 51st. */
export async function createGraph(userId: string, input: CreateCalcGraphBody): Promise<CreateGraphOutcome> {
  const result = graphResultSchema.safeParse(input.result);
  if (!result.success) return { ok: false, reason: 'invalid-result' };
  return prisma.$transaction(async (tx): Promise<CreateGraphOutcome> => {
    await lockKey(tx, `calc-graphs:${userId}`);
    const held = await tx.calcGraph.count({ where: { userId } });
    if (held >= CALC_GRAPH_LIMIT) return { ok: false, reason: 'limit' };
    const row = await tx.calcGraph.create({
      data: {
        userId,
        title: input.title,
        functions: input.functions,
        domainMin: input.domainMin,
        domainMax: input.domainMax,
        result: result.data as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return { ok: true, id: row.id };
  });
}

export type UpdateGraphOutcome = 'ok' | 'not-found' | 'invalid-result';

/** Rename a graph or store a new plot of it. Only the fields sent change; the row must be the caller's own. */
export async function updateGraph(userId: string, id: string, patch: UpdateCalcGraphBody): Promise<UpdateGraphOutcome> {
  const data: Prisma.CalcGraphUpdateManyMutationInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.functions !== undefined) data.functions = patch.functions;
  if (patch.domainMin !== undefined) data.domainMin = patch.domainMin;
  if (patch.domainMax !== undefined) data.domainMax = patch.domainMax;
  if (patch.result !== undefined) {
    const result = graphResultSchema.safeParse(patch.result);
    if (!result.success) return 'invalid-result';
    data.result = result.data as Prisma.InputJsonValue;
  }
  const done = await prisma.calcGraph.updateMany({ where: { id, userId }, data });
  return done.count > 0 ? 'ok' : 'not-found';
}

export async function deleteGraph(userId: string, id: string): Promise<boolean> {
  return (await prisma.calcGraph.deleteMany({ where: { id, userId } })).count > 0;
}

/**
 * The data export's calculator section: saved graphs (title, functions, domain, times; not the points) and
 * notebooks (title, body, times).
 */
export async function exportCalcTools(userId: string) {
  const [graphs, notebooks] = await Promise.all([
    prisma.calcGraph.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { title: true, functions: true, domainMin: true, domainMax: true, createdAt: true, updatedAt: true },
    }),
    prisma.calcNotebook.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      select: { title: true, body: true, createdAt: true, updatedAt: true },
    }),
  ]);
  return {
    graphs: graphs.map((g) => ({
      title: g.title,
      functions: g.functions,
      domainMin: g.domainMin,
      domainMax: g.domainMax,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
    notebooks: notebooks.map((n) => ({
      title: n.title,
      body: n.body,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
    })),
  };
}

/** The member's saved graphs go on account deletion (the user row is anonymised in place, so no cascade fires). */
export function calcGraphErasureOps(userId: string) {
  return [prisma.calcGraph.deleteMany({ where: { userId } })];
}

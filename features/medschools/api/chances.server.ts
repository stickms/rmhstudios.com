/**
 * The personal invite chance (phase 5, D8): "if you have not heard by today, how likely is an interview invite by
 * date X". It reads the caller's own tracker through `getTracker` (so it can only reach rows of the caller's cycles)
 * and, per school x program the caller has applied to, at most one pre-aggregated `MedWaitCurve` row. It never reads
 * another member's milestone, application or cycle: the curve is an aggregate over at least 20 members that the
 * forecast job wrote (D6, D7). The response carries the caller's own dates and the curve's day, never anyone else's.
 */
import { prisma } from '@/lib/prisma.server';
import type { ChanceDto, ChanceStatus, MedChancesRes } from '../medschools.contract';
import { utcDayOf } from '../engine/public-read';
import { CHANCE_HORIZONS } from '../engine/stats/constants';
import { addDays, dayIndex } from '../engine/stats/days';
import { inviteChance, type SurvivalCurve } from '../engine/stats/km';
import { getTracker } from './tracker.server';

const day = (d: Date): string => d.toISOString().slice(0, 10);
const CLOSING = new Set(['REJECTION', 'WITHDRAWN', 'ACCEPTANCE']);

/** The stored step function, or null when the JSON is not `{ t: number[], s: number[] }` of equal length. */
function curveOf(json: unknown): SurvivalCurve | null {
  const c = json as { t?: unknown; s?: unknown } | null;
  if (!c || !Array.isArray(c.t) || !Array.isArray(c.s) || c.t.length !== c.s.length) return null;
  if (!c.t.every((n) => typeof n === 'number') || !c.s.every((n) => typeof n === 'number')) return null;
  return { t: c.t as number[], s: c.s as number[] };
}

export async function getChances(
  userId: string,
  q: { school?: string | undefined; cycle?: number | undefined },
  now: Date = new Date(),
): Promise<MedChancesRes> {
  const tracker = await getTracker(userId, q.cycle);
  const cycle = tracker.cycle;
  if (!cycle) return { cycleYear: null, chances: [] };
  const today = utcDayOf(now);
  // An inactive school gets no chance and no row; `school` narrows to one slug.
  const apps = cycle.applications.filter((a) => a.school.active && (q.school === undefined || a.school.slug === q.school));

  // Only applications that can still have an estimate need a curve.
  const waiting = apps.filter(
    (a) =>
      a.milestones.some((m) => m.type === 'COMPLETE') &&
      !a.milestones.some((m) => m.type === 'INTERVIEW' || CLOSING.has(m.type)),
  );
  const curves = new Map<string, { curve: SurvivalCurve; maxDay: number; members: number; asOf: string }>();
  if (waiting.length > 0) {
    const slugs = [...new Set(waiting.map((a) => a.school.slug))];
    const schools = await prisma.medSchool.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
    const idOf = new Map(schools.map((s) => [s.slug, s.id] as const));
    const pairs = [
      ...new Map(
        waiting.flatMap((a) => {
          const schoolId = idOf.get(a.school.slug);
          return schoolId ? [[`${schoolId}|${a.program}`, { schoolId, program: a.program }] as const] : [];
        }),
      ).values(),
    ];
    if (pairs.length > 0) {
      const rows = await prisma.medWaitCurve.findMany({
        where: { OR: pairs },
        select: { schoolId: true, program: true, curve: true, maxDay: true, members: true, asOf: true },
      });
      for (const r of rows) {
        const curve = curveOf(r.curve);
        if (curve) {
          curves.set(`${r.schoolId}|${r.program}`, { curve, maxDay: r.maxDay, members: r.members, asOf: day(r.asOf) });
        }
      }
    }
    // Re-key by slug so the loop below needs no ids.
    for (const [slug, id] of idOf) {
      for (const program of ['REG', 'PHD'] as const) {
        const hit = curves.get(`${id}|${program}`);
        if (hit) curves.set(`${slug}|${program}`, hit);
      }
    }
  }

  const chances: ChanceDto[] = apps.map((a) => {
    const find = (type: string) => a.milestones.find((m) => m.type === type)?.date ?? null;
    const completeOn = find('COMPLETE');
    const invitedOn = find('INTERVIEW');
    const dto = (status: ChanceStatus, extra: Partial<ChanceDto> = {}): ChanceDto => ({
      applicationId: a.id,
      school: { slug: a.school.slug, shortName: a.school.shortName, name: a.school.name, active: a.school.active },
      program: a.program,
      status,
      completeOn,
      invitedOn: status === 'invited' ? invitedOn : null,
      asOf: null,
      basis: null,
      points: [],
      ...extra,
    });
    if (invitedOn) return dto('invited');
    if (a.milestones.some((m) => CLOSING.has(m.type))) return dto('closed');
    if (!completeOn) return dto('no-complete');
    const hit = curves.get(`${a.school.slug}|${a.program}`);
    if (!hit) return dto('thin');
    const elapsed = Math.max(0, dayIndex(today) - dayIndex(completeOn));
    const points = CHANCE_HORIZONS.flatMap((h) => {
      const c = inviteChance(hit.curve, hit.maxDay, elapsed, h);
      return c === null ? [] : [{ on: addDays(today, h), percent: Math.round(100 * c) }];
    });
    if (points.length === 0) return dto('beyond');
    return dto('estimate', { asOf: hit.asOf, basis: Math.max(20, Math.floor(hit.members / 10) * 10), points });
  });
  return { cycleYear: cycle.cycleYear, chances };
}

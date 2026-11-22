/**
 * The Today hub's numbers — pure, client-safe.
 *
 * One place that says what is waiting: how many items of each drill (staff reading, ear training,
 * Sprint) are due, how many new staff cards Practice may still introduce, and which lesson or level
 * of the other two drills holds the most due items, so the button next to it opens the drill that
 * will deal them first (ear lessons and Sprint freeplay already deal due and weak items first).
 */
import type { Instrument } from '../schemas';
import { SPRINT_LEVELS, type SprintLevelId } from '../sprint/levels';
import { buildInsights, FAMILIES } from '../srs/insights';
import { earItemId, intervalItemId, type ItemFamily } from '../srs/items';
import { staffIntervalLesson } from '../theory/staff-intervals';
import { isDue } from '../srs/schedule';
import { newCardsIntroduced, stateFromRow, type CardRow } from './practice';
import { pathFor } from './path';

export interface TodayData {
  /** Items due now, per drill. */
  due: Record<ItemFamily, number>;
  /** Items answered at least once, per drill (a learner with none has nothing to review yet). */
  reviewed: Record<ItemFamily, number>;
  /** Due now, all drills. */
  totalDue: number;
  newPerDay: number;
  /** Staff cards first met in the last 24 hours. */
  newIntroduced: number;
  /** New staff cards Practice may still introduce. */
  newLeft: number;
  /** The available ear lesson with the most due items, with how many; null when no ear item is due. */
  ear: { lessonId: string; due: number } | null;
  /** The available interval-reading lesson with the most due items, with how many; null when none is due. */
  interval: { lessonId: string; due: number } | null;
  /** The Sprint level with the most due items, with how many; null when no Sprint item is due. */
  sprint: { level: SprintLevelId; due: number } | null;
}

/** The Sprint level a Sprint item belongs to (an approximation: a bass note is also in the treble level's sibling). */
export function sprintLevelOf(cardId: string): SprintLevelId | null {
  const p = cardId.split(':');
  if (p[0] !== 'sprint') return null;
  if (p[1] === 'chord') return 'triad';
  if (p[1] !== 'note') return null;
  if (p[4] !== '0') return 'accidental';
  return p[2] === 'bass' ? 'note-both' : 'note';
}

export function buildToday(
  rows: readonly CardRow[],
  now: number,
  opts: { newPerDay: number; instrument?: Instrument },
): TodayData {
  const insights = buildInsights(rows, now, now, 0);
  const due = {} as Record<ItemFamily, number>;
  const reviewed = {} as Record<ItemFamily, number>;
  let totalDue = 0;
  for (const f of FAMILIES) {
    due[f] = insights.families[f].dueNow;
    reviewed[f] = insights.families[f].reviewed;
    totalDue += due[f];
  }

  const dueIds = new Set<string>();
  for (const r of rows) if (r.reps > 0 && isDue(stateFromRow(r), now)) dueIds.add(r.cardId);

  let ear: TodayData['ear'] = null;
  for (const unit of pathFor(opts.instrument ?? 'piano')) {
    for (const lesson of unit.lessons) {
      if (!lesson.available || !lesson.pool) continue;
      const kind = lesson.mode === 'ear-interval' ? 'interval' : lesson.mode === 'ear-chord' ? 'chord' : null;
      if (kind === null) continue;
      const n = lesson.pool.filter((name) => dueIds.has(earItemId(kind, name as never))).length;
      if (n > 0 && (ear === null || n > ear.due)) ear = { lessonId: lesson.id, due: n };
    }
  }

  let interval: TodayData['interval'] = null;
  for (const unit of pathFor(opts.instrument ?? 'piano')) {
    for (const lesson of unit.lessons) {
      if (!lesson.available || lesson.mode !== 'staff-intervals') continue;
      const setting = staffIntervalLesson(lesson.id);
      if (setting === null) continue;
      let n = 0;
      for (const direction of setting.directions) {
        for (const name of setting.pool) if (dueIds.has(intervalItemId(direction, name))) n += 1;
      }
      if (n > 0 && (interval === null || n > interval.due)) interval = { lessonId: lesson.id, due: n };
    }
  }

  const perLevel = new Map<SprintLevelId, number>();
  for (const id of dueIds) {
    const level = sprintLevelOf(id);
    if (level !== null) perLevel.set(level, (perLevel.get(level) ?? 0) + 1);
  }
  let sprint: TodayData['sprint'] = null;
  for (const level of SPRINT_LEVELS) {
    const n = perLevel.get(level.id) ?? 0;
    if (n > 0 && (sprint === null || n > sprint.due)) sprint = { level: level.id, due: n };
  }

  const perDay = Number.isFinite(opts.newPerDay) ? Math.max(0, Math.floor(opts.newPerDay)) : 0;
  const newIntroduced = newCardsIntroduced(rows, now);
  return {
    due,
    reviewed,
    totalDue,
    newPerDay: perDay,
    newIntroduced,
    newLeft: Math.max(0, perDay - newIntroduced),
    ear,
    interval,
    sprint,
  };
}

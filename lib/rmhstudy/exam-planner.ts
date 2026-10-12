/**
 * Exam countdown planner — pure and client-safe.
 * Feature idea F4 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * RMHStudy has the *how* of studying (synced Pomodoro rooms, SRS flashcards)
 * and nothing for the *what, when*. A student types an exam date, the topics,
 * a rough hours estimate and how confident they feel about each, and how many
 * hours they have per weekday. The planner works out a day-by-day plan:
 *
 *   • need(topic) = hours × (1 − 0.5 × confidence) — a topic you are sure of
 *     still gets half its time, because confidence is the least reliable
 *     input on the form;
 *   • the day before the exam is reserved for review of everything, never
 *     new material (the advice every study guide gives and nobody follows);
 *   • remaining days are filled in 30-minute blocks, each block going to the
 *     topic with the most need left — which interleaves topics naturally,
 *     the strongest finding in the learning-science literature on retention;
 *   • if capacity runs out, the plan says by how many hours, rather than
 *     silently dropping topics.
 *
 * Days are local calendar dates as `YYYY-MM-DD` strings; the caller owns the
 * timezone, so the planner never touches `Date` timezone behaviour.
 */

export interface Topic {
  id: string;
  hours: number;
  /** 0 (lost) – 1 (solid). */
  confidence: number;
}

export interface PlanDay {
  date: string;
  blocks: Array<{ topicId: string | 'review'; minutes: number }>;
}

export interface Plan {
  days: PlanDay[];
  /** Hours of need that did not fit. 0 = feasible. */
  shortfallHours: number;
}

const BLOCK_MIN = 30;

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

export function needHours(t: Topic): number {
  const c = Math.min(1, Math.max(0, t.confidence));
  return Math.max(0, t.hours) * (1 - 0.5 * c);
}

/**
 * @param today first study day (inclusive)
 * @param examDay exam date (no study planned on it)
 * @param hoursByWeekday index 0 = Sunday … 6 = Saturday
 */
export function planExam(
  today: string,
  examDay: string,
  topics: readonly Topic[],
  hoursByWeekday: readonly number[],
): Plan {
  const dates: string[] = [];
  for (let d = today; d < examDay && dates.length < 366; d = addDays(d, 1)) dates.push(d);

  const left = new Map(topics.map((t) => [t.id, needHours(t) * 60]));
  const days: PlanDay[] = dates.map((date) => ({ date, blocks: [] }));
  const reviewDay = days.length >= 2 ? days[days.length - 1]! : null;
  const studyDays = reviewDay ? days.slice(0, -1) : days;

  for (const day of studyDays) {
    let capacity =
      Math.floor(((hoursByWeekday[weekday(day.date)] ?? 0) * 60) / BLOCK_MIN) * BLOCK_MIN;
    let lastTopic: string | null = null;
    while (capacity >= BLOCK_MIN) {
      // Most need left first; avoid two consecutive blocks of the same topic
      // when another topic still needs time.
      const ranked = [...left.entries()].filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]);
      if (ranked.length === 0) break;
      const pick = ranked.find(([id]) => id !== lastTopic) ?? ranked[0]!;
      const [id, mins] = pick;
      const take = Math.min(BLOCK_MIN, Math.ceil(mins / 5) * 5);
      const prev = day.blocks[day.blocks.length - 1];
      if (prev && prev.topicId === id) prev.minutes += take;
      else day.blocks.push({ topicId: id, minutes: take });
      left.set(id, mins - take);
      capacity -= BLOCK_MIN;
      lastTopic = id;
    }
  }

  if (reviewDay) {
    const cap =
      Math.floor(((hoursByWeekday[weekday(reviewDay.date)] ?? 0) * 60) / BLOCK_MIN) * BLOCK_MIN;
    if (cap > 0) reviewDay.blocks.push({ topicId: 'review', minutes: cap });
  }

  const remaining = [...left.values()].reduce((a, m) => a + Math.max(0, m), 0);
  return { days, shortfallHours: Math.round((remaining / 60) * 10) / 10 };
}

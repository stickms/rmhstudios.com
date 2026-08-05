/**
 * Narrative Wrapped scheduling + framing (A9).
 *
 * The generation itself is one constrained model call and is not what can go
 * wrong. What can go wrong is the *schedule*: the entire justification for this
 * feature's design is that Wrapped narratives are precomputed rather than
 * generated on page load, and the pieces that hold that up — the window check,
 * the target year, and `readWrappedNarrative` never generating — are plain
 * functions that a well-meant edit could quietly invert.
 *
 * So this suite asserts the calendar logic exhaustively and asserts that the
 * read path is a read. Nothing here reaches a provider or a database.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
// Redis is optional everywhere in this repo, and `redisGetJSON` returns null
// when it is not configured — which is precisely the "no precomputed
// narrative" path the read test wants.
vi.mock('@/lib/redis.server', () => ({
  redisGetJSON: vi.fn(async () => null),
  redisSetJSON: vi.fn(async () => undefined),
  redisDel: vi.fn(async () => undefined),
}));

import {
  inWrappedWindow,
  targetWrappedYear,
  readWrappedNarrative,
  WRAPPED_NARRATIVE_QUEUE,
  WRAPPED_NARRATIVE_FANOUT_QUEUE,
  WRAPPED_NARRATIVE_CRON,
} from '@/lib/wrapped/narrative.server';
import { WRAPPED_NARRATIVE, SAFETY_FRAME, systemFor } from '@/lib/ai/prompts';

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d, 12, 0, 0));

describe('the Wrapped window', () => {
  it('is open through December', () => {
    for (const day of [1, 15, 25, 31]) expect(inWrappedWindow(utc(2026, 11, day))).toBe(true);
  });

  it('is open through 15 January and closed after', () => {
    expect(inWrappedWindow(utc(2027, 0, 1))).toBe(true);
    expect(inWrappedWindow(utc(2027, 0, 15))).toBe(true);
    expect(inWrappedWindow(utc(2027, 0, 16))).toBe(false);
  });

  it('is closed for the rest of the year', () => {
    // The daily cron is only affordable because it does nothing for ten and a
    // half months. If this ever returns true in, say, June, the fan-out runs
    // every night against a year that has not finished.
    for (let month = 1; month <= 10; month++) {
      expect(inWrappedWindow(utc(2026, month, 15))).toBe(false);
    }
  });
});

describe('targetWrappedYear', () => {
  it('narrates the current year in December', () => {
    expect(targetWrappedYear(utc(2026, 11, 20))).toBe(2026);
  });

  it('narrates the previous year in January', () => {
    // The off-by-one that would otherwise produce paragraphs about three weeks
    // of activity, for everyone, on New Year's Day.
    expect(targetWrappedYear(utc(2027, 0, 5))).toBe(2026);
  });
});

describe('readWrappedNarrative', () => {
  it('returns null rather than generating when nothing is cached', async () => {
    // The single most important assertion in this file. A "generate on miss"
    // convenience here would reintroduce the page-load model call the whole
    // design exists to remove — and it would do so invisibly, because the page
    // would still render.
    await expect(readWrappedNarrative('user_absent', 2026)).resolves.toBeNull();
  });
});

describe('queue identity', () => {
  it('keeps the fan-out and the per-user queue distinct', () => {
    // They are separate because pg-boss retries a failed job: a fan-out that
    // shared a queue with per-user work would re-enqueue everyone it had
    // already enqueued on any single failure.
    expect(WRAPPED_NARRATIVE_QUEUE).not.toBe(WRAPPED_NARRATIVE_FANOUT_QUEUE);
    expect(WRAPPED_NARRATIVE_QUEUE).toBe('wrapped.narrative');
  });

  it('schedules at most once a day', () => {
    const [minute, hour] = WRAPPED_NARRATIVE_CRON.split(' ');
    expect(minute).not.toBe('*');
    expect(hour).not.toBe('*');
  });
});

describe('the narrative prompt', () => {
  it('carries the shared safety frame', () => {
    expect(systemFor(WRAPPED_NARRATIVE)).toContain(SAFETY_FRAME);
  });

  it('forbids inventing an achievement', () => {
    // The promise the serialization keeps by sending numbers and no post text.
    expect(WRAPPED_NARRATIVE.instructions).toMatch(/never invent/i);
  });

  it('routes to the narrative task', () => {
    expect(WRAPPED_NARRATIVE.task).toBe('narrative');
  });
});

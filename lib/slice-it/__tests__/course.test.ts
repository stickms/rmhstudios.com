/**
 * S2 — the course reducer (`lib/slice-it/course.ts`).
 *
 * The interesting part of a course is not arithmetic, it is the two properties
 * that make it a mode rather than a playlist: **the gauge carries across songs**
 * and **the recovery is partial**. Both are easy to break in a way that
 * typechecks — carrying full health forward turns a five-song course into five
 * one-song runs, and carrying none turns it into a one-song course with four
 * songs of theatre afterwards. These tests pin the shape of the survival curve,
 * not the constants.
 */

import { describe, it, expect } from 'vitest';
import { HEALTH_MAX } from '@/lib/slice-it/constants';
import {
  COURSE_RECOVERY,
  MAX_COURSE_SONGS,
  MIN_COURSE_SONGS,
  advance,
  courseFromSongs,
  courseModifiers,
  coursePosition,
  currentSongId,
  isValidCourse,
  startCourse,
  type CourseState,
} from '@/lib/slice-it/course';

const FIVE = ['a', 'b', 'c', 'd', 'e'];

describe('course construction', () => {
  it('needs at least MIN_COURSE_SONGS songs', () => {
    expect(isValidCourse(['a', 'b'])).toBe(false);
    expect(isValidCourse(FIVE.slice(0, MIN_COURSE_SONGS))).toBe(true);
  });

  it('trims a longer setlist to MAX_COURSE_SONGS rather than refusing it', () => {
    const state = courseFromSongs([...FIVE, 'f', 'g']);
    expect(state?.songIds).toHaveLength(MAX_COURSE_SONGS);
  });

  it('returns null for a setlist too short to be a course', () => {
    expect(courseFromSongs(['a'])).toBeNull();
  });

  it('starts at full gauge and the first song', () => {
    const state = startCourse(FIVE);
    expect(state.health).toBe(HEALTH_MAX);
    expect(state.index).toBe(0);
    expect(currentSongId(state)).toBe('a');
    expect(coursePosition(state)).toBe('1 / 5');
  });
});

describe('courseModifiers', () => {
  it('forces the gauge on regardless of the player setting', () => {
    // The gauge defaults to OFF everywhere else in the game, deliberately.
    // Starting a course is the opt-in, so this must not read the setting.
    expect(courseModifiers({ healthGauge: false }).healthGauge).toBe(true);
  });

  it('leaves the rest of the player settings alone', () => {
    expect(courseModifiers({ speed: 1.4, difficulty: 'expert' })).toMatchObject({
      speed: 1.4,
      difficulty: 'expert',
      healthGauge: true,
    });
  });
});

describe('advance', () => {
  const run = (health: number, score = 1000) => ({ health, score, maxCombo: 50 });

  it('carries the gauge across songs — the defining mechanic', () => {
    const outcome = advance(startCourse(FIVE), run(40));
    expect(outcome.status).toBe('continue');
    if (outcome.status !== 'continue') return;
    // Not reset to HEALTH_MAX: the next song starts from where the last one
    // left you, plus the partial recovery.
    expect(outcome.state.health).toBe(40 + COURSE_RECOVERY);
    expect(outcome.state.health).toBeLessThan(HEALTH_MAX);
  });

  it('caps recovery at the gauge ceiling', () => {
    const outcome = advance(startCourse(FIVE), run(HEALTH_MAX));
    expect(outcome.status).toBe('continue');
    if (outcome.status !== 'continue') return;
    expect(outcome.state.health).toBe(HEALTH_MAX);
  });

  it('fails the course when the gauge is gone, before any recovery applies', () => {
    const outcome = advance(startCourse(FIVE), run(0));
    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.clearedSongs).toBe(0);
  });

  it('accumulates score and keeps the best combo', () => {
    let state: CourseState = startCourse(FIVE);
    for (const [health, score] of [
      [60, 1000],
      [70, 2500],
      [80, 500],
    ] as const) {
      const outcome = advance(state, { health, score, maxCombo: score / 10 });
      expect(outcome.status).toBe('continue');
      if (outcome.status !== 'continue') return;
      state = outcome.state;
    }
    expect(state.cumulativeScore).toBe(4000);
    expect(state.scores).toEqual([1000, 2500, 500]);
    expect(state.maxCombo).toBe(250);
    expect(coursePosition(state)).toBe('4 / 5');
  });

  it('completes on the last song rather than continuing past the end', () => {
    let state = startCourse(FIVE.slice(0, MIN_COURSE_SONGS));
    let last = advance(state, run(80));
    for (let i = 1; i < MIN_COURSE_SONGS; i++) {
      expect(last.status === 'continue' || last.status === 'complete').toBe(true);
      if (last.status === 'failed') return;
      state = last.state;
      if (i < MIN_COURSE_SONGS - 1) last = advance(state, run(80));
    }
    const final = advance(state, run(80));
    expect(final.status).toBe('complete');
    expect(currentSongId(state)).not.toBeNull();
  });
});

describe('the survival curve the recovery is chosen for', () => {
  /**
   * One bad chart must be survivable and two must not. This is the whole
   * justification for `COURSE_RECOVERY` being a partial number rather than 0 or
   * `HEALTH_MAX`, so it is asserted as a property of the reducer rather than as
   * the constant's value.
   */
  it('survives one collapse and not two in a row', () => {
    const bad = 5;
    const first = advance(startCourse(FIVE), { health: bad, score: 0, maxCombo: 0 });
    expect(first.status).toBe('continue');
    if (first.status !== 'continue') return;
    expect(first.state.health).toBeGreaterThan(bad);
    // A second collapse takes the gauge to zero during the song, which is what
    // `failed` reports — recovery never outpaces two consecutive collapses.
    expect(first.state.health).toBeLessThan(HEALTH_MAX);
    const second = advance(first.state, { health: 0, score: 0, maxCombo: 0 });
    expect(second.status).toBe('failed');
  });
});

import { describe, expect, it } from 'vitest';
import { TYPING_LAYOUTS } from '@/lib/rmhtype/keystats';
import { keyboardRows, locate } from '@/lib/rmhtype/layouts';
import {
  LESSONS,
  UNITS,
  courseFor,
  drillFor,
  layoutOfLessonId,
  lessonById,
  recommendedNext,
  unitsFor,
  unitsNotInCourse,
} from '@/lib/rmhtype/lessons';

describe('courseFor', () => {
  it('is today QWERTY course for qwerty, ids and all', () => {
    expect(courseFor('qwerty')).toEqual(LESSONS);
    expect(unitsFor('qwerty')).toEqual(UNITS);
    expect(LESSONS[0]).toMatchObject({ id: 'l01', newKeys: ['f', 'j'] });
    expect(LESSONS.at(-1)?.id).toBe('l25');
  });

  it('introduces uh on Dvorak lesson 1, with dv- ids', () => {
    const first = courseFor('dvorak')[0];
    expect(first?.id).toBe('dv-l01');
    expect(first?.newKeys).toEqual(['u', 'h']);
    expect(courseFor('colemak')[0]).toMatchObject({ id: 'cm-l01', newKeys: ['t', 'n'] });
    expect(courseFor('azerty')[0]).toMatchObject({ id: 'az-l01', newKeys: ['f', 'j'] });
  });

  it('gives AZERTY units 1-4 only and says what is left out', () => {
    expect(unitsFor('azerty').map((u) => u.id)).toEqual([1, 2, 3, 4]);
    expect(unitsNotInCourse('azerty')).toEqual([5, 6]);
    expect(unitsNotInCourse('dvorak')).toEqual([]);
    expect(unitsFor('dvorak').map((u) => u.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it.each(TYPING_LAYOUTS)('uses only keys that are on %s', (layout) => {
    for (const lesson of courseFor(layout)) {
      for (const key of lesson.allowedKeys) expect(locate(layout, key), `${lesson.id} ${key}`).not.toBeNull();
    }
  });

  it.each(TYPING_LAYOUTS)('teaches every letter, and a capital for it, on %s', (layout) => {
    const all = new Set(courseFor(layout).flatMap((l) => l.newKeys));
    for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
      expect(all.has(letter), letter).toBe(true);
      expect(all.has(letter.toUpperCase()) || layout === 'azerty', letter.toUpperCase()).toBe(true);
    }
    // Every key of the three letter rows is introduced somewhere.
    for (const key of keyboardRows(layout)
      .slice(1)
      .map((row) => row.slice(0, 10))
      .join('')) {
      if (/[a-z;,./]/.test(key)) expect(all.has(key), key).toBe(true);
    }
  });

  it('keeps AZERTY capitals complete, m included', () => {
    const all = new Set(courseFor('azerty').flatMap((l) => l.newKeys));
    for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') expect(all.has(letter), letter).toBe(true);
  });

  it.each(TYPING_LAYOUTS)('has unique ids of at most 32 characters on %s, all found by lessonById', (layout) => {
    const course = courseFor(layout);
    const ids = course.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const lesson of course) {
      expect(lesson.id.length).toBeLessThanOrEqual(32);
      expect(lessonById(lesson.id)).toBe(lesson);
      expect(layoutOfLessonId(lesson.id)).toBe(layout);
    }
  });

  it('never shares an id between layouts, and refuses unknown ones', () => {
    const all = TYPING_LAYOUTS.flatMap((layout) => courseFor(layout).map((l) => l.id));
    expect(new Set(all).size).toBe(all.length);
    expect(lessonById('xx-l01')).toBeUndefined();
    expect(lessonById('dv-l99')).toBeUndefined();
    expect(lessonById('az-l20')).toBeUndefined();
  });

  it.each(TYPING_LAYOUTS)('builds a non-empty drill from only allowed keys for 50 seeds on %s', (layout) => {
    for (const lesson of courseFor(layout)) {
      const allowed = new Set([...lesson.allowedKeys, ' ']);
      for (let seed = 1; seed <= 50; seed += 1) {
        const text = drillFor(lesson, seed);
        expect(text.length, `${lesson.id} #${seed}`).toBeGreaterThan(0);
        expect(
          [...text].every((c) => allowed.has(c)),
          `${lesson.id} #${seed}`,
        ).toBe(true);
      }
    }
  });

  it('recommends the next lesson inside the chosen layout', () => {
    expect(recommendedNext(new Map())).toBe('l01');
    expect(recommendedNext(new Map(), 'dvorak')).toBe('dv-l01');
    const done = new Map([['l01', { stars: 3 }]]);
    expect(recommendedNext(done, 'dvorak')).toBe('dv-l01');
    expect(recommendedNext(new Map([['dv-l01', { stars: 1 }]]), 'dvorak')).toBe('dv-l02');
  });
});

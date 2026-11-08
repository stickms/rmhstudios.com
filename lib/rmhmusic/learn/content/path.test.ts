import { describe, expect, it } from 'vitest';
import { PATH, getLesson, isKnownLesson } from './path';

const lessons = PATH.flatMap((unit) => unit.lessons);

describe('learning path', () => {
  it('has unique, kebab-case lesson ids of at most 64 chars', () => {
    const ids = lessons.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id.length).toBeLessThanOrEqual(64);
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
  it('gives every unit at least one lesson and a unique id', () => {
    expect(new Set(PATH.map((u) => u.id)).size).toBe(PATH.length);
    for (const unit of PATH) expect(unit.lessons.length).toBeGreaterThan(0);
  });
  it('tags each lesson with its unit', () => {
    for (const unit of PATH) for (const l of unit.lessons) expect(l.unit).toBe(unit.id);
  });
  it('recognises known lessons only', () => {
    expect(isKnownLesson('nope')).toBe(false);
    expect(isKnownLesson('play-first-note')).toBe(true);
    expect(getLesson('play-first-note')?.mode).toBe('play-note');
    expect(getLesson('nope')).toBeUndefined();
  });
  it('ships exactly the play-note lesson as available in Phase 1', () => {
    const available = lessons.filter((l) => l.available);
    expect(available.map((l) => l.id)).toEqual(['play-first-note']);
  });
});

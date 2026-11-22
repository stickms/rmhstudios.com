import { describe, expect, it } from 'vitest';
import { STAFF_INTERVAL_LESSON_IDS } from '../theory/staff-intervals';
import { PATH, VOICE_PATH, getLesson, isKnownLesson } from './path';
import { ROUTED_MODES, isPlayable } from './routing';

const unit = PATH.find((u) => u.id === 'read-intervals');

describe('the Read intervals unit', () => {
  it('follows Scales and keys and comes before rhythm, on the piano and guitar path only', () => {
    const at = (id: string) => PATH.findIndex((u) => u.id === id);
    expect(unit).toBeDefined();
    expect(at('read-intervals')).toBe(at('scales-and-keys') + 1);
    expect(at('rhythm-basics')).toBe(at('read-intervals') + 1);
    expect(VOICE_PATH.some((u) => u.id === 'read-intervals')).toBe(false);
  });

  it('has exactly the lessons the theory file defines, in order, all playable and all of one mode', () => {
    expect(unit?.lessons.map((l) => l.id)).toEqual([...STAFF_INTERVAL_LESSON_IDS]);
    expect(ROUTED_MODES.has('staff-intervals')).toBe(true);
    for (const l of unit?.lessons ?? []) {
      expect(l.mode).toBe('staff-intervals');
      expect(l.unit).toBe('read-intervals');
      expect(l.available).toBe(true);
      expect(isKnownLesson(l.id)).toBe(true);
      expect(isPlayable(l), l.id).toBe(true);
      // The setting lives with the theory, so a lesson here carries no pool of its own.
      expect(l.pool, l.id).toBeUndefined();
    }
  });

  it('is not playable for an interval lesson the theory file does not know', () => {
    const l = getLesson('intervals-read-all-sizes')!;
    expect(isPlayable({ ...l, id: 'intervals-read-nope' })).toBe(false);
  });
});

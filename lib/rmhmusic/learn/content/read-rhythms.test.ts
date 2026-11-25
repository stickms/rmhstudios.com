import { describe, expect, it } from 'vitest';
import { PATH, PIANO_PATH, VOICE_PATH, getLesson, isKnownLesson, needsVoiceRange } from './path';
import { RHYTHM_READING_LESSON_IDS, rhythmReadingPatterns } from './rhythm-patterns';
import { ROUTED_MODES, isPlayable } from './routing';

describe('the Read rhythms unit', () => {
  const paths = { guitar: PATH, piano: PIANO_PATH, voice: VOICE_PATH };

  it.each(Object.entries(paths))('follows Rhythm basics, with five lessons, on the %s path', (_name, path) => {
    const at = path.findIndex((u) => u.id === 'rhythm-basics');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(path[at + 1]?.id).toBe('read-rhythms');
    expect(path[at + 1]?.lessons.map((l) => l.id)).toEqual([...RHYTHM_READING_LESSON_IDS]);
    expect(path[at + 1]?.title).toBe('Read rhythms');
  });

  it('is the same unit, and the same lessons, on every path', () => {
    const unit = PATH.find((u) => u.id === 'read-rhythms');
    expect(PIANO_PATH.find((u) => u.id === 'read-rhythms')).toBe(unit);
    expect(VOICE_PATH.find((u) => u.id === 'read-rhythms')).toBe(unit);
  });

  it('is playable, known to the server, and in the rhythm-reading mode, with patterns behind it', () => {
    expect(ROUTED_MODES.has('rhythm-reading')).toBe(true);
    for (const id of RHYTHM_READING_LESSON_IDS) {
      const l = getLesson(id);
      expect(l?.mode, id).toBe('rhythm-reading');
      expect(l?.unit, id).toBe('read-rhythms');
      expect(isKnownLesson(id), id).toBe(true);
      expect(isPlayable(l), id).toBe(true);
      expect(rhythmReadingPatterns(id), id).toHaveLength(8);
    }
  });

  it('is not playable for a lesson id with no patterns', () => {
    const l = getLesson('rhythm-read-eighths');
    expect(isPlayable(l && { ...l, id: 'rhythm-read-nothing' })).toBe(false);
  });

  it('needs no voice range: a singer reaches it without choosing one', () => {
    for (const id of RHYTHM_READING_LESSON_IDS) expect(needsVoiceRange(getLesson(id)), id).toBe(false);
    for (const l of VOICE_PATH.find((u) => u.id === 'read-rhythms')?.lessons ?? []) expect(l.available).toBe(true);
  });
});

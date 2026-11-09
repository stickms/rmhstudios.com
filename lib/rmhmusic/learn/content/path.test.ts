import { describe, expect, it } from 'vitest';
import { DECKS } from './decks';
import { CHORDS } from '../theory/chords';
import { INTERVALS } from '../theory/intervals';
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
  it('ships the first-note lesson, the staff-reading lessons, the note finders, the pitch match, the ear training and playing a chord', () => {
    const available = lessons.filter((l) => l.available);
    expect(available.map((l) => l.id)).toEqual([
      'staff-what-is-a-staff',
      'staff-treble-notes',
      'staff-find-middle-c',
      'keys-layout-and-strings',
      'fretboard-first-frets',
      'play-first-note',
      'match-c',
      'match-white-keys',
      'ear-second-third',
      'ear-fifth-octave',
      'ear-major-minor',
      'chord-play-c-major',
    ]);
    expect(getLesson('keys-layout-and-strings')?.mode).toBe('keyboard-map');
    expect(getLesson('fretboard-first-frets')?.mode).toBe('fretboard');
    expect(getLesson('fretboard-first-frets')?.unit).toBe('meet-staff-and-keys');
    expect(getLesson('match-c')?.mode).toBe('match-note');
    expect(getLesson('match-white-keys')?.mode).toBe('match-note');
    expect(getLesson('match-c')?.unit).toBe('play-it-back');
    expect(getLesson('ear-second-third')?.mode).toBe('ear-interval');
    expect(getLesson('ear-fifth-octave')?.unit).toBe('train-your-ear');
    expect(getLesson('ear-major-minor')?.mode).toBe('ear-chord');
    expect(getLesson('chord-play-c-major')?.mode).toBe('play-chord');
    expect(getLesson('chord-play-c-major')?.unit).toBe('train-your-ear');
  });
  it('wires every available lesson to an activity the lesson screen runs', () => {
    const handled = new Set([
      'play-note',
      'staff-flashcards',
      'keyboard-map',
      'fretboard',
      'match-note',
      'ear-interval',
      'ear-chord',
      'play-chord',
    ]);
    for (const l of lessons.filter((x) => x.available)) {
      expect(handled.has(l.mode), `${l.id} (${l.mode})`).toBe(true);
    }
  });
  it('names an existing deck for every staff-flashcards lesson', () => {
    const flash = lessons.filter((l) => l.mode === 'staff-flashcards');
    expect(flash.length).toBeGreaterThan(0);
    for (const l of flash) {
      expect(l.deck, l.id).toBeDefined();
      expect(DECKS[l.deck ?? ''], `${l.id} -> ${l.deck}`).toBeDefined();
    }
    expect(getLesson('staff-what-is-a-staff')?.deck).toBe('treble-lines');
    expect(getLesson('staff-treble-notes')?.deck).toBe('treble-all');
    expect(getLesson('staff-find-middle-c')?.deck).toBe('middle-c');
  });
  it('gives every ear lesson a pool of answer names of its own kind', () => {
    const ear = lessons.filter((l) => l.mode === 'ear-interval' || l.mode === 'ear-chord');
    expect(ear.length).toBeGreaterThan(0);
    for (const l of ear) {
      expect(l.pool?.length, l.id).toBeGreaterThan(0);
      expect(new Set(l.pool).size, `${l.id} repeats a name`).toBe(l.pool?.length);
      const names = l.mode === 'ear-interval' ? INTERVALS : CHORDS;
      for (const name of l.pool ?? []) expect(name in names, `${l.id}: ${name}`).toBe(true);
    }
    expect(getLesson('ear-second-third')?.pool).toEqual(['second', 'third']);
    expect(getLesson('ear-fifth-octave')?.pool).toEqual(['third', 'fifth', 'octave']);
    expect(getLesson('ear-major-minor')?.pool).toEqual(['major', 'minor']);
  });
  it('gives a pool to ear lessons only', () => {
    for (const l of lessons.filter((x) => x.mode !== 'ear-interval' && x.mode !== 'ear-chord')) {
      expect(l.pool, l.id).toBeUndefined();
    }
  });
});

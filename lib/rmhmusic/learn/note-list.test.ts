import { describe, expect, it } from 'vitest';
import { isolateLtr, noteList } from './note-list';

const strip = (s: string) => s.replace(/[⁦⁩]/g, '');

describe('noteList', () => {
  it('joins names as the language joins a list, in order', () => {
    expect(strip(noteList('en', ['C', 'E', 'G']))).toBe('C, E, and G');
    expect(strip(noteList('en', ['C', 'G']))).toBe('C and G');
    expect(strip(noteList('en', ['C']))).toBe('C');
    expect(noteList('en', [])).toBe('');
  });
  it('sets every name in its own left-to-right isolate, so the connecting words stay outside', () => {
    expect(noteList('ar', ['C', 'E', 'G']).match(/⁦[^⁩]+⁩/g)).toEqual([
      isolateLtr('C'),
      isolateLtr('E'),
      isolateLtr('G'),
    ]);
    expect(noteList('en', ['F♯4'])).toBe('⁦F♯4⁩');
  });
  it('survives a language Intl does not know', () => {
    expect(strip(noteList('not a language !!', ['C', 'E']))).toMatch(/^C.*E$/);
  });
});

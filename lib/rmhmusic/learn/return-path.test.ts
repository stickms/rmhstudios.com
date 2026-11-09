import { describe, expect, it } from 'vitest';
import { rmhmusicReturnPath } from './return-path';

describe('rmhmusicReturnPath', () => {
  it('returns to a lesson the visitor asked for', () => {
    expect(rmhmusicReturnPath('/rmhmusic/lesson/play-first-note')).toBe(
      '/rmhmusic/lesson/play-first-note',
    );
    expect(rmhmusicReturnPath('/rmhmusic/lesson/play-first-note/')).toBe(
      '/rmhmusic/lesson/play-first-note',
    );
  });

  it('returns to Practice', () => {
    expect(rmhmusicReturnPath('/rmhmusic/practice')).toBe('/rmhmusic/practice');
    expect(rmhmusicReturnPath('/rmhmusic/practice/')).toBe('/rmhmusic/practice');
    expect(rmhmusicReturnPath('/rmhmusic/practice/x')).toBe('/rmhmusic');
    expect(rmhmusicReturnPath('/rmhmusic/practicex')).toBe('/rmhmusic');
  });

  it('sends everything else to the app home, never off the app', () => {
    for (const bad of [
      undefined,
      null,
      42,
      '',
      '/',
      '/rmhmusic',
      '/rmhmusic/',
      'https://evil.example/rmhmusic/lesson/x',
      '//evil.example/rmhmusic/lesson/x',
      '/rmhmusic/lesson/../../admin',
      '/rmhmusic/lesson/x?next=//evil',
      '/rmhmusicx/lesson/x',
      '/feed',
    ]) {
      expect(rmhmusicReturnPath(bad)).toBe('/rmhmusic');
    }
  });
});

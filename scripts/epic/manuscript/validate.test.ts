import { test, expect } from 'vitest';
import { validateChapter } from './validate';
import { SAMPLE_CHAPTER } from './sample';

test('accepts a well-formed chapter', () => {
  expect(() => validateChapter(SAMPLE_CHAPTER)).not.toThrow();
  expect(validateChapter(SAMPLE_CHAPTER).n).toBe(1);
});

test('rejects a chapter missing its couplet', () => {
  const bad = { ...SAMPLE_CHAPTER, couplet: undefined };
  expect(() => validateChapter(bad)).toThrow(/couplet/);
});

test('rejects a verse passage whose zh/en line counts differ', () => {
  const bad = {
    ...SAMPLE_CHAPTER,
    passages: [{ type: 'verse', zh: ['一', '二'], en: ['one'] }],
  };
  expect(() => validateChapter(bad)).toThrow(/line count/);
});

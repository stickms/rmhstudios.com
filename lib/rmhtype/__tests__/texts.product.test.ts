import { describe, expect, it } from 'vitest';
import {
  MAX_TEXTS_PER_MEMBER,
  TEXT_BODY_MAX,
  TEXT_BODY_MIN,
  TEXT_TITLE_MAX,
  beatsBest,
  normaliseTextBody,
  normaliseTextTitle,
  validateTextRun,
} from '@/lib/rmhtype/texts';

const ok = (r: { ok: boolean }) => r.ok;
const SENTENCE = 'The quick brown fox jumps over the lazy dog.';

describe('normaliseTextBody', () => {
  it('turns tabs into two spaces and line endings into \\n, and keeps line breaks', () => {
    const r = normaliseTextBody('function f() {\r\n\treturn 1;\r\n}\rend of the snippet');
    expect(r).toEqual({ ok: true, value: 'function f() {\n  return 1;\n}\nend of the snippet' });
  });

  it('trims the ends only', () => {
    expect(normaliseTextBody(`\n\n  ${SENTENCE}  \n`)).toEqual({ ok: true, value: SENTENCE });
    expect(normaliseTextBody(`first line of text\n\n  second line indented`)).toEqual({
      ok: true,
      value: 'first line of text\n\n  second line indented',
    });
  });

  it('refuses control characters, separators and bidi overrides', () => {
    for (const bad of ['\u0000', '\u0007', '\u001B', '\u007F', '\u0085', ' ', ' ', '‮', '⁦']) {
      expect(normaliseTextBody(`${SENTENCE}${bad}${SENTENCE}`), JSON.stringify(bad)).toEqual({
        ok: false,
        problem: 'control-characters',
      });
    }
  });

  it('keeps ordinary non-Latin text, emoji and punctuation', () => {
    expect(ok(normaliseTextBody('مرحبا بالعالم، هذا نص للتدريب على الكتابة.'))).toBe(true);
    expect(ok(normaliseTextBody('日本語の文章を練習します。毎日少しずつ打ちます。'))).toBe(true);
    expect(ok(normaliseTextBody(`${SENTENCE} 🙂`))).toBe(true);
  });

  it('limits the length after normalising', () => {
    expect(normaliseTextBody('x'.repeat(TEXT_BODY_MIN - 1))).toEqual({ ok: false, problem: 'too-short' });
    expect(ok(normaliseTextBody('x'.repeat(TEXT_BODY_MIN)))).toBe(true);
    expect(ok(normaliseTextBody('x'.repeat(TEXT_BODY_MAX)))).toBe(true);
    expect(normaliseTextBody('x'.repeat(TEXT_BODY_MAX + 1))).toEqual({ ok: false, problem: 'too-long' });
    // A tab counts as the two spaces it becomes.
    expect(normaliseTextBody(`a${'\t'.repeat(TEXT_BODY_MAX / 2)}b`).ok).toBe(false);
    expect(normaliseTextBody('   \n  ')).toEqual({ ok: false, problem: 'empty' });
  });
});

describe('normaliseTextTitle', () => {
  it('collapses whitespace and trims', () => {
    expect(normaliseTextTitle('  My \t speech\n draft ')).toEqual({ ok: true, value: 'My speech draft' });
  });

  it('limits to 80 characters and refuses empty or control characters', () => {
    expect(ok(normaliseTextTitle('t'.repeat(TEXT_TITLE_MAX)))).toBe(true);
    expect(normaliseTextTitle('t'.repeat(TEXT_TITLE_MAX + 1))).toEqual({ ok: false, problem: 'too-long' });
    expect(normaliseTextTitle('  \n ')).toEqual({ ok: false, problem: 'empty' });
    expect(normaliseTextTitle('bad\u0000title')).toEqual({ ok: false, problem: 'control-characters' });
  });
});

describe('limits and run rules', () => {
  it('states the spec limits', () => {
    expect(MAX_TEXTS_PER_MEMBER).toBe(50);
    expect(TEXT_TITLE_MAX).toBe(80);
    expect(TEXT_BODY_MIN).toBe(20);
    expect(TEXT_BODY_MAX).toBe(3000);
  });

  it('validateTextRun checks length, speed, accuracy and time', () => {
    const good = { wpm: 80, accuracy: 96.5, timeMs: 4_000, typedLength: 100 };
    expect(validateTextRun(good, 100)).toBe(true);
    expect(validateTextRun({ ...good, typedLength: 101 }, 100)).toBe(false);
    expect(validateTextRun({ ...good, wpm: 250 }, 100)).toBe(true);
    expect(validateTextRun({ ...good, wpm: 250.1 }, 100)).toBe(false);
    expect(validateTextRun({ ...good, accuracy: 0 }, 100)).toBe(true);
    expect(validateTextRun({ ...good, accuracy: 101 }, 100)).toBe(false);
    expect(validateTextRun({ ...good, timeMs: 1 }, 100)).toBe(true);
    expect(validateTextRun({ ...good, timeMs: 0 }, 100)).toBe(false);
    // 100 characters in 12 s is at most 100 net WPM: a claimed 150 cannot be right.
    expect(validateTextRun({ ...good, wpm: 100, timeMs: 12_000 }, 100)).toBe(true);
    expect(validateTextRun({ ...good, wpm: 150, timeMs: 12_000 }, 100)).toBe(false);
    expect(validateTextRun({ ...good, timeMs: 1.5 }, 100)).toBe(false);
    expect(validateTextRun({ ...good, wpm: Number.POSITIVE_INFINITY }, 100)).toBe(false);
  });

  it('beatsBest: the first run and any strictly faster one', () => {
    expect(beatsBest(null, 10)).toBe(true);
    expect(beatsBest(undefined, 10)).toBe(true);
    expect(beatsBest(60, 61)).toBe(true);
    expect(beatsBest(60, 60)).toBe(false);
    expect(beatsBest(60, 59)).toBe(false);
  });
});

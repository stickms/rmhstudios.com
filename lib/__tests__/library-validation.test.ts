import { describe, test, expect } from 'vitest';
import { validatePdfBuffer, validateBookFields, sanitizePages } from '@/lib/library/upload-validation';

describe('validatePdfBuffer', () => {
  test('accepts a buffer with a %PDF header', () => {
    const buf = Buffer.from('%PDF-1.7\n1 0 obj\n');
    expect(validatePdfBuffer(buf)).toEqual({ ok: true });
  });

  test('rejects a buffer without a PDF header', () => {
    const res = validatePdfBuffer(Buffer.from('not a pdf at all'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/pdf/i);
  });

  test('rejects an empty buffer', () => {
    expect(validatePdfBuffer(Buffer.alloc(0)).ok).toBe(false);
  });
});

describe('validateBookFields', () => {
  test('accepts a normal title and page count', () => {
    expect(validateBookFields({ title: 'Field Manual', pages: 12 })).toEqual({ ok: true });
  });

  test('rejects an empty/whitespace title', () => {
    const res = validateBookFields({ title: '   ', pages: 12 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/title/i);
  });

  test('rejects a title longer than 200 characters', () => {
    expect(validateBookFields({ title: 'x'.repeat(201), pages: 12 }).ok).toBe(false);
  });

  test('accepts any page count — it is cosmetic and uncapped', () => {
    expect(validateBookFields({ title: 'ok', pages: 0 }).ok).toBe(true);
    expect(validateBookFields({ title: 'ok', pages: 1_000_000 }).ok).toBe(true);
  });
});

describe('sanitizePages', () => {
  test('floors and zeroes out unknown values, with no upper bound', () => {
    expect(sanitizePages(12)).toBe(12);
    expect(sanitizePages(3.5)).toBe(3);
    expect(sanitizePages(0)).toBe(0);
    expect(sanitizePages(-4)).toBe(0);
    expect(sanitizePages(NaN)).toBe(0);
    expect(sanitizePages('17')).toBe(17);
    expect(sanitizePages(1_000_000)).toBe(1_000_000);
  });
});

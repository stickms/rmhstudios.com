import { describe, test, expect } from 'vitest';
import { validatePdfBuffer, validateBookFields } from '@/lib/library/upload-validation';

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

  test('rejects a non-positive page count', () => {
    expect(validateBookFields({ title: 'ok', pages: 0 }).ok).toBe(false);
  });

  test('rejects a non-integer page count', () => {
    expect(validateBookFields({ title: 'ok', pages: 3.5 }).ok).toBe(false);
  });

  test('rejects an absurd page count', () => {
    expect(validateBookFields({ title: 'ok', pages: 1_000_000 }).ok).toBe(false);
  });
});

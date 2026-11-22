import { describe, expect, it } from 'vitest';
import { MAX_BATCH_ITEMS, batchAuditDetail, splitLookupInput } from '@/lib/admin/lookup';

describe('splitLookupInput', () => {
  it('splits on newlines, commas and spaces and drops blanks', () => {
    expect(splitLookupInput('a, b\n\nc  d,,\r\ne')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(splitLookupInput('  \n ,, ')).toEqual([]);
  });
  it('collapses repeats at the first position', () => {
    expect(splitLookupInput('x y x z y')).toEqual(['x', 'y', 'z']);
  });
  it('keeps links and e-mail addresses whole', () => {
    expect(splitLookupInput('https://rmhstudios.com/u/alice?x=1,bob@example.com')).toEqual([
      'https://rmhstudios.com/u/alice?x=1',
      'bob@example.com',
    ]);
  });
  it('the cap is 50', () => {
    expect(MAX_BATCH_ITEMS).toBe(50);
  });
});

describe('batchAuditDetail', () => {
  it('counts kinds and matches and carries no input', () => {
    expect(
      batchAuditDetail([
        {
          inputKind: 'email',
          found: 1,
        },
        {
          inputKind: 'email',
          found: 0,
        },
        {
          inputKind: 'handle',
          found: 2,
        },
      ]),
    ).toBe('items=3 kinds=email:2,handle:1 matched=2');
  });
});

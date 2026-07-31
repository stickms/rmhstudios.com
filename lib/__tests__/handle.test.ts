import { describe, it, expect } from 'vitest';
import {
  HANDLE_BASE_MAX_LENGTH,
  HANDLE_MAX_LENGTH,
  HANDLE_REGEX,
  RESERVED_HANDLES,
  deriveHandleBase,
  isValidHandle,
  suffixHandle,
} from '@/lib/handle';

/**
 * The handle rules underpin two things that must never disagree: the signup
 * hook in lib/auth.ts and the retroactive backfill (lib/handle.server.ts +
 * the `backfill_user_handles` migration). Both lean on one invariant — that
 * `deriveHandleBase` followed by `suffixHandle` produces something
 * `handleSchema` accepts, for *any* display name — because an account whose
 * handle stays null can't be @mentioned at all.
 */
describe('deriveHandleBase', () => {
  it('slugifies an ordinary display name', () => {
    expect(deriveHandleBase('Alice Smith')).toBe('alice_smith');
  });

  it('collapses runs of punctuation into single underscores', () => {
    expect(deriveHandleBase('  ***Bob!!  ~Jones~  ')).toBe('bob_jones');
  });

  it('folds common accents instead of shredding the name', () => {
    expect(deriveHandleBase('José')).toBe('jose');
    expect(deriveHandleBase('Renée Müller')).toBe('renee_muller');
  });

  it('prefixes a letter when the name does not start with one', () => {
    expect(deriveHandleBase('123abc')).toBe('u123abc');
    expect(deriveHandleBase('42')).toBe('u42');
    // Leading underscores are stripped before the check, so this already
    // starts with a letter and needs no prefix.
    expect(deriveHandleBase('_leading')).toBe('leading');
  });

  it('falls back to a usable base for empty and unusable input', () => {
    for (const input of ['', '   ', '!!!', '???', null, undefined]) {
      const base = deriveHandleBase(input);
      expect(base).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('never exceeds the base budget, and never ends on an underscore', () => {
    const base = deriveHandleBase('a very long display name that keeps going and going');
    expect(base.length).toBeLessThanOrEqual(HANDLE_BASE_MAX_LENGTH);
    expect(base.endsWith('_')).toBe(false);
  });

  it('leaves an already-valid handle untouched', () => {
    expect(deriveHandleBase('alice_smith')).toBe('alice_smith');
  });
});

describe('suffixHandle', () => {
  it('appends a four-digit suffix', () => {
    expect(suffixHandle('alice', () => 0)).toBe('alice_1000');
    expect(suffixHandle('alice', () => 0.99999)).toBe('alice_9999');
  });

  it('stays inside the handle length limit for a maximal base', () => {
    const base = deriveHandleBase('x'.repeat(60));
    expect(suffixHandle(base, () => 0.5).length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
  });
});

describe('generated handles are always valid', () => {
  const names = [
    'Alice Smith',
    'José',
    'Renée Müller',
    '123',
    '!!!',
    '',
    '   ',
    '_',
    '__x__',
    'a',
    'ab',
    'ADMIN',
    'admin',
    'null',
    'a very long display name that keeps going and going',
    '🎉🎉🎉',
    '日本語のなまえ',
    'user@example.com',
    'x'.repeat(200),
  ];

  it.each(names)('suffixed handle for %j satisfies every rule', (name) => {
    const suffixed = suffixHandle(deriveHandleBase(name));
    expect(suffixed).toMatch(HANDLE_REGEX);
    expect(suffixed.length).toBeLessThanOrEqual(HANDLE_MAX_LENGTH);
    // A suffixed handle can never collide with a reserved word, since every
    // reserved word is suffix-free.
    expect(RESERVED_HANDLES.has(suffixed)).toBe(false);
    expect(isValidHandle(suffixed)).toBe(true);
  });
});

describe('isValidHandle', () => {
  it('rejects reserved handles', () => {
    for (const reserved of RESERVED_HANDLES) expect(isValidHandle(reserved)).toBe(false);
  });

  it('rejects handles that break the charset or length rules', () => {
    for (const bad of ['ab', 'Alice', 'alice-smith', '1alice', '_alice', 'a'.repeat(21), '']) {
      expect(isValidHandle(bad)).toBe(false);
    }
  });

  it('accepts ordinary handles', () => {
    for (const good of ['alice', 'alice_smith', 'a1b', 'u123abc', 'a'.repeat(20)]) {
      expect(isValidHandle(good)).toBe(true);
    }
  });
});

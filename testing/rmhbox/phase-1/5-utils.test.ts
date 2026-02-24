/**
 * Phase 1 — Section 5: Shared Utilities
 *
 * Tests sanitizeString() and generateRoomCode() functions.
 */

import { describe, it, expect } from 'vitest';
import { sanitizeString, generateRoomCode } from '../../../lib/rmhbox/utils';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '../../../lib/rmhbox/constants';

describe('sanitizeString', () => {
  it('should return trimmed string', () => {
    expect(sanitizeString('  hello  ', 100)).toBe('hello');
  });

  it('should strip HTML-dangerous characters', () => {
    expect(sanitizeString('<script>alert("xss")</script>', 100)).toBe('scriptalert(xss)/script');
  });

  it('should strip angle brackets', () => {
    expect(sanitizeString('a<b>c', 100)).toBe('abc');
  });

  it('should strip ampersand', () => {
    expect(sanitizeString('a&b', 100)).toBe('ab');
  });

  it('should strip double quotes', () => {
    expect(sanitizeString('a"b', 100)).toBe('ab');
  });

  it('should strip single quotes', () => {
    expect(sanitizeString("a'b", 100)).toBe('ab');
  });

  it('should truncate to maxLength', () => {
    expect(sanitizeString('abcdefghij', 5)).toBe('abcde');
  });

  it('should return empty string for non-string input', () => {
    expect(sanitizeString(123, 100)).toBe('');
    expect(sanitizeString(null, 100)).toBe('');
    expect(sanitizeString(undefined, 100)).toBe('');
    expect(sanitizeString({}, 100)).toBe('');
    expect(sanitizeString([], 100)).toBe('');
  });

  it('should return empty string for empty input', () => {
    expect(sanitizeString('', 100)).toBe('');
  });

  it('should handle whitespace-only input', () => {
    expect(sanitizeString('   ', 100)).toBe('');
  });

  it('should preserve safe characters', () => {
    expect(sanitizeString('Hello World 123!@#$%', 100)).toBe('Hello World 123!@#$%');
  });

  it('should handle mixed dangerous and safe characters', () => {
    expect(sanitizeString('Hello <world> & "everyone"', 100)).toBe('Hello world  everyone');
  });

  it('should strip HTML then truncate', () => {
    // After stripping <>&"': 'scriptalert(xss)/script' = 23 chars
    const result = sanitizeString('<script>alert("xss")</script>', 10);
    expect(result).toBe('scriptaler');
    expect(result.length).toBeLessThanOrEqual(10);
  });
});

describe('generateRoomCode', () => {
  it('should generate a code of ROOM_CODE_LENGTH characters', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
  });

  it('should only contain characters from the room code alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      for (const char of code) {
        expect(ROOM_CODE_ALPHABET).toContain(char);
      }
    }
  });

  it('should not contain ambiguous characters (I, O, 0, 1)', () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode();
      expect(code).not.toMatch(/[IO01]/);
    }
  });

  it('should generate unique codes (statistical check)', () => {
    const codes = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      codes.add(generateRoomCode());
    }
    // With 30^6 ≈ 729 million possible codes, 1000 should all be unique
    expect(codes.size).toBe(1000);
  });

  it('should generate uppercase alphanumeric codes', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z2-9]+$/);
    }
  });
});

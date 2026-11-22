import { describe, expect, it } from 'vitest';
import { convertCase, splitWords } from '@/lib/toolbox/case';

describe('splitWords', () => {
  it('splits camel, acronyms, digits and separators', () => {
    expect(splitWords('parseHTTPResponse2')).toEqual(['parse', 'HTTP', 'Response', '2']);
    expect(splitWords('PARSE_HTTP_RESPONSE_2')).toEqual(['PARSE', 'HTTP', 'RESPONSE', '2']);
    expect(splitWords('  hello -- world.js ')).toEqual(['hello', 'world', 'js']);
    expect(splitWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(splitWords('')).toEqual([]);
  });

  it('keeps non-Latin letters', () => {
    expect(splitWords('größeÄnderung')).toEqual(['größe', 'Änderung']);
  });
});

describe('convertCase', () => {
  const input = 'user profile ID';
  it.each([
    ['camel', 'userProfileId'],
    ['pascal', 'UserProfileId'],
    ['snake', 'user_profile_id'],
    ['kebab', 'user-profile-id'],
    ['constant', 'USER_PROFILE_ID'],
    ['dot', 'user.profile.id'],
    ['path', 'user/profile/id'],
    ['title', 'User Profile Id'],
    ['sentence', 'User profile id'],
    ['lower', 'user profile id'],
    ['upper', 'USER PROFILE ID'],
  ] as const)('%s', (style, expected) => {
    expect(convertCase(input, style)).toBe(expected);
  });

  it('round-trips between styles', () => {
    expect(convertCase(convertCase('fooBarBaz', 'snake'), 'camel')).toBe('fooBarBaz');
  });

  it('converts each line on its own and keeps blank lines', () => {
    expect(convertCase('first name\n\nlast name', 'kebab')).toBe('first-name\n\nlast-name');
  });

  it('uses the locale for case mapping', () => {
    expect(convertCase('istanbul', 'upper', 'tr')).toBe('İSTANBUL');
  });
});

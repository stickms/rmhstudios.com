/**
 * Password and passphrase generation, and a strength estimate for a password
 * someone already has.
 *
 * Generation uses `randomInt` (crypto, rejection-sampled), so every character
 * and word is equally likely; the entropy shown is exact for what was
 * generated. The estimate for a typed password is necessarily a guess: it
 * scores the character classes used, then takes off for the patterns cracking
 * tools try first (repeats, sequences, keyboard rows, common passwords).
 */

import { randomInt, secureShuffle, type WordSource, cryptoWords } from '@/lib/toolbox/random';

export const CHARSETS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!#$%&*+-=?@^_~.,:;',
} as const;

export type CharsetName = keyof typeof CHARSETS;

/** Characters easily misread for each other in many fonts. */
export const AMBIGUOUS = 'Il1O0o';

export interface PasswordOptions {
  length: number;
  sets: readonly CharsetName[];
  excludeAmbiguous: boolean;
}

export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 128;

function pools(opts: PasswordOptions): string[] {
  return opts.sets
    .map((name) => [...CHARSETS[name]].filter((c) => !opts.excludeAmbiguous || !AMBIGUOUS.includes(c)).join(''))
    .filter(Boolean);
}

/**
 * A password with at least one character from every chosen set (sites often
 * require that), the rest drawn from all of them, then shuffled so the required
 * characters are not always first.
 */
export function generatePassword(opts: PasswordOptions, source: WordSource = cryptoWords): string {
  const sets = pools(opts);
  if (sets.length === 0) throw new RangeError('generatePassword: choose at least one character set');
  const length = Math.max(MIN_PASSWORD_LENGTH, Math.min(MAX_PASSWORD_LENGTH, Math.floor(opts.length)), sets.length);
  const all = sets.join('');
  const chars = sets.map((set) => set.charAt(randomInt(set.length, source)));
  while (chars.length < length) chars.push(all.charAt(randomInt(all.length, source)));
  return secureShuffle(chars, source).join('');
}

/**
 * Entropy of a generated password, in bits. Requiring one character per set
 * removes a sliver of the space; the figure ignores that, which overstates the
 * strength by well under a bit for any sensible length.
 */
export function passwordEntropy(opts: PasswordOptions): number {
  const size = pools(opts).join('').length;
  return size > 1 ? opts.length * Math.log2(size) : 0;
}

export interface PassphraseOptions {
  words: number;
  separator: string;
  capitalize: boolean;
  /** Append one random digit to one word, for sites that demand a number. */
  addDigit: boolean;
}

export const MIN_WORDS = 3;
export const MAX_WORDS = 12;

export function generatePassphrase(
  opts: PassphraseOptions,
  list: readonly string[],
  source: WordSource = cryptoWords,
): string {
  const n = Math.max(MIN_WORDS, Math.min(MAX_WORDS, Math.floor(opts.words)));
  const words = Array.from({ length: n }, () => list[randomInt(list.length, source)] ?? '');
  const shaped = opts.capitalize ? words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)) : words;
  if (opts.addDigit) {
    const i = randomInt(n, source);
    shaped[i] = `${shaped[i] ?? ''}${randomInt(10, source)}`;
  }
  return shaped.join(opts.separator);
}

export function passphraseEntropy(opts: PassphraseOptions, listSize: number): number {
  const n = Math.max(MIN_WORDS, Math.min(MAX_WORDS, Math.floor(opts.words)));
  return n * Math.log2(listSize) + (opts.addDigit ? Math.log2(n * 10) : 0);
}

export type Strength = 'very-weak' | 'weak' | 'fair' | 'strong' | 'very-strong';

/** Bits to rating: under 28 is crackable in moments, 60+ resists an offline attack for years, 80+ is ample. */
export function rateEntropy(bits: number): Strength {
  if (bits < 28) return 'very-weak';
  if (bits < 40) return 'weak';
  if (bits < 60) return 'fair';
  if (bits < 80) return 'strong';
  return 'very-strong';
}

const COMMON = new Set([
  'password',
  '123456',
  '12345678',
  'qwerty',
  'abc123',
  'letmein',
  'welcome',
  'monkey',
  'dragon',
  'football',
  'iloveyou',
  'admin',
  'login',
  'master',
  'sunshine',
  'princess',
  'shadow',
  'passw0rd',
  'trustno1',
  'baseball',
]);

const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', 'abcdefghijklmnopqrstuvwxyz'];

export interface StrengthEstimate {
  bits: number;
  strength: Strength;
  warnings: ('common' | 'repeats' | 'sequence' | 'short')[];
}

/** A rough strength estimate for a password the user typed. */
export function estimateStrength(password: string): StrengthEstimate {
  const warnings: StrengthEstimate['warnings'] = [];
  if (!password) return { bits: 0, strength: 'very-weak', warnings };
  let pool = 0;
  if (/[a-z]/.test(password)) pool += 26;
  if (/[A-Z]/.test(password)) pool += 26;
  if (/\d/.test(password)) pool += 10;
  if (/[^A-Za-z0-9]/.test(password)) pool += 33;
  const chars = [...password];
  // Each run of a repeated character, or of a keyboard/alphabet sequence, counts as about one character.
  let effective = chars.length;
  const lower = password.toLowerCase();
  let repeats = 0;
  let sequences = 0;
  for (let i = 2; i < chars.length; i++) {
    if (chars[i] === chars[i - 1] && chars[i] === chars[i - 2]) repeats++;
    const tri = lower.slice(i - 2, i + 1);
    if (tri.length === 3 && ROWS.some((row) => row.includes(tri) || [...row].reverse().join('').includes(tri)))
      sequences++;
  }
  effective -= repeats + sequences;
  if (repeats) warnings.push('repeats');
  if (sequences) warnings.push('sequence');
  const stripped = lower.replace(/[^a-z0-9]/g, '').replace(/\d+$/, '');
  if (COMMON.has(lower) || COMMON.has(stripped)) {
    warnings.push('common');
    return { bits: Math.min(10, effective), strength: 'very-weak', warnings };
  }
  if (chars.length < 8) warnings.push('short');
  const bits = Math.max(0, effective) * Math.log2(Math.max(pool, 2));
  return { bits, strength: rateEntropy(bits), warnings };
}

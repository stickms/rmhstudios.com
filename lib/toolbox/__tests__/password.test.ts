import { describe, expect, it } from 'vitest';
import { PASSPHRASE_WORDS } from '@/lib/toolbox/password-words';
import {
  AMBIGUOUS,
  CHARSETS,
  estimateStrength,
  generatePassphrase,
  generatePassword,
  passphraseEntropy,
  passwordEntropy,
  rateEntropy,
} from '@/lib/toolbox/password';
import { seededWords } from '@/lib/toolbox/random';

describe('generatePassword', () => {
  it('has the length and includes every chosen set', () => {
    for (let seed = 1; seed < 50; seed++) {
      const p = generatePassword({ length: 12, sets: ['lower', 'upper', 'digits', 'symbols'], excludeAmbiguous: false }, seededWords(seed));
      expect(p).toHaveLength(12);
      for (const set of Object.values(CHARSETS)) expect([...p].some((c) => set.includes(c))).toBe(true);
    }
  });

  it('leaves out ambiguous characters and unchosen sets', () => {
    for (let seed = 1; seed < 30; seed++) {
      const p = generatePassword({ length: 64, sets: ['upper', 'digits'], excludeAmbiguous: true }, seededWords(seed));
      expect([...p].some((c) => AMBIGUOUS.includes(c))).toBe(false);
      expect(p).toMatch(/^[A-Z0-9]+$/);
    }
  });

  it('refuses an empty selection and clamps the length', () => {
    expect(() => generatePassword({ length: 10, sets: [], excludeAmbiguous: false })).toThrow(RangeError);
    expect(generatePassword({ length: 1, sets: ['lower'], excludeAmbiguous: false })).toHaveLength(4);
    expect(generatePassword({ length: 1000, sets: ['lower'], excludeAmbiguous: false })).toHaveLength(128);
  });

  it('reports exact entropy', () => {
    expect(passwordEntropy({ length: 10, sets: ['digits'], excludeAmbiguous: false })).toBeCloseTo(10 * Math.log2(10));
    expect(passwordEntropy({ length: 16, sets: ['lower', 'upper', 'digits'], excludeAmbiguous: false })).toBeCloseTo(16 * Math.log2(62));
  });
});

describe('passphrases', () => {
  it('uses a large list of unique, lowercase words', () => {
    expect(PASSPHRASE_WORDS.length).toBeGreaterThan(700);
    expect(new Set(PASSPHRASE_WORDS).size).toBe(PASSPHRASE_WORDS.length);
    for (const w of PASSPHRASE_WORDS) expect(w).toMatch(/^[a-z]{2,9}$/);
  });

  it('joins the requested number of words', () => {
    const p = generatePassphrase({ words: 5, separator: '-', capitalize: true, addDigit: true }, PASSPHRASE_WORDS, seededWords(9));
    const parts = p.split('-');
    expect(parts).toHaveLength(5);
    for (const part of parts) expect(part).toMatch(/^[A-Z][a-z]+\d?$/);
    expect(parts.filter((x) => /\d$/.test(x))).toHaveLength(1);
  });

  it('computes entropy from the list size', () => {
    expect(passphraseEntropy({ words: 6, separator: ' ', capitalize: false, addDigit: false }, 1024)).toBe(60);
  });
});

describe('estimateStrength', () => {
  it('rates common, short and patterned passwords low', () => {
    expect(estimateStrength('password1')).toMatchObject({ strength: 'very-weak', warnings: ['common'] });
    expect(estimateStrength('aaaaaaaa').warnings).toContain('repeats');
    expect(estimateStrength('qwertyui').warnings).toContain('sequence');
    expect(estimateStrength('Ab1!').warnings).toContain('short');
    expect(estimateStrength('').bits).toBe(0);
  });

  it('rates a long random password highly', () => {
    expect(estimateStrength('vR7#kq2!Lm9@xZ4$').strength).toBe('very-strong');
  });

  it('maps bits to ratings', () => {
    expect(rateEntropy(20)).toBe('very-weak');
    expect(rateEntropy(50)).toBe('fair');
    expect(rateEntropy(90)).toBe('very-strong');
  });
});

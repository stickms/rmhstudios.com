import { describe, it, expect } from 'vitest';
import {
  boundedEditDistance,
  CONFIDENCE,
  confidenceOf,
  diceCoefficient,
  MATCH_FLOOR,
  scoreField,
  scoreRecord,
  tokenSimilarity,
  withPopularity,
  withRecency,
} from '../score';
import { normalizeQuery } from '../normalize';

const q = normalizeQuery;

describe('boundedEditDistance', () => {
  it('charges a transposition one edit, not two', () => {
    // The single most common real typo. Plain Levenshtein scores it 2, which
    // pushed "jhon" out of range for "john".
    expect(boundedEditDistance('jhon', 'john', 3)).toBe(1);
  });

  it('counts ordinary edits', () => {
    expect(boundedEditDistance('kitten', 'sitting', 5)).toBe(3);
    expect(boundedEditDistance('same', 'same', 2)).toBe(0);
  });

  it('bails out past the bound instead of finishing the matrix', () => {
    expect(boundedEditDistance('abcdefgh', 'zzzz', 2)).toBeGreaterThan(2);
  });
});

describe('diceCoefficient', () => {
  it('is 1 for identical strings and 0 for disjoint ones', () => {
    expect(diceCoefficient('kowloon', 'kowloon')).toBe(1);
    expect(diceCoefficient('abc', 'xyz')).toBe(0);
  });
});

describe('tokenSimilarity', () => {
  it('caps single-character queries so "a" cannot flood results', () => {
    expect(tokenSimilarity('a', 'alexander')).toBeLessThanOrEqual(0.55);
  });

  it('rewards a longer shared prefix more', () => {
    expect(tokenSimilarity('alexa', 'alexander')).toBeGreaterThan(
      tokenSimilarity('al', 'alexander'),
    );
  });
});

describe('scoreField — the display-name cases that used to return nothing', () => {
  it('finds a long display name from its first word', () => {
    // `similarity('john', 'johnathan alexander smith')` is ~0.14 in Postgres —
    // below the 0.3 trigram threshold, so this person was simply unfindable.
    const { score } = scoreField(q('john'), 'Johnathan Alexander Smith');
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE.high);
  });

  it('finds a long display name from its last word', () => {
    const { score, reason } = scoreField(q('smith'), 'Johnathan Alexander Smith');
    expect(reason).toBe('word');
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE.high);
  });

  it('finds a display name from a middle-word prefix', () => {
    const { score, reason } = scoreField(q('alex'), 'Johnathan Alexander Smith');
    expect(reason).toBe('word-prefix');
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE.high);
  });

  it('survives a transposed letter', () => {
    const { score } = scoreField(q('jhon smith'), 'John Smith');
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE.high);
  });

  it('matches an accented name typed without accents', () => {
    const { score } = scoreField(q('jose garcia'), 'José García');
    expect(score).toBe(1);
    expect(scoreField(q('jose'), 'José García').score).toBeGreaterThanOrEqual(CONFIDENCE.high);
  });

  it('resolves an acronym to the name it abbreviates', () => {
    const { score, reason } = scoreField(q('rs'), 'RMH Studios');
    expect(reason).toBe('acronym');
    expect(score).toBeGreaterThanOrEqual(CONFIDENCE.medium);
  });

  it('scores an exact match 1', () => {
    expect(scoreField(q('ada lovelace'), 'Ada Lovelace').score).toBe(1);
  });

  it('rejects unrelated text', () => {
    expect(scoreField(q('zebra'), 'Ada Lovelace').score).toBeLessThan(MATCH_FLOOR);
  });

  it('ignores empty inputs', () => {
    expect(scoreField('', 'Ada').score).toBe(0);
    expect(scoreField(q('ada'), null).score).toBe(0);
    expect(scoreField(q('ada'), '!!!').score).toBe(0);
  });
});

describe('scoreRecord', () => {
  const NAME = 1;
  const BIO = 0.45;

  it('ranks a name match above a bio match', () => {
    const byName = scoreRecord(q('ada'), [
      { value: 'Ada Lovelace', weight: NAME },
      { value: 'writes about computers', weight: BIO },
    ]);
    const byBio = scoreRecord(q('ada'), [
      { value: 'Bob', weight: NAME },
      { value: 'ada ada ada', weight: BIO },
    ]);
    expect(byName.score).toBeGreaterThan(byBio.score);
  });

  it('takes the best field rather than summing, so repetition cannot win', () => {
    const single = scoreRecord(q('ada'), [{ value: 'Ada', weight: NAME }]);
    const repeated = scoreRecord(q('ada'), [
      { value: 'Ada', weight: NAME },
      { value: 'ada ada ada ada', weight: BIO },
    ]);
    // Corroboration adds a sliver; it must not double the score.
    expect(repeated.score - single.score).toBeLessThanOrEqual(0.06);
    expect(repeated.score).toBeGreaterThanOrEqual(single.score);
  });

  it('returns nothing when no field clears the floor', () => {
    expect(scoreRecord(q('zebra'), [{ value: 'Ada Lovelace', weight: NAME }])).toEqual({
      score: 0,
      reason: 'none',
    });
  });
});

describe('tiebreakers stay tiebreakers', () => {
  it('popularity cannot promote a weak match past a strong one', () => {
    const wildlyPopular = withPopularity(0.5, 5_000_000);
    expect(wildlyPopular).toBeLessThan(0.6);
    expect(wildlyPopular).toBeGreaterThan(0.5);
  });

  it('recency decays and never applies to a zero score', () => {
    const fresh = withRecency(0.5, new Date());
    const old = withRecency(0.5, new Date(Date.now() - 400 * 86_400_000));
    expect(fresh).toBeGreaterThan(old);
    expect(old).toBe(0.5);
    expect(withRecency(0, new Date())).toBe(0);
    expect(withRecency(0.5, null)).toBe(0.5);
  });
});

describe('confidenceOf', () => {
  it('bands the shared scale', () => {
    expect(confidenceOf(1)).toBe('high');
    expect(confidenceOf(CONFIDENCE.high)).toBe('high');
    expect(confidenceOf(CONFIDENCE.medium)).toBe('medium');
    expect(confidenceOf(0.1)).toBe('low');
  });
});

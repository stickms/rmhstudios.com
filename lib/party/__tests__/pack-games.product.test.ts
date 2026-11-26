import { describe, expect, it } from 'vitest';
import {
  PACK_GAME_RULES,
  isPackGame,
  normalizeSentence,
  parseIdentityLine,
  parsePackLines,
  parsePackText,
  usablePackLines,
} from '../pack-games';
import { PACK_GAMES } from '../packs';
import { createPackSchema } from '../packs-schema';

const identities = (n: number) => Array.from({ length: n }, (_, i) => `Person Number ${i + 1}`);
const sentences = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `sentence number ${'abcdefghijklmnopqrstuvwxyz'[i % 26]} for pack ${'xyz'[i % 3]}`.replace(/\d/g, ''),
  );

describe('pack games', () => {
  it('lists the three games, each with a minimum and the shared maximum', () => {
    expect([...PACK_GAMES]).toEqual(['wit-war', 'identity-crisis', 'human-keyboard']);
    expect(PACK_GAME_RULES['identity-crisis']).toEqual({ min: 20, max: 60 });
    expect(PACK_GAME_RULES['human-keyboard']).toEqual({ min: 12, max: 60 });
    expect(PACK_GAME_RULES['wit-war']).toEqual({ min: 12, max: 60 });
    expect(isPackGame('human-keyboard')).toBe(true);
    expect(isPackGame('toString')).toBe(false);
    expect(isPackGame(3)).toBe(false);
  });
});

describe('identity-crisis lines', () => {
  it('reads a name with aliases after a bar and stores one canonical form', () => {
    const p = parsePackText('identity-crisis', '  Ada   Lovelace |Lovelace|  Countess of Lovelace ');
    expect(p.errors).toEqual([]);
    expect(p.lines).toEqual(['Ada Lovelace | Lovelace | Countess of Lovelace']);
    expect(parseIdentityLine(p.lines[0]!)).toEqual({
      name: 'Ada Lovelace',
      aliases: ['Lovelace', 'Countess of Lovelace'],
    });
  });

  it('drops empty aliases and keeps a plain name as a name with no aliases', () => {
    const p = parsePackText('identity-crisis', 'Grace Hopper | | \nAlan Turing');
    expect(p.lines).toEqual(['Grace Hopper', 'Alan Turing']);
    expect(parseIdentityLine('Alan Turing')).toEqual({ name: 'Alan Turing', aliases: [] });
  });

  it('refuses a name under 2 or over 60 characters, and bad aliases, with the line number', () => {
    const text = [
      'A',
      'Fine Name',
      'x'.repeat(61),
      'Ok Name | B',
      `Ok Name Two | ${'y'.repeat(61)}`,
      'N | a | b | c | d | e | f',
    ].join('\n');
    const p = parsePackText('identity-crisis', text);
    expect(p.errors).toEqual([
      { line: 1, code: 'too-short', limit: 2 },
      { line: 3, code: 'too-long', limit: 60 },
      { line: 4, code: 'alias-too-short', limit: 2 },
      { line: 5, code: 'alias-too-long', limit: 60 },
      { line: 6, code: 'too-short', limit: 2 },
    ]);
    expect(p.lines).toEqual(['Fine Name']);
  });

  it('refuses more than 5 aliases', () => {
    const p = parsePackText('identity-crisis', 'Name | aa | bb | cc | dd | ee | ff');
    expect(p.errors).toEqual([{ line: 1, code: 'too-many-aliases', limit: 5 }]);
  });

  it('counts blank lines in the line numbers and counts a repeated name once', () => {
    const p = parsePackText('identity-crisis', 'Ada Lovelace\n\n\nB\nada lovelace | Ada');
    expect(p.errors).toEqual([{ line: 4, code: 'too-short', limit: 2 }]);
    expect(p.lines).toEqual(['Ada Lovelace']);
    expect(p.duplicates).toBe(1);
  });

  it('needs 20 identities and at most 60', () => {
    expect(parsePackLines('identity-crisis', identities(19)).ok).toBe(false);
    expect(parsePackLines('identity-crisis', identities(20)).ok).toBe(true);
    expect(parsePackLines('identity-crisis', identities(60)).ok).toBe(true);
    const many = parsePackLines('identity-crisis', identities(61));
    expect(many.tooMany).toBe(true);
    expect(many.ok).toBe(false);
  });

  it('a line that is not a usable identity is not parsed', () => {
    expect(parseIdentityLine('x')).toBeNull();
    expect(parseIdentityLine('Name | a')).toBeNull();
  });
});

describe('human-keyboard lines', () => {
  it('normalises to lowercase letters and single spaces', () => {
    expect(normalizeSentence('  The Quick, BROWN fox -- jumps!  ')).toBe('the quick brown fox jumps');
    expect(normalizeSentence('Crème brûlée à la façon')).toBe('creme brulee a la facon');
    expect(normalizeSentence("it's 2 o'clock")).toBe('it s o clock');
    expect(normalizeSentence('1234 !!! ???')).toBe('');
  });

  it('stores the normalised sentence and refuses a line outside 20 to 60 characters after normalising', () => {
    const p = parsePackText(
      'human-keyboard',
      ['The Quick Brown Fox Jumps!', 'too short', 'a'.repeat(61), 'Exactly twenty chars'].join('\n'),
    );
    expect(p.lines).toEqual(['the quick brown fox jumps', 'exactly twenty chars']);
    expect(p.errors).toEqual([
      { line: 2, code: 'too-short', limit: 20 },
      { line: 3, code: 'too-long', limit: 60 },
    ]);
  });

  it('refuses a line that normalises to nothing, with its line number', () => {
    const p = parsePackText(
      'human-keyboard',
      'the quick brown fox jumps\n\n12345 !!! ???\nanother usable sentence here',
    );
    expect(p.errors).toEqual([{ line: 3, code: 'empty-after-normalising' }]);
    expect(p.lines).toHaveLength(2);
  });

  it('counts two lines that normalise the same once', () => {
    const p = parsePackText('human-keyboard', 'The quick brown fox jumps\nthe QUICK brown fox, jumps.');
    expect(p.lines).toEqual(['the quick brown fox jumps']);
    expect(p.duplicates).toBe(1);
  });

  it('needs 12 sentences', () => {
    const twelve = sentences(12);
    expect(new Set(twelve).size).toBe(12);
    expect(parsePackLines('human-keyboard', twelve.slice(0, 11)).ok).toBe(false);
    expect(parsePackLines('human-keyboard', twelve).ok).toBe(true);
  });
});

describe('wit-war lines (unchanged rules)', () => {
  it('keeps 8 to 120 characters and 12 distinct prompts', () => {
    const p = parsePackText(
      'wit-war',
      ['short', 'x'.repeat(121), ...Array.from({ length: 12 }, (_, i) => `Prompt number ${i}`)].join('\n'),
    );
    expect(p.errors).toEqual([
      { line: 1, code: 'too-short', limit: 8 },
      { line: 2, code: 'too-long', limit: 120 },
    ]);
    expect(p.lines).toHaveLength(12);
    expect(p.ok).toBe(false);
  });
});

describe('the create schema', () => {
  const body = (game: string, prompts: string[]) => ({ name: 'My pack', game, prompts });

  it('accepts 25 identities for identity-crisis and 12 sentences for human-keyboard', () => {
    expect(createPackSchema.safeParse(body('identity-crisis', identities(25))).success).toBe(true);
    expect(createPackSchema.safeParse(body('human-keyboard', sentences(12))).success).toBe(true);
  });

  it('refuses a list below the game minimum and an unusable line by its position', () => {
    expect(createPackSchema.safeParse(body('identity-crisis', identities(12))).success).toBe(false);
    const r = createPackSchema.safeParse(body('human-keyboard', ['12345 !!!', ...sentences(12)]));
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['prompts', 0]);
  });

  it('refuses a game that is not a pack game', () => {
    expect(createPackSchema.safeParse(body('chess', identities(25))).success).toBe(false);
  });

  it('defaults to wit-war', () => {
    const r = createPackSchema.safeParse({
      name: 'My pack',
      prompts: Array.from({ length: 12 }, (_, i) => `Prompt number ${i}`),
    });
    expect(r.success && r.data.game).toBe('wit-war');
  });
});

describe('what the hub loads', () => {
  it('re-reads stored lines, drops the bad ones and repeats, and keeps only a pack still above the minimum', () => {
    const stored = [...identities(20), 'x', 42, null, 'Person Number 1'];
    const lines = usablePackLines('identity-crisis', stored);
    expect(lines).toHaveLength(20);
    expect(usablePackLines('identity-crisis', [...identities(19), 'x'])).toBeNull();
    expect(usablePackLines('human-keyboard', ['Not Normalised Sentence Here', ...sentences(11)])?.[0]).toBe(
      'not normalised sentence here',
    );
  });
});

describe('member text other players read', () => {
  it('removes control characters and invisible direction controls from names, aliases and prompts', () => {
    const name = parsePackText('identity-crisis', 'Ada\u0000 ‮Lovelace‬ | Love⁦lace⁩\u0007');
    expect(name.lines).toEqual(['Ada Lovelace | Lovelace']);
    const prompt = parsePackText('wit-war', 'The worst\tthing‏ to say\u0085 at dinner');
    expect(prompt.lines).toEqual(['The worst thing to say at dinner']);
    expect(parseIdentityLine('‮‮ | Ada')).toBeNull();
  });

  it('tells a line over the raw cap the game’s own limit', () => {
    const parsed = parsePackText('wit-war', 'x'.repeat(401));
    expect(parsed.errors).toEqual([{ line: 1, code: 'too-long', limit: 120 }]);
  });
});

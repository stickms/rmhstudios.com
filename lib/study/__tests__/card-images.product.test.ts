/**
 * Pictures on flashcards (s08-15), the pure rules: the description and cloze rules, which addresses count as
 * flashcard pictures, how a generated sibling reads its source's, the hash part, the JSON export and import round
 * trip, and the picture a practice-test prompt carries.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_CARD_IMAGES,
  cardImageProblem,
  fromColumns,
  hasPictures,
  isCardImageUrl,
  normalizePictures,
  pictureHashInput,
  pictureUrls,
  picturesOfRow,
  toColumns,
} from '@/lib/study/card-images';
import { buildExport, toCsv, toTsv } from '@/lib/study/export';
import { parseCards, parseDeckJson } from '@/lib/study/import';
import { buildTest, type TestCard } from '@/lib/study/practice-test';

const url = (n: string) => `/api/feed/image/${n}.webp`;
const img = (n: string, alt = 'A heart cut in half') => ({ url: url(n), alt });

describe('the cap', () => {
  it('is 500 cards', () => expect(MAX_CARD_IMAGES).toBe(500));
});

describe('cardImageProblem', () => {
  it('accepts no picture and a described picture', () => {
    expect(cardImageProblem('basic', {})).toBeNull();
    expect(cardImageProblem('basic', { frontImage: img('a'), backImage: img('b') })).toBeNull();
  });

  it('requires a description on each side, after trimming', () => {
    expect(cardImageProblem('basic', { frontImage: img('a', '  ') })).toEqual({ code: 'ALT_REQUIRED', side: 'front' });
    expect(cardImageProblem('basic', { frontImage: img('a'), backImage: img('b', '') })).toEqual({
      code: 'ALT_REQUIRED',
      side: 'back',
    });
  });

  it('caps the description at 1,000 characters', () => {
    expect(cardImageProblem('basic', { backImage: img('a', 'x'.repeat(1000)) })).toBeNull();
    expect(cardImageProblem('basic', { backImage: img('a', 'x'.repeat(1001)) })).toEqual({
      code: 'ALT_TOO_LONG',
      side: 'back',
    });
  });

  it('refuses a cloze front picture and allows a cloze back picture', () => {
    expect(cardImageProblem('cloze', { frontImage: img('a') })).toEqual({ code: 'CLOZE_FRONT', side: 'front' });
    expect(cardImageProblem('cloze', { backImage: img('a') })).toBeNull();
    expect(cardImageProblem('reversible', { frontImage: img('a') })).toBeNull();
  });

  it('refuses an address the flashcard surface cannot have stored', () => {
    expect(cardImageProblem('basic', { frontImage: { url: 'https://evil.test/a.png', alt: 'x' } })).toEqual({
      code: 'URL_INVALID',
      side: 'front',
    });
  });
});

describe('isCardImageUrl', () => {
  it('takes the site’s image proxy and the CDN’s feed space, nothing else', () => {
    expect(isCardImageUrl('/api/feed/image/user-1-2.webp')).toBe(true);
    expect(isCardImageUrl('/api/feed/image/../secret')).toBe(false);
    expect(isCardImageUrl('/api/feed/image/a/b.webp')).toBe(false);
    expect(isCardImageUrl('https://cdn.example.test/rmharks/user-1-2.webp', 'https://cdn.example.test')).toBe(true);
    expect(isCardImageUrl('https://cdn.example.test/other/x.webp', 'https://cdn.example.test')).toBe(false);
    expect(isCardImageUrl('https://cdn.example.test/rmharks/x.webp', '')).toBe(false);
    expect(isCardImageUrl('javascript:alert(1)')).toBe(false);
    expect(isCardImageUrl('')).toBe(false);
    expect(isCardImageUrl(`/api/feed/image/${'a'.repeat(500)}`)).toBe(false);
  });
});

describe('columns', () => {
  it('round-trips through the four columns and trims descriptions', () => {
    expect(toColumns({ frontImage: img('a', ' hi '), backImage: null })).toEqual({
      frontImageUrl: url('a'),
      frontImageAlt: 'hi',
      backImageUrl: null,
      backImageAlt: null,
    });
    expect(fromColumns(toColumns({ backImage: img('b') }))).toEqual({ frontImage: null, backImage: img('b') });
    expect(normalizePictures({ frontImage: img('a', ' x ') }).frontImage?.alt).toBe('x');
  });

  it('lists a card’s URLs once', () => {
    expect(pictureUrls({ frontImageUrl: url('a'), backImageUrl: url('a') })).toEqual([url('a')]);
    expect(pictureUrls({})).toEqual([]);
    expect(hasPictures({ backImageUrl: url('a') })).toBe(true);
    expect(hasPictures({})).toBe(false);
  });
});

describe('siblings read the source’s pictures', () => {
  const source = toColumns({ frontImage: img('f', 'front'), backImage: img('b', 'back') });
  it('an authored card shows its own', () => {
    expect(picturesOfRow({ kind: 'basic', sourceId: null, clozeIndex: null, ...source }, null)).toEqual({
      frontImage: img('f', 'front'),
      backImage: img('b', 'back'),
    });
  });
  it('the reverse of a reversible card swaps the sides', () => {
    expect(picturesOfRow({ kind: 'reversible', sourceId: 's', clozeIndex: null }, source)).toEqual({
      frontImage: img('b', 'back'),
      backImage: img('f', 'front'),
    });
  });
  it('a cloze card shows the source’s back picture on its back only', () => {
    expect(picturesOfRow({ kind: 'cloze', sourceId: 's', clozeIndex: 1 }, source)).toEqual({
      frontImage: null,
      backImage: img('b', 'back'),
    });
  });
  it('a sibling holds no URL of its own', () => {
    expect(picturesOfRow({ kind: 'cloze', sourceId: 's', clozeIndex: 1 }, null)).toEqual({
      frontImage: null,
      backImage: null,
    });
  });
});

describe('the hash input', () => {
  it('is nothing for a card with no picture, so old hashes still match', () => {
    expect(pictureHashInput({})).toBeNull();
    expect(pictureHashInput({ frontImageUrl: null, backImageUrl: null })).toBeNull();
  });
  it('carries URLs and descriptions otherwise', () => {
    expect(pictureHashInput({ frontImageUrl: url('a'), frontImageAlt: 'x' })).toEqual([url('a'), 'x', null, null]);
  });
});

describe('export and import', () => {
  const cards = [
    { front: 'Heart', back: 'Organ', frontImage: img('a') },
    { front: 'Plain', back: 'Card' },
  ];
  it('the JSON file carries pictures with descriptions; TSV and CSV stay plain text', () => {
    const json = JSON.parse(buildExport('json', { title: 'Anatomy', description: null, cards }).text);
    expect(json.cards[0]).toEqual({ front: 'Heart', back: 'Organ', frontImage: img('a') });
    expect(json.cards[1]).toEqual({ front: 'Plain', back: 'Card' });
    expect(toTsv(cards)).toBe('Heart\tOrgan\nPlain\tCard\n');
    expect(toCsv(cards)).not.toContain('api/feed');
  });

  it('reads the JSON export back, pictures included', () => {
    const text = buildExport('json', { title: 'Anatomy', description: null, cards }).text;
    const parsed = parseCards(text);
    expect(parsed.rejected).toEqual([]);
    expect(parsed.cards).toEqual([
      { front: 'Heart', back: 'Organ', frontImage: img('a') },
      { front: 'Plain', back: 'Card' },
    ]);
  });

  it('rejects a picture with no description, on a cloze front, or from a remote address, and fetches nothing', () => {
    const text = JSON.stringify({
      cards: [
        { front: 'a', back: 'b', frontImage: { url: url('a'), alt: '' } },
        { front: 'The {{c1::heart}}', type: 'cloze', frontImage: img('b') },
        { front: 'c', back: 'd', backImage: { url: 'https://evil.test/x.png', alt: 'x' } },
        { front: 'e', back: 'f', backImage: 'not an object' },
        { front: 'g', back: 'h', backImage: img('c') },
      ],
    });
    const parsed = parseDeckJson(text);
    expect(parsed?.rejected.map((r) => [r.line, r.reason])).toEqual([
      [1, 'invalid-picture'],
      [2, 'invalid-picture'],
      [3, 'invalid-picture'],
      [4, 'invalid-picture'],
    ]);
    expect(parsed?.cards).toEqual([{ front: 'g', back: 'h', backImage: img('c') }]);
  });

  it('leaves pasted text, including a cloze sentence that starts with braces, to the list parser', () => {
    expect(parseDeckJson('{{c1::Paris}} is the capital of France')).toBeNull();
    expect(parseDeckJson('front\tback')).toBeNull();
    expect(parseDeckJson('{"title":"x"}')).toBeNull();
  });
});

describe('practice-test prompts', () => {
  const cards: TestCard[] = [
    { id: '1', front: 'Heart', back: 'Organ', frontImage: img('h') },
    { id: '2', front: 'Lung', back: 'Organ two' },
    { id: '3', front: 'Kidney', back: 'Organ three' },
    { id: '4', front: 'Liver', back: 'Organ four' },
  ];
  it('puts the picture on the side the question asks from', () => {
    const questions = buildTest(cards, { count: 4, kinds: ['written'], direction: 'back' }, 7);
    const heart = questions.find((q) => 'cardId' in q && q.cardId === '1');
    expect(heart && 'promptImage' in heart ? heart.promptImage : undefined).toEqual(img('h'));
    for (const q of questions) if ('cardId' in q && q.cardId !== '1') expect('promptImage' in q).toBe(false);
  });
  it('does not show a front picture when the question asks from the back', () => {
    const questions = buildTest(cards, { count: 4, kinds: ['written'], direction: 'front' }, 7);
    for (const q of questions) expect('promptImage' in q).toBe(false);
  });
});

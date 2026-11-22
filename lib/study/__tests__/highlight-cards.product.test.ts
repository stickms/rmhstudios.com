import { describe, expect, it } from 'vitest';
import {
  basicBack,
  buildCloze,
  draftFromItem,
  isPassageOf,
  lengthCheck,
  mergeRanges,
  splitWords,
  MAX_CLOZE_DELETIONS,
} from '@/lib/study/highlight-cards';
import { parseCloze, validateCard } from '@/lib/study/card-types';

const range = (...pairs: [number, number][]) => pairs.map(([from, to]) => ({ from, to }));

describe('splitWords', () => {
  it('bounds the letters of each word and leaves punctuation outside', () => {
    const [first, second] = splitWords('“Hello,” she said.');
    expect(first).toMatchObject({ text: '“Hello,”', selectable: true });
    expect('“Hello,”'.slice(first!.coreStart - first!.start, first!.coreEnd - first!.start)).toBe('Hello');
    expect(second?.text).toBe('she');
  });

  it('marks a token with no letter or digit as unselectable', () => {
    const words = splitWords('one — two');
    expect(words.map((w) => w.selectable)).toEqual([true, false, true]);
  });
});

describe('buildCloze', () => {
  it('wraps each picked word and keeps the punctuation around it', () => {
    const built = buildCloze('The tide, they say, turns.', range([1, 1], [3, 3]));
    expect(built).toEqual({ ok: true, text: 'The {{c1::tide}}, they {{c2::say}}, turns.', count: 2 });
  });

  it('numbers the blanks in reading order whatever order they were picked in', () => {
    const built = buildCloze('alpha beta gamma', range([2, 2], [0, 0]));
    expect(built).toEqual({ ok: true, text: '{{c1::alpha}} beta {{c2::gamma}}', count: 2 });
  });

  it('merges overlapping selections into one phrase and keeps touching ones apart', () => {
    expect(buildCloze('a b c d e', range([0, 2], [1, 3]))).toMatchObject({ text: '{{c1::a b c d}} e', count: 1 });
    expect(buildCloze('a b c', range([0, 0], [1, 1]))).toMatchObject({ text: '{{c1::a}} {{c2::b}} c', count: 2 });
  });

  it('keeps the spaces and punctuation between the words of a phrase inside the blank', () => {
    expect(buildCloze('so, the red fox ran', range([1, 3]))).toMatchObject({ text: 'so, {{c1::the red fox}} ran' });
  });

  it('allows five blanks and refuses a sixth', () => {
    const passage = 'a b c d e f g';
    expect(buildCloze(passage, range([0, 0], [1, 1], [2, 2], [3, 3], [4, 4]))).toMatchObject({
      ok: true,
      count: MAX_CLOZE_DELETIONS,
    });
    expect(buildCloze(passage, range([0, 0], [1, 1], [2, 2], [3, 3], [4, 4], [5, 5]))).toEqual({
      ok: false,
      error: 'too-many-blanks',
    });
  });

  it('refuses no selection, or only unselectable tokens', () => {
    expect(buildCloze('a b', [])).toEqual({ ok: false, error: 'no-blanks' });
    expect(buildCloze('a — b', range([1, 1]))).toEqual({ ok: false, error: 'no-blanks' });
  });

  it('refuses a passage that already carries cloze syntax', () => {
    expect(buildCloze('use {{c1::this}} here', range([0, 0]))).toEqual({ ok: false, error: 'unsafe-text' });
    expect(buildCloze('ratio a::b here', range([0, 0]))).toEqual({ ok: false, error: 'unsafe-text' });
  });

  it('builds text the card validator accepts, with one index per blank', () => {
    const built = buildCloze('Water boils at one hundred degrees.', range([0, 0], [4, 4]));
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    const parsed = parseCloze(built.text);
    expect(parsed.ok && parsed.indices).toEqual([1, 2]);
    expect(validateCard({ kind: 'cloze', front: built.text }).ok).toBe(true);
  });

  it('ignores indices past the end of the passage', () => {
    expect(buildCloze('a b', range([1, 9]))).toMatchObject({ text: 'a {{c1::b}}' });
    expect(mergeRanges(splitWords('a b'), range([5, 9]))).toEqual([]);
  });
});

describe('buildCloze with combining marks', () => {
  it('keeps a vowel sign or a diacritic inside the blank', () => {
    const hindi = 'हिन्दी भाषा।';
    expect(buildCloze(hindi, [{ from: 0, to: 0 }])).toMatchObject({ ok: true, text: '{{c1::हिन्दी}} भाषा।' });
    const arabic = 'كَتَبَ الولدُ.';
    expect(buildCloze(arabic, [{ from: 1, to: 1 }])).toMatchObject({ ok: true, text: 'كَتَبَ {{c1::الولدُ}}.' });
  });
});

describe('isPassageOf', () => {
  it('accepts a trimmed part of the highlight and nothing else', () => {
    expect(isPassageOf('  tide pulls ', 'The tide pulls twice')).toBe(true);
    expect(isPassageOf('tide  pulls', 'The tide pulls twice')).toBe(false);
    expect(isPassageOf('Tide', 'The tide pulls twice')).toBe(false);
    expect(isPassageOf('   ', 'The tide pulls twice')).toBe(false);
  });
});

describe('length rules per shape', () => {
  it('limits a basic back to 500 characters and shows the count', () => {
    expect(lengthCheck('basic', 'x'.repeat(500))).toEqual({ ok: true, length: 500, max: 500 });
    expect(lengthCheck('basic', `  ${'x'.repeat(501)}  `)).toEqual({ ok: false, length: 501, max: 500 });
  });

  it('limits a cloze card to 1,000 characters counting its markup', () => {
    expect(lengthCheck('cloze', 'x'.repeat(900))).toEqual({ ok: true, length: 900, max: 1000 });
    const built = buildCloze(`${'x'.repeat(995)} y`, range([1, 1]));
    expect(built.ok).toBe(true);
    if (built.ok) expect(lengthCheck('cloze', 'x', built.text).ok).toBe(false);
  });

  it('adds the title to a basic back only when it fits', () => {
    expect(basicBack('Passage.', 'A Title')).toBe('Passage.\n— A Title');
    expect(basicBack('Passage.', null)).toBe('Passage.');
    expect(basicBack('x'.repeat(498), 'A Title')).toHaveLength(498);
    const cut = basicBack('x'.repeat(470), 'A very long title that cannot possibly fit in what is left');
    expect(cut.length).toBeLessThanOrEqual(500);
    expect(cut.endsWith('…')).toBe(true);
  });
});

describe('draftFromItem', () => {
  const highlight = { exact: 'The tide pulls twice daily.', title: 'On Tides' };

  it('builds a basic draft from the stored text', () => {
    expect(draftFromItem({ highlightId: 'h', shape: 'basic', text: 'tide pulls', front: ' Q? ' }, highlight)).toEqual({
      ok: true,
      draft: { kind: 'basic', front: 'Q?', back: 'tide pulls\n— On Tides' },
    });
  });

  it('refuses text that is not in the highlight, an empty front, and a passage over 500', () => {
    expect(draftFromItem({ highlightId: 'h', shape: 'basic', text: 'tide rises', front: 'Q' }, highlight)).toEqual({
      ok: false,
      error: 'not-in-highlight',
    });
    expect(draftFromItem({ highlightId: 'h', shape: 'basic', text: 'tide', front: ' ' }, highlight)).toEqual({
      ok: false,
      error: 'front-required',
    });
    const long = { exact: 'w '.repeat(400), title: null };
    expect(draftFromItem({ highlightId: 'h', shape: 'basic', text: long.exact, front: 'Q' }, long)).toEqual({
      ok: false,
      error: 'passage-too-long',
    });
  });

  it('builds a cloze draft with no back', () => {
    expect(
      draftFromItem({ highlightId: 'h', shape: 'cloze', text: 'tide pulls', deletions: range([0, 0]) }, highlight),
    ).toEqual({ ok: true, draft: { kind: 'cloze', front: '{{c1::tide}} pulls', back: '' } });
  });
});

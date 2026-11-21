import { describe, expect, it } from 'vitest';
import {
  clozeAnswers,
  clozePlainText,
  hasCloze,
  isReverseCard,
  isReviewable,
  maskCloze,
  maskClozeText,
  nextClozeIndex,
  noteIdOf,
  parseCloze,
  planRegeneration,
  rowsFor,
  siblingsFor,
  validateCard,
  wrapDeletion,
  type CardInput,
  type ExistingSibling,
} from '@/lib/study/card-types';
import { buildExport, toCsv, toJson, toTsv } from '@/lib/study/export';
import { parseCards } from '@/lib/study/import';
import { buildTest, factCount, type TestCard } from '@/lib/study/practice-test';
import { CLOZE_TEXT_MAX } from '@/lib/study/limits';

const FRANCE = 'The capital of {{c1::France}} is {{c2::Paris}}.';

describe('parseCloze', () => {
  it('splits plain text and deletions and lists the distinct indices', () => {
    const r = parseCloze(FRANCE);
    expect(r).toMatchObject({ ok: true, indices: [1, 2] });
    if (!r.ok) return;
    expect(r.segments).toEqual([
      { type: 'text', text: 'The capital of ' },
      { type: 'deletion', index: 1, answer: 'France', hint: null },
      { type: 'text', text: ' is ' },
      { type: 'deletion', index: 2, answer: 'Paris', hint: null },
      { type: 'text', text: '.' },
    ]);
  });

  it('reads a hint after the second pair of colons', () => {
    const r = parseCloze('{{c1::Paris::a city}}');
    expect(r.ok && r.segments).toEqual([{ type: 'deletion', index: 1, answer: 'Paris', hint: 'a city' }]);
    // An empty hint is no hint.
    const empty = parseCloze('{{c1::Paris::}}');
    expect(empty.ok && empty.segments[0]).toMatchObject({ hint: null });
  });

  it('lets several deletions share an index, hidden together', () => {
    const r = parseCloze('{{c1::Rome}} and {{c1::Paris}} and {{c2::Oslo}}');
    expect(r).toMatchObject({ ok: true, indices: [1, 2] });
    if (!r.ok) return;
    expect(clozeAnswers(r.segments, 1)).toEqual(['Rome', 'Paris']);
    expect(clozeAnswers(r.segments, 2)).toEqual(['Oslo']);
  });

  it('refuses nesting', () => {
    expect(parseCloze('{{c1::a {{c2::b}} c}}')).toEqual({ ok: false, error: 'nested' });
  });

  it('refuses malformed braces', () => {
    expect(parseCloze('{{c1::never closed')).toEqual({ ok: false, error: 'unterminated' });
    expect(parseCloze('{{c1::}}')).toEqual({ ok: false, error: 'empty' });
    expect(parseCloze('{{c1:: ::hint}}')).toEqual({ ok: false, error: 'empty' });
    expect(parseCloze('{{c0::zero}}')).toEqual({ ok: false, error: 'bad-index' });
    expect(parseCloze('{{c1000::big}}')).toEqual({ ok: false, error: 'bad-index' });
  });

  it('needs at least one deletion and at most 20 distinct indices', () => {
    expect(parseCloze('no deletions here')).toEqual({ ok: false, error: 'no-deletions' });
    expect(parseCloze('{{c1:missing colon}}')).toEqual({ ok: false, error: 'no-deletions' });
    const many = (n: number) => Array.from({ length: n }, (_, i) => `{{c${i + 1}::x}}`).join(' ');
    expect(parseCloze(many(20)).ok).toBe(true);
    expect(parseCloze(many(21))).toEqual({ ok: false, error: 'too-many-indices' });
  });

  it('treats a stray brace pair that is not a deletion as text', () => {
    const r = parseCloze('a {{not a deletion}} b }} {{c1::x}}');
    expect(r.ok && r.segments[0]).toEqual({ type: 'text', text: 'a {{not a deletion}} b }} ' });
  });

  it('hasCloze looks for an opener only', () => {
    expect(hasCloze(FRANCE)).toBe(true);
    expect(hasCloze('{{c1::unterminated')).toBe(true);
    expect(hasCloze('plain {{braces}}')).toBe(false);
  });
});

describe('masking', () => {
  const parsed = parseCloze('{{c1::Paris::city}} is in {{c2::France}}, {{c1::yes}}');
  if (!parsed.ok) throw new Error('fixture');

  it('masks the active index on the front and shows the others as text', () => {
    expect(maskCloze(parsed.segments, 1, false)).toEqual([
      { type: 'mask', hint: 'city' },
      { type: 'text', text: ' is in ' },
      { type: 'text', text: 'France' },
      { type: 'text', text: ', ' },
      { type: 'mask', hint: null },
    ]);
  });

  it('reveals the active index as the answer on the back', () => {
    const back = maskCloze(parsed.segments, 2, true);
    expect(back.filter((p) => p.type === 'answer')).toEqual([{ type: 'answer', text: 'France' }]);
  });

  it('draws every deletion at once when no index is active (the editor list)', () => {
    expect(maskCloze(parsed.segments, null, true).filter((p) => p.type === 'answer')).toHaveLength(3);
  });

  it('maskClozeText writes the translated blank, or [hint], as one string', () => {
    expect(maskClozeText('{{c1::Paris::city}} is in {{c2::France}}', 1, '[…]')).toBe('[city] is in France');
    expect(maskClozeText('{{c1::Paris}} is in {{c2::France}}', 2, '[blank]')).toBe('Paris is in [blank]');
    expect(maskClozeText('not cloze', 1, '[…]')).toBe('not cloze');
  });

  it('clozePlainText shows every answer', () => {
    expect(clozePlainText(FRANCE)).toBe('The capital of France is Paris.');
  });
});

describe('the Add deletion button', () => {
  it('numbers the next deletion one past the largest in use', () => {
    expect(nextClozeIndex('plain')).toBe(1);
    expect(nextClozeIndex('{{c1::a}} {{c4::b}}')).toBe(5);
  });

  it('wraps the selection and selects the wrapped answer', () => {
    const text = 'Paris is the capital';
    const r = wrapDeletion(text, 0, 5);
    expect(r).toEqual({ text: '{{c1::Paris}} is the capital', selStart: 6, selEnd: 11 });
    expect(wrapDeletion(r!.text, 21, 28)?.text).toBe('{{c1::Paris}} is the {{c2::capital}}');
  });

  it('refuses an empty selection, a blank one, or one that cuts into a deletion', () => {
    expect(wrapDeletion('abc', 1, 1)).toBeNull();
    expect(wrapDeletion('a b', 1, 2)).toBeNull();
    expect(wrapDeletion('{{c1::Paris}} x', 3, 9)).toBeNull();
  });

  it('refuses a wrap that would pass the text limit', () => {
    expect(wrapDeletion('x'.repeat(CLOZE_TEXT_MAX), 0, 3)).toBeNull();
  });
});

describe('validateCard', () => {
  it('trims, and a cloze card keeps no back', () => {
    expect(validateCard({ front: ' a ', back: ' b ' })).toEqual({
      ok: true,
      card: { kind: 'basic', front: 'a', back: 'b' },
    });
    expect(validateCard({ kind: 'cloze', front: FRANCE, back: 'ignored' })).toEqual({
      ok: true,
      card: { kind: 'cloze', front: FRANCE, back: '' },
    });
  });

  it('a reversible card needs both sides', () => {
    expect(validateCard({ kind: 'reversible', front: 'a', back: ' ' })).toEqual({ ok: false, error: 'back-required' });
    expect(validateCard({ kind: 'reversible', front: ' ', back: 'b' })).toEqual({ ok: false, error: 'front-required' });
  });

  it('a cloze card needs a deletion, at most 20 indices and at most 1,000 characters', () => {
    expect(validateCard({ kind: 'cloze', front: 'plain' })).toEqual({ ok: false, error: 'cloze-no-deletions' });
    expect(validateCard({ kind: 'cloze', front: `{{c1::x}}${'y'.repeat(CLOZE_TEXT_MAX)}` })).toEqual({
      ok: false,
      error: 'cloze-too-long',
    });
    const many = Array.from({ length: 21 }, (_, i) => `{{c${i + 1}::x}}`).join('');
    expect(validateCard({ kind: 'cloze', front: many })).toEqual({ ok: false, error: 'cloze-too-many-indices' });
    expect(validateCard({ kind: 'cloze', front: '{{c1::a {{c2::b}}}}' })).toEqual({ ok: false, error: 'cloze-nested' });
  });

  it('a basic side is at most 500 characters', () => {
    expect(validateCard({ front: 'x'.repeat(501), back: 'b' })).toEqual({ ok: false, error: 'front-too-long' });
    expect(validateCard({ front: 'a', back: 'x'.repeat(501) })).toEqual({ ok: false, error: 'back-too-long' });
  });
});

describe('siblingsFor', () => {
  it('a basic card generates nothing', () => {
    expect(siblingsFor({ kind: 'basic', front: 'a', back: 'b' })).toEqual([]);
    expect(rowsFor({ kind: 'basic', front: 'a', back: 'b' })).toBe(1);
  });

  it('a reversible card generates one reverse with the sides swapped', () => {
    expect(siblingsFor({ kind: 'reversible', front: 'chat', back: 'cat' })).toEqual([
      { key: 'r', kind: 'reversible', front: 'cat', back: 'chat', clozeIndex: null },
    ]);
  });

  it('a cloze card generates one card per distinct index, answers as the back', () => {
    const card: CardInput = { kind: 'cloze', front: '{{c1::Rome}} / {{c2::Oslo}} / {{c1::Paris}}', back: '' };
    expect(siblingsFor(card)).toEqual([
      { key: 'c1', kind: 'cloze', front: card.front, back: 'Rome, Paris', clozeIndex: 1 },
      { key: 'c2', kind: 'cloze', front: card.front, back: 'Oslo', clozeIndex: 2 },
    ]);
    expect(rowsFor(card)).toBe(3);
  });

  it('text that does not parse generates nothing rather than throwing', () => {
    expect(siblingsFor({ kind: 'cloze', front: 'broken {{c1::', back: '' })).toEqual([]);
  });
});

describe('planRegeneration', () => {
  const text = '{{c1::a}} {{c2::b}}';
  const stored = (): ExistingSibling[] => [
    { id: 's1', kind: 'cloze', front: text, back: 'a', clozeIndex: 1 },
    { id: 's2', kind: 'cloze', front: text, back: 'b', clozeIndex: 2 },
  ];

  it('changes nothing for an unchanged card', () => {
    const plan = planRegeneration(stored(), siblingsFor({ kind: 'cloze', front: text, back: '' }));
    expect(plan).toEqual({ update: [], create: [], remove: [] });
  });

  it('dropping c2 removes only that card; c1 keeps its row', () => {
    const next = '{{c1::a}} b';
    const plan = planRegeneration(stored(), siblingsFor({ kind: 'cloze', front: next, back: '' }));
    expect(plan.remove).toEqual(['s2']);
    expect(plan.create).toEqual([]);
    // c1's text changed (the whole sentence is its front), so the row is updated in place.
    expect(plan.update).toEqual([{ id: 's1', front: next, back: 'a' }]);
  });

  it('adding c3 creates only c3', () => {
    const next = `${text} {{c3::c}}`;
    const plan = planRegeneration(stored(), siblingsFor({ kind: 'cloze', front: next, back: '' }));
    expect(plan.create.map((s) => s.key)).toEqual(['c3']);
    expect(plan.remove).toEqual([]);
    expect(plan.update.map((u) => u.id)).toEqual(['s1', 's2']);
  });

  it('changing an answer updates that row in place', () => {
    const next = '{{c1::z}} {{c2::b}}';
    const plan = planRegeneration(stored(), siblingsFor({ kind: 'cloze', front: next, back: '' }));
    expect(plan.update).toContainEqual({ id: 's1', front: next, back: 'z' });
    expect(plan.remove).toEqual([]);
  });

  it('keeps the reverse of an edited reversible card, and drops it when the card becomes basic', () => {
    const reverse: ExistingSibling[] = [{ id: 'r1', kind: 'reversible', front: 'b', back: 'a', clozeIndex: null }];
    const edited = planRegeneration(reverse, siblingsFor({ kind: 'reversible', front: 'a', back: 'c' }));
    expect(edited).toEqual({ update: [{ id: 'r1', front: 'c', back: 'a' }], create: [], remove: [] });
    expect(planRegeneration(reverse, siblingsFor({ kind: 'basic', front: 'a', back: 'c' })).remove).toEqual(['r1']);
  });

  it('switching reversible to cloze replaces the reverse with cloze cards', () => {
    const reverse: ExistingSibling[] = [{ id: 'r1', kind: 'reversible', front: 'b', back: 'a', clozeIndex: null }];
    const plan = planRegeneration(reverse, siblingsFor({ kind: 'cloze', front: '{{c1::a}}', back: '' }));
    expect(plan.remove).toEqual(['r1']);
    expect(plan.create.map((s) => s.key)).toEqual(['c1']);
  });

  it('removes a duplicate row for the same key', () => {
    const dup = [...stored(), { id: 's1b', kind: 'cloze', front: text, back: 'a', clozeIndex: 1 }];
    expect(planRegeneration(dup, siblingsFor({ kind: 'cloze', front: text, back: '' })).remove).toEqual(['s1b']);
  });
});

describe('reading a stored card', () => {
  it('an authored cloze row is never reviewed; everything else is', () => {
    expect(isReviewable({ kind: 'cloze', sourceId: null })).toBe(false);
    expect(isReviewable({ kind: 'cloze', sourceId: 'x' })).toBe(true);
    expect(isReviewable({ kind: 'reversible', sourceId: null })).toBe(true);
    expect(isReviewable({ kind: 'basic', sourceId: null })).toBe(true);
  });

  it('only a generated reverse card is labelled Reverse', () => {
    expect(isReverseCard({ kind: 'reversible', sourceId: 'x', clozeIndex: null })).toBe(true);
    expect(isReverseCard({ kind: 'reversible', sourceId: null, clozeIndex: null })).toBe(false);
    expect(isReverseCard({ kind: 'cloze', sourceId: 'x', clozeIndex: 1 })).toBe(false);
  });

  it('a note is the authored card', () => {
    expect(noteIdOf({ id: 'sib', sourceId: 'auth' })).toBe('auth');
    expect(noteIdOf({ id: 'auth', sourceId: null })).toBe('auth');
  });
});

describe('import and export round trip', () => {
  const mixed = [
    { front: 'hello', back: 'bonjour' },
    { front: 'chat', back: 'cat', kind: 'reversible' },
    { front: FRANCE, back: '', kind: 'cloze' },
    { front: 'two\nlines, with "quotes"', back: 'tab\there', kind: 'basic' },
  ];

  it('a mixed deck exports with a type column and imports back unchanged (tsv)', () => {
    const tsv = toTsv(mixed);
    const r = parseCards(tsv);
    expect(r.rejected).toEqual([]);
    expect(r.separator).toBe('tab');
    expect(r.cards).toEqual([
      { front: 'hello', back: 'bonjour' },
      { front: 'chat', back: 'cat', kind: 'reversible' },
      { front: FRANCE, back: '', kind: 'cloze' },
      { front: 'two\nlines, with "quotes"', back: 'tab\there' },
    ]);
    // And exports to the same file again.
    expect(toTsv(r.cards)).toBe(tsv);
  });

  it('a mixed deck round-trips through csv, header skipped', () => {
    const r = parseCards(toCsv(mixed), { separator: 'comma', hasHeader: true });
    expect(r.rejected).toEqual([]);
    expect(r.cards.map((c) => [c.front, c.back, c.kind ?? 'basic'])).toEqual(
      mixed.map((c) => [c.front, c.back, c.kind ?? 'basic']),
    );
  });

  it('a quote or newline inside a deletion survives a csv round trip (quoted cell un-doubled once)', () => {
    const cards = [
      { kind: 'cloze', front: 'He said {{c1::"hi", then\nleft}} ok, "x"', back: '' },
      { kind: 'reversible', front: 'a', back: 'b' },
    ];
    const r = parseCards(toCsv(cards), { separator: 'comma', hasHeader: true });
    expect(r.cards.map((c) => c.front)).toEqual([cards[0]!.front, 'a']);
  });

  it('an all-basic deck keeps its two columns, so earlier files are unchanged', () => {
    expect(toTsv([{ front: 'a', back: 'b' }])).toBe('a\tb\n');
    expect(toCsv([{ front: 'a', back: 'b', kind: 'basic' }])).toBe('front,back\r\na,b\r\n');
    expect(JSON.parse(toJson({ title: 'T', description: null, cards: [{ front: 'a', back: 'b' }] })).cards).toEqual([
      { front: 'a', back: 'b' },
    ]);
  });

  it('json carries the type once the deck has a non-basic card', () => {
    const out = JSON.parse(buildExport('json', { title: 'T', description: null, cards: mixed }).text);
    expect(out.cards.map((c: { type: string }) => c.type)).toEqual(['basic', 'reversible', 'cloze', 'basic']);
  });

  it('a front with a deletion becomes a cloze card, even with no separator or back', () => {
    const r = parseCards(`${FRANCE}\nanother {{c1::one}}`);
    expect(r.cards).toEqual([
      { front: FRANCE, back: '', kind: 'cloze' },
      { front: 'another {{c1::one}}', back: '', kind: 'cloze' },
    ]);
  });

  it('a third column of reverse or reversible (any case) makes a reversible card', () => {
    const r = parseCards('a\tb\tReverse\nc\td\tREVERSIBLE\ne\tf\tunrelated tag');
    expect(r.cards).toEqual([
      { front: 'a', back: 'b', kind: 'reversible' },
      { front: 'c', back: 'd', kind: 'reversible' },
      { front: 'e', back: 'f' },
    ]);
  });

  it('an explicit basic type keeps a front that merely contains braces a basic card', () => {
    const r = parseCards('{{c1::x}}\ty\tbasic');
    expect(r.cards).toEqual([{ front: '{{c1::x}}', back: 'y' }]);
  });

  it('rejects a cloze row whose deletions do not parse', () => {
    const r = parseCards('{{c1::open\tback\nok\tfine\nplain\tback\tcloze');
    expect(r.rejected).toEqual([
      { line: 1, reason: 'invalid-cloze' },
      { line: 3, reason: 'invalid-cloze' },
    ]);
    expect(r.cards).toEqual([{ front: 'ok', back: 'fine' }]);
  });
});

describe('practice tests with generated cards', () => {
  const sentence = '{{c1::Paris}} is the capital of {{c2::France}}';
  const cards: TestCard[] = [
    { id: 'cat', front: 'chat', back: 'cat', noteId: 'cat' },
    { id: 'cat-r', front: 'cat', back: 'chat', noteId: 'cat' },
    { id: 'cl1', front: sentence, back: 'Paris', clozeIndex: 1, noteId: 'cl' },
    { id: 'cl2', front: sentence, back: 'France', clozeIndex: 2, noteId: 'cl' },
    { id: 'dog', front: 'chien', back: 'dog', noteId: 'dog' },
    { id: 'sun', front: 'soleil', back: 'sun', noteId: 'sun' },
    { id: 'sea', front: 'mer', back: 'sea', noteId: 'sea' },
  ];

  const options = { count: 50, kinds: ['written' as const], direction: 'back' as const };

  it('counts facts, not cards', () => {
    expect(factCount(cards)).toBe(5);
  });

  it('never asks about the same fact twice, whatever the seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const questions = buildTest(cards, options, seed);
      expect(questions).toHaveLength(5);
      const notes = questions.map((q) => {
        if (q.kind !== 'written') throw new Error('kind');
        return cards.find((c) => c.id === q.cardId)?.noteId;
      });
      expect(new Set(notes).size).toBe(5);
    }
  });

  it('masks a cloze prompt with the given blank and answers with the deletion', () => {
    const only = cards.filter((c) => c.noteId === 'cl');
    const questions = buildTest(only, { ...options, blank: '[blank]' }, 3);
    expect(questions).toHaveLength(1);
    const q = questions[0];
    if (q?.kind !== 'written') throw new Error('kind');
    const card = only.find((c) => c.id === q.cardId);
    expect(q.prompt).toBe(
      card?.clozeIndex === 1 ? '[blank] is the capital of France' : 'Paris is the capital of [blank]',
    );
    expect(q.answer).toBe(card?.back);
  });

  it('asks a cloze card front to back whatever the direction', () => {
    const only = cards.filter((c) => c.noteId === 'cl');
    for (const direction of ['back', 'front', 'mixed'] as const) {
      const q = buildTest(only, { ...options, direction }, 9)[0];
      if (q?.kind !== 'written') throw new Error('kind');
      expect(['Paris', 'France']).toContain(q.answer);
      expect(q.prompt).toContain('[…]');
    }
  });

  it('never offers a whole cloze sentence as a distractor', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const q of buildTest(cards, { ...options, kinds: ['multiple-choice'], direction: 'front' }, seed)) {
        if (q.kind === 'multiple-choice') expect(q.options.some((o) => o.includes('{{'))).toBe(false);
      }
    }
  });

  it('a deck of plain cards builds the same test as before: no note ids, one question per card', () => {
    const plain: TestCard[] = ['a', 'b', 'c', 'd', 'e'].map((x) => ({ id: x, front: x, back: x.toUpperCase() }));
    expect(buildTest(plain, options, 5)).toHaveLength(5);
  });
});

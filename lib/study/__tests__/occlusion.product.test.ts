/**
 * Picture-occlusion flashcards (s09-03), the pure logic: the mask bounds, normalisation, id assignment, the sibling
 * diff by mask id, what a review card draws, the deck files and the practice test.
 */
import { describe, expect, it } from 'vitest';
import { planRegeneration, rowsFor, siblingsFor, validateCard, isReviewable, cardLabel } from '@/lib/study/card-types';
import { buildExport, skippedInText, toCsv, toJson, toTsv } from '@/lib/study/export';
import { parseCards } from '@/lib/study/import';
import {
  OCCLUSION_MAX_MASKS,
  boxFromDrag,
  checkOcclusion,
  dragCorner,
  labelOf,
  maskLayout,
  nextMaskId,
  nudgeBox,
  partOf,
  resizeBox,
  reviewDataFor,
  sameOcclusion,
  type Occlusion,
  type OcclusionMask,
} from '@/lib/study/occlusion';
import { buildTest, type TestCard } from '@/lib/study/practice-test';
import { occlusionInput } from '@/lib/study/occlusion-schema';
import { cardHash } from '@/lib/study/deck-sync';
import { cardImageProblem, picturesOfRow } from '@/lib/study/card-images';

const mask = (id: number, label = `part ${id}`, box: Partial<OcclusionMask> = {}): OcclusionMask => ({
  id,
  x: 0.1,
  y: 0.1,
  w: 0.2,
  h: 0.2,
  label,
  ...box,
});
const occ = (...masks: OcclusionMask[]): Occlusion => ({ mode: 'hide-all', masks });
const picture = { url: '/api/feed/image/diagram.webp', alt: 'A labelled heart' };

describe('the mask schema', () => {
  it('accepts 1 to 20 masks inside the picture and trims the labels', () => {
    const ok = checkOcclusion({ mode: 'hide-one', masks: [mask(1, '  aorta  ')] });
    expect(ok).toEqual({ ok: true, occlusion: { mode: 'hide-one', masks: [mask(1, 'aorta')] } });
    const twenty = Array.from({ length: OCCLUSION_MAX_MASKS }, (_, i) => mask(i + 1));
    expect(checkOcclusion({ mode: 'hide-all', masks: twenty }).ok).toBe(true);
  });

  it('refuses none, more than 20, and a bad mode', () => {
    expect(checkOcclusion({ mode: 'hide-all', masks: [] })).toEqual({ ok: false, error: 'no-masks' });
    const twentyOne = Array.from({ length: OCCLUSION_MAX_MASKS + 1 }, (_, i) => mask(i + 1));
    expect(checkOcclusion({ mode: 'hide-all', masks: twentyOne })).toEqual({ ok: false, error: 'too-many-masks' });
    expect(checkOcclusion({ mode: 'show-all', masks: [mask(1)] })).toEqual({ ok: false, error: 'bad-mode' });
    expect(checkOcclusion(null)).toEqual({ ok: false, error: 'not-object' });
    expect(checkOcclusion([])).toEqual({ ok: false, error: 'not-object' });
  });

  it('refuses a mask outside the picture or under 0.02 wide or tall', () => {
    const bad = (m: Partial<OcclusionMask>) => checkOcclusion({ mode: 'hide-all', masks: [mask(1, 'a', m)] });
    expect(bad({ x: -0.01 })).toEqual({ ok: false, error: 'out-of-bounds' });
    expect(bad({ x: 0.9, w: 0.2 })).toEqual({ ok: false, error: 'out-of-bounds' });
    expect(bad({ y: 0.95, h: 0.1 })).toEqual({ ok: false, error: 'out-of-bounds' });
    expect(bad({ w: 0.019 })).toEqual({ ok: false, error: 'too-small' });
    expect(bad({ h: 0.01 })).toEqual({ ok: false, error: 'too-small' });
    expect(bad({ w: 0.02, h: 0.02 })).toMatchObject({ ok: true });
    // A mask that fills the picture and one that touches its far edge are inside it.
    expect(bad({ x: 0, y: 0, w: 1, h: 1 })).toMatchObject({ ok: true });
    expect(bad({ x: 0.8, w: 0.2 })).toMatchObject({ ok: true });
  });

  it('refuses an empty or over-long label, a duplicate id and a bad id', () => {
    const run = (masks: unknown[]) => checkOcclusion({ mode: 'hide-all', masks });
    expect(run([mask(1, '   ')])).toEqual({ ok: false, error: 'bad-label' });
    expect(run([mask(1, 'x'.repeat(201))])).toEqual({ ok: false, error: 'bad-label' });
    expect(run([mask(1, 'x'.repeat(200))])).toMatchObject({ ok: true });
    expect(run([mask(2), mask(2)])).toEqual({ ok: false, error: 'duplicate-id' });
    expect(run([mask(0)])).toEqual({ ok: false, error: 'bad-id' });
    expect(run([{ ...mask(1), id: 1.5 }])).toEqual({ ok: false, error: 'bad-id' });
  });

  it('rounds coordinates to four decimals', () => {
    const out = checkOcclusion({ mode: 'hide-all', masks: [mask(1, 'a', { x: 0.123456, w: 0.2000049 })] });
    expect(out).toMatchObject({ ok: true, occlusion: { masks: [{ x: 0.1235, w: 0.2 }] } });
  });

  it('is checked by the zod schema the routes use, shape first', () => {
    expect(
      occlusionInput.safeParse({ mode: 'hide-all', masks: [{ x: 0, y: 0, w: 0.5, h: 0.5, label: 'a' }] }).success,
    ).toBe(true);
    expect(occlusionInput.safeParse({ mode: 'hide-all', masks: [] }).success).toBe(false);
    expect(
      occlusionInput.safeParse({ mode: 'hide-all', masks: [{ x: 2, y: 0, w: 0.5, h: 0.5, label: 'a' }] }).success,
    ).toBe(false);
    expect(occlusionInput.safeParse({ mode: 'hide-all', extra: 1, masks: [mask(1)] }).success).toBe(false);
  });
});

describe('mask ids', () => {
  it('are assigned as max + 1 to a mask that has none, in list order', () => {
    const out = checkOcclusion({
      mode: 'hide-all',
      masks: [{ ...mask(5), id: undefined }, mask(3), { ...mask(9), id: undefined }],
    });
    expect(out.ok && out.occlusion.masks.map((m) => m.id)).toEqual([4, 3, 5]);
  });

  it('are max + 1 when drawn, and never reused while the editor remembers the highest handed out', () => {
    expect(nextMaskId([])).toBe(1);
    expect(nextMaskId([mask(1), mask(2), mask(7)])).toBe(8);
    // Mask 7 was deleted and a new one drawn in the same session: the floor keeps it from taking 7 again.
    expect(nextMaskId([mask(1), mask(2)], 7)).toBe(8);
  });

  it('leave list order free: a reorder changes no id', () => {
    const before = occ(mask(1), mask(2), mask(3));
    const after = occ(mask(3), mask(1), mask(2));
    expect(
      siblingsFor({ kind: 'occlusion', front: '', back: '', occlusion: after })
        .map((s) => s.clozeIndex)
        .sort(),
    ).toEqual(
      siblingsFor({ kind: 'occlusion', front: '', back: '', occlusion: before })
        .map((s) => s.clozeIndex)
        .sort(),
    );
  });
});

describe('the authored card', () => {
  const draft = (over: Record<string, unknown> = {}) =>
    validateCard({ kind: 'occlusion', front: '', back: '', occlusion: occ(mask(1)), ...over });

  it('has an optional prompt and note and needs valid masks', () => {
    expect(draft()).toMatchObject({ ok: true, card: { kind: 'occlusion', front: '', back: '' } });
    expect(draft({ front: ' Name it ', back: ' note ' })).toMatchObject({
      ok: true,
      card: { front: 'Name it', back: 'note' },
    });
    expect(draft({ occlusion: undefined })).toEqual({ ok: false, error: 'occlusion-not-object' });
    expect(draft({ occlusion: occ() })).toEqual({ ok: false, error: 'occlusion-no-masks' });
    expect(draft({ front: 'x'.repeat(501) })).toEqual({ ok: false, error: 'front-too-long' });
  });

  it('is refused masks on any other kind', () => {
    expect(validateCard({ kind: 'basic', front: 'a', back: 'b', occlusion: occ(mask(1)) })).toEqual({
      ok: false,
      error: 'occlusion-wrong-kind',
    });
    expect(validateCard({ kind: 'basic', front: 'a', back: 'b', occlusion: null })).toMatchObject({ ok: true });
  });

  it('is never reviewed itself, and its siblings are', () => {
    expect(isReviewable({ kind: 'occlusion', sourceId: null })).toBe(false);
    expect(isReviewable({ kind: 'occlusion', sourceId: 'src' })).toBe(true);
  });

  it('needs a front picture and takes no back picture', () => {
    expect(cardImageProblem('occlusion', {})).toEqual({ code: 'OCCLUSION_FRONT_REQUIRED', side: 'front' });
    expect(cardImageProblem('occlusion', { frontImage: picture })).toBeNull();
    expect(cardImageProblem('occlusion', { frontImage: picture, backImage: picture })).toEqual({
      code: 'OCCLUSION_BACK',
      side: 'back',
    });
    expect(cardImageProblem('basic', {})).toBeNull();
  });

  it('is labelled by its prompt, or else its mask labels', () => {
    expect(cardLabel({ kind: 'occlusion', front: 'Heart', occlusion: occ(mask(1, 'aorta')) })).toBe('Heart');
    expect(cardLabel({ kind: 'occlusion', front: '', occlusion: occ(mask(1, 'aorta'), mask(2, 'valve')) })).toBe(
      'aorta, valve',
    );
  });
});

describe('siblings', () => {
  const card = (o: Occlusion, front = 'Name it') => ({
    kind: 'occlusion' as const,
    front,
    back: 'a note',
    occlusion: o,
  });

  it('are one per mask, keyed by the mask id, holding its label as the answer', () => {
    const siblings = siblingsFor(card(occ(mask(4, 'aorta'), mask(9, 'valve'))));
    expect(siblings).toEqual([
      { key: 'c4', kind: 'occlusion', front: 'Name it', back: 'aorta', clozeIndex: 4 },
      { key: 'c9', kind: 'occlusion', front: 'Name it', back: 'valve', clozeIndex: 9 },
    ]);
    expect(rowsFor(card(occ(mask(1), mask(2), mask(3))))).toBe(4);
  });

  const stored = (o: Occlusion) =>
    siblingsFor(card(o)).map((s, i) => ({
      id: `row${s.clozeIndex}-${i}`,
      kind: s.kind,
      front: s.front,
      back: s.back,
      clozeIndex: s.clozeIndex,
    }));

  it('keep their row (and review history) when a label is edited', () => {
    const before = occ(mask(1, 'aorta'), mask(2, 'valve'));
    const plan = planRegeneration(stored(before), siblingsFor(card(occ(mask(1, 'aorta (arch)'), mask(2, 'valve')))));
    expect(plan.update).toEqual([{ id: 'row1-0', front: 'Name it', back: 'aorta (arch)' }]);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
  });

  it('keep their row when the masks are reordered', () => {
    const before = occ(mask(1, 'a'), mask(2, 'b'), mask(3, 'c'));
    const plan = planRegeneration(stored(before), siblingsFor(card(occ(mask(3, 'c'), mask(1, 'a'), mask(2, 'b')))));
    expect(plan).toEqual({ update: [], create: [], remove: [] });
  });

  it('drop a deleted mask’s row and create only the new mask’s', () => {
    const before = occ(mask(1, 'a'), mask(2, 'b'), mask(3, 'c'));
    const plan = planRegeneration(stored(before), siblingsFor(card(occ(mask(1, 'a'), mask(3, 'c'), mask(4, 'd')))));
    expect(plan.remove).toEqual(['row2-1']);
    expect(plan.create.map((s) => s.clozeIndex)).toEqual([4]);
    expect(plan.update).toEqual([]);
  });

  it('copy a changed prompt to every sibling', () => {
    const before = occ(mask(1, 'a'), mask(2, 'b'));
    const plan = planRegeneration(stored(before), siblingsFor(card(before, 'What is this?')));
    expect(plan.update.map((u) => u.front)).toEqual(['What is this?', 'What is this?']);
  });

  it('are none for a card whose masks are not valid', () => {
    expect(siblingsFor({ kind: 'occlusion', front: '', back: '', occlusion: null })).toEqual([]);
  });
});

describe('what a review card draws', () => {
  const all: Occlusion = { mode: 'hide-all', masks: [mask(1, 'a'), mask(2, 'b'), mask(3, 'c')] };
  const one: Occlusion = { mode: 'hide-one', masks: all.masks };

  it('in hide-all mode covers the target in ink and every other mask in the muted colour', () => {
    expect(maskLayout(all, 2, false).map((m) => [m.id, m.state])).toEqual([
      [1, 'covered'],
      [2, 'target'],
      [3, 'covered'],
    ]);
  });

  it('lifts only the target on the reveal', () => {
    expect(maskLayout(all, 2, true).map((m) => [m.id, m.state])).toEqual([
      [1, 'covered'],
      [3, 'covered'],
    ]);
  });

  it('in hide-one mode draws only the target, and nothing once revealed', () => {
    expect(maskLayout(one, 2, false).map((m) => m.id)).toEqual([2]);
    expect(maskLayout(one, 2, true)).toEqual([]);
  });

  it('numbers the part by its place in the list, and finds its label', () => {
    expect(partOf(all, 2)).toEqual({ n: 2, of: 3 });
    expect(labelOf(all, 3)).toBe('c');
    expect(labelOf(all, 9)).toBeNull();
  });

  it('is built for a sibling from its source, and for none when the mask is gone', () => {
    expect(reviewDataFor({ occlusion: all, back: ' a note ' }, 2)).toEqual({
      mode: 'hide-all',
      masks: all.masks,
      targetId: 2,
      note: 'a note',
    });
    expect(reviewDataFor({ occlusion: all, back: '' }, 9)).toBeNull();
    expect(reviewDataFor({ occlusion: 'damaged', back: '' }, 1)).toBeNull();
    expect(reviewDataFor(null, 1)).toBeNull();
  });

  it('shows the source’s front picture on the sibling', () => {
    const source = { frontImageUrl: picture.url, frontImageAlt: picture.alt, backImageUrl: null, backImageAlt: null };
    expect(picturesOfRow({ kind: 'occlusion', sourceId: 's', clozeIndex: 1 }, source)).toEqual({
      frontImage: picture,
      backImage: null,
    });
  });
});

describe('the editor’s geometry', () => {
  it('drags a rectangle out in any direction, inside the picture and at the minimum size', () => {
    expect(boxFromDrag({ x: 0.5, y: 0.5 }, { x: 0.2, y: 0.3 })).toEqual({ x: 0.2, y: 0.3, w: 0.3, h: 0.2 });
    expect(boxFromDrag({ x: 0.5, y: 0.5 }, { x: 1.4, y: 0.5 })).toMatchObject({ x: 0.5, w: 0.5 });
    expect(boxFromDrag({ x: 0.99, y: 0.99 }, { x: 0.99, y: 0.99 })).toEqual({ x: 0.98, y: 0.98, w: 0.02, h: 0.02 });
  });

  it('nudges by a step and stops at the edge', () => {
    expect(nudgeBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.01, 0)).toMatchObject({ x: 0.11 });
    expect(nudgeBox({ x: 0.79, y: 0.1, w: 0.2, h: 0.2 }, 0.05, 0)).toMatchObject({ x: 0.8 });
    expect(nudgeBox({ x: 0.005, y: 0, w: 0.2, h: 0.2 }, -0.05, -0.05)).toMatchObject({ x: 0, y: 0 });
  });

  it('resizes from the top-left, between the minimum and the edge', () => {
    expect(resizeBox({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 0.01, -0.01)).toMatchObject({ w: 0.21, h: 0.19 });
    expect(resizeBox({ x: 0.1, y: 0.1, w: 0.03, h: 0.03 }, -0.05, -0.05)).toMatchObject({ w: 0.02, h: 0.02 });
    expect(resizeBox({ x: 0.9, y: 0.1, w: 0.05, h: 0.2 }, 0.5, 0)).toMatchObject({ w: 0.1 });
  });

  it('drags a corner while the opposite one stays', () => {
    const box = { x: 0.2, y: 0.2, w: 0.2, h: 0.2 };
    expect(dragCorner(box, 'se', { x: 0.6, y: 0.5 })).toEqual({ x: 0.2, y: 0.2, w: 0.4, h: 0.3 });
    expect(dragCorner(box, 'nw', { x: 0.1, y: 0.1 })).toEqual({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 });
  });

  it('compares occlusions by mode, order, ids, boxes and labels', () => {
    expect(sameOcclusion(occ(mask(1), mask(2)), occ(mask(1), mask(2)))).toBe(true);
    expect(sameOcclusion(occ(mask(1), mask(2)), occ(mask(2), mask(1)))).toBe(false);
    expect(sameOcclusion(null, undefined)).toBe(true);
    expect(sameOcclusion(occ(mask(1)), null)).toBe(false);
  });
});

describe('deck files', () => {
  const deckCard = {
    front: 'Name the part',
    back: 'note',
    kind: 'occlusion',
    frontImage: picture,
    occlusion: occ(mask(1, 'aorta'), mask(2, 'valve')),
  };
  const basic = { front: 'a', back: 'b' };

  it('write type "occlusion" with the picture and the masks in the JSON export', () => {
    const out = JSON.parse(toJson({ title: 'Heart', description: null, cards: [deckCard, basic] }));
    expect(out.cards[0]).toMatchObject({
      type: 'occlusion',
      front: 'Name the part',
      frontImage: picture,
      occlusion: { mode: 'hide-all', masks: [mask(1, 'aorta'), mask(2, 'valve')] },
    });
    expect(out.cards[1]).toEqual({ front: 'a', back: 'b', type: 'basic' });
  });

  it('round-trip through the JSON import, masks and ids included', () => {
    const json = toJson({ title: 'Heart', description: null, cards: [deckCard, basic] });
    const read = parseCards(json);
    expect(read.rejected).toEqual([]);
    expect(read.cards[0]).toEqual({
      front: 'Name the part',
      back: 'note',
      kind: 'occlusion',
      frontImage: picture,
      occlusion: occ(mask(1, 'aorta'), mask(2, 'valve')),
    });
    expect(read.cards[1]).toEqual({ front: 'a', back: 'b' });
  });

  it('accept an occlusion card with no prompt and no note', () => {
    const json = JSON.stringify({ cards: [{ type: 'occlusion', frontImage: picture, occlusion: occ(mask(1)) }] });
    expect(parseCards(json).cards).toEqual([
      { front: '', back: '', kind: 'occlusion', frontImage: picture, occlusion: occ(mask(1)) },
    ]);
  });

  it('reject bad masks as invalid-occlusion, and a missing or foreign picture as invalid-picture', () => {
    const rows = [
      { type: 'occlusion', frontImage: picture, occlusion: { mode: 'hide-all', masks: [] } },
      { type: 'occlusion', frontImage: picture, occlusion: occ(mask(1, 'a', { w: 0.01 })) },
      { type: 'occlusion', frontImage: picture },
      { type: 'occlusion', occlusion: occ(mask(1)) },
      { type: 'occlusion', frontImage: { url: 'https://example.com/x.png', alt: 'x' }, occlusion: occ(mask(1)) },
      { type: 'occlusion', frontImage: picture, backImage: picture, occlusion: occ(mask(1)) },
    ];
    const read = parseCards(JSON.stringify({ cards: rows }));
    expect(read.cards).toEqual([]);
    expect(read.rejected.map((r) => r.reason)).toEqual([
      'invalid-occlusion',
      'invalid-occlusion',
      'invalid-occlusion',
      'invalid-picture',
      'invalid-picture',
      'invalid-picture',
    ]);
  });

  it('are skipped by the CSV and TSV export, with a count', () => {
    const cards = [deckCard, basic, deckCard];
    expect(toCsv(cards)).toBe('front,back\r\na,b\r\n');
    expect(toTsv(cards)).toBe('a\tb\n');
    expect(skippedInText(cards)).toBe(2);
    expect(buildExport('csv', { title: 'Heart', description: null, cards }).skipped).toBe(2);
    expect(buildExport('tsv', { title: 'Heart', description: null, cards }).skipped).toBe(2);
    expect(buildExport('json', { title: 'Heart', description: null, cards }).skipped).toBe(0);
    expect(buildExport('csv', { title: 'Heart', description: null, cards: [basic] }).skipped).toBe(0);
  });
});

describe('copies and updates', () => {
  const base = { kind: 'occlusion', front: '', back: '', frontImageUrl: picture.url, frontImageAlt: picture.alt };

  it('hash the masks, so an author’s new mask or label is an update the copier is offered', () => {
    const a = cardHash({ ...base, occlusion: occ(mask(1, 'a')) });
    expect(cardHash({ ...base, occlusion: occ(mask(1, 'a')) })).toBe(a);
    expect(cardHash({ ...base, occlusion: occ(mask(1, 'b')) })).not.toBe(a);
    expect(cardHash({ ...base, occlusion: occ(mask(1, 'a'), mask(2, 'c')) })).not.toBe(a);
  });

  it('leave the hash of every other kind as it was before masks existed', () => {
    const plain = cardHash({ kind: 'basic', front: 'a', back: 'b' });
    expect(cardHash({ kind: 'basic', front: 'a', back: 'b', occlusion: null })).toBe(plain);
  });
});

describe('the practice test', () => {
  const heart = occ(mask(1, 'aorta'), mask(2, 'valve'), mask(3, 'atrium'));
  const cards: TestCard[] = [1, 2, 3].map((id) => ({
    id: `s${id}`,
    front: '',
    back: heart.masks[id - 1]?.label ?? '',
    clozeIndex: id,
    noteId: 'src',
    frontImage: picture,
    occlusion: reviewDataFor({ occlusion: heart, back: '' }, id),
  }));
  const options = {
    count: 3,
    kinds: ['written', 'matching', 'true-false', 'multiple-choice'] as const,
    direction: 'back' as const,
  };

  it('asks each mask as its own question, with the picture and its masks, not one per note', () => {
    const questions = buildTest(cards, options, 7);
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      if (q.kind === 'matching') throw new Error('a mask is never a matching pair');
      expect(q.promptImage).toEqual(picture);
      expect(q.promptOcclusion?.masks).toHaveLength(3);
    }
    const asked = questions.flatMap((q) => (q.kind === 'matching' ? [] : [q.promptOcclusion?.targetId]));
    expect(new Set(asked).size).toBe(3);
  });

  it('answers with the label', () => {
    const written = buildTest(cards, { ...options, kinds: ['written'] }, 3);
    const answers = written.flatMap((q) => (q.kind === 'written' ? [q.answer] : []));
    expect(answers.sort()).toEqual(['aorta', 'atrium', 'valve']);
  });
});

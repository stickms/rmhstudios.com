import { describe, expect, it } from 'vitest';
import { decodePassage, encodePassage, passageMarkEnd } from '../passage-link';
import { createAnchor, resolveAnchor, type TextAnchor } from '../text-anchor';

const original =
  'First paragraph about harbours.\nThe tide pulls twice daily, and sailors knew it.\nLast paragraph about charts.';
const sentence = 'The tide pulls twice daily, and sailors knew it.';
const start = original.indexOf(sentence);

/** What a reader does on arrival: decode the code, resolve it against the text now on the page. */
function arrive(code: string, current: string) {
  const ref = decodePassage(code)!;
  const hit = resolveAnchor(current, ref.anchor);
  return hit && { ...hit, end: passageMarkEnd(ref.anchor, hit.start, current.length) };
}

const code = encodePassage(createAnchor(original, start, start + sentence.length)!, '')!;

describe('passage arrival against edited text', () => {
  it('finds the passage where it was', () => {
    const hit = arrive(code, original)!;
    expect(hit.how).toBe('position');
    expect(original.slice(hit.start, hit.end)).toBe(sentence);
  });

  it('follows a passage that moved', () => {
    const edited = 'A new opening paragraph was added above.\n' + original;
    const hit = arrive(code, edited)!;
    expect(hit.how).toBe('unique');
    expect(edited.slice(hit.start, hit.end)).toBe(sentence);
  });

  it('picks the occurrence with the matching context when the passage is duplicated', () => {
    const copy = 'Elsewhere: ' + sentence + ' Different ending here.\n';
    const edited = copy + original;
    const hit = arrive(code, edited)!;
    expect(hit.how).toBe('context');
    expect(hit.start).toBe(edited.lastIndexOf(sentence));
  });

  it('reports a removed passage as missing', () => {
    expect(arrive(code, original.replace(sentence, 'Something else entirely.'))).toBeNull();
  });

  it('never resolves an empty text', () => {
    expect(arrive(code, '')).toBeNull();
  });

  it('marks the whole selection when the link was truncated to 300 characters', () => {
    const long = 'Long sentence about tides and moons. '.repeat(20);
    const text = 'Intro.\n' + long + 'Outro.';
    const a: TextAnchor = createAnchor(text, 7, 7 + long.length)!;
    const ref = decodePassage(encodePassage(a, '')!)!;
    expect(ref.anchor.exact.length).toBe(300);
    const hit = resolveAnchor(text, ref.anchor)!;
    expect(passageMarkEnd(ref.anchor, hit.start, text.length)).toBe(7 + long.length);
  });
});

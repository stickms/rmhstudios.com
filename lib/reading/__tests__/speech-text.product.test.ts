import { describe, expect, it } from 'vitest';
import { buildSegments, cleanSpeechText, type SpeechBlock } from '../speech-text';

const labels = { codeSkipped: 'Code block skipped', image: (alt: string) => `Image: ${alt}` };
const block = (kind: SpeechBlock<string>['kind'], text: string, element = text): SpeechBlock<string> => ({
  kind,
  text,
  element,
});

describe('buildSegments', () => {
  it('keeps headings, paragraphs and list items in document order with running indices', () => {
    const out = buildSegments(
      [
        block('text', 'Title', 'h1'),
        block('text', 'First.', 'p'),
        block('text', 'Item one', 'li'),
        block('text', 'Item two', 'li'),
      ],
      labels,
    );
    expect(out.map((s) => [s.index, s.text, s.element])).toEqual([
      [0, 'Title', 'h1'],
      [1, 'First.', 'p'],
      [2, 'Item one', 'li'],
      [3, 'Item two', 'li'],
    ]);
  });

  it('announces a code block instead of reading it', () => {
    const out = buildSegments(
      [block('text', 'Before'), block('code', 'const secret = 1;'), block('text', 'After')],
      labels,
    );
    expect(out.map((s) => s.text)).toEqual(['Before', 'Code block skipped', 'After']);
  });

  it('reads image alt text as "Image: …" and skips images without alt', () => {
    const out = buildSegments([block('image', '  A red   door '), block('image', ''), block('image', '   ')], labels);
    expect(out.map((s) => s.text)).toEqual(['Image: A red door']);
  });

  it('drops footnote markers and empty blocks, and re-indexes', () => {
    const out = buildSegments(
      [block('text', 'Claim[^1] stands.[2]'), block('text', '   '), block('text', 'Next')],
      labels,
    );
    expect(out.map((s) => [s.index, s.text])).toEqual([
      [0, 'Claim stands.'],
      [1, 'Next'],
    ]);
  });
});

describe('cleanSpeechText', () => {
  it('collapses whitespace and keeps ordinary bracketed words', () => {
    expect(cleanSpeechText('a\n  b [sic]\tc')).toBe('a b [sic] c');
  });
});

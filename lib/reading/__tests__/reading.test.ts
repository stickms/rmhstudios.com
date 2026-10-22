import { describe, expect, it } from 'vitest';
import { resolveAnchor, createAnchor } from '@/lib/library/text-anchor';
import { passagesFor, splitSentences, hashText, textVersion } from '../passages';
import { extractFootnotes } from '../footnotes';
import { buildGlossaryMatcher, findGlossaryMatches } from '../glossary';
import { createHighlightSchema, storySlug } from '../schema';

describe('passages', () => {
  const text =
    'The moon rose slowly. Nobody spoke for a long while. Then the gate opened.\nA new paragraph begins here.';

  it('splits sentences on terminators and paragraph breaks', () => {
    const parts = splitSentences(text).map((s) => text.slice(s.start, s.end));
    expect(parts).toEqual([
      'The moon rose slowly.',
      'Nobody spoke for a long while.',
      'Then the gate opened.',
      'A new paragraph begins here.',
    ]);
  });

  it('counts a highlight toward every sentence it touches, and no others', () => {
    const start = text.indexOf('slowly');
    const end = text.indexOf('while') + 5;
    const refs = passagesFor(text, start, end);
    expect(refs.map((r) => r.sample)).toEqual([
      'The moon rose slowly.',
      'Nobody spoke for a long while.',
    ]);
  });

  it('keys a passage on its normalised text, not its offset', () => {
    const a = passagesFor('  Shift   me.  The moon rose slowly.', 20, 30);
    const b = passagesFor('The moon rose slowly.', 2, 8);
    expect(a[0]!.passage).toBe(b[0]!.passage);
    expect(hashText('a')).not.toBe(hashText('b'));
    expect(textVersion('x')).toHaveLength(12);
  });
});

describe('re-anchoring a highlight after an edit', () => {
  it('survives a typo fix above it and orphans when the text is gone', () => {
    const before = 'Intro paragrph. The ancient gate opened at dawn.';
    const start = before.indexOf('The ancient');
    const anchor = createAnchor(before, start, start + 'The ancient gate'.length)!;
    const after = 'Intro paragraph with more words. The ancient gate opened at dawn.';
    const hit = resolveAnchor(after, anchor);
    expect(hit && after.slice(hit.start, hit.end)).toBe('The ancient gate');
    expect(resolveAnchor('Entirely rewritten.', anchor)).toBeNull();
  });
});

describe('footnotes', () => {
  it('numbers references in order and removes definitions', () => {
    const md = 'First[^b] and second[^a].\n\n[^a]: Alpha note.\n[^b]: Beta\n    continues.\n';
    const { body, notes } = extractFootnotes(md);
    expect(notes.map((n) => [n.index, n.label, n.text])).toEqual([
      [1, 'b', 'Beta continues.'],
      [2, 'a', 'Alpha note.'],
    ]);
    expect(body).toContain('[1](#rf-fn-1-1)');
    expect(body).toContain('[2](#rf-fn-2-1)');
    expect(body).not.toContain('Alpha note');
  });

  it('leaves code and undefined labels alone', () => {
    const md = 'Use `[^x]` here[^x] and[^y].\n\n```\n[^x]: not a def\n```\n\n[^x]: real\n';
    const { body, notes } = extractFootnotes(md);
    expect(notes).toHaveLength(1);
    expect(body).toContain('`[^x]`');
    expect(body).toContain('[^y]');
    expect(body).toContain('[^x]: not a def');
  });
});

describe('glossary', () => {
  const terms = [
    { id: 't1', term: 'Lunar Court', aliases: ['the Court'], definition: 'd', linkUrl: null },
    { id: 't2', term: 'Lunar', aliases: [], definition: 'd2', linkUrl: null },
  ];

  it('links the longest phrase, once per term, on word boundaries', () => {
    const m = buildGlossaryMatcher(terms)!;
    const seen = new Set<string>();
    const text = 'The Lunar Court met. The Court rose; Lunarian ignored. Lunar again.';
    const hits = findGlossaryMatches(text, m, seen);
    expect(hits.map((h) => [h.term.id, h.start])).toEqual([
      ['t1', 4],
      ['t2', text.lastIndexOf('Lunar')],
    ]);
  });
});

describe('schemas', () => {
  it('rejects an inverted anchor and slugifies story titles', () => {
    expect(
      createHighlightSchema.safeParse({ kind: 'blog', key: 'x', exact: 'a', start: 5, end: 3 })
        .success,
    ).toBe(false);
    expect(storySlug('The Great  Reboot!')).toBe('the-great-reboot');
  });
});

describe('reading challenge pace', () => {
  it('compares progress with a steady pace across the year', async () => {
    const { paceFor } = await import('../goal');
    const mid = new Date(Date.UTC(2026, 6, 2, 12));
    expect(paceFor(12, 24, 2026, mid).status).toBe('on-track');
    expect(paceFor(20, 24, 2026, mid).status).toBe('ahead');
    expect(paceFor(3, 24, 2026, mid).status).toBe('behind');
    expect(paceFor(24, 24, 2026, mid).status).toBe('done');
  });
});

describe('pdf text', () => {
  it('joins lines, un-hyphenates and splits paragraphs on big gaps', async () => {
    const { pdfItemsToText } = await import('../pdf-text');
    const text = pdfItemsToText([
      { str: 'An exam-', hasEOL: true, height: 10, transform: [1, 0, 0, 1, 0, 700] },
      { str: 'ple line.', hasEOL: true, height: 10, transform: [1, 0, 0, 1, 0, 688] },
      { str: 'Next paragraph.', hasEOL: true, height: 10, transform: [1, 0, 0, 1, 0, 640] },
    ]);
    expect(text).toBe('An example line.\n\nNext paragraph.');
    expect(pdfItemsToText([])).toBe('');
  });
});

import { describe, expect, it } from 'vitest';
import { WIKI_DESCRIPTION_MAX, wikiDescription } from '@/lib/communities/wiki-seo';

describe('wikiDescription', () => {
  it('returns a short page as one plain line', () => {
    expect(wikiDescription('# FAQ\n\nHow the **weekly** thread works.')).toBe('FAQ How the weekly thread works.');
  });

  it('keeps link text and drops targets and code blocks', () => {
    expect(wikiDescription('See [the rules](https://example.com/r) first.\n```\nsecret\n```')).toBe(
      'See the rules first.',
    );
  });

  it('cuts a long page to 160 characters at a word, with an ellipsis', () => {
    const out = wikiDescription('word '.repeat(100));
    expect(out.length).toBeLessThanOrEqual(WIKI_DESCRIPTION_MAX);
    expect(out.endsWith('…')).toBe(true);
  });

  it('is empty for an empty page', () => {
    expect(wikiDescription('  \n ')).toBe('');
  });
});

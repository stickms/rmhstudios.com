import { describe, expect, it } from 'vitest';
import { isWikiTitle, wikiPageUrl } from '@/lib/wiki/editor-fields';
import {
  createWikiPageBody,
  updateWikiPageBody,
  wikiAssistBody,
  wikiTitle,
} from '@/lib/wiki/wiki-schema';

const GOOD = [
  'Games',
  'Coins and memberships',
  'Games/Balatro',
  'RMHTube: uploading',
  "Player's guide",
  'Café',
];
const BAD = ['', '   ', '[[Games]]', 'Games#Top', 'a|b', '{{x}}', '<b>', 'tab\there'];

describe('wiki page titles', () => {
  it.each(GOOD)('accepts %j', (title) => {
    expect(wikiTitle.safeParse(title).success).toBe(true);
    expect(isWikiTitle(title)).toBe(true);
  });

  it.each(BAD)('rejects %j', (title) => {
    expect(wikiTitle.safeParse(title).success).toBe(false);
    expect(isWikiTitle(title)).toBe(false);
  });

  it('caps the length in the schema and the editor alike', () => {
    const long = 'a'.repeat(256);
    expect(wikiTitle.safeParse(long).success).toBe(false);
    expect(isWikiTitle(long)).toBe(false);
  });
});

describe('request bodies', () => {
  const page = { title: 'Games', content: 'Body', summary: '' };

  it('accepts a full page and trims the title and summary', () => {
    const parsed = createWikiPageBody.parse({ ...page, title: '  Games ', summary: ' typo ' });
    expect(parsed.title).toBe('Games');
    expect(parsed.summary).toBe('typo');
  });

  it('rejects an empty title, an empty body, an oversized body and a long summary', () => {
    expect(createWikiPageBody.safeParse({ ...page, title: ' ' }).success).toBe(false);
    expect(createWikiPageBody.safeParse({ ...page, content: '' }).success).toBe(false);
    expect(createWikiPageBody.safeParse({ ...page, content: 'x'.repeat(200_001) }).success).toBe(
      false,
    );
    expect(createWikiPageBody.safeParse({ ...page, summary: 'x'.repeat(501) }).success).toBe(false);
  });

  it('an update has no title, so a page cannot be moved through the site, and names its base revision', () => {
    const update = { content: 'Body', summary: '', baseRevisionId: 12 };
    expect(updateWikiPageBody.safeParse(update).success).toBe(true);
    expect('title' in updateWikiPageBody.parse({ ...update, title: 'Elsewhere' })).toBe(false);
    for (const baseRevisionId of [undefined, 0, -1, 1.5, '12']) {
      expect(updateWikiPageBody.safeParse({ ...update, baseRevisionId }).success).toBe(false);
    }
  });

  it('the assistant needs an instruction and bounds what it is sent', () => {
    const body = { instruction: 'Write it', title: '', content: '' };
    expect(wikiAssistBody.safeParse(body).success).toBe(true);
    expect(wikiAssistBody.safeParse({ ...body, instruction: '  ' }).success).toBe(false);
    expect(wikiAssistBody.safeParse({ ...body, instruction: 'x'.repeat(2_001) }).success).toBe(
      false,
    );
    expect(wikiAssistBody.safeParse({ ...body, content: 'x'.repeat(60_001) }).success).toBe(false);
  });
});

describe('editor helpers', () => {
  const base = 'https://wiki.rmhstudios.com';

  it('links a page the way MediaWiki does: underscores for spaces, slashes and colons kept', () => {
    expect(wikiPageUrl(base, 'Main Page')).toBe(`${base}/wiki/Main_Page`);
    expect(wikiPageUrl(base, 'Games/Balatro')).toBe(`${base}/wiki/Games/Balatro`);
    expect(wikiPageUrl(base, 'RMHTube: uploading')).toBe(`${base}/wiki/RMHTube:_uploading`);
  });

  it('percent-encodes everything else, so a title cannot change the URL it points at', () => {
    expect(wikiPageUrl(base, 'Q&A?x=1')).toBe(`${base}/wiki/Q%26A%3Fx%3D1`);
    expect(wikiPageUrl(base, 'Café')).toBe(`${base}/wiki/Caf%C3%A9`);
  });
});

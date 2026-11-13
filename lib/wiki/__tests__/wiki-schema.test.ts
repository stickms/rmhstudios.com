import { describe, expect, it } from 'vitest';
import { isWikiPath, parseWikiTags, slugifyWikiTitle } from '@/lib/wiki/editor-fields';
import {
  createWikiPageBody,
  updateWikiPageBody,
  wikiAssistBody,
  wikiPath,
} from '@/lib/wiki/wiki-schema';

const GOOD = ['home', 'coins-and-memberships', 'games/balatro', 'a/b/c', 'v2'];
const BAD = ['', 'Home', 'a b', '/games', 'games/', 'a//b', '-a', 'a-', 'a--b', 'a_b', '../x', 'é'];

describe('wiki page paths', () => {
  it.each(GOOD)('accepts %s', (path) => {
    expect(wikiPath.safeParse(path).success).toBe(true);
    expect(isWikiPath(path)).toBe(true);
  });

  it.each(BAD)('rejects %j', (path) => {
    expect(wikiPath.safeParse(path).success).toBe(false);
    expect(isWikiPath(path)).toBe(false);
  });

  it('caps the length in the schema and the editor alike', () => {
    const long = 'a'.repeat(201);
    expect(wikiPath.safeParse(long).success).toBe(false);
    expect(isWikiPath(long)).toBe(false);
  });
});

describe('request bodies', () => {
  const page = {
    path: 'games',
    title: 'Games',
    description: '',
    content: 'Body',
    tags: ['games'],
    isPublished: true,
  };

  it('accepts a full page and trims the title', () => {
    const parsed = createWikiPageBody.parse({ ...page, title: '  Games ' });
    expect(parsed.title).toBe('Games');
  });

  it('rejects an empty title, an empty body and an oversized body', () => {
    expect(createWikiPageBody.safeParse({ ...page, title: ' ' }).success).toBe(false);
    expect(createWikiPageBody.safeParse({ ...page, content: '' }).success).toBe(false);
    expect(createWikiPageBody.safeParse({ ...page, content: 'x'.repeat(200_001) }).success).toBe(
      false,
    );
  });

  it('an update has no path: a page cannot be moved through the site', () => {
    const { path: _path, ...fields } = page;
    expect(updateWikiPageBody.safeParse(fields).success).toBe(true);
    expect('path' in updateWikiPageBody.parse({ ...fields, path: 'elsewhere' })).toBe(false);
  });

  it('caps tags', () => {
    const tags = Array.from({ length: 21 }, (_, i) => `t${i}`);
    expect(createWikiPageBody.safeParse({ ...page, tags }).success).toBe(false);
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
  it('suggests a valid path from a title', () => {
    expect(slugifyWikiTitle('Battle Pass Guide')).toBe('battle-pass-guide');
    expect(slugifyWikiTitle('  RMHarks: the feed!  ')).toBe('rmharks-the-feed');
    expect(slugifyWikiTitle('Café Déjà')).toBe('cafe-deja');
    expect(isWikiPath(slugifyWikiTitle('Coins & memberships (2026)'))).toBe(true);
    expect(slugifyWikiTitle('!!!')).toBe('');
  });

  it('parses a comma-separated tag field', () => {
    expect(parseWikiTags(' games, apps ,, games ,')).toEqual(['games', 'apps']);
    expect(parseWikiTags('')).toEqual([]);
  });
});

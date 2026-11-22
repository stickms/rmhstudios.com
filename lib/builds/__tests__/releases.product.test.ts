import { describe, expect, it } from 'vitest';
import {
  CHANGELOG_MAX,
  commitLink,
  isValidCommitHash,
  isValidVersion,
  releasePreview,
  shortCommit,
  sortReleases,
  splitReleases,
} from '@/lib/builds/releases';
import { createReleaseBody } from '@/lib/builds/releases-schema';
import { commitFromGit, parseReleaseArgs } from '../../../rmhcode/src/lib/release-args';

describe('version rule', () => {
  it.each(['1', '1.0', '1.0.0', 'v2', '2.0.0-beta.1', '1.0+build5', 'A', 'a'.repeat(20)])('accepts %s', (v) => {
    expect(isValidVersion(v)).toBe(true);
  });
  it.each(['', '.1', '-1', '+1', '1 0', '1_0', 'v1/2', '1.0!', 'a'.repeat(21), 'é1'])('rejects %j', (v) => {
    expect(isValidVersion(v)).toBe(false);
  });
});

describe('commit hash', () => {
  it('is 7 to 40 hex characters', () => {
    expect(isValidCommitHash('abc1234')).toBe(true);
    expect(isValidCommitHash('A'.repeat(40))).toBe(true);
    expect(isValidCommitHash('abc123')).toBe(false);
    expect(isValidCommitHash('a'.repeat(41))).toBe(false);
    expect(isValidCommitHash('abc123g')).toBe(false);
  });
  it('is shown as seven characters', () => {
    expect(shortCommit('0123456789abcdef')).toBe('0123456');
  });
});

describe('commit link', () => {
  const hash = '3F2A9C1D4E5B6A7988776655443322110FEDCBA9';
  it('links a GitHub repository to the commit, lower-cased', () => {
    expect(commitLink('https://github.com/rmh/studio', hash)).toBe(
      `https://github.com/rmh/studio/commit/${hash.toLowerCase()}`,
    );
    expect(commitLink('https://github.com/rmh/studio.git', 'abc1234')).toBe(
      'https://github.com/rmh/studio/commit/abc1234',
    );
    expect(commitLink('http://www.github.com/rmh/studio/tree/main', 'abc1234')).toBe(
      'https://github.com/rmh/studio/commit/abc1234',
    );
  });
  it('gives no link for another host, a look-alike, a bare owner or no repository', () => {
    for (const url of [
      'https://gitlab.com/rmh/studio',
      'https://github.com.evil.test/rmh/studio',
      'https://evil.test/github.com/rmh/studio',
      'https://github.com/rmh',
      'javascript:alert(1)',
      'not a url',
      '',
      null,
      undefined,
    ]) {
      expect(commitLink(url, 'abc1234')).toBeNull();
    }
    expect(commitLink('https://github.com/rmh/studio', null)).toBeNull();
    expect(commitLink('https://github.com/rmh/studio', 'nothex!')).toBeNull();
  });
});

describe('ordering', () => {
  const r = (id: string, createdAt: string) => ({ id, createdAt });
  it('is newest first, ties broken by id, without mutating', () => {
    const input = [r('a', '2026-01-01T00:00:00Z'), r('c', '2026-03-01T00:00:00Z'), r('b', '2026-03-01T00:00:00Z')];
    expect(sortReleases(input).map((x) => x.id)).toEqual(['c', 'b', 'a']);
    expect(input.map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('splits the latest from the earlier ones', () => {
    expect(splitReleases([])).toEqual({ latest: null, earlier: [] });
    const { latest, earlier } = splitReleases([r('old', '2026-01-01T00:00:00Z'), r('new', '2026-02-01T00:00:00Z')]);
    expect(latest?.id).toBe('new');
    expect(earlier.map((x) => x.id)).toEqual(['old']);
  });
  it('words the notification', () => {
    expect(releasePreview('Cube Run', '1.1').fallback).toBe('Cube Run 1.1 is out');
  });
});

describe('create body', () => {
  it('trims the version and commit and keeps the changelog as written', () => {
    expect(createReleaseBody.parse({ version: ' 1.1 ', changelog: '## Fixed\n- a', commitHash: ' abc1234 ' })).toEqual({
      version: '1.1',
      changelog: '## Fixed\n- a',
      commitHash: 'abc1234',
    });
  });
  it('bounds the changelog', () => {
    expect(createReleaseBody.safeParse({ version: '1', changelog: 'x'.repeat(CHANGELOG_MAX) }).success).toBe(true);
    expect(createReleaseBody.safeParse({ version: '1', changelog: 'x'.repeat(CHANGELOG_MAX + 1) }).success).toBe(false);
  });
});

describe('rmhcode release arguments', () => {
  it('reads every option, spaced or with an equals sign', () => {
    expect(
      parseReleaseArgs(['--version', '1.2', '--notes=CHANGES.md', '--commit', 'abc1234', '--build', 'my-build']),
    ).toEqual({
      version: '1.2',
      notes: 'CHANGES.md',
      commit: 'abc1234',
      build: 'my-build',
    });
    expect(parseReleaseArgs([])).toEqual({});
  });
  it('refuses an unknown option or a missing value', () => {
    expect(() => parseReleaseArgs(['--tag', 'x'])).toThrow(/Unknown option/);
    expect(() => parseReleaseArgs(['--version'])).toThrow(/needs a value/);
    expect(() => parseReleaseArgs(['--version', '--notes', 'f'])).toThrow(/needs a value/);
  });
  it('takes the commit from git only when it is a full hash', () => {
    expect(commitFromGit('3F2A9C1D4E5B6A7988776655443322110FEDCBA9\n')).toBe(
      '3f2a9c1d4e5b6a7988776655443322110fedcba9',
    );
    expect(commitFromGit('HEAD\n')).toBeUndefined();
    expect(commitFromGit('')).toBeUndefined();
  });
});

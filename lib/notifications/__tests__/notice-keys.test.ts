import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NOTICE_KEY_MAX,
  NOTICE_TEMPLATES,
  fillNotice,
  formatNoticeInstantUtc,
  isNoticeKey,
  noticeColumns,
  noticeFallbackText,
  noticeParamNames,
  notice,
  type NoticeKey,
} from '@/lib/notifications/notice-keys';
import { formatEnd } from '@/lib/communities/bans';

const CATALOGUE = JSON.parse(readFileSync('locales/en/notice-language.json', 'utf8')) as Record<string, string>;
const KEYS = Object.keys(NOTICE_TEMPLATES) as NoticeKey[];
const AT = '2026-12-01T14:30:00.000Z';

function sampleParams(key: NoticeKey): Record<string, string> {
  return Object.fromEntries(
    noticeParamNames(NOTICE_TEMPLATES[key]).map((n) => [n, n.endsWith('At') ? AT : `Sample ${n}`]),
  );
}

describe('the notice keys', () => {
  it('has a catalogue entry for every key, saying what the template says', () => {
    for (const key of KEYS) expect(CATALOGUE[`notice-${key}`], key).toBe(NOTICE_TEMPLATES[key]);
  });

  it('has no catalogue entry for a key the code does not have', () => {
    expect(Object.keys(CATALOGUE).sort()).toEqual(KEYS.map((k) => `notice-${k}`).sort());
  });

  it('keeps every key inside the column and in kebab case', () => {
    for (const key of KEYS) {
      expect(key.length, key).toBeLessThanOrEqual(NOTICE_KEY_MAX);
      expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('builds the fallback from the template and the params, for every key', () => {
    for (const key of KEYS) {
      const params = sampleParams(key);
      const built = notice(key, params as never);
      expect(built.key).toBe(key);
      expect(built.fallback).toBe(fillNotice(NOTICE_TEMPLATES[key], params));
      expect(built.fallback, key).not.toMatch(/\{\{|\}\}/);
      expect(built.params).toEqual(params);
    }
  });

  it('names an instant param with an At suffix, and nothing else', () => {
    for (const key of KEYS) {
      for (const name of noticeParamNames(NOTICE_TEMPLATES[key])) {
        if (/at$/i.test(name)) expect(name, key).toMatch(/At$/);
      }
    }
  });

  it('stores an instant as an ISO string that parses back to the same moment', () => {
    const built = notice('community-timeout-until', { community: 'Chess', endsAt: new Date(AT) });
    expect(built.params.endsAt).toBe(AT);
    expect(new Date(String(built.params.endsAt)).toISOString()).toBe(AT);
  });

  it('writes the fallback instant as UTC English, the form server text always used', () => {
    expect(formatNoticeInstantUtc(AT)).toBe('1 Dec 2026, 14:30 UTC');
    expect(formatNoticeInstantUtc(AT)).toBe(formatEnd(new Date(AT)));
    expect(notice('community-ban-until', { community: 'Chess', endsAt: AT }).fallback).toBe(
      'You were banned from Chess until 1 Dec 2026, 14:30 UTC',
    );
  });

  it('leaves a number a number and drops nothing the template needs', () => {
    const built = notice('wager-won', { coins: 250 });
    expect(built.params).toEqual({ coins: 250 });
    expect(built.fallback).toBe('You won a wager — 250 coins paid out');
  });

  it('recognises only its own keys', () => {
    expect(isNoticeKey('level-reached')).toBe(true);
    expect(isNoticeKey('toString')).toBe(false);
    expect(isNoticeKey('nope')).toBe(false);
    expect(isNoticeKey(null)).toBe(false);
  });

  it('reads the English out of either preview form, and out of nothing', () => {
    expect(noticeFallbackText('Plain')).toBe('Plain');
    expect(noticeFallbackText(notice('level-reached', { level: 3 }))).toBe('You reached level 3!');
    expect(noticeFallbackText(null)).toBeNull();
    expect(noticeFallbackText(undefined)).toBeNull();
  });

  it('gives a direct writer the three columns, the preview inside its 280', () => {
    const cols = noticeColumns(notice('level-reached', { level: 3 }));
    expect(cols).toEqual({ preview: 'You reached level 3!', previewKey: 'level-reached', previewParams: { level: 3 } });
    expect(noticeColumns(notice('keyword-alert', { keyword: 'k', text: 'x'.repeat(400) })).preview).toHaveLength(280);
  });
});

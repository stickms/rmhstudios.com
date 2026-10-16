import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  capsuleDateError,
  formatCountdown,
  isExpired,
  isValidDayKey,
  qotdAddSchema,
  saveNoteSchema,
  ttlToExpiry,
  utcDayKey,
} from '../constants';
import { BUILTIN_QOTD_PROMPTS, builtinPromptFor } from '../qotd-builtin';
import { classifyStatus, parseWaybackResponse, waybackTimestampToIso } from '../wayback';

describe('X8 expiry rules', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('computes the TTL from creation', () => {
    expect(ttlToExpiry('1h', now).toISOString()).toBe('2026-10-12T13:00:00.000Z');
    expect(ttlToExpiry('24h', now).toISOString()).toBe('2026-10-13T12:00:00.000Z');
    expect(ttlToExpiry('7d', now).toISOString()).toBe('2026-10-19T12:00:00.000Z');
  });
  it('hides a post at read time exactly when it expires', () => {
    const t = now.getTime();
    expect(isExpired(null, t)).toBe(false);
    expect(isExpired(undefined, t)).toBe(false);
    expect(isExpired(new Date(t + 1).toISOString(), t)).toBe(false);
    expect(isExpired(new Date(t).toISOString(), t)).toBe(true);
    expect(isExpired('not a date', t)).toBe(false);
  });
});

describe('Z7 capsule date rule', () => {
  const now = new Date('2026-10-12T12:00:00Z');
  it('refuses anything under a day, and anything absurdly far out', () => {
    expect(capsuleDateError(new Date(now.getTime() + 3_600_000), now)).toMatch(/at least a day/);
    expect(capsuleDateError(new Date(now.getTime() + 11 * 365 * DAY_MS), now)).toMatch(/ten years/);
    expect(capsuleDateError(new Date('nope'), now)).toBe('Invalid date');
  });
  it('accepts a day or more', () => {
    expect(capsuleDateError(new Date(now.getTime() + DAY_MS), now)).toBeNull();
    expect(capsuleDateError(new Date(now.getTime() + 400 * DAY_MS), now)).toBeNull();
  });
  it('formats a coarse countdown', () => {
    const t = now.getTime();
    expect(formatCountdown(new Date(t + 3 * DAY_MS + 4 * 3_600_000), t)).toBe('3d 4h');
    expect(formatCountdown(new Date(t + 2 * 3_600_000 + 5 * 60_000), t)).toBe('2h 5m');
    expect(formatCountdown(new Date(t + 30_000), t)).toBe('1m');
    expect(formatCountdown(new Date(t - 5), t)).toBe('0m');
  });
});

describe('X4 prompts', () => {
  it('validates day keys as real calendar dates', () => {
    expect(isValidDayKey('2026-10-12')).toBe(true);
    expect(isValidDayKey('2026-02-31')).toBe(false);
    expect(isValidDayKey('2026-1-1')).toBe(false);
    expect(utcDayKey(new Date('2026-10-12T23:59:59Z'))).toBe('2026-10-12');
  });
  it('the built-in rotation is a pure function of the date and covers every prompt', () => {
    expect(builtinPromptFor('2026-10-12')).toBe(builtinPromptFor('2026-10-12'));
    const seen = new Set<string>();
    for (let i = 0; i < BUILTIN_QOTD_PROMPTS.length; i++) {
      seen.add(builtinPromptFor(utcDayKey(new Date(Date.UTC(2026, 0, 1 + i)))));
    }
    expect(seen.size).toBe(BUILTIN_QOTD_PROMPTS.length);
    expect(builtinPromptFor('garbage')).toBe(BUILTIN_QOTD_PROMPTS[0]);
  });
  it('admin input is bounded', () => {
    expect(qotdAddSchema.safeParse({ text: 'x'.repeat(281) }).success).toBe(false);
    expect(qotdAddSchema.safeParse({ text: 'short' }).success).toBe(false);
    expect(
      qotdAddSchema.safeParse({ text: 'A decent question?', dayKey: '2026-10-20' }).success,
    ).toBe(true);
  });
});

describe('X9 note schema', () => {
  it('caps a note at 500 characters and allows clearing', () => {
    const base = { entityType: 'rmhark', entityId: 'abc' };
    expect(saveNoteSchema.safeParse({ ...base, note: 'n'.repeat(500) }).success).toBe(true);
    expect(saveNoteSchema.safeParse({ ...base, note: 'n'.repeat(501) }).success).toBe(false);
    expect(saveNoteSchema.safeParse({ ...base, note: null }).success).toBe(true);
  });
});

describe('X11 dead-link rules', () => {
  it('only 404 and 410 mean gone', () => {
    expect(classifyStatus(200)).toBe('ok');
    expect(classifyStatus(301)).toBe('ok');
    expect(classifyStatus(404)).toBe('gone');
    expect(classifyStatus(410)).toBe('gone');
    for (const s of [401, 403, 405, 429, 500, 503]) expect(classifyStatus(s)).toBe('unknown');
  });

  const snap = (over: Record<string, unknown> = {}) => ({
    archived_snapshots: {
      closest: {
        available: true,
        status: '200',
        url: 'http://web.archive.org/web/20200101000000/https://example.com/x',
        timestamp: '20200101000000',
        ...over,
      },
    },
  });

  it('accepts an available 200 capture and upgrades it to https', () => {
    expect(parseWaybackResponse(snap())).toEqual({
      url: 'https://web.archive.org/web/20200101000000/https://example.com/x',
      timestamp: '20200101000000',
    });
  });
  it('rejects unusable or hostile responses', () => {
    expect(parseWaybackResponse({})).toBeNull();
    expect(parseWaybackResponse(null)).toBeNull();
    expect(parseWaybackResponse({ archived_snapshots: {} })).toBeNull();
    expect(parseWaybackResponse(snap({ available: false }))).toBeNull();
    expect(parseWaybackResponse(snap({ status: '404' }))).toBeNull();
    expect(parseWaybackResponse(snap({ timestamp: '2020' }))).toBeNull();
    // A snapshot URL that points off archive.org must never become the card's link.
    expect(parseWaybackResponse(snap({ url: 'https://evil.example/web/2020/x' }))).toBeNull();
    expect(parseWaybackResponse(snap({ url: 'https://archive.org.evil.example/x' }))).toBeNull();
    expect(parseWaybackResponse(snap({ url: 'javascript:alert(1)' }))).toBeNull();
  });
  it('formats the capture date', () => {
    expect(waybackTimestampToIso('20200131093000')).toBe('2020-01-31T09:30:00.000Z');
    expect(waybackTimestampToIso('bad')).toBeNull();
  });
});

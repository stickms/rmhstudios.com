import { describe, it, expect } from 'vitest';
import { createReminderSchema, isSiteRelativePath, resolvePreset } from '@/lib/reminders/schema';

/**
 * Reminders (plan U7). A fired reminder is a notification whose link the user
 * taps without reading, so its URL must never leave the site — this is the
 * guard that keeps a reminder from becoming an open redirect.
 */
describe('isSiteRelativePath', () => {
  it('accepts same-site paths', () => {
    expect(isSiteRelativePath('/u/ana/post/abc')).toBe(true);
    expect(isSiteRelativePath('/notifications?x=1#y')).toBe(true);
  });

  it('rejects anything that can leave the origin', () => {
    for (const bad of [
      'https://evil.example/',
      '//evil.example/x',
      '/\\evil.example',
      'javascript:alert(1)',
      'u/ana',
      '/ spaced',
      '',
    ]) {
      expect(isSiteRelativePath(bad), bad).toBe(false);
    }
    expect(isSiteRelativePath('/' + 'a'.repeat(600))).toBe(false);
  });

  it('is what the route schema enforces', () => {
    const base = {
      kind: 'post',
      targetId: 'p1',
      label: 'Post by Ana',
      remindAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    expect(createReminderSchema.safeParse({ ...base, url: '/u/ana/post/p1' }).success).toBe(true);
    expect(createReminderSchema.safeParse({ ...base, url: '//evil.example' }).success).toBe(false);
  });
});

describe('resolvePreset', () => {
  const now = new Date(2026, 9, 11, 14, 0, 0); // local 14:00

  it('resolves in the viewer clock', () => {
    expect(resolvePreset('hour', now).getTime()).toBe(now.getTime() + 3_600_000);
    expect(resolvePreset('tonight', now).getHours()).toBe(20);
    const tomorrow = resolvePreset('tomorrow', now);
    expect([tomorrow.getDate(), tomorrow.getHours()]).toEqual([12, 9]);
    expect(resolvePreset('week', now).getDate()).toBe(18);
  });

  it('"tonight" after 8pm falls back to an hour from now, never the past', () => {
    const late = new Date(2026, 9, 11, 21, 30, 0);
    expect(resolvePreset('tonight', late).getTime()).toBe(late.getTime() + 3_600_000);
  });
});

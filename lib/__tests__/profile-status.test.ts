import { describe, it, expect } from 'vitest';
import {
  resolveStatus,
  statusExpiresAt,
  statusUpdateSchema,
  STATUS_MAX_TEXT,
} from '@/lib/profile/status';

describe('resolveStatus', () => {
  const now = Date.parse('2026-07-20T12:00:00Z');

  it('returns null for no status', () => {
    expect(resolveStatus(null, now)).toBeNull();
    expect(resolveStatus({}, now)).toBeNull();
    expect(resolveStatus({ statusText: '   ', statusEmoji: '' }, now)).toBeNull();
  });

  it('returns text-only and emoji-only statuses', () => {
    expect(resolveStatus({ statusText: 'Vibing' }, now)).toEqual({ emoji: null, text: 'Vibing' });
    expect(resolveStatus({ statusEmoji: '🎮' }, now)).toEqual({ emoji: '🎮', text: '' });
  });

  it('honors expiry at read time', () => {
    const past = new Date('2026-07-20T11:59:00Z');
    const future = new Date('2026-07-20T12:01:00Z');
    expect(resolveStatus({ statusText: 'gone', statusExpires: past }, now)).toBeNull();
    expect(resolveStatus({ statusText: 'here', statusExpires: future }, now)).toEqual({
      emoji: null,
      text: 'here',
    });
  });

  it('accepts a string expiry (as serialized over JSON)', () => {
    expect(resolveStatus({ statusText: 'x', statusExpires: '2026-07-20T11:00:00Z' }, now)).toBeNull();
  });
});

describe('statusExpiresAt', () => {
  const now = new Date('2026-07-20T12:00:00Z');

  it('computes relative expiries', () => {
    expect(statusExpiresAt('30m', now)?.toISOString()).toBe('2026-07-20T12:30:00.000Z');
    expect(statusExpiresAt('1h', now)?.toISOString()).toBe('2026-07-20T13:00:00.000Z');
  });

  it('computes end-of-UTC-day for "today"', () => {
    expect(statusExpiresAt('today', now)?.toISOString()).toBe('2026-07-20T23:59:59.999Z');
  });

  it('returns null for no expiry', () => {
    expect(statusExpiresAt(null, now)).toBeNull();
    expect(statusExpiresAt(undefined, now)).toBeNull();
  });
});

describe('statusUpdateSchema', () => {
  it('accepts valid input', () => {
    expect(statusUpdateSchema.safeParse({ emoji: '🎮', text: 'gg', expiresIn: '1h' }).success).toBe(true);
    expect(statusUpdateSchema.safeParse({}).success).toBe(true);
  });

  it('rejects overlong text and bad expiry', () => {
    expect(statusUpdateSchema.safeParse({ text: 'a'.repeat(STATUS_MAX_TEXT + 1) }).success).toBe(false);
    expect(statusUpdateSchema.safeParse({ expiresIn: 'forever' }).success).toBe(false);
  });
});

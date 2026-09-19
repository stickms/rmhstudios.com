import { describe, it, expect } from 'vitest';

/**
 * Member memory (M3) — the key vocabulary and the overwrite rule.
 *
 * The rule with teeth is that a member's own correction is never overwritten
 * by a surface. Somebody who tells the site it is wrong about them should not
 * have to tell it again next week, and a coach cheerfully restoring its own
 * guess is exactly how a memory feature becomes one people switch off.
 */

import {
  MEMORY_NAMESPACES,
  NAMESPACE_TTL_DAYS,
  expiryFor,
  isExpired,
  isValidKey,
  mayOverwrite,
  namespaceOf,
} from '@/lib/ai/memory/keys';

const NOW = new Date('2026-09-19T12:00:00Z');
const DAY = 86_400_000;

describe('the key vocabulary', () => {
  it('accepts a namespaced key', () => {
    expect(isValidKey('prefers.game')).toBe(true);
    expect(isValidKey('goal.active-run')).toBe(true);
    expect(isValidKey('context.last-seen')).toBe(true);
  });

  it('refuses a key outside the vocabulary', () => {
    // An open key space becomes a junk drawer within a month, and the failure
    // is silent: every surface writes what it likes and nothing reads it.
    expect(isValidKey('whatever.thing')).toBe(false);
    expect(isValidKey('random')).toBe(false);
  });

  it('refuses a key with no namespace', () => {
    expect(isValidKey('prefers')).toBe(false);
  });

  it('refuses malformed and oversized keys', () => {
    expect(isValidKey('')).toBe(false);
    expect(isValidKey('prefers.')).toBe(false);
    expect(isValidKey('Prefers.Game')).toBe(false);
    expect(isValidKey(`prefers.${'x'.repeat(80)}`)).toBe(false);
  });

  it('resolves the namespace', () => {
    expect(namespaceOf('milestone.season')).toBe('milestone');
    expect(namespaceOf('nope.x')).toBeNull();
  });

  it('gives every namespace a TTL decision', () => {
    for (const ns of MEMORY_NAMESPACES) {
      expect(ns in NAMESPACE_TTL_DAYS).toBe(true);
    }
  });
});

describe('expiry', () => {
  it('never expires a taste', () => {
    // A preference is not an event; it is displaced by a newer write, not by
    // the calendar.
    expect(expiryFor('prefers.game', NOW)).toBeNull();
  });

  it('expires a goal after its window', () => {
    const at = expiryFor('goal.active', NOW)!;
    expect(at.getTime()).toBe(NOW.getTime() + NAMESPACE_TTL_DAYS.goal! * DAY);
  });

  it('expires context soonest', () => {
    expect(NAMESPACE_TTL_DAYS.context!).toBeLessThan(NAMESPACE_TTL_DAYS.milestone!);
    expect(NAMESPACE_TTL_DAYS.milestone!).toBeLessThan(NAMESPACE_TTL_DAYS.goal!);
  });

  it('returns null for a key it does not recognise', () => {
    expect(expiryFor('nonsense.key', NOW)).toBeNull();
  });

  it('reports an expired row as expired', () => {
    expect(isExpired({ expiresAt: new Date(NOW.getTime() - 1) }, NOW)).toBe(true);
    expect(isExpired({ expiresAt: new Date(NOW.getTime() + 1) }, NOW)).toBe(false);
    expect(isExpired({ expiresAt: null }, NOW)).toBe(false);
  });
});

describe('mayOverwrite', () => {
  it('lets a surface overwrite another surface', () => {
    expect(mayOverwrite('coach', 'recap')).toBe(true);
    expect(mayOverwrite('assistant', 'coach')).toBe(true);
  });

  it('never lets a surface overwrite the member', () => {
    for (const source of ['coach', 'recap', 'assistant', 'catchup'] as const) {
      expect(mayOverwrite('member', source)).toBe(false);
    }
  });

  it('lets the member overwrite themselves', () => {
    expect(mayOverwrite('member', 'member')).toBe(true);
  });
});

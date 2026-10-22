/**
 * Gift-exchange draw. Kept in the mission-critical suite because the draw
 * routes coin gifts: a self-assignment, a dropped member or a broken
 * exclusion sends a member's coins somewhere they did not agree to.
 */
import { describe, it, expect } from 'vitest';
import { drawExchange } from '@/lib/gifting/secret-santa';

function assertValid(members: string[], assignments: Map<string, string>) {
  expect([...assignments.keys()].sort()).toEqual([...members].sort());
  expect([...assignments.values()].sort()).toEqual([...members].sort());
  for (const [g, r] of assignments) expect(g).not.toBe(r);
}

describe('drawExchange', () => {
  const members = ['ana', 'bo', 'cy', 'di', 'ed', 'fi'];

  it('is a single cycle and reproducible from its seed', () => {
    const a = drawExchange({ members, seed: 42 });
    const b = drawExchange({ members, seed: 42 });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    assertValid(members, a.assignments);
    expect(a.singleCycle).toBe(true);
    expect([...a.assignments]).toEqual([...b.assignments]);
    // Walking the cycle from anyone visits everyone.
    let at = members[0]!;
    const visited = new Set<string>();
    for (let i = 0; i < members.length; i++) {
      visited.add(at);
      at = a.assignments.get(at)!;
    }
    expect(visited.size).toBe(members.length);
  });

  it('honours exclusions across many seeds', () => {
    const exclusions = [
      ['ana', 'bo'],
      ['bo', 'ana'],
      ['cy', 'di'],
    ] as const;
    for (let seed = 0; seed < 200; seed++) {
      const r = drawExchange({ members, exclusions, seed });
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      assertValid(members, r.assignments);
      for (const [g, rec] of exclusions) expect(r.assignments.get(g)).not.toBe(rec);
    }
  });

  it('refuses impossible, tiny and duplicated groups', () => {
    expect(drawExchange({ members: ['solo'], seed: 1 })).toEqual({ ok: false, reason: 'too-few' });
    expect(drawExchange({ members: ['a', 'a'], seed: 1 })).toEqual({
      ok: false,
      reason: 'duplicate-member',
    });
    expect(drawExchange({ members: ['a', 'b'], exclusions: [['a', 'b']], seed: 1 })).toEqual({
      ok: false,
      reason: 'impossible',
    });
  });
});

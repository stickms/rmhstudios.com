/**
 * s10-18: `held` on `/api/v1/me/scheduled*` is read from the publish checks, and now includes AutoMod: a draft the
 * community's rules would hold, flag or remove reports `automod` (the rule's text is never returned). Moderators are
 * exempt, as in the gate. Prisma and the community modules are stand-ins; the matcher is the real `evaluateAutomod`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScheduledPost } from '@prisma/client';

const h = vi.hoisted(() => ({
  rules: [] as unknown[],
  role: 'MEMBER' as string | null,
  rulesCalls: 0,
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    communityMember: { findUnique: vi.fn(async () => (h.role ? { role: h.role } : null)) },
    user: {
      findUnique: vi.fn(async () => ({ createdAt: new Date('2026-11-20T00:00:00Z'), image: null })),
    },
  },
}));
vi.mock('@/lib/communities/bans.server', () => ({ activeSanction: vi.fn(async () => null) }));
vi.mock('@/lib/communities/settings.server', () => ({
  getCommunitySettings: vi.fn(async () => ({ requireImageAlt: false })),
}));
vi.mock('@/lib/communities/automod.server', () => ({
  getAutomodRules: vi.fn(async () => {
    h.rulesCalls += 1;
    return h.rules;
  }),
}));
vi.mock('@/lib/communities/post-gate.server', () => ({ prepareCommunityPost: vi.fn() }));
vi.mock('@/lib/scheduled/publish.server', () => ({ publishScheduledPost: vi.fn(), publishDueForUser: vi.fn() }));
vi.mock('@/lib/scheduled/create.server', () => ({ createScheduledPost: vi.fn(), updateScheduledPost: vi.fn() }));

import { heldReasonsFor, serializeScheduled } from '@/lib/api/v1/scheduled.server';

const rule = (action: string, keyword: string, extra: Record<string, unknown> = {}) => ({
  id: `rule-${action}`,
  name: 'No spam',
  enabled: true,
  appliesTo: 'posts',
  action,
  conditions: { keywords: [keyword] },
  ...extra,
});

const draft = (id: string, content: string, extra: Partial<ScheduledPost> = {}): ScheduledPost =>
  ({
    id,
    userId: 'u1',
    content,
    communityId: 'c1',
    publishedId: null,
    imageUrls: [],
    imageAlts: [],
    gifUrl: null,
    gifAlt: null,
    ...extra,
  }) as ScheduledPost;

beforeEach(() => {
  h.rules = [];
  h.role = 'MEMBER';
  h.rulesCalls = 0;
});

describe('heldReasonsFor and AutoMod', () => {
  it('reports automod for a draft a rule would hold', async () => {
    h.rules = [rule('hold', 'buy followers')];
    const held = await heldReasonsFor([draft('a', 'Buy followers now'), draft('b', 'A fine post')]);
    expect(held.get('a')).toBe('automod');
    expect(held.has('b')).toBe(false);
  });

  it('reports automod for a rule that would flag or remove it, too', async () => {
    h.rules = [rule('flag', 'maybe')];
    expect((await heldReasonsFor([draft('a', 'maybe spam')])).get('a')).toBe('automod');
    h.rules = [rule('remove', 'definitely')];
    expect((await heldReasonsFor([draft('a', 'definitely spam')])).get('a')).toBe('automod');
  });

  it('never returns the rule: the serialised row carries only the reason', async () => {
    h.rules = [rule('hold', 'buy followers')];
    const held = await heldReasonsFor([draft('a', 'Buy followers now')]);
    const body = JSON.stringify(
      serializeScheduled(
        {
          ...draft('a', 'Buy followers now'),
          createdAt: new Date(),
          updatedAt: new Date(),
          scheduledAt: null,
        } as ScheduledPost,
        held.get('a') ?? null,
      ),
    );
    expect(body).toContain('"held":"automod"');
    expect(body).not.toContain('No spam');
    expect(body).not.toContain('rule-hold');
  });

  it('does not hold a moderator, whom the gate exempts', async () => {
    h.rules = [rule('hold', 'buy followers')];
    h.role = 'MOD';
    expect((await heldReasonsFor([draft('a', 'Buy followers now')])).size).toBe(0);
  });

  it('skips a draft with no community and one already published', async () => {
    h.rules = [rule('hold', 'buy followers')];
    const held = await heldReasonsFor([
      draft('a', 'buy followers', { communityId: null }),
      draft('b', 'buy followers', { publishedId: 'p1' }),
    ]);
    expect(held.size).toBe(0);
    expect(h.rulesCalls).toBe(0);
  });

  it("reads a community's rules once however many drafts it holds", async () => {
    h.rules = [rule('hold', 'spam')];
    await heldReasonsFor([draft('a', 'spam'), draft('b', 'spam two'), draft('c', 'fine')]);
    expect(h.rulesCalls).toBe(1);
  });
});

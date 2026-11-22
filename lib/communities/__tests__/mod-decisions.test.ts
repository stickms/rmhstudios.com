import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `decideModItem` is the one decision path: the site's route and the developer API both call it, so one decision
 * has the same side effects whichever way it came in. The only difference is the `via` marker in the moderators'
 * log detail, which the API sets and the site does not.
 */

const h = vi.hoisted(() => ({
  item: { current: null as null | Record<string, unknown> },
  resolve: vi.fn(),
  enqueue: vi.fn(),
  cite: vi.fn(),
  notify: vi.fn(),
  rule: { current: null as null | { id: string; position: number; title: string; description: string | null } },
}));

vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_options: unknown, handler: unknown) => handler,
}));
vi.mock('@/lib/communities/guard.server', () => ({
  requireMod: async () => ({ ok: true, value: { id: 'c1', name: 'Quiet Group' } }),
}));
vi.mock('@/lib/communities/automod.server', () => ({
  AutomodError: class extends Error {
    constructor(
      message: string,
      readonly status: 400 | 404 | 409,
    ) {
      super(message);
    }
  },
  resolveModItem: h.resolve,
}));
vi.mock('@/lib/communities/rules.server', () => ({
  getRule: vi.fn(async (_c: string, id: string) => (h.rule.current?.id === id ? h.rule.current : null)),
  recordCitation: h.cite,
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/communities/post-alerts.server', () => ({ enqueuePostAlert: h.enqueue }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { communityModItem: { findUnique: async () => h.item.current } },
}));

import { route } from '@/lib/communities/api/communities.$slug.modqueue.$itemId.server';
import { decideModItem } from '@/lib/communities/mod-decisions.server';
import { AutomodError } from '@/lib/communities/automod.server';

type Handler = (args: { params: Record<string, string>; userId: string; body: unknown }) => Promise<Response>;
const viaSite = (body: Record<string, unknown>) =>
  (route.handlers.POST as unknown as Handler)({ params: { slug: 'quiet', itemId: 'i1' }, userId: 'mod', body });
const viaApi = (d: { decision: 'approve' | 'remove'; ruleId?: string; message?: string }) =>
  decideModItem({
    community: { id: 'c1', name: 'Quiet Group' },
    itemId: 'i1',
    decision: d.decision,
    moderatorId: 'mod',
    ruleId: d.ruleId,
    message: d.message,
    via: 'api',
  });

/** Everything a decision did, with the one allowed difference (`via`) taken out of what the log was told. */
const effects = () => ({
  resolve: h.resolve.mock.calls.map(([c, i, d, m, note]) => [
    c,
    i,
    d,
    m,
    Object.fromEntries(Object.entries(note ?? {}).filter(([k]) => k !== 'via')),
  ]),
  enqueue: h.enqueue.mock.calls,
  cite: h.cite.mock.calls,
  notify: h.notify.mock.calls,
});

beforeEach(() => {
  for (const fn of [h.resolve, h.enqueue, h.cite, h.notify]) fn.mockReset();
  h.resolve.mockImplementation(async (_c: string, _i: string, d: string) => ({
    status: d === 'approve' ? 'APPROVED' : 'REMOVED',
  }));
  h.item.current = { action: 'hold', entityType: 'rmhark', entityId: 'p1', authorId: 'author1' };
  h.rule.current = { id: 'r1', position: 3, title: 'Be kind', description: null };
});

const SCENARIOS: [string, { decision: 'approve' | 'remove'; ruleId?: string; message?: string }][] = [
  ['approving a held post', { decision: 'approve' }],
  ['removing with no rule and no note', { decision: 'remove' }],
  ['removing with a note only', { decision: 'remove', message: 'Not for this group.' }],
  ['removing citing a rule', { decision: 'remove', ruleId: 'r1' }],
  ['removing citing a rule with a note', { decision: 'remove', ruleId: 'r1', message: 'Please read the rules.' }],
];

describe('the site route and the API', () => {
  it.each(SCENARIOS)('%s has the same side effects either way', async (_name, d) => {
    const site = await viaSite(d);
    const siteEffects = effects();
    for (const fn of [h.resolve, h.enqueue, h.cite, h.notify]) fn.mockClear();
    const api = await viaApi(d);
    expect(site.status).toBe(200);
    expect(api.ok).toBe(true);
    expect(effects()).toEqual(siteEffects);
    expect(await site.json()).toEqual({ status: api.ok ? api.status : null });
  });

  it('only the API marks the log detail', async () => {
    await viaSite({ decision: 'approve' });
    await viaApi({ decision: 'approve' });
    expect(h.resolve.mock.calls[0]?.[4]).toEqual({});
    expect(h.resolve.mock.calls[1]?.[4]).toEqual({ via: 'api' });
  });

  it('names the rule in the author notice and records the citation', async () => {
    await viaApi({ decision: 'remove', ruleId: 'r1' });
    expect(h.cite).toHaveBeenCalledWith('i1', expect.objectContaining({ id: 'r1', title: 'Be kind' }));
    const sent = h.notify.mock.calls[0]?.[0] as { userId: string; preview: string };
    expect(sent.userId).toBe('author1');
    expect(sent.preview).toContain('Be kind');
  });

  it('refuses a rule of another community before resolving anything, in both', async () => {
    const site = await viaSite({ decision: 'remove', ruleId: 'other' });
    expect(site.status).toBe(400);
    expect(await site.json()).toEqual({ error: 'Rule not found', code: 'COMMUNITY_RULE_NOT_FOUND' });
    const api = await viaApi({ decision: 'remove', ruleId: 'other' });
    expect(api).toMatchObject({ ok: false, reason: 'rule_not_found', status: 400 });
    expect(h.resolve).not.toHaveBeenCalled();
  });

  it('a resolved item is a 409 in both, and its alerts and notices never go out', async () => {
    h.resolve.mockRejectedValue(new AutomodError('Already resolved', 409));
    const site = await viaSite({ decision: 'approve' });
    expect(site.status).toBe(409);
    expect(await viaApi({ decision: 'approve' })).toMatchObject({ ok: false, reason: 'resolved', status: 409 });
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("an error that is not the queue's own is thrown to the caller, not swallowed", async () => {
    h.resolve.mockRejectedValue(new Error('boom'));
    await expect(viaApi({ decision: 'approve' })).rejects.toThrow('boom');
    await expect(viaSite({ decision: 'approve' })).rejects.toThrow('boom');
  });
});

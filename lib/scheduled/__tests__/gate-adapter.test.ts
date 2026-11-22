/** s09-11: the adapter from a stored draft to the community gate and back. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ result: null as unknown, input: null as unknown }));
vi.mock('@/lib/communities/post-gate.server', () => ({
  prepareCommunityPost: vi.fn(async (a: unknown) => {
    h.input = a;
    return h.result;
  }),
}));

const { evaluateScheduledGate } = await import('@/lib/scheduled/gate.server');

const sp = {
  communityId: 'c1',
  userId: 'u1',
  content: '  hi  ',
  imageUrls: ['a.png'],
  imageAlts: ['alt'],
  gifUrl: null,
  gifAlt: null,
  poll: null,
};
const refusal = (code: string | null, error = 'No') => ({ ok: false, refusal: { status: 403, code, body: { error } } });

beforeEach(() => {
  h.result = { ok: true, held: false, holdRule: 'AutoMod', flagRule: null };
});

describe('evaluateScheduledGate', () => {
  it('a profile post has no community gate', async () => {
    expect(await evaluateScheduledGate({ ...sp, communityId: null })).toEqual({ kind: 'allow', flagRule: null });
    expect(h.input).toBeNull();
  });

  it('passes the stored fields to the community gate', async () => {
    await evaluateScheduledGate({ ...sp, poll: { question: 'q' } });
    expect(h.input).toMatchObject({
      communityId: 'c1',
      userId: 'u1',
      content: 'hi',
      imageUrls: ['a.png'],
      imageAlts: ['alt'],
      hasPoll: true,
    });
  });

  it('maps allowed, flagged and held', async () => {
    expect(await evaluateScheduledGate(sp)).toEqual({ kind: 'allow', flagRule: null });
    h.result = { ok: true, held: false, holdRule: 'AutoMod', flagRule: 'Links' };
    expect(await evaluateScheduledGate(sp)).toEqual({ kind: 'allow', flagRule: 'Links' });
    h.result = { ok: true, held: true, holdRule: 'No links', flagRule: null };
    expect(await evaluateScheduledGate(sp)).toEqual({ kind: 'hold', holdRule: 'No links' });
  });

  it('maps a refusal to the notice it earns', async () => {
    h.result = refusal(null, 'Join the community to post in it');
    expect(await evaluateScheduledGate(sp)).toEqual({
      kind: 'refuse',
      notice: 'refused',
      reason: 'Join the community to post in it',
    });
    h.result = refusal('ALT_REQUIRED');
    expect(await evaluateScheduledGate(sp)).toMatchObject({ notice: 'alt-required' });
    h.result = refusal('community_banned');
    expect(await evaluateScheduledGate(sp)).toMatchObject({ notice: 'refused' });
    h.result = refusal('community_timed_out');
    expect(await evaluateScheduledGate(sp)).toMatchObject({ notice: 'refused' });
    h.result = refusal('automod_removed');
    expect(await evaluateScheduledGate(sp)).toMatchObject({ notice: 'refused' });
  });
});

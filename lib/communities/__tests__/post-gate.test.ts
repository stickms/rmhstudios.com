/**
 * `prepareCommunityPost` is the one call the site's create path and `POST /api/v1/posts` make, so they cannot give
 * different outcomes for the same input: the outcomes are held here, and a source scan holds that both callers use it
 * and neither calls the gate on its own.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Gate =
  | {
      kind: 'allow';
      flag?: {
        ruleName: string;
      };
    }
  | {
      kind: 'deny';
      status: 400 | 403 | 404;
      code: string;
      error: string;
      endsAt?: string | null;
      missing?: number[];
      missingGif?: boolean;
    }
  | {
      kind: 'hold';
      ruleName: string;
    }
  | {
      kind: 'remove';
      ruleName: string;
    };

const h = vi.hoisted(() => ({
  member: true,
  gate: {
    kind: 'allow',
  } as Gate,
  sanction: null as null | {
    kind: 'ban' | 'timeout';
    endsAt: Date | null;
  },
  challenge: null as string | null,
  gateArgs: [] as Record<string, unknown>[],
  removed: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    communityMember: {
      findUnique: async () =>
        h.member
          ? {
              id: 'm1',
            }
          : null,
    },
  },
}));
vi.mock('@/lib/communities/bans.server', () => ({
  activeSanction: async () => h.sanction,
}));
vi.mock('@/lib/communities/gate.server', () => ({
  gateCommunityContent: async (a: Record<string, unknown>) => {
    h.gateArgs.push(a);
    return h.gate;
  },
  logRemoved: async (a: Record<string, unknown>) => {
    h.removed.push(a);
  },
}));
vi.mock('@/lib/communities/challenge.server', () => ({
  challengeEntryError: async () => h.challenge,
}));

const { prepareCommunityPost } = await import('@/lib/communities/post-gate.server');
const input = {
  communityId: 'c1',
  userId: 'u1',
  content: 'hello',
};
const root = join(__dirname, '..', '..', '..');
const src = (p: string) => readFileSync(join(root, p), 'utf8');

beforeEach(() => {
  h.member = true;
  h.gate = {
    kind: 'allow',
  };
  h.sanction = null;
  h.challenge = null;
  h.gateArgs.length = 0;
  h.removed.length = 0;
});

describe('prepareCommunityPost', () => {
  it('refuses a non-member 403 before the gate runs', async () => {
    h.member = false;
    const r = await prepareCommunityPost(input);
    expect(r).toMatchObject({
      ok: false,
      refusal: {
        status: 403,
        code: null,
        body: {
          error: 'Join the community to post in it',
        },
      },
    });
    expect(h.gateArgs).toHaveLength(0);
  });

  it('refuses an active timeout or ban with the code and end time', async () => {
    h.sanction = {
      kind: 'timeout',
      endsAt: new Date('2026-12-01T10:00:00Z'),
    };
    const r = await prepareCommunityPost(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.status).toBe(403);
    expect(r.refusal.body.endsAt).toBe('2026-12-01T10:00:00.000Z');
    expect(r.refusal.body.code).toBeTruthy();
    expect(h.gateArgs).toHaveLength(0);
  });

  it('passes a gate refusal through with its status, code and details', async () => {
    h.gate = {
      kind: 'deny',
      status: 400,
      code: 'ALT_REQUIRED',
      error: 'needs a description',
      missing: [1],
      missingGif: true,
    };
    const r = await prepareCommunityPost({
      ...input,
      imageUrls: ['a', 'b'],
      imageAlts: ['x', ''],
    });
    expect(r).toEqual({
      ok: false,
      refusal: {
        status: 400,
        code: 'ALT_REQUIRED',
        body: {
          error: 'needs a description',
          code: 'ALT_REQUIRED',
          missing: [1],
          missingGif: true,
        },
      },
    });
    expect(h.gateArgs[0]).toMatchObject({
      imageUrls: ['a', 'b'],
      imageAlts: ['x', ''],
      target: 'post',
    });
  });

  it('a removal is 422 with the rule name and is logged', async () => {
    h.gate = {
      kind: 'remove',
      ruleName: 'No spoilers',
    };
    const r = await prepareCommunityPost(input);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.status).toBe(422);
    expect(r.refusal.body.error).toContain('No spoilers');
    expect(h.removed).toEqual([
      expect.objectContaining({
        communityId: 'c1',
        authorId: 'u1',
        ruleName: 'No spoilers',
      }),
    ]);
  });

  it('a hold holds, except for a challenge entry, which is flagged instead', async () => {
    h.gate = {
      kind: 'hold',
      ruleName: 'No links',
    };
    expect(await prepareCommunityPost(input)).toEqual({
      ok: true,
      held: true,
      holdRule: 'No links',
      flagRule: null,
    });
    expect(
      await prepareCommunityPost({
        ...input,
        challengeId: 'ch1',
      }),
    ).toEqual({
      ok: true,
      held: false,
      holdRule: 'AutoMod',
      flagRule: 'No links',
    });
  });

  it('a closed challenge is 409', async () => {
    h.challenge = 'This challenge has ended';
    const r = await prepareCommunityPost({
      ...input,
      challengeId: 'ch1',
    });
    expect(r).toMatchObject({
      ok: false,
      refusal: {
        status: 409,
        code: 'challenge_closed',
      },
    });
  });

  it('allow goes through, carrying a flag when the gate raised one', async () => {
    expect(await prepareCommunityPost(input)).toEqual({
      ok: true,
      held: false,
      holdRule: 'AutoMod',
      flagRule: null,
    });
    h.gate = {
      kind: 'allow',
      flag: {
        ruleName: 'Watch',
      },
    };
    expect(await prepareCommunityPost(input)).toMatchObject({
      ok: true,
      held: false,
      flagRule: 'Watch',
    });
  });
});

describe('the site and the API share it', () => {
  it.each(['lib/feed/api/rmharks.server.ts', 'lib/api/v1/communities.server.ts'])(
    '%s calls prepareCommunityPost and not the gate',
    (p) => {
      const s = src(p);
      expect(s).toMatch(/import \{ prepareCommunityPost \} from '@\/lib\/communities\/post-gate\.server'/);
      expect(s).toMatch(/prepareCommunityPost\(/);
      expect(s).not.toMatch(/gateCommunityContent\(/);
    },
  );

  it('the v1 posts route sends a community post through the adapter only after the scope check', () => {
    const s = src('app/routes/api/v1/posts.ts');
    expect(s.indexOf("hasScope(scopes, 'write:communities')")).toBeGreaterThan(-1);
    expect(s.indexOf("hasScope(scopes, 'write:communities')")).toBeLessThan(s.indexOf('createCommunityPostForKey({'));
  });
});

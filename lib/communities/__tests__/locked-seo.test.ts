/**
 * "Listed + locked" must not leak a private community into search engines: it
 * stays out of the sitemap, the locked page and the invite page are `noindex`,
 * and the invite page (a credential) is also `nofollow`.
 */
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  communityCount: vi.fn(async (_a: unknown) => 0),
  communityFindMany: vi.fn(async (_a: unknown) => [] as unknown[]),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: { count: h.communityCount, findMany: h.communityFindMany },
    aiPersona: { count: async () => 0, findMany: async () => [] },
    flashcardDeck: { count: async () => 0, findMany: async () => [] },
    tournament: { count: async () => 0, findMany: async () => [] },
  },
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
  Link: () => null,
  useNavigate: () => () => undefined,
}));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({ validator: () => ({ handler: () => () => undefined }) }),
}));
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('http://x') }));
vi.mock('@/lib/auth-session.server', () => ({ getRequestSession: async () => null }));
vi.mock('@/lib/community.server', () => ({ getCommunity: vi.fn(), getCommunityFeed: vi.fn() }));
vi.mock('@/lib/communities/invites.server', () => ({ isInviteUsable: vi.fn() }));
vi.mock('@/lib/rate-limit.server', () => ({ checkRateLimit: vi.fn(), getClientIp: () => '' }));
vi.mock('@/components/feed/PageLayout', () => ({ PageFrame: () => null }));
vi.mock('@/components/feed/CommunityColumn', () => ({ CommunityColumn: () => null }));
vi.mock('@/components/communities/LockedCommunity', () => ({ LockedCommunityPreview: () => null }));
vi.mock('@/components/communities/plus-api', () => ({
  communityApi: () => '',
  plusFetch: vi.fn(),
}));
vi.mock('@/components/Providers', () => ({ useSession: () => ({ data: null }) }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: () => null }));

type Meta = { name?: string; content?: string }[];
const robots = (head: { meta: Meta }) => head.meta.find((m) => m.name === 'robots')?.content;

describe('private communities and search engines', () => {
  it('the sitemap counts and lists only public communities', async () => {
    const { SITEMAP_SECTIONS } = await import('@/lib/sitemap.server');
    await SITEMAP_SECTIONS.community.count();
    await SITEMAP_SECTIONS.community.page(0, 10);
    expect(h.communityCount).toHaveBeenCalledWith({ where: { isPrivate: false } });
    expect(h.communityFindMany.mock.calls.length).toBeGreaterThan(0);
    for (const [arg] of h.communityFindMany.mock.calls) {
      expect((arg as { where: unknown }).where).toEqual({ isPrivate: false });
    }
  });

  it('the community page is noindex for a private community and indexable for a public one', async () => {
    const { Route } = await import('@/app/routes/_site/c.$slug');
    const head = (Route as unknown as { options: { head: (c: unknown) => { meta: Meta } } }).options
      .head;
    const base = { name: 'Club', description: 'd', icon: null, memberCount: 3, postCount: 0 };
    const priv = head({
      loaderData: { community: { ...base, isPrivate: true, locked: true } },
      params: { slug: 'club' },
    });
    expect(robots(priv)).toMatch(/noindex/);
    const pub = head({
      loaderData: { community: { ...base, isPrivate: false } },
      params: { slug: 'club' },
    });
    expect(robots(pub)).toBeUndefined();
  });

  it('the invite page is noindex, nofollow', async () => {
    const { Route } = await import('@/app/routes/_site/c.$slug_.invite.$code');
    const head = (Route as unknown as { options: { head: () => { meta: Meta } } }).options.head;
    expect(robots(head())).toBe('noindex, nofollow');
  });
});

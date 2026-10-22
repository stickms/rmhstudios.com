/**
 * Read -> write -> read through the real wishlist route: once the owner makes the
 * list private, the next read must be a 404, not the micro-cached 200.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { findUnique, findMany } = vi.hoisted(() => ({ findUnique: vi.fn(), findMany: vi.fn() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: { userProfile: { findUnique }, wishlistEntry: { findMany } },
}));
vi.mock('@/lib/user-display', () => ({ resolveUser: vi.fn(), userDisplaySelect: {} }));
vi.mock('@/lib/shop/catalog', () => ({ getShopItem: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (cfg: unknown) => ({ options: cfg }),
}));

import { clearResponseCache } from '@/lib/api/response-cache.server';
import { Route } from '../../app/routes/api/users/$id.wishlist';

const GET = (
  Route as unknown as {
    options: { server: { handlers: { GET: (a: unknown) => Promise<Response> } } };
  }
).options.server.handlers.GET;
let n = 0;
const call = () =>
  GET({
    params: { id: 'u1' },
    request: new Request('https://rmhstudios.com/api/users/u1/wishlist', {
      headers: { 'cf-connecting-ip': `10.1.0.${n++ % 250}` },
    }),
  });

describe('wishlist route vs the micro-cache', () => {
  beforeEach(() => {
    clearResponseCache();
    findMany.mockResolvedValue([]);
  });

  it('serves 404 immediately after the owner makes the wishlist private', async () => {
    findUnique.mockResolvedValue({ wishlistPublic: true });
    expect((await call()).status).toBe(200);
    findUnique.mockResolvedValue({ wishlistPublic: false }); // the write
    expect((await call()).status).toBe(404);
  });
});

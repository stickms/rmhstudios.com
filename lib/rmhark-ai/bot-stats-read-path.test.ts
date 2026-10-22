/**
 * WS4 — the /admin/bots activity counts are read-only dashboard numbers: eight
 * queries (three of them relation-filtered counts over the whole post table)
 * that belong on `prismaRead`. The settings row echoes a save and stays on the
 * primary.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  count: vi.fn(),
  primarySettings: vi.fn(),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    { botWorkerSettings: { findUnique: h.primarySettings } },
    {
      get(t, prop) {
        if (prop in t) return (t as Record<string | symbol, unknown>)[prop];
        throw new Error(`stats touched the primary (prisma.${String(prop)})`);
      },
    },
  ),
  prismaRead: {
    user: { findMany: h.userFindMany, count: h.count },
    rMHark: { count: h.count },
    rMHarkComment: { count: h.count },
    directMessage: { count: h.count },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: vi.fn() }));

import { getBotActivityStats, getBotWorkerSettings } from '@/lib/rmhark-ai/bot-settings.server';
import { DEFAULT_BOT_SETTINGS } from '@/lib/rmhark-ai/bot-stats';

beforeEach(() => {
  h.userFindMany.mockReset().mockResolvedValue([]);
  h.count.mockReset().mockResolvedValue(0);
  h.primarySettings.mockReset().mockResolvedValue(null);
});

describe('bot admin reads', () => {
  it('activity stats: 8 queries, all on prismaRead', async () => {
    await getBotActivityStats(DEFAULT_BOT_SETTINGS);
    expect(h.userFindMany).toHaveBeenCalledTimes(1);
    expect(h.count).toHaveBeenCalledTimes(7);
  });

  it('settings stay on the primary', async () => {
    await getBotWorkerSettings();
    expect(h.primarySettings).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { warmPrismaClient } from '../prisma-client';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

describe('warmPrismaClient', () => {
  it('issues one trivial query and logs success', async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    await warmPrismaClient({ $queryRaw: queryRaw } as unknown as PrismaClient, logger);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'prisma_warmed' }));
  });

  it('never throws: a failed warm-up only logs', async () => {
    const queryRaw = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(
      warmPrismaClient({ $queryRaw: queryRaw } as unknown as PrismaClient, logger),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ event: 'prisma_warm_failed' }));
  });
});

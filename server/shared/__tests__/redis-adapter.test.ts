import { describe, it, expect, vi } from 'vitest';
import { attachRedisAdapter } from '../redis-adapter';

const makeLogger = () => ({ info: vi.fn(), warn: vi.fn() });

describe('attachRedisAdapter', () => {
  it('stays on the in-memory adapter when REDIS_URL is unset', async () => {
    const io = { adapter: vi.fn() };
    const logger = makeLogger();
    const handle = await attachRedisAdapter(io as never, logger, '');
    expect(handle.enabled).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ event: 'redis_adapter_disabled' }));
  });

  it('falls back (never throws) when Redis is unreachable', async () => {
    const io = { adapter: vi.fn() };
    const logger = makeLogger();
    const handle = await attachRedisAdapter(io as never, logger, 'redis://127.0.0.1:1');
    expect(handle.enabled).toBe(false);
    expect(io.adapter).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'redis_adapter_unavailable' }),
    );
  });
});

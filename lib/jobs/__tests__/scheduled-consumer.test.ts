import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => {
  const state: { work: ((jobs: { data: unknown }[]) => Promise<void>) | null } = { work: null };
  const boss = {
    createQueue: vi.fn(async () => undefined),
    schedule: vi.fn(async () => undefined),
    work: vi.fn(async (_q: string, _o: unknown, fn: (jobs: { data: unknown }[]) => Promise<void>) => {
      state.work = fn;
    }),
    send: vi.fn(async () => 'id'),
    offWork: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
  };
  return { state, boss };
});

vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => fake.boss }));

import { startScheduledConsumer } from '../scheduled-consumer.server';

const log = { warn: vi.fn(), error: vi.fn() };

describe('startScheduledConsumer job data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fake.state.work = null;
  });

  async function start(handler: (data: Record<string, unknown>) => Promise<void>) {
    const consumer = await startScheduledConsumer({
      queue: 'test.queue',
      cron: '0 0 1 1 *',
      expireInSeconds: 60,
      retryLimit: 0,
      handler,
      log,
    });
    expect(consumer).not.toBeNull();
    return consumer!;
  }

  it('forwards the data runNow queued to the handler', async () => {
    const handler = vi.fn(async () => undefined);
    const consumer = await start(handler);
    await consumer.runNow({ manual: true });
    expect(fake.boss.send).toHaveBeenCalledWith('test.queue', { manual: true });
    await fake.state.work!([{ data: { manual: true } }]);
    expect(handler).toHaveBeenCalledWith({ manual: true });
  });

  it('hands a cron fire (empty payload) and a bare runNow an empty object', async () => {
    const handler = vi.fn(async () => undefined);
    const consumer = await start(handler);
    await consumer.runNow();
    expect(fake.boss.send).toHaveBeenCalledWith('test.queue', {});
    await fake.state.work!([{ data: {} }]);
    await fake.state.work!([{ data: null }]);
    expect(handler).toHaveBeenNthCalledWith(1, {});
    expect(handler).toHaveBeenNthCalledWith(2, {});
  });

  it('still contains a throwing handler', async () => {
    const consumer = await start(async () => {
      throw new Error('boom');
    });
    expect(consumer).toBeTruthy();
    await expect(fake.state.work!([{ data: {} }])).resolves.toBeUndefined();
    expect(log.error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});

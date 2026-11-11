import { describe, expect, it, vi } from 'vitest';

const deliverDuePending = vi.hoisted(() => vi.fn(async () => 3));
vi.mock('@/lib/webhooks/emit.server', () => ({ deliverDuePending }));

import {
  registerWebhookRetryCron,
  WEBHOOK_RETRY_BATCH,
  WEBHOOK_RETRY_CRON,
  WEBHOOK_RETRY_QUEUE,
} from '@/lib/webhooks/jobs.server';

describe('webhook retry drain', () => {
  it('schedules a once-a-minute drain of due deliveries on the jobs worker', async () => {
    const calls: string[] = [];
    let handler: (() => Promise<void>) | undefined;
    const boss = {
      createQueue: vi.fn(async (name: string) => void calls.push(`create ${name}`)),
      schedule: vi.fn(async (name: string, cron: string) => void calls.push(`schedule ${name} ${cron}`)),
      work: vi.fn(async (name: string, fn: () => Promise<void>) => {
        calls.push(`work ${name}`);
        handler = fn;
      }),
    };

    await registerWebhookRetryCron(boss as never);

    // schedule() before work() is what lets the queue policy pick a poll interval.
    expect(calls).toEqual([
      `create ${WEBHOOK_RETRY_QUEUE}`,
      `schedule ${WEBHOOK_RETRY_QUEUE} ${WEBHOOK_RETRY_CRON}`,
      `work ${WEBHOOK_RETRY_QUEUE}`,
    ]);
    expect(WEBHOOK_RETRY_CRON).toBe('* * * * *');

    await handler!();
    expect(deliverDuePending).toHaveBeenCalledWith(WEBHOOK_RETRY_BATCH);
  });
});

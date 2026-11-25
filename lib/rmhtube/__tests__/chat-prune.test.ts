import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s13-06: the nightly prune deletes room chat older than 90 days beyond each room's newest 200, never a message a
 * pending report names, in batches of 1,000. The SQL runs against the real table and quoted camelCase columns (the
 * window-function statement itself is smoke-tested against Postgres by integration); here its text and bindings are held.
 */

const h = vi.hoisted(() => ({
  calls: [] as { sql: string; values: unknown[] }[],
  results: [] as number[],
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.calls.push({ sql: strings.join('?'), values });
      return h.results.shift() ?? 0;
    }),
  },
}));
vi.mock('@/lib/redis.server', () => ({ redisPublish: vi.fn() }));

import {
  CHAT_PRUNE_BATCH,
  CHAT_PRUNE_CRON,
  CHAT_PRUNE_QUEUE,
  CHAT_RETENTION_DAYS,
  KEEP_NEWEST_PER_ROOM,
  pruneRoomChat,
} from '@/lib/rmhtube/chat-reports.server';

const NOW = new Date('2026-11-25T04:17:00Z');

beforeEach(() => {
  h.calls = [];
  h.results = [];
});

describe('pruneRoomChat SQL', () => {
  it('names the real tables and quoted columns', async () => {
    await pruneRoomChat(NOW);
    expect(h.calls).toHaveLength(1);
    const sql = h.calls[0]!.sql;
    expect(sql).toContain('DELETE FROM "rmhtube_chat_message"');
    expect(sql).toContain('FROM "content_report"');
    for (const col of ['"roomId"', '"createdAt"', '"entityType"', '"entityId"', '"status"']) {
      expect(sql, col).toContain(col);
    }
    expect(sql).toContain('ROW_NUMBER() OVER (PARTITION BY m."roomId" ORDER BY m."createdAt" DESC');
  });

  it('keeps each room’s newest 200 and only touches messages past the 90-day cutoff', async () => {
    await pruneRoomChat(NOW);
    const { sql, values } = h.calls[0]!;
    expect(sql).toMatch(/ranked\."rank" > \?/);
    expect(sql).toMatch(/ranked\."createdAt" < \?/);
    expect(values[0]).toBe(KEEP_NEWEST_PER_ROOM);
    expect(KEEP_NEWEST_PER_ROOM).toBe(200);
    expect(values[1]).toEqual(new Date(NOW.getTime() - CHAT_RETENTION_DAYS * 86_400_000));
    expect(CHAT_RETENTION_DAYS).toBe(90);
    expect(values[2]).toBe(CHAT_PRUNE_BATCH);
  });

  it('spares a message that an open tube-chat report names', async () => {
    await pruneRoomChat(NOW);
    const sql = h.calls[0]!.sql.replace(/\s+/g, ' ');
    expect(sql).toContain(
      `NOT EXISTS ( SELECT 1 FROM "content_report" r WHERE r."entityType" = 'tube-chat' AND r."entityId" = ranked."id" AND r."status" IN ('PENDING', 'REVIEWING') )`,
    );
  });
});

describe('pruneRoomChat batches', () => {
  it('stops after the first short batch', async () => {
    h.results = [12];
    expect(await pruneRoomChat(NOW)).toBe(12);
    expect(h.calls).toHaveLength(1);
  });

  it('repeats full batches until one comes back short and totals them', async () => {
    h.results = [1000, 1000, 40];
    expect(await pruneRoomChat(NOW)).toBe(2040);
    expect(h.calls).toHaveLength(3);
  });

  it('runs outside any transaction (no $transaction on the client it uses)', () => {
    const source = readFileSync(join(__dirname, '..', 'chat-reports.server.ts'), 'utf8');
    expect(source).not.toContain('$transaction');
  });
});

describe('the nightly job', () => {
  it('is registered in the jobs worker, daily at 04:17 UTC', () => {
    expect(CHAT_PRUNE_CRON).toBe('17 4 * * *');
    expect(CHAT_PRUNE_QUEUE).toBe('rmhtube.chat-prune');
    const jobs = readFileSync(join(__dirname, '..', '..', '..', 'server', 'jobs', 'index.ts'), 'utf8');
    expect(jobs).toContain('{ queue: CHAT_PRUNE_QUEUE, register: registerChatPruneCron }');
  });
});

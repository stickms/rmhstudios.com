/**
 * s12-15: the homes worker passes the job's `trigger` to the run. A cron fire carries `{}` and is CRON; a run queued
 * from /admin/homes carries `{ trigger: 'MANUAL', by }` and is MANUAL; anything else is CRON. The run stores it on its
 * HomeScrapeRun row, which /admin/homes shows as "Manual".
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HOMES_SCRAPE_QUEUE, scrapeTriggerOf } from '../../../lib/homes/scrape/trigger';
import { runHomesScrape, type RunPrisma } from '../../../lib/homes/scrape/run';

describe('scrapeTriggerOf', () => {
  it('is MANUAL only for { trigger: "MANUAL" }', () => {
    expect(scrapeTriggerOf({ trigger: 'MANUAL', by: 'admin-1' })).toBe('MANUAL');
    expect(scrapeTriggerOf({ trigger: 'MANUAL' })).toBe('MANUAL');
  });

  it('defaults to CRON for a cron fire and for anything else', () => {
    for (const data of [
      {},
      undefined,
      null,
      'MANUAL',
      7,
      [],
      { trigger: 'manual' },
      { trigger: 'CRON' },
      { trigger: 1 },
      { by: 'x' },
    ]) {
      expect(scrapeTriggerOf(data)).toBe('CRON');
    }
  });
});

describe('the trigger reaches runHomesScrape', () => {
  function fakePrisma() {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      homeSource: {
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
      homeScrapeRun: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return { id: 'run-1' };
        },
        update: async () => ({ id: 'run-1' }),
      },
    } as unknown as RunPrisma;
    return { prisma, created };
  }

  it.each([
    [{ trigger: 'MANUAL', by: 'admin-1' }, 'MANUAL'],
    [{}, 'CRON'],
    [{ trigger: 'something else' }, 'CRON'],
  ])('a job with data %j is stored as %s', async (data, expected) => {
    const { prisma, created } = fakePrisma();
    await runHomesScrape({ prisma, sleepMs: 0 }, { trigger: scrapeTriggerOf(data) });
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ trigger: expected });
  });
});

describe('the worker wires it', () => {
  const src = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('reads the payload in tick and no longer hard-codes CRON', () => {
    expect(src).toMatch(/async function tick\(data/);
    expect(src).toMatch(/trigger:\s*scrapeTriggerOf\(data\)/);
    expect(src).not.toMatch(/trigger:\s*'CRON'/);
  });

  it('hands the consumer a handler that receives the job data', () => {
    expect(src).toMatch(/handler:\s*tick\b/);
  });

  it('consumes the queue /admin/homes sends to, with a relative import (the worker is its own bundle)', () => {
    expect(HOMES_SCRAPE_QUEUE).toBe('homes.scrape');
    expect(src).toMatch(/queue:\s*HOMES_QUEUE/);
    expect(src).toMatch(/from '\.\.\/\.\.\/lib\/homes\/scrape\/trigger'/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  SECONDARIES_PROMPT_ID,
  DEFAULT_SECONDARIES_AI_SHARE,
  createSecondariesBudgetGate,
  secondariesAiShare,
} from './secondaries-budget';
import { EXTRACT_TASK } from './sdn/budget';
import { createFakePrisma } from './test-support';

const NOW = new Date('2026-11-23T12:00:00.000Z');
const usage = (fake: ReturnType<typeof createFakePrisma>, costUsd: number, promptId: string, at = NOW) =>
  fake.tables.aiUsage!.push({ task: EXTRACT_TASK, promptId, costMicros: costUsd * 1_000_000, createdAt: at });

describe('secondariesAiShare', () => {
  it('defaults to 10% and fails closed on a typo', () => {
    const warned: string[] = [];
    expect(secondariesAiShare(undefined)).toBe(DEFAULT_SECONDARIES_AI_SHARE);
    expect(secondariesAiShare('  ')).toBe(0.1);
    expect(secondariesAiShare('0.25')).toBe(0.25);
    expect(secondariesAiShare('2', (l) => warned.push(l))).toBe(0);
    expect(secondariesAiShare('-1', (l) => warned.push(l))).toBe(0);
    expect(secondariesAiShare('lots', (l) => warned.push(l))).toBe(0);
    expect(warned).toHaveLength(3);
  });
});

describe('createSecondariesBudgetGate (cap $20, share 10% = $2)', () => {
  const gate = (fake: ReturnType<typeof createFakePrisma>) =>
    createSecondariesBudgetGate(fake.prisma, () => NOW, 20, 0.1);

  it('allows while the secondaries have spent under their share', async () => {
    const fake = createFakePrisma();
    usage(fake, 1.9, SECONDARIES_PROMPT_ID);
    expect(await gate(fake).allow('live')).toBe(true);
  });

  it('refuses once the secondaries spent their own share, however little SDN spent', async () => {
    const fake = createFakePrisma();
    usage(fake, 2, SECONDARIES_PROMPT_ID);
    usage(fake, 1, 'medschools-extract');
    expect(await gate(fake).allow('live')).toBe(false);
  });

  it('SDN spend counts toward the total cap: the sum of both jobs never passes it', async () => {
    const fake = createFakePrisma();
    usage(fake, 19.5, 'medschools-extract');
    usage(fake, 0.5, SECONDARIES_PROMPT_ID);
    expect(await gate(fake).allow('live')).toBe(false);
    const ok = createFakePrisma();
    usage(ok, 15, 'medschools-extract'); // event extraction far over a 90% share is fine for the secondaries while the total is under cap
    usage(ok, 1, SECONDARIES_PROMPT_ID);
    expect(await gate(ok).allow('live')).toBe(true);
  });

  it('only this UTC month counts, and a ledger read error fails closed', async () => {
    const fake = createFakePrisma();
    usage(fake, 50, SECONDARIES_PROMPT_ID, new Date('2026-10-31T23:00:00.000Z'));
    expect(await gate(fake).allow('live')).toBe(true);
    const broken = createFakePrisma();
    (broken.prisma.aiUsage as { aggregate: unknown }).aggregate = async () => {
      throw new Error('db down');
    };
    expect(await gate(broken).allow('live')).toBe(false);
  });

  it('a share of 0 pauses the secondaries entirely', async () => {
    const fake = createFakePrisma();
    expect(await createSecondariesBudgetGate(fake.prisma, () => NOW, 20, 0).allow('live')).toBe(false);
  });
});

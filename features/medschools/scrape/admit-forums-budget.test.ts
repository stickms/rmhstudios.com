import { describe, expect, it } from 'vitest';
import {
  ADMIT_FORUMS_PROMPT_ID,
  DEFAULT_FORUMS_AI_SHARE,
  createForumsBudgetGate,
  forumsAiShare,
} from './admit-forums-budget';
import { EXTRACT_TASK } from './sdn/budget';
import { createFakePrisma } from './test-support';

const NOW = new Date('2026-11-23T12:00:00.000Z');
const usage = (fake: ReturnType<typeof createFakePrisma>, costUsd: number, promptId: string, at = NOW) =>
  fake.tables.aiUsage!.push({ task: EXTRACT_TASK, promptId, costMicros: costUsd * 1_000_000, createdAt: at });

describe('forumsAiShare', () => {
  it('defaults to 40% and fails closed on a typo', () => {
    const warned: string[] = [];
    expect(forumsAiShare(undefined)).toBe(DEFAULT_FORUMS_AI_SHARE);
    expect(forumsAiShare('  ')).toBe(0.4);
    expect(forumsAiShare('0.25')).toBe(0.25);
    expect(forumsAiShare('1.5', (l) => warned.push(l))).toBe(0);
    expect(forumsAiShare('lots', (l) => warned.push(l))).toBe(0);
    expect(warned).toHaveLength(2);
  });
});

describe('createForumsBudgetGate (cap $20, share 40% = $8)', () => {
  const gate = (fake: ReturnType<typeof createFakePrisma>) => createForumsBudgetGate(fake.prisma, () => NOW, 20, 0.4);

  it('allows while the forums have spent under their share', async () => {
    const fake = createFakePrisma();
    usage(fake, 7.9, ADMIT_FORUMS_PROMPT_ID);
    expect(await gate(fake).allow('live')).toBe(true);
  });

  it('refuses once the forums spent their own share, however little SDN spent', async () => {
    const fake = createFakePrisma();
    usage(fake, 8, ADMIT_FORUMS_PROMPT_ID);
    usage(fake, 1, 'medschools-extract');
    expect(await gate(fake).allow('live')).toBe(false);
  });

  it('SDN spend counts toward the total cap: the sum of both jobs never passes it', async () => {
    const fake = createFakePrisma();
    usage(fake, 19, 'medschools-extract');
    usage(fake, 1, ADMIT_FORUMS_PROMPT_ID);
    expect(await gate(fake).allow('live')).toBe(false);
    const ok = createFakePrisma();
    usage(ok, 15, 'medschools-extract'); // SDN far over a 60% share is fine for the forums while the total is under cap
    usage(ok, 2, ADMIT_FORUMS_PROMPT_ID);
    expect(await gate(ok).allow('live')).toBe(true);
  });

  it('only this UTC month counts, and a ledger read error fails closed', async () => {
    const fake = createFakePrisma();
    usage(fake, 50, ADMIT_FORUMS_PROMPT_ID, new Date('2026-10-31T23:00:00.000Z'));
    expect(await gate(fake).allow('live')).toBe(true);
    const broken = createFakePrisma();
    (broken.prisma.aiUsage as { aggregate: unknown }).aggregate = async () => {
      throw new Error('db down');
    };
    expect(await gate(broken).allow('live')).toBe(false);
  });

  it('a share of 0 pauses the forums entirely', async () => {
    const fake = createFakePrisma();
    expect(await createForumsBudgetGate(fake.prisma, () => NOW, 20, 0).allow('live')).toBe(false);
  });
});

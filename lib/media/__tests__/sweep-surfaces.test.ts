import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';

/**
 * Every place that writes an upload is classified before the media sweep may delete anything (s09-12): each
 * `POLICIES` key plus the writers outside the ingest door. A `swept` surface names rules that are in the sweep's
 * query; an `excluded` one names where its reference lives. And the variant names the sweep derives are the ones the
 * ingest really writes.
 */

const { putObject } = vi.hoisted(() => ({
  putObject: vi.fn(async (_key: string, _body: Buffer, _type: string) => {}),
}));
vi.mock('@/lib/storage/s3.server', () => ({ putObject }));
vi.mock('@/lib/prisma.server', () => ({ prisma: { media: { create: vi.fn(async () => ({})) } } }));
vi.mock('@/lib/storage/asset', () => ({ CDN_BASE: '' }));
vi.mock('@/lib/media/quota.server', () => ({
  checkDailyUploadQuota: vi.fn(async () => ({ ok: true })),
  keyedLimit: vi.fn(async () => ({ ok: true })),
}));

import { ingest, POLICIES, variantKey, variantKeysFor } from '@/lib/media/ingest.server';
import { MEDIA_SWEEP_SURFACES, SWEEP_RULES, sweptSurfaces, type SweepSurface } from '@/lib/media/sweep-surfaces';

const root = join(__dirname, '..', '..', '..');
const sweepSource = readFileSync(join(root, 'lib/media/sweep.server.ts'), 'utf8');
const surfaces = MEDIA_SWEEP_SURFACES as Record<string, SweepSurface>;

describe('MEDIA_SWEEP_SURFACES', () => {
  it('classifies every upload policy', () => {
    for (const key of Object.keys(POLICIES)) {
      expect(surfaces[key], `POLICIES.${key} has no entry in MEDIA_SWEEP_SURFACES`).toBeDefined();
    }
  });

  it('classifies the writers outside the ingest door', () => {
    for (const key of ['persona-avatar', 'pronunciation', 'emoji']) expect(surfaces[key]).toBeDefined();
  });

  it('has no entry for something that is neither a policy nor one of those writers', () => {
    const known = new Set([...Object.keys(POLICIES), 'persona-avatar', 'pronunciation', 'emoji']);
    for (const key of Object.keys(surfaces)) expect(known.has(key), `${key} is not an upload surface`).toBe(true);
  });

  it('marks a surface swept only with a named rule that is in the sweep', () => {
    expect(sweptSurfaces().length).toBeGreaterThan(0);
    for (const key of sweptSurfaces()) {
      const entry = surfaces[key]!;
      if (entry.kind !== 'swept') throw new Error('unreachable');
      expect(entry.rules.length, `${key} is swept with no rule`).toBeGreaterThan(0);
      for (const rule of entry.rules) {
        expect(SWEEP_RULES).toContain(rule);
        expect(sweepSource, `the rule ${rule} is not in sweep.server.ts`).toContain(`"${rule}"`);
      }
    }
  });

  it('never sweeps a surface that keeps its pictures by URL, that shares the feed space unattached, or that records nothing', () => {
    for (const key of ['build', 'flashcard', 'chat', 'emoji']) expect(surfaces[key]!.kind).toBe('excluded');
    for (const key of ['avatar', 'album', 'library', 'persona-avatar', 'pronunciation']) {
      expect(surfaces[key]!.kind).toBe('not-recorded');
    }
    expect(sweptSurfaces()).toEqual(['post']);
  });

  it('points every exclusion at a file that exists, and every unrecorded surface at its follow-up', () => {
    for (const [key, entry] of Object.entries(surfaces)) {
      expect(entry.why.length, `${key} has no reason`).toBeGreaterThan(10);
      if (entry.kind === 'excluded') {
        const file = entry.keptBy.split(/[\s(]/)[0]!;
        if (file.includes('/')) expect(existsSync(join(root, file)), `${key}: ${file} does not exist`).toBe(true);
      }
      if (entry.kind === 'not-recorded') expect(entry.followUp.length).toBeGreaterThan(10);
    }
  });

  it('keeps the exclusions the sweep cites (the sprint 08 references) in its source', () => {
    for (const needle of ['scheduledPost', 'flashcard', 'buildScreenshot', 'userBuild']) {
      expect(sweepSource).toContain(needle);
    }
  });
});

describe('the variant keys the sweep derives are the ones the ingest writes', () => {
  async function bigImage() {
    return sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#123456' } })
      .png()
      .toBuffer();
  }
  const file = async () => new File([new Uint8Array(await bigImage())], 'a.png', { type: 'image/png' });

  it('flashcard: the full key plus -400', async () => {
    putObject.mockClear();
    const result = await ingest(await file(), 'flashcard', { userId: 'user_1', record: true });
    const written = putObject.mock.calls.map((c) => c[0]);
    expect(written).toHaveLength(POLICIES.flashcard.variants.length);
    expect(variantKeysFor(result.key)).toEqual(written.filter((k) => k !== result.key));
    expect(variantKeysFor(result.key)).toEqual([variantKey(result.key, 400)]);
  });

  it('album: the full key plus -400 and -1600', async () => {
    putObject.mockClear();
    const result = await ingest(await file(), 'album', { userId: 'user_1', entityId: 'album_1' });
    const written = putObject.mock.calls.map((c) => c[0]);
    expect([...variantKeysFor(result.key)].sort()).toEqual(written.filter((k) => k !== result.key).sort());
  });

  it('names a variant by putting the width before the extension, whatever the folder', () => {
    expect(variantKey('rmharks/a.b/c-1.webp', 400)).toBe('rmharks/a.b/c-1-400.webp');
    expect(variantKey('rmharks/c-1', 400)).toBe('rmharks/c-1-400');
  });
});

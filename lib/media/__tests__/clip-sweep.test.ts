import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/storage/s3.server', () => ({ putObject: vi.fn(), deleteObject: vi.fn(), getObject: vi.fn() }));

import {
  CLIP_LIST_LIMIT,
  CLIP_MIN_AGE_MS,
  sweepPronunciationClips,
  type ClipSweepDeps,
} from '@/lib/media/clip-sweep.server';

const NOW = new Date('2026-06-22T00:00:00.000Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
const clip = (name: string) => `profile-pronunciation/${name}.webm`;

function makeDeps(entries: Array<{ key: string; lastModified: Date | null }>, named: string[] = []) {
  return {
    listObjectEntries: vi.fn(async (_prefix: string, _limit: number) => entries),
    prisma: {
      profilePlus: {
        findMany: vi.fn(async (args: { where: { pronunciationKey: { in: string[] } } }) =>
          args.where.pronunciationKey.in.filter((k) => named.includes(k)).map((k) => ({ pronunciationKey: k })),
        ),
      },
    },
    deleteObject: vi.fn(async (_key: string) => {}),
    purgeFromCdn: vi.fn(async (_key: string) => {}),
    now: NOW,
  } satisfies ClipSweepDeps;
}

describe('sweepPronunciationClips', () => {
  it('deletes only clips no profile names that are more than 7 days old', async () => {
    const deps = makeDeps(
      [
        { key: clip('orphan-old'), lastModified: ago(8) },
        { key: clip('named-old'), lastModified: ago(30) },
        { key: clip('orphan-new'), lastModified: ago(6) },
        { key: clip('orphan-boundary'), lastModified: new Date(NOW.getTime() - CLIP_MIN_AGE_MS) },
      ],
      [clip('named-old')],
    );

    const summary = await sweepPronunciationClips(deps);

    expect(deps.deleteObject.mock.calls.map((c) => c[0])).toEqual([clip('orphan-old')]);
    expect(deps.purgeFromCdn).toHaveBeenCalledWith(clip('orphan-old'));
    expect(summary).toMatchObject({
      listed: 4,
      tooNew: 2,
      referenced: 1,
      targets: 1,
      deleted: 1,
      failed: 0,
      capped: false,
    });
  });

  it('skips an entry that has no time, and keys outside the prefix', async () => {
    const deps = makeDeps([
      { key: clip('no-time'), lastModified: null },
      { key: 'profile-pronunciation/', lastModified: ago(40) },
      { key: 'rmharks/other.webp', lastModified: ago(40) },
      { key: clip('bad-time'), lastModified: new Date('invalid') },
    ]);
    const summary = await sweepPronunciationClips(deps);
    expect(deps.deleteObject).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ noTime: 2, targets: 0, deleted: 0 });
  });

  it('asks the database about the old clips only, by key', async () => {
    const deps = makeDeps([
      { key: clip('a'), lastModified: ago(9) },
      { key: clip('b'), lastModified: ago(1) },
    ]);
    await sweepPronunciationClips(deps);
    expect(deps.listObjectEntries).toHaveBeenCalledWith('profile-pronunciation/', 5000);
    expect(deps.prisma.profilePlus.findMany).toHaveBeenCalledWith({
      where: { pronunciationKey: { in: [clip('a')] } },
      select: { pronunciationKey: true },
    });
  });

  it('dryRun deletes nothing and lists what a run deletes', async () => {
    const entries = [
      { key: clip('a'), lastModified: ago(9) },
      { key: clip('b'), lastModified: ago(10) },
    ];
    const dry = makeDeps(entries);
    const preview = await sweepPronunciationClips(dry, { dryRun: true });
    expect(dry.deleteObject).not.toHaveBeenCalled();
    expect(preview).toMatchObject({ dryRun: true, targets: 2, deleted: 0, sampleKeys: [clip('a'), clip('b')] });

    const live = makeDeps(entries);
    await sweepPronunciationClips(live);
    expect(live.deleteObject.mock.calls.map((c) => c[0])).toEqual(preview.sampleKeys);
  });

  it('keeps a clip whose delete failed, counts it, and logs no key', async () => {
    const deps = makeDeps([
      { key: clip('bad'), lastModified: ago(9) },
      { key: clip('good'), lastModified: ago(9) },
    ]);
    deps.deleteObject.mockImplementation(async (key: string) => {
      if (key === clip('bad')) throw new Error('boom');
    });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const summary = await sweepPronunciationClips(deps);
    expect(JSON.stringify(spy.mock.calls)).not.toContain('profile-pronunciation');
    spy.mockRestore();
    expect(summary).toMatchObject({ deleted: 1, failed: 1 });
  });

  it('says when the listing limit was reached', async () => {
    const entries = Array.from({ length: CLIP_LIST_LIMIT }, (_, i) => ({ key: clip(`c${i}`), lastModified: ago(1) }));
    const summary = await sweepPronunciationClips(makeDeps(entries));
    expect(summary).toMatchObject({ listed: 5000, capped: true, targets: 0 });
  });
});

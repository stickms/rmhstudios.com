import { describe, expect, it, vi } from 'vitest';
import {
  RECOMPUTE_BATCH_SIZE,
  recomputeStreaks,
  type ProfileRow,
  type RecomputeDb,
} from '@/lib/rmhstudy/recompute-streaks.server';

function fakeDb(
  profiles: ProfileRow[],
  sessions: {
    profileId: string;
    startedAt: Date;
  }[],
) {
  const rows = profiles.map((p) => ({
    ...p,
  }));
  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: {
        id: string;
      };
      data: Partial<ProfileRow>;
    }) => {
      Object.assign(rows.find((p) => p.id === where.id) as ProfileRow, data);
    },
  );
  const reads: number[] = [];
  const db: RecomputeDb = {
    rmhStudyProfile: {
      findMany: async ({ where, take }) => {
        const page = rows
          .filter((p) => !where.id || p.id > where.id.gt)
          .sort((a, b) => a.id.localeCompare(b.id))
          .slice(0, take);
        reads.push(page.length);
        return page.map((p) => ({
          ...p,
        }));
      },
      update,
    },
    rmhStudySession: {
      findMany: async ({ where }) => sessions.filter((s) => where.profileId.in.includes(s.profileId)),
    },
  };
  return {
    db,
    rows,
    update,
    reads,
  };
}

const day = (d: number) => new Date(Date.UTC(2026, 10, d, 15));
const NOW = new Date('2026-11-21T10:00:00Z');
const stuck = (id: string, extra: Partial<ProfileRow> = {}): ProfileRow => ({
  id,
  userId: `u-${id}`,
  timeZone: null,
  currentStreak: 1,
  longestStreak: 1,
  ...extra,
});

describe('recomputeStreaks', () => {
  const fiveDays = [17, 18, 19, 20, 21].map((d) => ({
    profileId: 'a',
    startedAt: day(d),
  }));

  it('repairs a profile stuck at 1 after five days in a row', async () => {
    const { db, rows } = fakeDb([stuck('a')], fiveDays);
    const result = await recomputeStreaks(db, {
      dryRun: false,
      now: NOW,
    });
    expect(result).toMatchObject({
      scanned: 1,
      changed: 1,
    });
    expect(rows[0]).toMatchObject({
      currentStreak: 5,
      longestStreak: 5,
    });
  });

  it('is idempotent: a second run changes and writes nothing', async () => {
    const { db, update } = fakeDb([stuck('a')], fiveDays);
    await recomputeStreaks(db, {
      dryRun: false,
      now: NOW,
    });
    update.mockClear();
    const again = await recomputeStreaks(db, {
      dryRun: false,
      now: NOW,
    });
    expect(again).toMatchObject({
      changed: 0,
      unchanged: 1,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing in a dry run but reports what would change', async () => {
    const { db, rows, update } = fakeDb([stuck('a')], fiveDays);
    const seen: string[] = [];
    const result = await recomputeStreaks(db, {
      dryRun: true,
      now: NOW,
      onChange: (p) => seen.push(p.id),
    });
    expect(update).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({
      currentStreak: 1,
      longestStreak: 1,
    });
    expect(result.changed).toBe(1);
    expect(seen).toEqual(['a']);
  });

  it('counts days in the stored zone', async () => {
    // 02:00 UTC is 21:00 the evening before in New York: three evenings, three local days.
    const sessions = [19, 20, 21].map((d) => ({
      profileId: 'n',
      startedAt: new Date(Date.UTC(2026, 10, d, 2)),
    }));
    const { db, rows } = fakeDb(
      [
        stuck('n', {
          timeZone: 'America/New_York',
        }),
      ],
      sessions,
    );
    await recomputeStreaks(db, {
      dryRun: false,
      now: new Date('2026-11-21T20:00:00Z'),
    });
    expect(rows[0]).toMatchObject({
      currentStreak: 3,
      longestStreak: 3,
    });
  });

  it('ends the current streak after a missed day but keeps a longer stored longest', async () => {
    const sessions = [10, 11].map((d) => ({
      profileId: 'b',
      startedAt: day(d),
    }));
    const { db, rows } = fakeDb(
      [
        stuck('b', {
          currentStreak: 2,
          longestStreak: 9,
        }),
      ],
      sessions,
    );
    await recomputeStreaks(db, {
      dryRun: false,
      now: NOW,
    });
    expect(rows[0]).toMatchObject({
      currentStreak: 0,
      longestStreak: 9,
    });
  });

  it('leaves profiles without sessions alone', async () => {
    const { db, update } = fakeDb(
      [
        stuck('c', {
          currentStreak: 4,
        }),
      ],
      [],
    );
    const result = await recomputeStreaks(db, {
      dryRun: false,
      now: NOW,
    });
    expect(result).toMatchObject({
      scanned: 1,
      skipped: 1,
      changed: 0,
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('reads profiles in batches', async () => {
    const profiles = Array.from(
      {
        length: RECOMPUTE_BATCH_SIZE + 3,
      },
      (_, i) => stuck(`p${String(i).padStart(5, '0')}`),
    );
    const { db, reads } = fakeDb(profiles, []);
    const result = await recomputeStreaks(db, {
      dryRun: true,
      now: NOW,
    });
    expect(result.scanned).toBe(RECOMPUTE_BATCH_SIZE + 3);
    expect(reads).toEqual([RECOMPUTE_BATCH_SIZE, 3]);
  });
});

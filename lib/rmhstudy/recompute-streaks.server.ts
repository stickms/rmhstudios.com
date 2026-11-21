import {
  deriveStreak,
  longestRun,
  studyDayKey,
} from '@/lib/rmhstudy/streak';

/** Profiles read per batch. */
export const RECOMPUTE_BATCH_SIZE = 500;

export interface ProfileRow {
  id: string;
  userId: string;
  timeZone:
    | string
    | null;
  currentStreak: number;
  longestStreak: number;
}

/** The slice of the Prisma client the recompute uses, so a test can fake it. */
export interface RecomputeDb {
  rmhStudyProfile: {
    findMany(args: {
      where: {
        id?: {
          gt: string;
        };
      };
      orderBy: {
        id: 'asc';
      };
      take: number;
      select: Record<
        keyof ProfileRow,
        true
      >;
    }): Promise<
      ProfileRow[]
    >;
    update(args: {
      where: {
        id: string;
      };
      data: {
        currentStreak: number;
        longestStreak: number;
      };
    }): Promise<unknown>;
  };
  rmhStudySession: {
    findMany(args: {
      where: {
        profileId: {
          in: string[];
        };
      };
      select: {
        profileId: true;
        startedAt: true;
      };
    }): Promise<
      {
        profileId: string;
        startedAt: Date;
      }[]
    >;
  };
}

export interface RecomputeResult {
  scanned: number;
  /** Profiles with no session rows, left as they are. */
  skipped: number;
  /** Profiles whose stored streaks differ from the recomputed ones (written unless a dry run). */
  changed: number;
  unchanged: number;
}

/**
 * Recompute every profile's `currentStreak` and `longestStreak` from its session rows, in the
 * profile's stored zone (UTC when none). Idempotent: a profile already holding the recomputed
 * values is not written, so a second run changes nothing. The longest streak never goes down
 * (runs older than the rows kept stay counted); the current streak is the one alive as of `now`.
 * Rows from before the end time was recorded carry the end in `startedAt`, and count on that day,
 * as the history page does. Profiles are read in id order, `RECOMPUTE_BATCH_SIZE` at a time, and
 * only the day keys are held.
 */
export async function recomputeStreaks(
  db: RecomputeDb,
  options: {
    dryRun: boolean;
    now?: Date;
    onChange?: (
      profile: ProfileRow,
      next: {
        currentStreak: number;
        longestStreak: number;
      },
    ) => void;
  },
): Promise<RecomputeResult> {
  const now =
    options.now ??
    new Date();
  const result: RecomputeResult =
    {
      scanned: 0,
      skipped: 0,
      changed: 0,
      unchanged: 0,
    };
  let after:
    | string
    | undefined;
  for (;;) {
    const profiles =
      await db.rmhStudyProfile.findMany(
        {
          where:
            after ===
            undefined
              ? {}
              : {
                  id: {
                    gt: after,
                  },
                },
          orderBy:
            {
              id: 'asc',
            },
          take: RECOMPUTE_BATCH_SIZE,
          select:
            {
              id: true,
              userId: true,
              timeZone: true,
              currentStreak: true,
              longestStreak: true,
            },
        },
      );
    if (
      profiles.length ===
      0
    )
      break;
    after =
      profiles[
        profiles.length -
          1
      ]
        ?.id;
    const sessions =
      await db.rmhStudySession.findMany(
        {
          where:
            {
              profileId:
                {
                  in: profiles.map(
                    (
                      p,
                    ) =>
                      p.id,
                  ),
                },
            },
          select:
            {
              profileId: true,
              startedAt: true,
            },
        },
      );
    const byProfile =
      new Map<
        string,
        Date[]
      >();
    for (const s of sessions) {
      const list =
        byProfile.get(
          s.profileId,
        );
      if (
        list
      )
        list.push(
          s.startedAt,
        );
      else
        byProfile.set(
          s.profileId,
          [
            s.startedAt,
          ],
        );
    }
    for (const profile of profiles) {
      result.scanned++;
      const rows =
        byProfile.get(
          profile.id,
        );
      if (
        !rows
      ) {
        result.skipped++;
        continue;
      }
      const keys =
        [
          ...new Set(
            rows.map(
              (
                d,
              ) =>
                studyDayKey(
                  d,
                  profile.timeZone,
                ),
            ),
          ),
        ];
      const next =
        {
          currentStreak:
            deriveStreak(
              keys,
              studyDayKey(
                now,
                profile.timeZone,
              ),
            )
              .current,
          longestStreak:
            Math.max(
              longestRun(
                keys,
              ),
              profile.longestStreak,
            ),
        };
      if (
        next.currentStreak ===
          profile.currentStreak &&
        next.longestStreak ===
          profile.longestStreak
      ) {
        result.unchanged++;
        continue;
      }
      result.changed++;
      options.onChange?.(
        profile,
        next,
      );
      if (
        !options.dryRun
      )
        await db.rmhStudyProfile.update(
          {
            where:
              {
                id: profile.id,
              },
            data: next,
          },
        );
    }
    if (
      profiles.length <
      RECOMPUTE_BATCH_SIZE
    )
      break;
  }
  return result;
}

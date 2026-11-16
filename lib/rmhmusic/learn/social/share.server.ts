/**
 * Shared results (RMH Music Phase 6, plan 1.4): `music_share`. The rules are `share.ts`; this file
 * reads and writes the rows.
 *
 * - **Create** takes the snapshot from the learner's own stored row (a scored, unhidden Daily run,
 *   or a song best and the instrument they play) and returns the live link already made for the
 *   same result and name choice when there is one; a new one is refused past 50 live links.
 * - **Stop** is owner-scoped (`updateMany where { id, userId }`): another learner's id changes
 *   nothing. Nothing is deleted; account deletion and the maintenance sweep delete rows.
 * - **Read** (`getSharedResult`, the public page and the card) answers one generic "gone" for every
 *   reason a link cannot be seen: a malformed or unknown token, stopped, expired, hidden by a
 *   moderator, a Daily run a moderator took off the board, a banned or deleted author (a tombstone
 *   is banned until 9999), or a viewer who blocks or is blocked by the sharer. A failed block
 *   lookup is "gone" too (closed). The name and picture are resolved live, and only when the link
 *   chose to show them.
 * - The token is never logged.
 */
import { randomBytes } from 'node:crypto';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { prisma } from '@/lib/prisma.server';
import {
  resolveUser,
  userDisplaySelect,
} from '@/lib/user-display';
import type { ShareSummary } from '@/lib/music-social/share.contract';
import type { SongMode } from '../songs/scoring';
import {
  SHARE_LIVE_CAP,
  SHARE_SWEEP_AFTER_MS,
  SHARE_TTL_MS,
  dailyPayload,
  dailySubject,
  readPayload,
  samePayload,
  shareGone,
  sharePath,
  songPayload,
  songSubject,
  isShareToken,
  type SharePayload,
} from './share';

/** 128 random bits, base64url: 22 characters. */
export function newShareToken(): string {
  return randomBytes(
    16,
  ).toString(
    'base64url',
  );
}

export type CreateShare =
  | {
      kind: 'daily';
      date: string;
      showName: boolean;
    }
  | {
      kind: 'song';
      songId: string;
      mode: SongMode;
      showName: boolean;
    };

export type CreateShareResult =
  | {
      ok: true;
      share: ShareSummary;
    }
  | {
      ok: false;
      reason:
        | 'nothing'
        | 'cap';
    };

interface StoredShare {
  id: string;
  token: string;
  payload: unknown;
  showName: boolean;
  createdAt: Date;
  expiresAt: Date;
}

function summary(
  row: StoredShare,
): ShareSummary | null {
  const payload =
    readPayload(
      row.payload,
    );
  if (
    !payload
  )
    return null;
  return {
    id: row.id,
    path: sharePath(
      row.token,
    ),
    payload,
    showName:
      row.showName,
    createdAt:
      row.createdAt.toISOString(),
    expiresAt:
      row.expiresAt.toISOString(),
  };
}

function liveWhere(
  userId: string,
  now: number,
) {
  return {
    userId,
    stoppedAt:
      null,
    hiddenAt:
      null,
    expiresAt:
      {
        gt: new Date(
          now,
        ),
      },
  };
}

/** The snapshot of what the learner asked to share, from their own stored row; null when none. */
async function snapshot(
  userId: string,
  input: CreateShare,
): Promise<{
  subject: string;
  rowId: string;
  payload: SharePayload;
} | null> {
  if (
    input.kind ===
    'daily'
  ) {
    const row =
      await prisma.musicSprintDaily.findUnique(
        {
          where:
            {
              userId_date:
                {
                  userId,
                  date: input.date,
                },
            },
          select:
            {
              id: true,
              userId: true,
              date: true,
              score: true,
              avgMs: true,
              played: true,
              skipped: true,
              results: true,
              hiddenAt: true,
            },
        },
      );
    if (
      !row ||
      row.userId !==
        userId ||
      row.hiddenAt !==
        null
    )
      return null;
    const payload =
      dailyPayload(
        row,
      );
    return payload
      ? {
          subject:
            dailySubject(
              row.date,
            ),
          rowId:
            row.id,
          payload,
        }
      : null;
  }
  const [
    best,
    profile,
  ] =
    await Promise.all(
      [
        prisma.musicSongBest.findUnique(
          {
            where:
              {
                userId_songId_mode:
                  {
                    userId,
                    songId:
                      input.songId,
                    mode: input.mode,
                  },
              },
            select:
              {
                id: true,
                userId: true,
                songId: true,
                mode: true,
                bestScore: true,
              },
          },
        ),
        prisma.musicLearnProfile.findUnique(
          {
            where:
              {
                userId,
              },
            select:
              {
                instrument: true,
              },
          },
        ),
      ],
    );
  if (
    !best ||
    best.userId !==
      userId
  )
    return null;
  const instrument =
    profile?.instrument;
  const payload =
    songPayload(
      best,
      instrument ===
        'guitar' ||
        instrument ===
          'voice'
        ? instrument
        : 'piano',
    );
  return payload
    ? {
        subject:
          songSubject(
            best.songId,
            best.mode,
          ),
        rowId:
          best.id,
        payload,
      }
    : null;
}

const SHARE_SELECT =
  {
    id: true,
    token: true,
    payload: true,
    showName: true,
    createdAt: true,
    expiresAt: true,
  } as const;

export async function createShare(
  userId: string,
  input: CreateShare,
  now: number,
): Promise<CreateShareResult> {
  const snap =
    await snapshot(
      userId,
      input,
    );
  if (
    !snap
  )
    return {
      ok: false,
      reason:
        'nothing',
    };

  // The same result with the same name choice: hand back the live link (a better song best since
  // makes a new snapshot, so a new link).
  const existing =
    await prisma.musicShare.findFirst(
      {
        where:
          {
            ...liveWhere(
              userId,
              now,
            ),
            subject:
              snap.subject,
            showName:
              input.showName,
          },
        orderBy:
          {
            createdAt:
              'desc',
          },
        select:
          SHARE_SELECT,
      },
    );
  if (
    existing &&
    samePayload(
      readPayload(
        existing.payload,
      ),
      snap.payload,
    )
  ) {
    const s =
      summary(
        existing,
      );
    if (
      s
    )
      return {
        ok: true,
        share:
          s,
      };
  }

  const live =
    await prisma.musicShare.count(
      {
        where:
          liveWhere(
            userId,
            now,
          ),
      },
    );
  if (
    live >=
    SHARE_LIVE_CAP
  )
    return {
      ok: false,
      reason:
        'cap',
    };

  const data =
    {
      userId,
      kind: snap
        .payload
        .kind,
      subject:
        snap.subject,
      rowId:
        snap.rowId,
      payload:
        snap.payload as unknown as object,
      showName:
        input.showName,
      createdAt:
        new Date(
          now,
        ),
      expiresAt:
        new Date(
          now +
            SHARE_TTL_MS,
        ),
    };
  let row: StoredShare;
  try {
    row =
      await prisma.musicShare.create(
        {
          data: {
            ...data,
            token:
              newShareToken(),
          },
          select:
            SHARE_SELECT,
        },
      );
  } catch (err) {
    // A token collision at 128 bits does not happen; if a unique index says it did, draw again once.
    if (
      (
        err as {
          code?: string;
        }
      )
        ?.code !==
      'P2002'
    )
      throw err;
    row =
      await prisma.musicShare.create(
        {
          data: {
            ...data,
            token:
              newShareToken(),
          },
          select:
            SHARE_SELECT,
        },
      );
  }
  const s =
    summary(
      row,
    );
  if (
    !s
  )
    throw new Error(
      'share payload did not read back',
    );
  return {
    ok: true,
    share:
      s,
  };
}

/** The learner's live links, newest first. */
export async function listShares(
  userId: string,
  now: number,
): Promise<
  ShareSummary[]
> {
  const rows =
    await prisma.musicShare.findMany(
      {
        where:
          liveWhere(
            userId,
            now,
          ),
        orderBy:
          {
            createdAt:
              'desc',
          },
        take: SHARE_LIVE_CAP,
        select:
          SHARE_SELECT,
      },
    );
  return rows.flatMap(
    (
      r,
    ) =>
      summary(
        r,
      ) ??
      [],
  );
}

/** Stop one of the learner's links; answers how many it stopped (0 for another learner's id). */
export async function stopShare(
  userId: string,
  id: string,
  now: number,
): Promise<number> {
  const res =
    await prisma.musicShare.updateMany(
      {
        where:
          {
            id,
            userId,
            stoppedAt:
              null,
          },
        data: {
          stoppedAt:
            new Date(
              now,
            ),
        },
      },
    );
  return res.count;
}

/** Stop every live link of the learner's. */
export async function stopAllShares(
  userId: string,
  now: number,
): Promise<number> {
  const res =
    await prisma.musicShare.updateMany(
      {
        where:
          {
            userId,
            stoppedAt:
              null,
          },
        data: {
          stoppedAt:
            new Date(
              now,
            ),
        },
      },
    );
  return res.count;
}

export type SharedResult =
  | {
      state: 'gone';
    }
  | {
      state: 'live';
      /** The share's internal id: what a report names. */
      id: string;
      payload: SharePayload;
      /** Null unless the link chose to show them ("A learner"). */
      name:
        | string
        | null;
      image:
        | string
        | null;
    };

const GONE: SharedResult =
  {
    state:
      'gone',
  };

/**
 * A shared result as a viewer may see it (`viewerId` null: signed out, or the card). Every reason
 * it cannot be seen is the same "gone".
 */
export async function getSharedResult(
  token: string,
  viewerId:
    | string
    | null,
  now: number,
): Promise<SharedResult> {
  if (
    !isShareToken(
      token,
    )
  )
    return GONE;
  const row =
    await prisma.musicShare.findUnique(
      {
        where:
          {
            token,
          },
        select:
          {
            id: true,
            userId: true,
            kind: true,
            rowId: true,
            payload: true,
            showName: true,
            expiresAt: true,
            stoppedAt: true,
            hiddenAt: true,
          },
      },
    );
  if (
    !row ||
    shareGone(
      row,
      now,
    )
  )
    return GONE;
  const payload =
    readPayload(
      row.payload,
    );
  if (
    !payload
  )
    return GONE;

  if (
    viewerId !==
      null &&
    viewerId !==
      row.userId
  ) {
    let blocked: string[];
    try {
      blocked =
        await getBlockedAuthorIds(
          viewerId,
        );
    } catch {
      return GONE;
    }
    if (
      blocked.includes(
        row.userId,
      )
    )
      return GONE;
  }

  const [
    author,
    source,
  ] =
    await Promise.all(
      [
        // Not banned (a lapsed ban is fine), which also leaves out deleted accounts.
        prisma.user.findFirst(
          {
            where:
              {
                id: row.userId,
                OR: [
                  {
                    bannedUntil:
                      null,
                  },
                  {
                    bannedUntil:
                      {
                        lt: new Date(
                          now,
                        ),
                      },
                  },
                ],
              },
            select:
              userDisplaySelect,
          },
        ),
        row.kind ===
        'daily'
          ? prisma.musicSprintDaily.findUnique(
              {
                where:
                  {
                    id: row.rowId,
                  },
                select:
                  {
                    hiddenAt: true,
                  },
              },
            )
          : Promise.resolve(
              null,
            ),
      ],
    );
  if (
    !author
  )
    return GONE;
  // A Daily run a moderator took off the board is not shared either.
  if (
    row.kind ===
      'daily' &&
    (!source ||
      source.hiddenAt !==
        null)
  )
    return GONE;

  const who =
    row.showName
      ? resolveUser(
          author,
        )
      : null;
  return {
    state:
      'live',
    id: row.id,
    payload,
    name:
      who?.name ??
      null,
    image:
      who?.image ??
      null,
  };
}

/** Delete links that expired more than 30 days ago (the maintenance job). */
export async function sweepExpiredShares(
  now: number,
): Promise<number> {
  const res =
    await prisma.musicShare.deleteMany(
      {
        where:
          {
            expiresAt:
              {
                lt: new Date(
                  now -
                    SHARE_SWEEP_AFTER_MS,
                ),
              },
          },
      },
    );
  return res.count;
}

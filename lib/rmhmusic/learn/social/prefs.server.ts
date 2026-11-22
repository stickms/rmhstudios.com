/**
 * A learner's social switches (`music_social`, Phase 6 plan 1.1). The rules are `prefs.ts`; this
 * file reads and writes the row and drops the caches a toggle changes.
 *
 * A toggle drops the Everyone boards of today and yesterday (the only dates a board shows) and the
 * learner's own friends list at once, in every process (`board-cache.server.ts`: a per-date
 * generation, so a rebuild already running elsewhere cannot put the old list back); other viewers'
 * cached friends lists expire within 30 s.
 */
import { prisma } from '@/lib/prisma.server';
import { dropLearnerBoardCaches } from './board-cache.server';
import { readSocial, type MusicSocialPrefs } from './prefs';

/** The learner's switches; never creates a row. */
export async function getMusicSocial(userId: string): Promise<MusicSocialPrefs> {
  const row = await prisma.musicSocial.findUnique({
    where: {
      userId,
    },
    select: {
      board: true,
      friends: true,
    },
  });
  return readSocial(row);
}

/** Change either switch (creating the row on the first change) and answer both. */
export async function setMusicSocial(
  userId: string,
  patch: {
    board?: boolean | undefined;
    friends?: boolean | undefined;
  },
  now: number,
): Promise<MusicSocialPrefs> {
  const data: {
    board?: boolean;
    friends?: boolean;
  } = {};
  if (patch.board !== undefined) data.board = patch.board;
  if (patch.friends !== undefined) data.friends = patch.friends;
  const row = await prisma.musicSocial.upsert({
    where: {
      userId,
    },
    create: {
      userId,
      ...data,
    },
    update: data,
    select: {
      board: true,
      friends: true,
    },
  });
  await dropLearnerBoardCaches(userId, now);
  return readSocial(row);
}

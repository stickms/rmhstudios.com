/**
 * Reading and writing game assists (P7). Server-only.
 *
 * The rules are in `assist.ts`; this is the row around them. The one thing
 * worth noting here is what is NOT here: nothing asks the client whether a run
 * was assisted. {@link assistProfileFor} derives the profile from the stored
 * settings at run start, for the same reason `issueEnvelope` does — the client
 * is the one participant with a motive to lie about it.
 */

import { prisma } from '@/lib/prisma.server';
import {
  ASSIST_DEFAULTS,
  normalizeAssists,
  profileFor,
  type AssistProfile,
  type AssistSettings,
} from '@/lib/game/assist';

/** A member's assists, defaulted when they have never set any. */
export async function getAssists(userId: string | null): Promise<AssistSettings> {
  if (!userId) return ASSIST_DEFAULTS;
  const row = await prisma.gameAssistPreference.findUnique({
    where: { userId },
    select: {
      holdToPress: true,
      speedFloorPerMille: true,
      calmVisuals: true,
      colorSafe: true,
      noTimedInput: true,
    },
  });
  if (!row) return ASSIST_DEFAULTS;
  return normalizeAssists({
    holdToPress: row.holdToPress,
    speedFloor: row.speedFloorPerMille / 1000,
    calmVisuals: row.calmVisuals,
    colorSafe: row.colorSafe,
    noTimedInput: row.noTimedInput,
  });
}

/** Write them. Values are clamped by `normalizeAssists`, never rejected. */
export async function setAssists(
  userId: string,
  raw: Partial<AssistSettings>,
): Promise<AssistSettings> {
  const next = normalizeAssists({ ...(await getAssists(userId)), ...raw });
  const data = {
    holdToPress: next.holdToPress,
    speedFloorPerMille: Math.round(next.speedFloor * 1000),
    calmVisuals: next.calmVisuals,
    colorSafe: next.colorSafe,
    noTimedInput: next.noTimedInput,
  };
  await prisma.gameAssistPreference.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return next;
}

/**
 * The profile for one run of one game.
 *
 * Returns the ranked profile whenever the game has not adopted the layer,
 * whatever the member asked for — see `profileFor`. That direction matters:
 * somebody with assists switched on must not quietly lose leaderboard
 * eligibility in a game that was never going to honour them.
 */
export async function assistProfileFor(
  userId: string | null,
  game: string,
): Promise<AssistProfile> {
  return profileFor(game, await getAssists(userId));
}

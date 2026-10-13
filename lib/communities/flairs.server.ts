/**
 * N1 — community post flair (server-only).
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import {
  CHALLENGE_WINNER_FLAIR,
  FLAIR_MAX_PER_COMMUNITY,
  isFlairColor,
  type FlairColor,
  type FlairDTO,
} from '@/lib/communities/plus-schema';

const TTL_MS = 60_000;
const key = (communityId: string) => `community:flairs:${communityId}`;

function toDTO(f: { id: string; name: string; color: string }): FlairDTO {
  return { id: f.id, name: f.name, color: isFlairColor(f.color) ? f.color : 'accent' };
}

export async function listFlairs(communityId: string): Promise<FlairDTO[]> {
  const hit = apiCache.get<FlairDTO[]>(key(communityId));
  if (hit) return hit;
  const rows = await prisma.communityFlair.findMany({
    where: { communityId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    take: FLAIR_MAX_PER_COMMUNITY + 1,
    select: { id: true, name: true, color: true },
  });
  const flairs = rows.map(toDTO);
  apiCache.set(key(communityId), flairs, TTL_MS);
  return flairs;
}

export function bustFlairs(communityId: string): void {
  apiCache.invalidate(key(communityId));
}

export class FlairError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

export async function createFlair(
  communityId: string,
  input: { name: string; color: FlairColor },
): Promise<FlairDTO> {
  const count = await prisma.communityFlair.count({ where: { communityId } });
  if (count >= FLAIR_MAX_PER_COMMUNITY) {
    throw new FlairError(`A community can have at most ${FLAIR_MAX_PER_COMMUNITY} flairs`, 400);
  }
  try {
    const row = await prisma.communityFlair.create({
      data: { communityId, name: input.name, color: input.color, position: count },
      select: { id: true, name: true, color: true },
    });
    return toDTO(row);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new FlairError('A flair with that name already exists', 409);
    }
    throw e;
  } finally {
    bustFlairs(communityId);
  }
}

export async function updateFlair(
  communityId: string,
  flairId: string,
  input: { name: string; color: FlairColor },
): Promise<FlairDTO> {
  const existing = await prisma.communityFlair.findFirst({
    where: { id: flairId, communityId },
    select: { id: true },
  });
  if (!existing) throw new FlairError('Flair not found', 404);
  try {
    const row = await prisma.communityFlair.update({
      where: { id: flairId },
      data: { name: input.name, color: input.color },
      select: { id: true, name: true, color: true },
    });
    return toDTO(row);
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') {
      throw new FlairError('A flair with that name already exists', 409);
    }
    throw e;
  } finally {
    bustFlairs(communityId);
  }
}

export async function deleteFlair(communityId: string, flairId: string): Promise<void> {
  const res = await prisma.communityFlair.deleteMany({ where: { id: flairId, communityId } });
  bustFlairs(communityId);
  if (res.count === 0) throw new FlairError('Flair not found', 404);
}

/** Does this flair belong to the community? (Used to validate a composer pick.) */
export async function flairBelongsTo(communityId: string, flairId: string): Promise<boolean> {
  const flairs = await listFlairs(communityId);
  return flairs.some((f) => f.id === flairId);
}

/** Flairs for a page of posts in one indexed query (`postId IN (...)`). */
export async function loadFlairsForPosts(postIds: string[]): Promise<Map<string, FlairDTO>> {
  const out = new Map<string, FlairDTO>();
  if (postIds.length === 0) return out;
  const rows = await prisma.communityPostFlair.findMany({
    where: { postId: { in: postIds } },
    select: { postId: true, flair: { select: { id: true, name: true, color: true } } },
  });
  for (const r of rows) out.set(r.postId, toDTO(r.flair));
  return out;
}

/** Find-or-create the auto flair given to a challenge winner. */
export async function ensureWinnerFlair(communityId: string): Promise<string | null> {
  const existing = await prisma.communityFlair.findUnique({
    where: { communityId_name: { communityId, name: CHALLENGE_WINNER_FLAIR.name } },
    select: { id: true },
  });
  if (existing) return existing.id;
  try {
    const row = await prisma.communityFlair.create({
      data: {
        communityId,
        name: CHALLENGE_WINNER_FLAIR.name,
        color: CHALLENGE_WINNER_FLAIR.color,
        // Sorted last so a mod's own flairs stay first in the picker. The cap is
        // for mod-defined flairs; this one reserved slot is allowed on top.
        position: FLAIR_MAX_PER_COMMUNITY,
      },
      select: { id: true },
    });
    bustFlairs(communityId);
    return row.id;
  } catch {
    const again = await prisma.communityFlair.findUnique({
      where: { communityId_name: { communityId, name: CHALLENGE_WINNER_FLAIR.name } },
      select: { id: true },
    });
    return again?.id ?? null;
  }
}

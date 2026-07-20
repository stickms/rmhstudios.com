/**
 * Live Spaces (§4) — server-side data logic (Phase 1: text + presence, no audio).
 *
 * A Space is a scheduled or spontaneous live room attached to a community or a
 * creator profile. This module owns the DB-backed lifecycle (create → start →
 * end), the "Live now" reader, and chat-transcript persistence. Live
 * participant/role state (audience, reactions) is ephemeral in the socket
 * handler (`server/socket-server/handlers/spaces.ts`) — same choice the game
 * handlers make.
 *
 * Permission model: community-hosted spaces require the host to be a MOD/ADMIN
 * of that community; profile-hosted spaces (communityId null) are open to any
 * signed-in user.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser, resolveUserDisplay } from '@/lib/user-display';
import { getRole, canModerate } from '@/lib/communities/access.server';
import { setActivity } from '@/lib/presence.server';
import type {
  LiveSpaceSummary,
  SpaceMessageView,
  SpacePinned,
  SpaceView,
} from '@/lib/spaces/types';

/**
 * Typed error the API routes translate into an HTTP status. Lets `createSpace`
 * / `startSpace` / … throw a permission or state error that the route maps
 * straight to a response instead of a blanket 500.
 */
export class SpaceError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SpaceError';
    this.status = status;
  }
}

const spaceSelect = {
  id: true,
  hostId: true,
  communityId: true,
  title: true,
  status: true,
  scheduledAt: true,
  startedAt: true,
  endedAt: true,
  pinned: true,
  recordChat: true,
  createdAt: true,
  host: { select: userDisplaySelect },
  community: { select: { id: true, slug: true, name: true, icon: true, color: true } },
} as const;

type SpaceRow = Prisma.SpaceGetPayload<{ select: typeof spaceSelect }>;

// Lighter select for transcript authors — resolveUserDisplay only needs
// name/image/profile, so we skip the cosmetics join.
const messageUserSelect = {
  id: true,
  name: true,
  image: true,
  username: true,
  handle: true,
  profile: { select: { displayName: true, customImage: true } },
} as const;

type MessageUserRow = Prisma.UserGetPayload<{ select: typeof messageUserSelect }>;

function shapeMessageAuthor(u: MessageUserRow): SpaceMessageView['author'] {
  const display = resolveUserDisplay(u);
  return { id: u.id, username: u.username, handle: u.handle ?? null, ...display };
}

function shapeSpace(row: SpaceRow): SpaceView {
  return {
    id: row.id,
    hostId: row.hostId,
    communityId: row.communityId,
    title: row.title,
    status: row.status,
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    pinned: (row.pinned as SpacePinned | null) ?? null,
    recordChat: row.recordChat,
    createdAt: row.createdAt.toISOString(),
    host: resolveUser(row.host),
    community: row.community,
  };
}

export interface CreateSpaceInput {
  hostId: string;
  communityId?: string | null;
  title: string;
  scheduledAt?: Date | null;
  pinned?: SpacePinned | null;
  recordChat?: boolean;
}

/**
 * Create a Space (always starts SCHEDULED; the host flips it LIVE via
 * {@link startSpace}). Community spaces require the host to be a community mod.
 */
export async function createSpace(input: CreateSpaceInput): Promise<SpaceView> {
  const { hostId, communityId, title } = input;

  if (communityId) {
    const role = await getRole(communityId, hostId);
    if (!canModerate(role)) {
      throw new SpaceError(403, 'Only community mods can host a Space in this community');
    }
  }

  const row = await prisma.space.create({
    data: {
      hostId,
      communityId: communityId ?? null,
      title: title.trim().slice(0, 120),
      status: 'SCHEDULED',
      scheduledAt: input.scheduledAt ?? null,
      // pinned is optional Json — only set it when provided (defaults to null).
      pinned: input.pinned ? (input.pinned as unknown as Prisma.InputJsonValue) : undefined,
      recordChat: input.recordChat ?? true,
    },
    select: spaceSelect,
  });

  return shapeSpace(row);
}

/** Flip a SCHEDULED/LIVE space to LIVE (host only). Idempotent for LIVE. */
export async function startSpace(id: string, hostId: string): Promise<SpaceView> {
  const existing = await prisma.space.findUnique({
    where: { id },
    select: { hostId: true, status: true, startedAt: true },
  });
  if (!existing) throw new SpaceError(404, 'Space not found');
  if (existing.hostId !== hostId) throw new SpaceError(403, 'Only the host can start this Space');
  if (existing.status === 'ENDED') throw new SpaceError(400, 'This Space has already ended');

  const row = await prisma.space.update({
    where: { id },
    data: { status: 'LIVE', startedAt: existing.startedAt ?? new Date() },
    select: spaceSelect,
  });
  const view = shapeSpace(row);
  // §9 rich presence: the host is now "Live in a Space". Ephemeral — clears on
  // endSpace or with the heartbeat if they drop. One of the ~10 activity touch
  // points (games / rooms / spaces); the rest are the documented follow-up.
  void setActivity(hostId, { kind: 'space', spaceId: id, label: `Live: ${view.title}` });
  return view;
}

/** End a LIVE/SCHEDULED space (host only). */
export async function endSpace(id: string, hostId: string): Promise<SpaceView> {
  const existing = await prisma.space.findUnique({
    where: { id },
    select: { hostId: true, status: true },
  });
  if (!existing) throw new SpaceError(404, 'Space not found');
  if (existing.hostId !== hostId) throw new SpaceError(403, 'Only the host can end this Space');

  const row = await prisma.space.update({
    where: { id },
    data: { status: 'ENDED', endedAt: new Date() },
    select: spaceSelect,
  });
  // §9: clear the host's "Live in a Space" activity on end.
  void setActivity(hostId, null);
  return shapeSpace(row);
}

/**
 * Live spaces, newest-started first — powers the "Live now" rail. Audience
 * count is left null: it is ephemeral in the socket hub (a separate process),
 * so the rail shows a live dot without a DB-derived count.
 */
export async function listLiveSpaces(limit = 20): Promise<LiveSpaceSummary[]> {
  const rows = await prisma.space.findMany({
    where: { status: 'LIVE' },
    orderBy: { startedAt: 'desc' },
    take: Math.min(Math.max(limit, 1), 50),
    select: spaceSelect,
  });
  return rows.map((row) => ({ ...shapeSpace(row), audienceCount: null }));
}

/**
 * Fetch one space for SSR. For an ENDED space with `recordChat`, includes the
 * persisted chat transcript (oldest first).
 */
export async function getSpace(id: string): Promise<SpaceView | null> {
  const row = await prisma.space.findUnique({ where: { id }, select: spaceSelect });
  if (!row) return null;

  const view = shapeSpace(row);

  if (row.status === 'ENDED' && row.recordChat) {
    const msgs = await prisma.spaceMessage.findMany({
      where: { spaceId: id },
      orderBy: { createdAt: 'asc' },
      take: 1000,
      select: { id: true, body: true, createdAt: true, user: { select: messageUserSelect } },
    });
    view.transcript = msgs.map((m) => ({
      id: m.id,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
      author: shapeMessageAuthor(m.user),
    }));
  }

  return view;
}

/**
 * Persist one chat message to a LIVE space. Rate-limiting is enforced at the
 * calling route. Returns the shaped message so the caller can echo it.
 */
export async function postSpaceMessage(input: {
  spaceId: string;
  userId: string;
  body: string;
}): Promise<SpaceMessageView> {
  const space = await prisma.space.findUnique({
    where: { id: input.spaceId },
    select: { status: true, recordChat: true },
  });
  if (!space) throw new SpaceError(404, 'Space not found');
  if (space.status !== 'LIVE') throw new SpaceError(400, 'This Space is not live');

  const body = input.body.trim().slice(0, 500);
  if (!body) throw new SpaceError(400, 'Message cannot be empty');

  const msg = await prisma.spaceMessage.create({
    data: { spaceId: input.spaceId, userId: input.userId, body },
    select: { id: true, body: true, createdAt: true, user: { select: messageUserSelect } },
  });

  return {
    id: msg.id,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    author: shapeMessageAuthor(msg.user),
  };
}

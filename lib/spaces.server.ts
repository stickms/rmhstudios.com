/**
 * Live Spaces (§4) — server-side data logic.
 *
 * A Space is a titled live room — scheduled or spontaneous — attached to a
 * community or a creator profile. Since 2026-11-19 it is not its own table: it
 * is a `GroupCall` row with a `title` (the one live-room model), so the same row
 * carries the room's voice roster (`GroupCallParticipant`, written by the
 * group-call hub) and its text (`GroupCallMessage`). This module owns the
 * DB-backed lifecycle of the titled room (create → start → end), the "Live now"
 * reader, and chat-transcript persistence. Live audience/reaction state is
 * ephemeral in the socket handler (`server/socket-server/handlers/spaces.ts`);
 * voice runs in `server/socket-server/handlers/group-call.ts`, which adopts the
 * room's row rather than opening a second one.
 *
 * Every read here is scoped to `title: { not: null }`: an untitled row is a
 * plain voice call (possibly a private ad-hoc ring) and is never a Space.
 *
 * The wire keeps the Space vocabulary (`LIVE`, not `ACTIVE`), so the room UI did
 * not change with the table.
 *
 * Permission model: community-hosted spaces require the host to be a MOD/ADMIN
 * of that community; profile-hosted spaces (communityId null) are open to any
 * signed-in user.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { isRestricted } from '@/lib/moderation/restrictions.server';
import { refusalBody } from '@/lib/errors/codes';
import { userDisplaySelect, resolveUser, resolveUserDisplay } from '@/lib/user-display';
import { getRole, canModerate } from '@/lib/communities/access.server';
import { setActivity } from '@/lib/presence.server';
import {
  parseSpacePinned,
  type LiveSpaceSummary,
  type SpaceMessageView,
  type SpacePinned,
  type SpaceView,
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

/** Rows that are Spaces: titled rooms. */
const TITLED = { title: { not: null } } as const;

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

type SpaceRow = Prisma.GroupCallGetPayload<{ select: typeof spaceSelect }>;

/** The room's status in the Space vocabulary the wire and the UI speak. */
function spaceStatus(status: SpaceRow['status']): SpaceView['status'] {
  if (status === 'SCHEDULED') return 'SCHEDULED';
  if (status === 'ACTIVE' || status === 'RINGING') return 'LIVE';
  return 'ENDED';
}

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
    title: row.title ?? '',
    status: spaceStatus(row.status),
    scheduledAt: row.scheduledAt?.toISOString() ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    pinned: parseSpacePinned(row.pinned),
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

  const row = await prisma.groupCall.create({
    data: {
      hostId,
      origin: communityId ? 'COMMUNITY' : 'PROFILE',
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
  const existing = await prisma.groupCall.findFirst({
    where: { id, ...TITLED },
    select: { hostId: true, status: true, startedAt: true },
  });
  if (!existing) throw new SpaceError(404, 'Space not found');
  if (existing.hostId !== hostId) throw new SpaceError(403, 'Only the host can start this Space');
  if (spaceStatus(existing.status) === 'ENDED') {
    throw new SpaceError(400, 'This Space has already ended');
  }

  // CAS on not-ENDED: an end landing after the check above must not be undone
  // (ENDED → LIVE). `update` with the extended where throws P2025 on a miss.
  const row = await prisma.groupCall
    .update({
      where: { id, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      data: { status: 'ACTIVE', startedAt: existing.startedAt ?? new Date() },
      select: spaceSelect,
    })
    .catch((err: unknown) => {
      if ((err as { code?: string } | null)?.code === 'P2025') {
        throw new SpaceError(400, 'This Space has already ended');
      }
      throw err;
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
  const existing = await prisma.groupCall.findFirst({
    where: { id, ...TITLED },
    select: { hostId: true, status: true },
  });
  if (!existing) throw new SpaceError(404, 'Space not found');
  if (existing.hostId !== hostId) throw new SpaceError(403, 'Only the host can end this Space');
  // Ending twice keeps the first endedAt.
  if (spaceStatus(existing.status) === 'ENDED') {
    const ended = await prisma.groupCall.findUnique({ where: { id }, select: spaceSelect });
    if (!ended) throw new SpaceError(404, 'Space not found');
    return shapeSpace(ended);
  }

  // Ended over HTTP, the room's voice (if anyone is in it) runs on in the hub
  // until it empties; the room page ends over the socket, which closes both.
  const row = await prisma.groupCall.update({
    where: { id },
    data: { status: 'ENDED', endedAt: new Date() },
    select: spaceSelect,
  });
  // §9: clear the host's "Live in a Space" activity on end.
  void setActivity(hostId, null);
  return shapeSpace(row);
}

/**
 * Everything live right now, newest-opened first — the one "Live now" listing.
 *
 * Two kinds of room, one model: titled rooms (Spaces) that are open, and the
 * untitled voice rooms of PUBLIC communities that have somebody in them. A
 * private community's voice room is never listed (who is talking where is a
 * fact about its members), nor is any ad-hoc ring or party room. `voiceCount`
 * is the number of people in the room's voice right now, from the roster the
 * hub persists; the text audience stays ephemeral in the hub, so
 * `audienceCount` is left null.
 */
export async function listLiveSpaces(limit = 20): Promise<LiveSpaceSummary[]> {
  const take = Math.min(Math.max(limit, 1), 50);
  const rows = await prisma.groupCall.findMany({
    where: {
      status: 'ACTIVE',
      endedAt: null,
      OR: [
        TITLED,
        {
          title: null,
          origin: 'COMMUNITY',
          community: { isPrivate: false },
          participants: { some: { status: 'JOINED' } },
        },
      ],
    },
    orderBy: { startedAt: 'desc' },
    take,
    select: {
      ...spaceSelect,
      _count: { select: { participants: { where: { status: 'JOINED' } } } },
    },
  });
  return rows.map(({ _count, ...row }) => ({
    ...shapeSpace(row),
    audienceCount: null,
    voiceCount: _count.participants,
    voiceOnly: row.title === null,
  }));
}

/**
 * Fetch one space for SSR. For an ENDED space with `recordChat`, includes the
 * persisted chat transcript (oldest first).
 */
export async function getSpace(id: string): Promise<SpaceView | null> {
  const row = await prisma.groupCall.findFirst({ where: { id, ...TITLED }, select: spaceSelect });
  if (!row) return null;

  const view = shapeSpace(row);

  if (view.status === 'ENDED' && row.recordChat) {
    const msgs = await prisma.groupCallMessage.findMany({
      where: { callId: id },
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
  // s14-17: a Space's chat is a chat; a member timed out of messages and chats cannot write in it.
  if (await isRestricted(input.userId, 'message')) {
    throw new SpaceError(403, refusalBody('FEATURE_RESTRICTED').error);
  }
  const space = await prisma.groupCall.findFirst({
    where: { id: input.spaceId, ...TITLED },
    select: { status: true, recordChat: true },
  });
  if (!space) throw new SpaceError(404, 'Space not found');
  if (spaceStatus(space.status) !== 'LIVE') throw new SpaceError(400, 'This Space is not live');

  const body = input.body.trim().slice(0, 500);
  if (!body) throw new SpaceError(400, 'Message cannot be empty');

  const msg = await prisma.groupCallMessage.create({
    data: { callId: input.spaceId, userId: input.userId, body },
    select: { id: true, body: true, createdAt: true, user: { select: messageUserSelect } },
  });

  return {
    id: msg.id,
    body: msg.body,
    createdAt: msg.createdAt.toISOString(),
    author: shapeMessageAuthor(msg.user),
  };
}

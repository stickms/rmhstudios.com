/**
 * K1 — availability polls. Server-only.
 *
 * Builds on `lib/schedule/availability.ts` (scoring + shortlist) and
 * `poll-slots.ts` (the slot grid derived from a poll's parameters). A poll
 * stores its parameters; a response stores one character per slot.
 */
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import { createNotification } from '@/lib/notifications.server';
import { getRole, canModerate } from '@/lib/communities/access.server';
import { createEvent, EventError } from '@/lib/events.server';
import { getChatAccess } from '@/lib/chat-plus/access.server';
import { postChatMessage } from '@/lib/chat-plus/post.server';
import { eventToICS } from '@/lib/events-ics';
import { userChipSelect, userDisplaySelect } from '@/lib/user-display';
import {
  POLL_MAX_RESPONDENTS,
  checkPollParams,
  emptyAnswers,
  isValidAnswers,
  isValidLock,
  pollSlotStarts,
  type PollParams,
} from './poll-slots';
import { loadPeople, toCalPerson } from './people.server';
import { parseDay } from './tz';
import type { CreatePollInput } from './schema';
import type { PollListItem, PollView } from './types';

export type PollResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({
  ok: false,
  status,
  error,
});

const pollUrl = (id: string) => `/when/${id}`;

function paramsOf(p: {
  tz: string;
  firstDay: string;
  days: number;
  dayStartHour: number;
  dayEndHour: number;
  slotMin: number;
}): PollParams {
  return {
    tz: p.tz,
    firstDay: p.firstDay,
    days: p.days,
    dayStartHour: p.dayStartHour,
    dayEndHour: p.dayEndHour,
    slotMin: p.slotMin,
  };
}

export async function createPoll(
  creatorId: string,
  input: CreatePollInput,
): Promise<PollResult<{ id: string }>> {
  const params = paramsOf(input);
  const problem = checkPollParams(params);
  if (problem) return fail(400, `Invalid poll window (${problem})`);
  const starts = pollSlotStarts(params);
  if ((starts[starts.length - 1] + params.slotMin) * 60_000 < Date.now()) {
    return fail(400, 'That date range is already over');
  }

  const requiredIds = [...new Set(input.requiredUserIds)].filter((id) => id !== creatorId);
  if (requiredIds.length) {
    const found = await prisma.user.count({ where: { id: { in: requiredIds } } });
    if (found !== requiredIds.length) return fail(400, 'One of the required people was not found');
  }

  if (input.communityId) {
    const role = await getRole(input.communityId, creatorId);
    if (!role) return fail(403, 'Join that community first');
  }
  let groupAccess: Awaited<ReturnType<typeof getChatAccess>> = null;
  if (input.groupChatId) {
    groupAccess = await getChatAccess('group', input.groupChatId, creatorId);
    if (!groupAccess) return fail(403, 'You are not in that group chat');
  }

  const poll = await prisma.availabilityPoll.create({
    data: {
      creatorId,
      title: input.title,
      description: input.description,
      ...params,
      communityId: input.communityId ?? null,
      groupChatId: input.groupChatId ?? null,
      invitees: { create: requiredIds.map((userId) => ({ userId })) },
    },
    select: { id: true },
  });

  const creator = await prisma.user.findUnique({
    where: { id: creatorId },
    select: userChipSelect,
  });
  const who = creator?.name ?? creator?.handle ?? 'Someone';
  for (const userId of requiredIds) {
    void createNotification({
      userId,
      actorId: creatorId,
      type: 'SYSTEM',
      entityType: 'availability-poll',
      entityId: poll.id,
      preview: `${who} needs you to pick times for "${input.title}".`,
      link: pollUrl(poll.id),
    });
  }
  if (groupAccess) {
    // The group hears about it where it is already talking.
    void postChatMessage(groupAccess, {
      senderId: creatorId,
      content: `Find a time: ${input.title} ${SITE_URL}${pollUrl(poll.id)}`.slice(0, 2000),
    }).catch(() => {});
  }
  return { ok: true, value: { id: poll.id } };
}

const pollSelect = {
  id: true,
  creatorId: true,
  title: true,
  description: true,
  tz: true,
  firstDay: true,
  days: true,
  dayStartHour: true,
  dayEndHour: true,
  slotMin: true,
  communityId: true,
  groupChatId: true,
  lockedStartMin: true,
  lockedEndMin: true,
  lockedAt: true,
  lockedEventId: true,
  createdAt: true,
  creator: { select: userDisplaySelect },
  invitees: { select: { userId: true }, take: 50 },
} as const;

export async function getPollView(pollId: string, viewerId: string): Promise<PollView | null> {
  const poll = await prisma.availabilityPoll.findUnique({
    where: { id: pollId },
    select: pollSelect,
  });
  if (!poll) return null;
  const responses = await prisma.availabilityPollResponse.findMany({
    where: { pollId },
    orderBy: { createdAt: 'asc' },
    take: POLL_MAX_RESPONDENTS,
    select: { userId: true, answers: true },
  });
  const requiredSet = new Set(poll.invitees.map((i) => i.userId));
  const answered = new Set(responses.map((r) => r.userId));
  const pendingIds = [...requiredSet].filter((id) => !answered.has(id));
  const people = await loadPeople([...responses.map((r) => r.userId), ...pendingIds]);
  const community = poll.communityId
    ? await prisma.community.findUnique({ where: { id: poll.communityId }, select: { name: true } })
    : null;

  const params = paramsOf(poll);

  const isCreator = poll.creatorId === viewerId;
  const mine = responses.find((r) => r.userId === viewerId);
  return {
    id: poll.id,
    title: poll.title,
    description: poll.description,
    params,
    creator: toCalPerson(poll.creator),
    communityId: poll.communityId,
    groupChatId: poll.groupChatId,
    communityName: community?.name ?? null,
    lockedStartMin: poll.lockedStartMin,
    lockedEndMin: poll.lockedEndMin,
    lockedAt: poll.lockedAt?.toISOString() ?? null,
    lockedEventId: poll.lockedEventId,
    createdAt: poll.createdAt.toISOString(),
    pending: pendingIds.flatMap((id) => {
      const p = people.get(id);
      return p ? [p] : [];
    }),
    respondents: responses.flatMap((r) => {
      const user = people.get(r.userId);
      return user ? [{ user, answers: r.answers, required: requiredSet.has(r.userId) }] : [];
    }),
    viewer: { isCreator, answers: mine?.answers ?? null, canLock: isCreator && !poll.lockedAt },
  };
}

export async function respondToPoll(
  pollId: string,
  userId: string,
  answers: string,
): Promise<PollResult<{ saved: true }>> {
  const poll = await prisma.availabilityPoll.findUnique({
    where: { id: pollId },
    select: {
      tz: true,
      firstDay: true,
      days: true,
      dayStartHour: true,
      dayEndHour: true,
      slotMin: true,
      lockedAt: true,
    },
  });
  if (!poll) return fail(404, 'Not found');
  if (poll.lockedAt) return fail(409, 'This poll is already locked in');
  const starts = pollSlotStarts(paramsOf(poll));
  if (!isValidAnswers(answers, starts.length)) return fail(400, 'Invalid answers');

  const existing = await prisma.availabilityPollResponse.count({ where: { pollId } });
  if (existing >= POLL_MAX_RESPONDENTS) {
    const mine = await prisma.availabilityPollResponse.findUnique({
      where: { pollId_userId: { pollId, userId } },
      select: { id: true },
    });
    if (!mine) return fail(409, 'This poll has reached its limit of respondents');
  }

  const blank = answers === emptyAnswers(starts.length);
  if (blank) {
    await prisma.availabilityPollResponse.deleteMany({ where: { pollId, userId } });
  } else {
    await prisma.availabilityPollResponse.upsert({
      where: { pollId_userId: { pollId, userId } },
      create: { pollId, userId, answers },
      update: { answers },
    });
  }
  return { ok: true, value: { saved: true } };
}

export interface LockOutcome {
  eventId: string | null;
  notified: number;
}

/** Organiser locks in a run: creates the community event (if possible) and tells everyone. */
export async function lockPoll(
  pollId: string,
  userId: string,
  startMin: number,
  endMin: number,
): Promise<PollResult<LockOutcome>> {
  const poll = await prisma.availabilityPoll.findUnique({
    where: { id: pollId },
    select: { ...pollSelect, invitees: { select: { userId: true }, take: 50 } },
  });
  if (!poll) return fail(404, 'Not found');
  if (poll.creatorId !== userId) return fail(403, 'Only the organiser can lock in a time');
  if (poll.lockedAt) return fail(409, 'This poll is already locked in');
  const params = paramsOf(poll);
  if (!isValidLock(startMin, endMin, pollSlotStarts(params), poll.slotMin)) {
    return fail(400, 'That is not a valid time range for this poll');
  }

  // Claim the lock first; the conditional update is what makes two clicks race-safe.
  const claimed = await prisma.availabilityPoll.updateMany({
    where: { id: pollId, lockedAt: null },
    data: { lockedAt: new Date(), lockedStartMin: startMin, lockedEndMin: endMin },
  });
  if (claimed.count === 0) return fail(409, 'This poll is already locked in');

  let eventId: string | null = null;
  if (poll.communityId) {
    const role = await getRole(poll.communityId, userId);
    if (canModerate(role)) {
      try {
        const event = await createEvent({
          hostId: userId,
          communityId: poll.communityId,
          title: poll.title,
          description: poll.description,
          startsAt: new Date(startMin * 60_000),
          endsAt: new Date(endMin * 60_000),
          venueKind: 'URL',
          venueRef: `${SITE_URL}${pollUrl(pollId)}`,
        });
        eventId = event.id;
        await prisma.availabilityPoll.update({
          where: { id: pollId },
          data: { lockedEventId: eventId },
        });
      } catch (e) {
        if (!(e instanceof EventError)) throw e;
      }
    }
  }

  const responders = await prisma.availabilityPollResponse.findMany({
    where: { pollId },
    select: { userId: true },
    take: POLL_MAX_RESPONDENTS,
  });
  const audience = new Set<string>([
    ...responders.map((r) => r.userId),
    ...poll.invitees.map((i) => i.userId),
  ]);
  if (poll.groupChatId) {
    const members = await prisma.groupChatMember.findMany({
      where: { groupId: poll.groupChatId },
      select: { userId: true },
      take: 100,
    });
    for (const m of members) audience.add(m.userId);
  }
  audience.delete(userId);

  const when = new Date(startMin * 60_000).toUTCString().replace(':00 GMT', ' UTC');
  for (const uid of audience) {
    void createNotification({
      userId: uid,
      actorId: userId,
      type: 'SYSTEM',
      entityType: 'availability-poll',
      entityId: pollId,
      preview: `"${poll.title}" is locked in for ${when}. Open the poll to add it to your calendar.`,
      link: eventId ? '/events' : pollUrl(pollId),
    });
  }
  if (poll.groupChatId) {
    const access = await getChatAccess('group', poll.groupChatId, userId);
    if (access) {
      void postChatMessage(access, {
        senderId: userId,
        content: `Locked in: ${poll.title} on ${when} ${SITE_URL}${pollUrl(pollId)}`.slice(0, 2000),
      }).catch(() => {});
    }
  }
  return { ok: true, value: { eventId, notified: audience.size } };
}

export async function deletePoll(pollId: string, userId: string): Promise<PollResult<true>> {
  const res = await prisma.availabilityPoll.deleteMany({
    where: { id: pollId, creatorId: userId },
  });
  return res.count === 0 ? fail(404, 'Not found') : { ok: true, value: true };
}

/** Polls the member organises, was invited to, or answered — newest first, bounded. */
export async function listMyPolls(userId: string): Promise<PollListItem[]> {
  const [mine, invited, answered] = await Promise.all([
    prisma.availabilityPoll.findMany({
      where: { creatorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        title: true,
        lockedStartMin: true,
        tz: true,
        firstDay: true,
        days: true,
        _count: { select: { responses: true } },
      },
    }),
    prisma.availabilityPollInvitee.findMany({
      where: { userId },
      orderBy: { id: 'desc' },
      take: 30,
      select: {
        poll: {
          select: {
            id: true,
            title: true,
            lockedStartMin: true,
            tz: true,
            firstDay: true,
            days: true,
            _count: { select: { responses: true } },
          },
        },
      },
    }),
    prisma.availabilityPollResponse.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        poll: {
          select: {
            id: true,
            title: true,
            lockedStartMin: true,
            tz: true,
            firstDay: true,
            days: true,
            _count: { select: { responses: true } },
          },
        },
      },
    }),
  ]);
  const seen = new Set<string>();
  const out: PollListItem[] = [];
  const push = (p: (typeof mine)[number], role: PollListItem['role']) => {
    if (seen.has(p.id)) return;
    seen.add(p.id);
    const first = parseDay(p.firstDay);
    const lastDayMs = first ? Date.UTC(first.y, first.mo - 1, first.d + p.days) : 0;
    out.push({
      id: p.id,
      title: p.title,
      role,
      lockedStartMin: p.lockedStartMin,
      lastDayMs,
      respondentCount: p._count.responses,
    });
  };
  for (const p of mine) push(p, 'organiser');
  for (const i of invited) push(i.poll, 'invitee');
  for (const a of answered) push(a.poll, 'respondent');
  return out;
}

/** True when the member may see the poll's lock-in details (organiser, invitee or respondent). */
async function isParticipant(pollId: string, userId: string, creatorId: string): Promise<boolean> {
  if (creatorId === userId) return true;
  const [inv, resp] = await Promise.all([
    prisma.availabilityPollInvitee.findUnique({
      where: { pollId_userId: { pollId, userId } },
      select: { id: true },
    }),
    prisma.availabilityPollResponse.findUnique({
      where: { pollId_userId: { pollId, userId } },
      select: { id: true },
    }),
  ]);
  return !!(inv || resp);
}

/** The ICS for a locked-in poll, or null if it is not locked / the caller is not a participant. */
export async function pollIcs(pollId: string, userId: string): Promise<string | null> {
  const poll = await prisma.availabilityPoll.findUnique({
    where: { id: pollId },
    select: {
      id: true,
      creatorId: true,
      title: true,
      description: true,
      lockedStartMin: true,
      lockedEndMin: true,
    },
  });
  if (!poll || poll.lockedStartMin == null || poll.lockedEndMin == null) return null;
  if (!(await isParticipant(pollId, userId, poll.creatorId))) return null;
  return eventToICS({
    id: `poll-${poll.id}`,
    title: poll.title,
    description: poll.description || undefined,
    startsAt: new Date(poll.lockedStartMin * 60_000),
    endsAt: new Date(poll.lockedEndMin * 60_000),
    url: `${SITE_URL}${pollUrl(poll.id)}`,
  });
}

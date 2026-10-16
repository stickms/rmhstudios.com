import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { userChipSelect } from '@/lib/user-display';
import { getObject, objectExists, putObject } from '@/lib/storage/s3.server';
import { isSafeFilename } from '@/lib/storage/keys';
import {
  AUDIO_TYPE_BY_EXT,
  CHALLENGE_AUDIO_MAX_BYTES,
  CHALLENGE_AUDIO_PREFIX,
  MAX_ENTRIES_SHOWN,
  challengeAudioUrl,
  phaseOf,
  sniffChallengeAudio,
  type ChallengeDetail,
  type ChallengeView,
  type createChallengeSchema,
  type entrySchema,
} from './shared';
import type { z } from 'zod';

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

const challengeSelect = {
  id: true,
  title: true,
  brief: true,
  sampleKey: true,
  sampleName: true,
  startsAt: true,
  endsAt: true,
  votingEndsAt: true,
  winnerId: true,
  finalizedAt: true,
} as const;

type Row = {
  id: string;
  title: string;
  brief: string;
  sampleKey: string;
  sampleName: string;
  startsAt: Date;
  endsAt: Date;
  votingEndsAt: Date;
  winnerId: string | null;
  finalizedAt: Date | null;
};

function toView(c: Row, entryCount: number): ChallengeView {
  return {
    id: c.id,
    title: c.title,
    brief: c.brief,
    sampleName: c.sampleName,
    sampleUrl: challengeAudioUrl(c.sampleKey),
    startsAt: c.startsAt.toISOString(),
    endsAt: c.endsAt.toISOString(),
    votingEndsAt: c.votingEndsAt.toISOString(),
    phase: phaseOf(c),
    entryCount,
    winnerEntryId: c.winnerId,
  };
}

/**
 * Close a challenge whose voting window has passed: pick the top entry (ties go to
 * the earliest submission) and tell its author. The conditional update is the
 * claim, so concurrent readers cannot both announce a winner.
 */
async function finalizeIfDue(c: Row): Promise<Row> {
  if (c.finalizedAt || new Date() < c.votingEndsAt) return c;
  const top = await prisma.studioChallengeEntry.findFirst({
    where: { challengeId: c.id },
    orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
    select: { id: true, userId: true },
  });
  const now = new Date();
  const claim = await prisma.studioChallenge.updateMany({
    where: { id: c.id, finalizedAt: null },
    data: { finalizedAt: now, winnerId: top?.id ?? null },
  });
  if (claim.count === 1 && top) {
    await createNotification({
      userId: top.userId,
      type: 'SYSTEM',
      entityType: 'studio-challenge',
      entityId: c.id,
      preview: `Your flip won "${c.title}"`,
      link: '/studio',
    });
  }
  return claim.count === 1 ? { ...c, finalizedAt: now, winnerId: top?.id ?? null } : c;
}

export async function listChallenges(): Promise<ChallengeView[]> {
  const rows = await prisma.studioChallenge.findMany({
    orderBy: { startsAt: 'desc' },
    take: 8,
    select: { ...challengeSelect, _count: { select: { entries: true } } },
  });
  const out: ChallengeView[] = [];
  for (const r of rows) out.push(toView(await finalizeIfDue(r), r._count.entries));
  return out;
}

export async function getChallenge(id: string, viewerId: string): Promise<ChallengeDetail | null> {
  const found = await prisma.studioChallenge.findUnique({ where: { id }, select: challengeSelect });
  if (!found) return null;
  const c = await finalizeIfDue(found);
  const phase = phaseOf(c);
  const [entries, myVote] = await Promise.all([
    prisma.studioChallengeEntry.findMany({
      where: { challengeId: id },
      orderBy: [{ voteCount: 'desc' }, { createdAt: 'asc' }],
      take: MAX_ENTRIES_SHOWN,
      select: {
        id: true,
        userId: true,
        title: true,
        linkUrl: true,
        audioKey: true,
        voteCount: true,
        user: { select: userChipSelect },
      },
    }),
    prisma.studioChallengeVote.findUnique({
      where: { challengeId_voterId: { challengeId: id, voterId: viewerId } },
      select: { entryId: true },
    }),
  ]);
  const showCounts = phase === 'finished';
  return {
    ...toView(c, entries.length),
    entries: entries.map((e) => ({
      id: e.id,
      title: e.title,
      linkUrl: e.linkUrl,
      audioUrl: e.audioKey ? challengeAudioUrl(e.audioKey) : null,
      // Counts stay hidden until the result so early leaders do not snowball.
      voteCount: showCounts ? e.voteCount : 0,
      isWinner: c.winnerId === e.id,
      mine: e.userId === viewerId,
      author: { id: e.user.id, name: e.user.name, image: e.user.image, handle: e.user.handle },
    })),
    myEntryId: entries.find((e) => e.userId === viewerId)?.id ?? null,
    myVoteEntryId: myVote?.entryId ?? null,
  };
}

export async function createChallenge(
  adminId: string,
  input: z.infer<typeof createChallengeSchema>,
): Promise<{ ok: true; id: string } | Fail> {
  if (
    !input.sampleKey.startsWith(CHALLENGE_AUDIO_PREFIX) ||
    !(await objectExists(input.sampleKey))
  ) {
    return fail(400, 'Upload the sample first');
  }
  const row = await prisma.studioChallenge.create({
    data: {
      title: input.title,
      brief: input.brief,
      sampleKey: input.sampleKey,
      sampleName: input.sampleName,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      votingEndsAt: new Date(input.votingEndsAt),
      createdById: adminId,
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

/** Store an uploaded clip. The key carries the uploader's id so an entry can only attach its own file. */
export async function saveChallengeAudio(
  userId: string,
  buffer: Buffer,
): Promise<{ ok: true; key: string } | Fail> {
  if (buffer.length === 0) return fail(400, 'That file is empty.');
  if (buffer.length > CHALLENGE_AUDIO_MAX_BYTES) return fail(413, 'Keep audio under 8 MB.');
  const kind = sniffChallengeAudio(buffer);
  if (!kind) return fail(400, 'Use a WAV, MP3, OGG, M4A or WebM file.');
  const key = `${CHALLENGE_AUDIO_PREFIX}${userId}-${Date.now()}-${Math.round(Math.random() * 1e9)}.${kind.ext}`;
  await putObject(key, buffer, kind.type);
  return { ok: true, key };
}

export async function readChallengeAudio(
  filename: string,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (!isSafeFilename(filename)) return null;
  const ext = filename.split('.').pop() ?? '';
  const contentType = AUDIO_TYPE_BY_EXT[ext];
  if (!contentType) return null;
  const obj = await getObject(`${CHALLENGE_AUDIO_PREFIX}${filename}`);
  return obj ? { body: obj.body, contentType } : null;
}

export async function submitEntry(
  userId: string,
  challengeId: string,
  input: z.infer<typeof entrySchema>,
): Promise<{ ok: true; id: string } | Fail> {
  const c = await prisma.studioChallenge.findUnique({
    where: { id: challengeId },
    select: challengeSelect,
  });
  if (!c) return fail(404, 'Challenge not found');
  if (phaseOf(c) !== 'open') return fail(409, 'Submissions are not open');
  // The file name embeds `<uploaderId>-`, so only the uploader can attach it.
  if (input.audioKey && !input.audioKey.startsWith(`${CHALLENGE_AUDIO_PREFIX}${userId}-`)) {
    return fail(400, 'Invalid audio reference');
  }
  if (input.audioKey && !(await objectExists(input.audioKey))) return fail(400, 'Audio not found');
  const data = {
    title: input.title,
    linkUrl: input.linkUrl ?? null,
    audioKey: input.audioKey ?? null,
  };
  // One entry per member; resubmitting replaces it (voting only opens after submissions close).
  const entry = await prisma.studioChallengeEntry.upsert({
    where: { challengeId_userId: { challengeId, userId } },
    create: { challengeId, userId, ...data },
    update: data,
    select: { id: true },
  });
  return { ok: true, id: entry.id };
}

export async function castVote(
  userId: string,
  challengeId: string,
  entryId: string,
): Promise<{ ok: true } | Fail> {
  const c = await prisma.studioChallenge.findUnique({
    where: { id: challengeId },
    select: challengeSelect,
  });
  if (!c) return fail(404, 'Challenge not found');
  if (phaseOf(c) !== 'voting') return fail(409, 'Voting is not open');
  const entry = await prisma.studioChallengeEntry.findUnique({
    where: { id: entryId },
    select: { challengeId: true, userId: true },
  });
  if (!entry || entry.challengeId !== challengeId) return fail(404, 'Entry not found');
  if (entry.userId === userId) return fail(403, 'You cannot vote for your own entry');
  try {
    await prisma.$transaction([
      // The composite primary key is the one-vote gate.
      prisma.studioChallengeVote.create({ data: { challengeId, voterId: userId, entryId } }),
      prisma.studioChallengeEntry.update({
        where: { id: entryId },
        data: { voteCount: { increment: 1 } },
      }),
    ]);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') return fail(409, 'You already voted');
    throw err;
  }
  return { ok: true };
}

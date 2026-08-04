/**
 * Server half of H2 — voice notes in direct messages.
 *
 * Two jobs: accept a recording (validate → store → send), and serve it back to
 * someone entitled to hear it.
 *
 * ## The door
 *
 * `validateVoiceUpload` (`lib/media/voice-policy.ts`) is the single authority on
 * size, duration and container, and it is tier-aware. This module does not
 * invent a limit; it reports the policy's refusal reason so the recorder can say
 * "60 seconds on the free plan" rather than "upload failed".
 *
 * ## Why playback is authenticated
 *
 * See `lib/voice/keys.ts`: a CDN URL for a private conversation's audio is a
 * permanent, forwardable bearer token. Voice objects are therefore read back
 * through {@link readVoiceObject}, which resolves the conversation from the
 * filename and refuses anyone who is not a participant.
 */

import { prisma } from '@/lib/prisma.server';
import { getUserTier } from '@/lib/entitlements';
import { getObject, putObject } from '@/lib/storage/s3.server';
import { validateVoiceUpload, type VoiceRejection } from '@/lib/media/voice-policy';
import {
  parseVoiceFilename,
  voiceContentTypeForFilename,
  voiceExtForContentType,
  voiceFilename,
  voiceObjectKey,
  voicePlaybackUrl,
} from '@/lib/voice/keys';
import { normalizePeaks, VOICE_PEAK_BUCKETS } from '@/lib/voice/peaks';
import { notifyUser } from '@/lib/message-events';
import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';
import { toMessageView, type MessageView } from '@/lib/messages/message-view';
import { loadParticipantConversation, otherParticipant } from '@/lib/messages/mutations.server';

/** Human-readable refusal for each policy rejection, with the tier's ceiling. */
export function voiceRejectionMessage(
  reason: VoiceRejection,
  limits: { maxDurationMs: number; maxBytes: number },
): string {
  const seconds = Math.round(limits.maxDurationMs / 1000);
  const megabytes = (limits.maxBytes / (1024 * 1024)).toFixed(1);
  switch (reason) {
    case 'too-long':
      return `Voice messages can be up to ${seconds} seconds on your plan.`;
    case 'too-large':
      return `That recording is too large — the limit is ${megabytes} MB on your plan.`;
    case 'empty':
      return 'That recording is empty.';
    case 'unsupported-type':
      return 'That audio format is not supported.';
    case 'implausible-bitrate':
      return 'That recording could not be verified. Try recording it again.';
    default:
      return 'That recording could not be accepted.';
  }
}

export type VoiceSendResult =
  | { ok: true; message: MessageView & { conversationId: string } }
  | { ok: false; status: number; error: string };

/**
 * Store a recording and send it as a message.
 *
 * Upload and send are one operation on purpose: a two-step flow leaves an object
 * in storage for every recording the user changed their mind about, and gives
 * the client a URL it could attach to a conversation it is not part of.
 */
export async function sendVoiceMessage(args: {
  conversationId: string;
  userId: string;
  buffer: Buffer;
  contentType: string;
  durationMs: number;
  peaks: unknown;
  /**
   * The sender's optional text note.
   *
   * Optional in the data model, prompted for in the UI. A voice message is
   * unreadable to a deaf recipient and unskimmable to everyone, and we have no
   * transcription model — so the note is the only path from audio to text this
   * feature has, and the composer asks for it every time.
   */
  note?: string | null;
  now?: Date;
}): Promise<VoiceSendResult> {
  const now = args.now ?? new Date();

  const conversation = await loadParticipantConversation(args.conversationId, args.userId);
  if (!conversation) return { ok: false, status: 404, error: 'Conversation not found' };

  const recipientId = otherParticipant(conversation, args.userId);

  // Same privacy gate the text send path applies. Re-checked here rather than
  // trusted from an earlier request: a recipient can close their DMs between
  // opening a thread and receiving a recording.
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { profile: { select: { dmPrivacy: true } } },
  });
  const dmPrivacy = recipient?.profile?.dmPrivacy ?? 'EVERYONE';
  if (dmPrivacy === 'NONE') {
    return { ok: false, status: 403, error: 'This user is no longer accepting messages.' };
  }
  if (dmPrivacy === 'FOLLOWERS') {
    const follows = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: recipientId, followingId: args.userId },
      },
    });
    if (!follows) {
      return {
        ok: false,
        status: 403,
        error: 'This user only accepts messages from people they follow.',
      };
    }
  }

  const tier = await getUserTier(args.userId);
  const validation = validateVoiceUpload({
    bytes: args.buffer.length,
    durationMs: args.durationMs,
    contentType: args.contentType,
    tier,
  });
  if (!validation.ok) {
    return {
      ok: false,
      status: 400,
      error: voiceRejectionMessage(validation.reason ?? 'empty', validation.limits),
    };
  }

  const ext = voiceExtForContentType(args.contentType);
  if (!ext) return { ok: false, status: 400, error: 'That audio format is not supported.' };

  const note = (args.note ?? '').trim().slice(0, MESSAGE_MAX_LENGTH);
  const peaks = normalizePeaks(args.peaks, VOICE_PEAK_BUCKETS);

  const unique = `${now.getTime()}-${Math.round(Math.random() * 1e9)}`;
  const filename = voiceFilename(args.conversationId, unique, ext);
  const key = voiceObjectKey(filename);

  // Stored before the row exists: an object with no message is an orphan the
  // sweep can collect, whereas a message pointing at an object that was never
  // written is a bubble that can only ever fail to play.
  await putObject(key, args.buffer, args.contentType.split(';')[0].trim());

  const [message] = await prisma.$transaction([
    prisma.directMessage.create({
      data: {
        conversationId: args.conversationId,
        senderId: args.userId,
        content: note,
        audioUrl: voicePlaybackUrl(filename),
        audioDurationMs: Math.round(args.durationMs),
        audioPeaks: peaks,
      },
      select: {
        id: true,
        senderId: true,
        content: true,
        read: true,
        createdAt: true,
        gifUrl: true,
        imageUrls: true,
        editedAt: true,
        deletedAt: true,
        deletedBy: true,
        audioUrl: true,
        audioDurationMs: true,
        audioPeaks: true,
      },
    }),
    prisma.conversation.update({
      where: { id: args.conversationId },
      data: { lastMessageAt: now },
    }),
  ]);

  const view = toMessageView(message);

  notifyUser(recipientId, {
    type: 'new-message',
    message: {
      id: view.id,
      conversationId: args.conversationId,
      content: view.content,
      senderId: view.senderId,
      read: view.read,
      createdAt: view.createdAt,
      gifUrl: view.gifUrl,
      imageUrls: view.imageUrls,
      reactions: [],
      audioUrl: view.audioUrl,
      audioDurationMs: view.audioDurationMs,
      audioPeaks: view.audioPeaks,
      editedAt: view.editedAt,
    },
  });

  return { ok: true, message: { ...view, conversationId: args.conversationId } };
}

export type VoiceObjectResult =
  { ok: true; body: Buffer; contentType: string } | { ok: false; status: number };

/**
 * Read a stored clip for a viewer.
 *
 * The conversation id is parsed out of the filename, so authorization is a
 * single primary-key lookup rather than a scan of the unindexed `audioUrl`
 * column — which is exactly why the filename is shaped the way it is.
 *
 * A tombstoned message's audio is refused: unsend removes the recording from the
 * conversation, and leaving the object readable to a participant who had already
 * loaded the URL would make the retraction cosmetic.
 */
export async function readVoiceObject(
  filename: string,
  userId: string,
): Promise<VoiceObjectResult> {
  const parsed = parseVoiceFilename(filename);
  if (!parsed) return { ok: false, status: 404 };

  const conversation = await loadParticipantConversation(parsed.conversationId, userId);
  if (!conversation) return { ok: false, status: 404 };

  const url = voicePlaybackUrl(filename);
  const message = await prisma.directMessage.findFirst({
    where: { conversationId: parsed.conversationId, audioUrl: url },
    select: { deletedAt: true },
  });
  if (!message) return { ok: false, status: 404 };
  if (message.deletedAt) return { ok: false, status: 410 };

  const object = await getObject(voiceObjectKey(filename));
  if (!object) return { ok: false, status: 404 };

  return {
    ok: true,
    body: object.body,
    contentType: object.contentType || voiceContentTypeForFilename(filename),
  };
}

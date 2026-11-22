/**
 * Shared @mention fan-out for feed writes (posts and comments).
 *
 * Resolves the @handles in a block of user text to users, then sends each a
 * persisted MENTION notification plus a live SSE toast (excluding the author /
 * self). Posts pass entityType "rmhark"/postId; comments pass entityType
 * "comment"/commentId so the bot-worker can tell where the mention lives and
 * reply in the right place.
 *
 * Best-effort: callers MUST wrap this in try/catch so a notification failure
 * never breaks the originating write.
 */

import { previewTextFor } from '@/lib/feed/content-warning';
import { prisma } from "@/lib/prisma.server";
import { findUsersByHandles } from "@/lib/handles/lookup.server";
import { feedEventBus } from "@/lib/feed-sse";
import { createNotification } from "@/lib/notifications.server";
import { parseHandles } from "@/lib/feed/mentions";
import { canViewPost } from "@/lib/feed/audience.server";
import { postConversationKey } from "@/lib/feed/conversation-controls.server";
import { getConversationPrefs, shouldDeliver } from "@/lib/notify/conversation-prefs.server";

export interface MentionAuthor {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}

export interface NotifyMentionsInput {
  content: string;
  /** The post's content warning reason (sprint 06 #16): the notification shows it instead of the text. */
  contentWarning?: string | null;
  author: MentionAuthor;
  postId: string;
  entityType: "rmhark" | "comment";
  entityId: string;
  link: string;
  timestamp: string;
}

export async function notifyMentions(input: NotifyMentionsInput): Promise<void> {
  const handles = parseHandles(input.content);
  if (handles.length === 0) return;

  // perf: index-backed lower(handle) match instead of per-handle ILIKE (seq scan).
  const mentioned = await findUsersByHandles(handles, { excludeUserId: input.author.id }); // never self-notify
  if (mentioned.length === 0) return;

  // A mention must not carry a post's text (preview + link) to someone who may not
  // read the post: followers-only / circle / private posts and private-community
  // posts previously notified every @mentioned user regardless.
  const post = await prisma.rMHark.findUnique({
    where: { id: input.postId },
    select: { id: true, userId: true, threadRootId: true, audience: true, communityId: true },
  });
  if (!post) return;
  const readers =
    post.audience === "PUBLIC" && !post.communityId
      ? mentioned
      : (
          await Promise.all(
            mentioned.map(async (m) => ((await canViewPost(post, m.id)) ? m : null)),
          )
        ).filter((m): m is (typeof mentioned)[number] => m !== null);

  // A mention is always addressed to its recipient, so only a full mute (None) silences it: look every recipient's choice
  // for this conversation up in one query, before the live toast as well as the stored notification.
  const conversationKey = postConversationKey(post);
  const prefs = await getConversationPrefs(
    readers.map((m) => m.id),
    conversationKey,
  );
  const recipients = readers.filter((m) => shouldDeliver(prefs.get(m.id), true));
  if (recipients.length === 0) return;

  // Live toast for any mentioned user with an open stream.
  feedEventBus.publish({
    type: "notification.mention",
    rmharkId: input.postId,
    payload: { id: input.postId },
    timestamp: input.timestamp,
    authorId: input.author.id,
    targetUserIds: recipients.map((m) => m.id),
    notification: {
      rmharkId: input.postId,
      preview: (previewTextFor(input) ?? '').slice(0, 120),
      author: {
        id: input.author.id,
        name: input.author.name,
        image: input.author.image,
        handle: input.author.handle,
      },
    },
  });

  // Persist so it appears in the notification center — and, for bot recipients,
  // becomes the bot-worker's mention work queue.
  await Promise.all(
    recipients.map((m) =>
      createNotification({
        userId: m.id,
        actorId: input.author.id,
        type: "MENTION",
        entityType: input.entityType,
        entityId: input.entityId,
        preview: previewTextFor(input) ?? '',
        link: input.link,
      })
    )
  );
}

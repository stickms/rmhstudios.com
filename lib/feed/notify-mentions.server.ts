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

import { prisma } from "@/lib/prisma.server";
import { feedEventBus } from "@/lib/feed-sse";
import { createNotification } from "@/lib/notifications.server";
import { parseHandles } from "@/lib/feed/mentions";
import { canViewPost } from "@/lib/feed/audience.server";

export interface MentionAuthor {
  id: string;
  name: string | null;
  image: string | null;
  handle: string | null;
}

export interface NotifyMentionsInput {
  content: string;
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

  const mentioned = await prisma.user.findMany({
    where: {
      id: { not: input.author.id }, // never self-notify
      OR: handles.map((h) => ({ handle: { equals: h, mode: "insensitive" as const } })),
    },
    select: { id: true },
  });
  if (mentioned.length === 0) return;

  // A mention must not carry a post's text (preview + link) to someone who may not
  // read the post: followers-only / circle / private posts and private-community
  // posts previously notified every @mentioned user regardless.
  const post = await prisma.rMHark.findUnique({
    where: { id: input.postId },
    select: { userId: true, audience: true, communityId: true },
  });
  if (!post) return;
  const recipients =
    post.audience === "PUBLIC" && !post.communityId
      ? mentioned
      : (
          await Promise.all(
            mentioned.map(async (m) => ((await canViewPost(post, m.id)) ? m : null)),
          )
        ).filter((m): m is { id: string } => m !== null);
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
      preview: input.content.slice(0, 120),
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
        preview: input.content,
        link: input.link,
      })
    )
  );
}

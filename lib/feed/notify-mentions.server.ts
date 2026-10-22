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
import { findUsersByHandles } from "@/lib/handles/lookup.server";
import { feedEventBus } from "@/lib/feed-sse";
import { createNotification } from "@/lib/notifications.server";
import { parseHandles } from "@/lib/feed/mentions";
import { canViewPost } from "@/lib/feed/audience.server";
import { blockedPairs } from "@/lib/mentions/notify.server";
import { isPostLockedFor } from "@/lib/feed/map-feed-item.server";

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

  // perf: index-backed lower(handle) match instead of per-handle ILIKE (seq scan).
  const found = await findUsersByHandles(handles, { excludeUserId: input.author.id }); // never self-notify
  if (found.length === 0) return;

  // Blocks beat mentions, in both directions: someone the author blocked (or who
  // blocked the author) must not get the MENTION or its preview.
  const blocked = await blockedPairs(
    input.author.id,
    found.map((m) => m.id),
  );
  const mentioned = found.filter((m) => !blocked.has(m.id));
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
        ).filter((m): m is (typeof mentioned)[number] => m !== null);
  if (recipients.length === 0) return;

  // A priced post's text is paid content: a recipient who has not unlocked it
  // gets the mention with a neutral preview (the lock is per RECIPIENT).
  const lockedFor = new Set<string>();
  const priced = await prisma.rMHark.count({ where: { id: input.postId, unlockPrice: { gt: 0 } } });
  if (priced > 0) {
    for (const r of recipients) {
      if (await isPostLockedFor(input.postId, r.id)) lockedFor.add(r.id);
    }
  }
  const previewFor = (id: string) => (lockedFor.has(id) ? "" : input.content);

  // Live toast for any mentioned user with an open stream.
  // One event per preview variant: the live toast carries the text too.
  for (const locked of [false, true]) {
    const targets = recipients.filter((m) => lockedFor.has(m.id) === locked).map((m) => m.id);
    if (targets.length === 0) continue;
    feedEventBus.publish({
      type: "notification.mention",
      rmharkId: input.postId,
      payload: { id: input.postId },
      timestamp: input.timestamp,
      authorId: input.author.id,
      targetUserIds: targets,
      notification: {
        rmharkId: input.postId,
        preview: locked ? "" : input.content.slice(0, 120),
        author: {
          id: input.author.id,
          name: input.author.name,
          image: input.author.image,
          handle: input.author.handle,
        },
      },
    });
  }

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
        preview: previewFor(m.id),
        link: input.link,
      })
    )
  );
}

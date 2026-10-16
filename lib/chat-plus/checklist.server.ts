/**
 * M5 — shared checklists. Server-only.
 *
 * A checklist is a message of `kind = 'checklist'` whose `meta` holds the items.
 * Ticking is a single `jsonb_set` UPDATE, not a read-modify-write: two people
 * ticking different boxes at the same moment each keep their own tick, because
 * Postgres re-reads the row under its lock before applying the second UPDATE.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { type ChatAccess, publishChatUpdate } from '@/lib/chat-plus/access.server';
import { postChatMessage, type PostedMessage } from '@/lib/chat-plus/post.server';
import {
  CHECKLIST_ITEM_MAX,
  CHECKLIST_MAX_ITEMS,
  CHECKLIST_MIN_ITEMS,
  CHECKLIST_TITLE_MAX,
  type ChecklistItem,
  type ChecklistMeta,
} from '@/lib/chat-plus/types';
import { z } from 'zod';

export const checklistSchema = z.object({
  title: z.string().trim().min(1).max(CHECKLIST_TITLE_MAX),
  items: z
    .array(z.string().trim().min(1).max(CHECKLIST_ITEM_MAX))
    .min(CHECKLIST_MIN_ITEMS)
    .max(CHECKLIST_MAX_ITEMS),
});

export function checklistFallback(title: string, items: string[]): string {
  return [title, ...items.map((i) => `☐ ${i}`)].join('\n').slice(0, 2000);
}

export async function createChecklist(
  access: ChatAccess,
  input: z.infer<typeof checklistSchema>,
): Promise<PostedMessage> {
  const meta: ChecklistMeta = {
    title: input.title,
    items: input.items.map((text) => ({ text, doneBy: null, doneAt: null })),
  };
  return postChatMessage(access, {
    senderId: access.viewerId,
    content: checklistFallback(input.title, input.items),
    kind: 'checklist',
    meta: meta as unknown as Prisma.InputJsonValue,
  });
}

export type TickResult =
  { ok: true; items: ChecklistItem[] } | { ok: false; status: number; error: string };

/** Toggle one item. Anyone in the chat may. */
export async function toggleChecklistItem(
  access: ChatAccess,
  messageId: string,
  index: number,
): Promise<TickResult> {
  const table = access.kind === 'dm' ? 'direct_message' : 'group_message';
  const scopeCol = access.kind === 'dm' ? 'conversationId' : 'groupId';
  const path = ['items', String(index)];
  const now = new Date().toISOString();

  const rows = await prisma.$queryRaw<{ meta: ChecklistMeta }[]>(Prisma.sql`
    UPDATE ${Prisma.raw(`"${table}"`)}
    SET "meta" = jsonb_set(
      "meta", ${path}::text[],
      CASE WHEN ("meta" #>> ${[...path, 'doneBy']}::text[]) IS NULL
        THEN ("meta" #> ${path}::text[]) || jsonb_build_object('doneBy', ${access.viewerId}::text, 'doneAt', ${now}::text)
        ELSE ("meta" #> ${path}::text[]) || jsonb_build_object('doneBy', NULL::text, 'doneAt', NULL::text)
      END)
    WHERE "id" = ${messageId} AND ${Prisma.raw(`"${scopeCol}"`)} = ${access.id}
      AND "kind" = 'checklist' AND "deletedAt" IS NULL
      AND ("expiresAt" IS NULL OR "expiresAt" > now())
      AND jsonb_array_length("meta" -> 'items') > ${index}
    RETURNING "meta"`);
  const meta = rows[0]?.meta;
  if (!meta) return { ok: false, status: 404, error: 'Checklist not found' };

  publishChatUpdate(access, {
    kind: access.kind,
    chatId: access.id,
    op: 'checklist',
    messageId,
    items: meta.items,
  });
  return { ok: true, items: meta.items };
}

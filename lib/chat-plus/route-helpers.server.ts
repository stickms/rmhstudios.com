/**
 * Shared preamble for the `/api/chats/$kind/$id/*` routes: validate the kind,
 * resolve the viewer's access (404 for strangers — indistinguishable from "no
 * such chat"), and refuse banned accounts on anything that writes, and timed-out
 * ones on anything that writes text (`requireChatText`).
 */

import { refusalBody } from '@/lib/errors/codes';
import { getActiveBan } from '@/lib/admin-audit.server';
import { restrictionResponse } from '@/lib/moderation/restrictions.server';
import { getChatAccess, type ChatAccess } from '@/lib/chat-plus/access.server';
import { requestWriteRefusal } from '@/lib/messages/requests.server';
import { chatKindSchema } from '@/lib/chat-plus/types-schema';

export async function requireChat(
  params: Record<string, string>,
  userId: string,
  opts: { write?: boolean } = {},
): Promise<ChatAccess | Response> {
  const kind = chatKindSchema.safeParse(params.kind);
  if (!kind.success) return Response.json({ error: 'Not found' }, { status: 404 });
  const access = await getChatAccess(kind.data, params.id, userId);
  if (!access) return Response.json({ error: 'Not found' }, { status: 404 });
  if (opts.write && (await getActiveBan(userId))) {
    return Response.json({ ...refusalBody('ACCOUNT_SUSPENDED') }, { status: 403 });
  }
  // A DM that is still a message request takes nothing but its one text message (s04-16).
  if (opts.write && access.kind === 'dm' && access.otherId && !access.isSelf) {
    const refusal = await requestWriteRefusal(userId, access.otherId, access.request);
    if (refusal) return Response.json({ error: refusal }, { status: 403 });
  }
  return access;
}

/**
 * `requireChat` for a write that puts text in the chat (a thread reply, a checklist, a command's line): that is a chat
 * message, so a moderator's timeout on messages and chats holds for it (s14-17). Votes, pins and settings are not
 * text and use `requireChat(..., { write: true })`.
 */
export async function requireChatText(
  params: Record<string, string>,
  userId: string,
): Promise<ChatAccess | Response> {
  const access = await requireChat(params, userId, { write: true });
  if (access instanceof Response) return access;
  const restricted = await restrictionResponse(userId, 'message');
  return restricted ?? access;
}

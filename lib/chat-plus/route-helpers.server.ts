/**
 * Shared preamble for the `/api/chats/$kind/$id/*` routes: validate the kind,
 * resolve the viewer's access (404 for strangers — indistinguishable from "no
 * such chat"), and refuse banned accounts on anything that writes.
 */

import { getActiveBan } from '@/lib/admin-audit.server';
import { getChatAccess, type ChatAccess } from '@/lib/chat-plus/access.server';
import { chatKindSchema } from '@/lib/chat-plus/types';

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
    return Response.json({ error: 'Your account is suspended' }, { status: 403 });
  }
  return access;
}

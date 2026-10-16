/**
 * Per-chat settings: the disappearing timer (M3), the theme (M9) and the
 * viewer's own receipt/typing switches (M8). Server-only.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { type ChatAccess, publishChatUpdate } from '@/lib/chat-plus/access.server';
import { postSystemLine } from '@/lib/chat-plus/post.server';
import { DISAPPEAR_OPTIONS } from '@/lib/chat-plus/flags';
import { isValidThemeKey } from '@/lib/chat-plus/themes';
import { listPins } from '@/lib/chat-plus/pins.server';
import type { ChatMeta } from '@/lib/chat-plus/settings.client';

export const settingsPatchSchema = z
  .object({
    /** Seconds from `DISAPPEAR_OPTIONS`, or null to turn the timer off. */
    disappearAfterSec: z
      .number()
      .int()
      .refine((n) => (DISAPPEAR_OPTIONS as readonly number[]).includes(n), 'Unsupported timer')
      .nullable()
      .optional(),
    themeKey: z.string().max(24).refine(isValidThemeKey, 'Unknown theme').nullable().optional(),
  })
  .refine(
    (v) => v.disappearAfterSec !== undefined || v.themeKey !== undefined,
    'Nothing to change',
  );
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;

export const prefsPatchSchema = z
  .object({ hideReceipts: z.boolean().optional(), hideTyping: z.boolean().optional() })
  .refine((v) => v.hideReceipts !== undefined || v.hideTyping !== undefined, 'Nothing to change');
export type PrefsPatch = z.infer<typeof prefsPatchSchema>;

export type { ChatMeta } from '@/lib/chat-plus/settings.client';

/** Everything the chat header needs, in one request. */
export async function getChatMeta(access: ChatAccess): Promise<ChatMeta> {
  const [pref, pins] = await Promise.all([
    access.kind === 'dm'
      ? prisma.conversationPref.findUnique({
          where: { userId_scopeKey: { userId: access.viewerId, scopeKey: access.scopeKey } },
          select: { hideReceipts: true, hideTyping: true },
        })
      : null,
    listPins(access),
  ]);
  return {
    disappearAfterSec: access.disappearAfterSec,
    themeKey: access.themeKey,
    isSelf: access.isSelf,
    prefs: { hideReceipts: pref?.hideReceipts ?? false, hideTyping: pref?.hideTyping ?? false },
    pins,
  };
}

/**
 * Change the timer and/or theme. Any participant may; every change is announced
 * in-chat as a system line so nobody is surprised by messages vanishing.
 * The timer only affects messages sent after the change.
 */
export async function updateChatSettings(
  access: ChatAccess,
  patch: SettingsPatch,
): Promise<{ disappearAfterSec: number | null; themeKey: string | null }> {
  const data: { disappearAfterSec?: number | null; themeKey?: string | null } = {};
  const lines: Parameters<typeof postSystemLine>[2][] = [];

  if (
    patch.disappearAfterSec !== undefined &&
    patch.disappearAfterSec !== access.disappearAfterSec
  ) {
    data.disappearAfterSec = patch.disappearAfterSec;
    lines.push({ action: 'timer', seconds: patch.disappearAfterSec, actorId: access.viewerId });
  }
  if (patch.themeKey !== undefined && patch.themeKey !== access.themeKey) {
    data.themeKey = patch.themeKey;
    lines.push({ action: 'theme', themeKey: patch.themeKey, actorId: access.viewerId });
  }
  if (lines.length === 0) {
    return { disappearAfterSec: access.disappearAfterSec, themeKey: access.themeKey };
  }

  if (access.kind === 'dm') {
    await prisma.conversation.update({ where: { id: access.id }, data });
  } else {
    await prisma.groupChat.update({ where: { id: access.id }, data });
  }
  const next = {
    disappearAfterSec:
      data.disappearAfterSec !== undefined ? data.disappearAfterSec : access.disappearAfterSec,
    themeKey: data.themeKey !== undefined ? data.themeKey : access.themeKey,
  };

  // The announcement is written under the OLD timer rules (system lines never
  // expire anyway), then everyone's cached settings are refreshed.
  for (const line of lines) await postSystemLine({ ...access, ...next }, access.viewerId, line);
  publishChatUpdate(access, { kind: access.kind, chatId: access.id, op: 'settings', ...next });
  return next;
}

/** Upsert the viewer's receipt/typing switches (DM only, never a note-to-self). */
export async function updateChatPrefs(
  access: ChatAccess,
  patch: PrefsPatch,
): Promise<{ hideReceipts: boolean; hideTyping: boolean }> {
  const data = {
    ...(patch.hideReceipts !== undefined ? { hideReceipts: patch.hideReceipts } : {}),
    ...(patch.hideTyping !== undefined ? { hideTyping: patch.hideTyping } : {}),
  };
  const row = await prisma.conversationPref.upsert({
    where: { userId_scopeKey: { userId: access.viewerId, scopeKey: access.scopeKey } },
    create: { userId: access.viewerId, scopeKey: access.scopeKey, ...data },
    update: data,
    select: { hideReceipts: true, hideTyping: true },
  });
  return row;
}

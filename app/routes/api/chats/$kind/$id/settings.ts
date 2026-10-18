import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import {
  prefsPatchSchema,
  settingsPatchSchema,
  updateChatPrefs,
  updateChatSettings,
} from '@/lib/chat-plus/settings.server';

/**
 * PATCH /api/chats/$kind/$id/settings — the disappearing-messages timer and the
 * theme. Any participant may change either; the change is announced in-chat.
 * PUT   /api/chats/$kind/$id/settings — the viewer's own receipt / typing
 * switches (DM only; reciprocal — see `lib/chat-plus/receipts.server.ts`).
 */
export const Route = createFileRoute('/api/chats/$kind/$id/settings')({
  server: {
    handlers: {
      PATCH: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'chat-settings' },
          body: settingsPatchSchema,
        },
        async ({ params, userId, body }) => {
          const access = await requireChat(params, userId, { write: true });
          if (access instanceof Response) return access;
          return Response.json(await updateChatSettings(access, body));
        },
      ),
      PUT: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'chat-prefs' },
          body: prefsPatchSchema,
        },
        async ({ params, userId, body }) => {
          const access = await requireChat(params, userId);
          if (access instanceof Response) return access;
          if (access.kind !== 'dm' || access.isSelf) {
            return Response.json(
              { error: 'Receipts and typing indicators only apply to one-to-one chats' },
              { status: 400 },
            );
          }
          return Response.json(await updateChatPrefs(access, body));
        },
      ),
    },
  },
});

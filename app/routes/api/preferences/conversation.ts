/**
 * GET  /api/preferences/conversation?scopeKey=group:abc123 — read one
 *      conversation's notification mode.
 * PUT  /api/preferences/conversation — set it (partial upsert).
 *
 * The per-conversation three-way (All / Mentions / None) lives in
 * `lib/notify/conversation-prefs.server.ts`; this route is the thin transport.
 * Both methods take the scope key from the caller, so it is regex-validated
 * before it reaches the database — it is half of a `@db.VarChar(80)` primary
 * key, and an unvalidated one lets a client mint unbounded rows under their own
 * user id.
 *
 * There is no authorization check that the caller is *in* the conversation, and
 * that is correct rather than an omission: the row is `(userId, scopeKey)` and
 * only ever affects that user's own deliveries. The worst a caller can do with a
 * fabricated key is mute a conversation they are not in.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import {
  conversationPrefQuerySchema,
  conversationPrefSchema,
  getConversationPref,
  setConversationPref,
  toView,
} from '@/lib/notify/conversation-prefs.server';

export const Route = createFileRoute('/api/preferences/conversation')({
  server: {
    handlers: {
      GET: defineHandler({ query: conversationPrefQuerySchema }, async ({ userId, query }) => {
        const pref = await getConversationPref(userId, query.scopeKey);
        // Absent = the default (All, unpinned). Returned as a materialized
        // view so the client renders the same shape whether or not a row
        // exists, instead of branching on null.
        return Response.json(toView(query.scopeKey, pref));
      }),
      PUT: defineHandler(
        {
          rateLimit: { limit: 40, windowMs: 60_000, prefix: 'conversation-pref' },
          body: conversationPrefSchema,
        },
        async ({ userId, body }) => Response.json(await setConversationPref(userId, body)),
      ),
    },
  },
});

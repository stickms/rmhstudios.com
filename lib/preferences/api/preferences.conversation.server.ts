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

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  getConversationPrefApi,
  setConversationPrefApi,
} from '@/lib/preferences/conversation.contract';
import { refusalBody } from '@/lib/errors/codes';
import { CONVERSATION_PIN_LIMIT, chatIdOfDmScope } from '@/lib/messages/pins';
import { setPinned } from '@/lib/messages/pins.server';
import {
  conversationPrefQuerySchema,
  conversationPrefSchema,
  getConversationPref,
  setConversationPref,
  toView,
} from '@/lib/notify/conversation-prefs.server';

export const route = apiRoute('/api/preferences/conversation', {
  GET: implement(getConversationPrefApi, { query: conversationPrefQuerySchema }, async ({ userId, query }) => {
    const pref = await getConversationPref(userId, query.scopeKey);
    // Absent = the default (All, unpinned). Returned as a materialized
    // view so the client renders the same shape whether or not a row
    // exists, instead of branching on null.
    return toView(query.scopeKey, pref);
  }),
  PUT: implement(
    setConversationPrefApi,
    {
      rateLimit: { limit: 40, windowMs: 60_000, prefix: 'conversation-pref' },
      body: conversationPrefSchema,
    },
    async ({ userId, body }) => {
      // s14-12: a pin is the one field with a rule of its own. `pinned: true` is for a direct conversation the caller
      // is in, and at most CONVERSATION_PIN_LIMIT of them, decided under a lock in `setPinned`.
      if (body.pinned === undefined) return setConversationPref(userId, body);
      const chatId = chatIdOfDmScope(body.scopeKey);
      if (body.pinned && !chatId) return Response.json(refusalBody('INVALID_INPUT'), { status: 400 });
      const { pinned, ...rest } = body;
      let view: Awaited<ReturnType<typeof setConversationPref>> | null = null;
      if (chatId) {
        const result = await setPinned(userId, chatId, pinned);
        if (!result.ok) {
          return result.reason === 'limit'
            ? Response.json(refusalBody('CONVERSATION_PIN_LIMIT', { max: CONVERSATION_PIN_LIMIT }), { status: 409 })
            : Response.json(refusalBody('INVALID_INPUT'), { status: 400 });
        }
        view = result.pref;
      }
      const others = rest.muteUntil !== undefined || rest.mentionsOnly !== undefined;
      if (others || !view) return setConversationPref(userId, others ? rest : body);
      return view;
    },
  ),
});

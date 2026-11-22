import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import {
  clearConversationMuteApi,
  getConversationMuteApi,
  setConversationMuteApi,
} from '@/lib/feed/conversation-controls.contract';
import { muteConversationBody } from '@/lib/feed/conversation-controls-schema';
import {
  clearConversationMute,
  getConversationMute,
  setConversationMute,
} from '@/lib/feed/conversation-controls.server';

const NO_STORE = {
  'Cache-Control': 'private, no-store',
};
const notFound = () =>
  Response.json(
    {
      error: 'Post not found',
    },
    {
      status: 404,
    },
  );

/**
 * /api/rmharks/$id/mute — the caller's own notification choice for this post's whole conversation (the thread root, however
 * deep the post is): GET the state, PUT All / Mentions only / a timed or open-ended mute, DELETE to unmute. Session only,
 * and it only ever writes the caller's own row; the post must be one the caller can read.
 */
export const route = apiRoute('/api/rmharks/$id/mute', {
  GET: implement(
    getConversationMuteApi,
    {
      rateLimit: 'read',
    },
    async ({ userId, params }) => {
      const state = await getConversationMute(userId, params.id);
      return state
        ? Response.json(state, {
            headers: NO_STORE,
          })
        : notFound();
    },
  ),
  PUT: implement(
    setConversationMuteApi,
    {
      rateLimit: 'write',
      body: muteConversationBody,
    },
    async ({ userId, params, body }) => {
      const state = await setConversationMute(userId, params.id, body.choice);
      return state ? Response.json(state) : notFound();
    },
  ),
  DELETE: implement(
    clearConversationMuteApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const state = await clearConversationMute(userId, params.id);
      return state ? Response.json(state) : notFound();
    },
  ),
});

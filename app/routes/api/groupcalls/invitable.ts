/**
 * /api/groupcalls/invitable — the invite picker's list.
 *
 * Online mutuals with no query; online mutuals plus people search with one. The
 * viewer is never in it, and the list is capped server-side rather than by the
 * caller, so `?q=a` cannot be turned into a directory dump.
 *
 * Appearing here is **not** permission to be rung. Every name still goes through
 * `canJoinGroupCall` on the socket hub when the invite is actually sent, which
 * is where blocks and the callee's call-privacy setting are enforced — and where
 * a refused invitee is dropped silently, so the host cannot read a block off
 * this endpoint by comparing the two lists.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getInvitableUsers } from '@/lib/groupcall.server';

export const Route = createFileRoute('/api/groupcalls/invitable')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          // A typeahead fires on (debounced) keystrokes, so it takes the read
          // bucket rather than the write one it superficially resembles.
          rateLimit: 'read',
          query: z.object({ q: z.string().max(64).optional() }),
        },
        async ({ userId, query }) =>
          Response.json({ users: await getInvitableUsers(userId, { q: query.q ?? null }) }),
      ),
    },
  },
});

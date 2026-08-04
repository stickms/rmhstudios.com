/**
 * RMHLadder — the application answer bank.
 *
 *   GET    /api/ladder/answers   → the caller's bank (an empty one if unsaved)
 *   PUT    /api/ladder/answers   → replace it wholesale
 *   DELETE /api/ladder/answers   → erase it
 *
 * Free for every signed-in user: the answer bank is the unglamorous part that
 * removes the retyping, and putting it behind a plan would gate the feature's
 * whole point. Only the AI prep sheet (`./prep`) is a member feature.
 *
 * `DELETE` is here rather than only in the account-delete flow because a user
 * who wants their salary expectation and work-authorization answer off our
 * servers should not have to delete their whole account to do it.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { answerBankSchema } from '@/lib/rmhladder/answer-bank';
import {
  deleteAnswerBank,
  getAnswerBank,
  saveAnswerBank,
} from '@/lib/rmhladder/answer-bank.server';

export const Route = createFileRoute('/api/rmhladder/answers')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json({ answers: await getAnswerBank(userId) }),
      ),

      PUT: defineHandler({ rateLimit: 'write', body: answerBankSchema }, async ({ userId, body }) =>
        Response.json({ answers: await saveAnswerBank(userId, body) }),
      ),

      DELETE: defineHandler({ rateLimit: 'write' }, async ({ userId }) => {
        await deleteAnswerBank(userId);
        return Response.json({ ok: true });
      }),
    },
  },
});

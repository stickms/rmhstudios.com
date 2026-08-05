/**
 * `/api/speedrun/runs` — submit a run, or read your own (design K1).
 *
 * The body names a replay and a category; it carries no time and no score,
 * because neither is the client's to state. The server reads both off the
 * `GameReplay` row, re-simulates the log through the game's headless logic and
 * stores what the simulation produced.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  getRunsForUser,
  submitRun,
  SpeedrunError,
  type SpeedrunErrorCode,
} from '@/lib/speedrun/speedrun.server';
import { speedrunRejectionMessage } from '@/lib/speedrun/types';

const bodySchema = z.object({
  game: z.string().min(1).max(32),
  slug: z.string().min(1).max(32),
  replayId: z.string().min(1).max(64),
});

/** Each failure gets its own status and its own sentence — "Invalid" tells a
 *  runner nothing about which of eight things went wrong. */
const ERROR_MAP: Record<SpeedrunErrorCode, [string, number]> = {
  UNKNOWN_GAME: ['That game has no speedrun verifier entry.', 400],
  NO_CAPTURE: ['That game cannot record replays yet, so runs cannot be verified.', 400],
  CATEGORY_NOT_FOUND: ['No such category.', 404],
  CATEGORY_INACTIVE: ['That category is closed.', 409],
  REPLAY_NOT_FOUND: ['No such replay.', 404],
  NOT_REPLAY_OWNER: ['You can only submit your own runs.', 403],
  GAME_MISMATCH: ['That replay is for a different game.', 400],
  NO_CATEGORY_FOR_VERSION: ['No board is open for the game version this run was recorded on.', 409],
  DUPLICATE_RUN: ['That replay has already been submitted.', 409],
  ENTRY_NOT_FOUND: ['No such run.', 404],
};

export const Route = createFileRoute('/api/speedrun/runs')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        return Response.json({ runs: await getRunsForUser(userId) });
      }),

      POST: defineHandler(
        {
          rateLimit: { policy: 'write', scope: 'user', prefix: 'speedrun-submit', limit: 20 },
          body: bodySchema,
        },
        async ({ userId, body }) => {
          try {
            const { entry, verdict } = await submitRun({ userId, ...body });
            return Response.json({
              entry,
              verdict: {
                status: verdict.status,
                tier: verdict.tier,
                // The verdict's reason is a code; the message is the sentence a
                // runner reads. Both travel so a client can branch on one and
                // show the other.
                reason: verdict.reason ?? null,
                message: verdict.reason ? speedrunRejectionMessage(verdict.reason) : null,
              },
            });
          } catch (error) {
            if (error instanceof SpeedrunError) {
              const [message, status] = ERROR_MAP[error.code];
              return Response.json({ error: message }, { status });
            }
            throw error;
          }
        },
      ),
    },
  },
});

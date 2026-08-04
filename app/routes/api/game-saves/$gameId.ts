/**
 * The shared single-player save endpoint.
 *
 * `GET` / `POST` / `DELETE` one JSON blob per (account, game). The blob is
 * opaque here on purpose: validating each game's save shape server-side would
 * mean this route had to be edited every time a game added a field, and a save
 * the server rejects is a save the player loses. The client owns the schema and
 * its own version check (`parse` in `createCloudSave`); the server owns the
 * things only it can: who you are, how big the row may be, and which games are
 * allowed to have one at all.
 *
 * That last one is the load-bearing check. Without the allowlist this is a
 * 500 KB-per-row key-value store writable by anyone with a session.
 */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { isSharedSaveGame, MAX_SAVE_BYTES } from '@/lib/game-saves/registry';

/** 404 rather than 400: an id that is not a game is not a resource. */
const UNKNOWN = () => Response.json({ error: 'Unknown game' }, { status: 404 });

export const Route = createFileRoute('/api/game-saves/$gameId')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ params, userId }) => {
        const gameId = params.gameId;
        if (!isSharedSaveGame(gameId)) return UNKNOWN();

        const save = await prisma.gameSave.findUnique({
          where: { userId_gameId: { userId, gameId } },
        });

        return Response.json({
          saveData: save?.saveData ?? null,
          updatedAt: save?.updatedAt ?? null,
        });
      }),

      POST: defineHandler(
        // Its own bucket, and a generous one: an engaged player's autosave runs
        // on a timer, again when they stop touching anything, and again on every
        // way a tab can go away. The client throttles to one write per ten
        // seconds; this is the backstop for a client that is not ours.
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'game-save' } },
        async ({ request, params, userId }) => {
          const gameId = params.gameId;
          if (!isSharedSaveGame(gameId)) return UNKNOWN();

          let body: { saveData?: unknown };
          try {
            body = (await request.json()) as { saveData?: unknown };
          } catch {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
          }

          const { saveData } = body;
          if (!saveData || typeof saveData !== 'object') {
            return Response.json({ error: 'Missing or invalid saveData' }, { status: 400 });
          }

          if (JSON.stringify(saveData).length > MAX_SAVE_BYTES) {
            return Response.json({ error: 'Payload too large' }, { status: 413 });
          }

          const save = await prisma.gameSave.upsert({
            where: { userId_gameId: { userId, gameId } },
            create: { userId, gameId, saveData },
            update: { saveData },
          });

          return Response.json({ success: true, updatedAt: save.updatedAt });
        },
      ),

      /**
       * Start again.
       *
       * `deleteMany` rather than `delete`: there may be no row — a player who
       * only ever played this game signed out on this device — and a missing row
       * is the outcome being asked for, not an error.
       */
      DELETE: defineHandler(
        { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'game-wipe' } },
        async ({ params, userId }) => {
          const gameId = params.gameId;
          if (!isSharedSaveGame(gameId)) return UNKNOWN();

          await prisma.gameSave.deleteMany({ where: { userId, gameId } });
          return Response.json({ success: true });
        },
      ),
    },
  },
});

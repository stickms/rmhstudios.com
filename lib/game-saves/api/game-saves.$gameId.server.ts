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
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { isSharedSaveGame, MAX_SAVE_BYTES } from '@/lib/game-saves/registry';
import { deleteSave, snapshotIfDue } from '@/lib/game-saves/snapshots.server';
import { expectedUpdatedAt as expectedUpdatedAtSchema } from '@/lib/game-saves/saves-schema';

/** Thrown inside the write transaction to roll it back: the stored row is not the one the writer read. */
class SaveChangedElsewhere extends Error {}

/** A unique violation on `(userId, gameId)`: another write created the row first. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002';
}

/** 404 rather than 400: an id that is not a game is not a resource. */
const UNKNOWN = () => Response.json({ error: 'Unknown game' }, { status: 404 });

export const route = apiRoute('/api/game-saves/$gameId', {
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

      let body: { saveData?: unknown; expectedUpdatedAt?: unknown };
      try {
        body = (await request.json()) as { saveData?: unknown; expectedUpdatedAt?: unknown };
      } catch {
        return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
      }

      const { saveData } = body;
      if (!saveData || typeof saveData !== 'object') {
        return Response.json({ error: 'Missing or invalid saveData' }, { status: 400 });
      }

      // Optional compare-and-set. `undefined` (the field absent) keeps today's last-writer-wins upsert untouched.
      const expectedParsed = expectedUpdatedAtSchema.safeParse(body.expectedUpdatedAt);
      if (!expectedParsed.success) {
        return Response.json({ error: 'Invalid expectedUpdatedAt' }, { status: 400 });
      }
      const expected = expectedParsed.data;

      if (JSON.stringify(saveData).length > MAX_SAVE_BYTES) {
        return Response.json({ error: 'Payload too large' }, { status: 413 });
      }

      if (expected === undefined) {
        // One transaction, so the old blob is never gone before its copy exists. Most saves add no insert: a copy is
        // kept only when the newest snapshot is six hours old or more (`snapshotIfDue`).
        const save = await prisma.$transaction(async (tx) => {
          await snapshotIfDue(tx, userId, gameId);
          return tx.gameSave.upsert({
            where: { userId_gameId: { userId, gameId } },
            create: { userId, gameId, saveData },
            update: { saveData },
          });
        });

        return Response.json({ success: true, updatedAt: save.updatedAt });
      }

      // The compare-and-set write. Nothing is written unless the stored row is the one the writer last saw: with
      // `null` there must be no row (the create's unique key settles a race), otherwise the `updateMany` repeats the
      // `updatedAt` condition so a write that lands between the check and the update still loses. A refusal rolls
      // the whole transaction back, so the snapshot taken first is not kept either.
      const expectedAt = expected === null ? null : new Date(expected);
      try {
        const updatedAt = await prisma.$transaction(async (tx) => {
          const current = await tx.gameSave.findUnique({
            where: { userId_gameId: { userId, gameId } },
            select: { updatedAt: true },
          });
          if (expectedAt === null) {
            if (current) throw new SaveChangedElsewhere();
            const created = await tx.gameSave.create({ data: { userId, gameId, saveData } });
            return created.updatedAt;
          }
          if (!current || current.updatedAt.getTime() !== expectedAt.getTime()) throw new SaveChangedElsewhere();

          await snapshotIfDue(tx, userId, gameId);
          // Strictly after the time the writer read, so the same writer's next write cannot match a stale copy.
          const next = new Date(Math.max(Date.now(), expectedAt.getTime() + 1));
          const claimed = await tx.gameSave.updateMany({
            where: { userId, gameId, updatedAt: expectedAt },
            data: { saveData, updatedAt: next },
          });
          if (claimed.count !== 1) throw new SaveChangedElsewhere();
          return next;
        });
        return Response.json({ success: true, updatedAt });
      } catch (error) {
        if (!(error instanceof SaveChangedElsewhere) && !isUniqueViolation(error)) throw error;
        const now = await prisma.gameSave.findUnique({
          where: { userId_gameId: { userId, gameId } },
          select: { updatedAt: true },
        });
        return Response.json(
          { error: 'Save changed elsewhere', updatedAt: now?.updatedAt ?? null },
          { status: 409 },
        );
      }
    },
  ),

  /**
   * Start again.
   *
   * `deleteMany` rather than `delete`: there may be no row — a player who
   * only ever played this game signed out on this device — and a missing row
   * is the outcome being asked for, not an error. The save is kept as a `before-delete` snapshot first.
   */
  DELETE: defineHandler(
    { rateLimit: { limit: 10, windowMs: 60_000, prefix: 'game-wipe' } },
    async ({ params, userId }) => {
      const gameId = params.gameId;
      if (!isSharedSaveGame(gameId)) return UNKNOWN();

      await deleteSave(userId, gameId);
      return Response.json({ success: true });
    },
  ),
});

import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteReplayApi, getReplayApi, setReplayVisibilityApi } from '@/lib/game/replay-library.contract';
import { replayIdSchema, setReplayVisibilityBody } from '@/lib/game/replay-library-schema';
import { deleteReplay, canViewReplay, getReplay, ReplayError, setReplayVisibility } from '@/lib/replays.server';

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

/** The 409 a refused owner action answers, with the reason the page shows. */
function refusal(error: unknown): Response | null {
  if (!(error instanceof ReplayError)) return null;
  if (error.code === 'SPEEDRUN_PROOF') {
    return Response.json(
      { error: 'This replay is the proof for a speedrun entry and cannot be deleted or unlisted.', reason: 'speedrun' },
      { status: 409 },
    );
  }
  if (error.code === 'GHOST') {
    return Response.json(
      { error: 'A race ghost is always unlisted.', reason: 'ghost' },
      { status: 409 },
    );
  }
  return null;
}

/**
 * GET    /api/replays/{id} — fetch a replay. Public replays are readable anonymously; unlisted requires the owner.
 * PATCH  /api/replays/{id} — publish or unlist the caller's replay (409 for a speedrun proof; a ghost is never public).
 * DELETE /api/replays/{id} — delete the caller's replay (409 for a speedrun proof).
 * Another member's replay answers 404 to PATCH and DELETE, as a missing one does.
 */
export const route = apiRoute('/api/replays/$id', {
  GET: implement(getReplayApi, { auth: 'optional' }, async ({ userId, params }) => {
    const replay = await getReplay(params.id);
    if (!replay) return notFound();

    // Unlisted replays are the owner's alone; a blocked pair cannot open each other's public replays.
    if (!(await canViewReplay(replay, userId))) return notFound();

    return Response.json({ replay });
  }),

  PATCH: implement(
    setReplayVisibilityApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'replay-visibility' }, body: setReplayVisibilityBody },
    async ({ userId, params, body }) => {
      const id = replayIdSchema.safeParse(params.id);
      if (!id.success) return notFound();
      try {
        const row = await setReplayVisibility(id.data, userId, body.visibility);
        return row ? Response.json(row) : notFound();
      } catch (error) {
        const refused = refusal(error);
        if (refused) return refused;
        throw error;
      }
    },
  ),

  DELETE: implement(
    deleteReplayApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'replay-delete' } },
    async ({ userId, params }) => {
      const id = replayIdSchema.safeParse(params.id);
      if (!id.success) return notFound();
      try {
        return (await deleteReplay(id.data, userId)) ? Response.json({ ok: true }) : notFound();
      } catch (error) {
        const refused = refusal(error);
        if (refused) return refused;
        throw error;
      }
    },
  ),
});

/**
 * Turn the loadout service's expected failures into the site's error envelope,
 * so "not found" or a limit is a 4xx the builder can show — not a 500.
 */

import { apiError } from '@/lib/api/handler.server';
import { refusalBody } from '@/lib/errors/codes';
import { LoadoutError } from './loadout.server';

export async function guard(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof LoadoutError) {
      if (e.removed) return Response.json(refusalBody('GAME_CONTENT_REMOVED_BY_MODERATOR'), { status: 409 });
      return apiError(e.message, e.status);
    }
    throw e;
  }
}

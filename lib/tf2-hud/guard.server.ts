/**
 * Turn the HUD service's expected failures into the site's error envelope, so a
 * "not found" or a limit is a 4xx the editor can show — not a 500.
 */

import { apiError } from '@/lib/api/handler.server';
import { refusalBody } from '@/lib/errors/codes';
import { HudError, type ServedFile } from './hud.server';

export async function guard(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (e) {
    if (e instanceof HudError) {
      if (e.removed) return Response.json(refusalBody('GAME_CONTENT_REMOVED_BY_MODERATOR'), { status: 409 });
      return apiError(e.message, e.status);
    }
    throw e;
  }
}

/** A stored HUD file as a response: content-addressed, sandboxed, never sniffed. */
export function fileResponse(file: ServedFile): Response {
  return new Response(new Uint8Array(file.body), {
    headers: {
      'Content-Type': file.contentType,
      ETag: `"${file.sha1}"`,
      // Public HUDs are shareable from caches; private/unlisted stay in the viewer's browser.
      'Cache-Control': file.immutablePublic
        ? 'public, max-age=31536000, immutable'
        : 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'",
      'Content-Disposition': 'attachment',
    },
  });
}

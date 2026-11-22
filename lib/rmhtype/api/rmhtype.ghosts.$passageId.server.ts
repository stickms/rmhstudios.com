/** `GET /api/rmhtype/ghosts/$passageId` — the caller's own best-run ghost for a passage. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getRmhTypeGhostApi } from '@/lib/rmhtype/ghost.contract';
import { ghostParams } from '@/lib/rmhtype/ghost-schema';
import { getGhost } from '@/lib/rmhtype/ghost.server';
import { textIdFromPassage } from '@/lib/rmhtype/ghost';
import { ownsText } from '@/lib/rmhtype/texts.server';

export const route = apiRoute('/api/rmhtype/ghosts/$passageId', {
  GET: implement(getRmhTypeGhostApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const parsed = ghostParams.safeParse(params);
    if (!parsed.success) return Response.json({ error: 'Invalid passage' }, { status: 400 });
    // A saved text's ghost (`text:<id>`) is read only after the text is shown to be the caller's.
    const textId = textIdFromPassage(parsed.data.passageId);
    if (textId !== null && !(await ownsText(userId, textId))) {
      return Response.json({ error: 'Text not found' }, { status: 404 });
    }
    // Own ghost only: the lookup is keyed by the session's user id, never by the request.
    return Response.json({ ghost: await getGhost(userId, parsed.data.passageId) });
  }),
});

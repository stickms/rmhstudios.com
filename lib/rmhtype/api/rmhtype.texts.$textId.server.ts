/** `GET` / `PATCH` / `DELETE /api/rmhtype/texts/$textId` — one of the caller's texts. Another member's id is 404. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteRmhTypeTextApi, getRmhTypeTextApi, updateRmhTypeTextApi } from '@/lib/rmhtype/texts.contract';
import { textParams, updateTextBody } from '@/lib/rmhtype/texts-schema';
import { deleteText, getText, updateText } from '@/lib/rmhtype/texts.server';

const notFound = () => Response.json({ error: 'Text not found' }, { status: 404 });

export const route = apiRoute('/api/rmhtype/texts/$textId', {
  GET: implement(getRmhTypeTextApi, { rateLimit: 'read' }, async ({ userId, params }) => {
    const parsed = textParams.safeParse(params);
    if (!parsed.success) return notFound();
    const found = await getText(userId, parsed.data.textId);
    return found ? Response.json(found) : notFound();
  }),

  PATCH: implement(
    updateRmhTypeTextApi,
    { rateLimit: 'write', body: updateTextBody },
    async ({ userId, params, body }) => {
      const parsed = textParams.safeParse(params);
      if (!parsed.success) return notFound();
      const updated = await updateText(userId, parsed.data.textId, body);
      if (!updated.ok) {
        return updated.reason === 'not-found' ? notFound() : Response.json({ error: 'Invalid text' }, { status: 400 });
      }
      return Response.json({ text: updated.text, reset: updated.reset });
    },
  ),

  DELETE: implement(deleteRmhTypeTextApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const parsed = textParams.safeParse(params);
    if (!parsed.success) return notFound();
    return (await deleteText(userId, parsed.data.textId)) ? Response.json({ deleted: true }) : notFound();
  }),
});

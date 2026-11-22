/** `GET` / `POST /api/rmhtype/texts` — the caller's saved texts, and saving a new one. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createRmhTypeTextApi, listRmhTypeTextsApi } from '@/lib/rmhtype/texts.contract';
import { createTextBody } from '@/lib/rmhtype/texts-schema';
import { createText, listTexts } from '@/lib/rmhtype/texts.server';

export const route = apiRoute('/api/rmhtype/texts', {
  GET: implement(listRmhTypeTextsApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json({ texts: await listTexts(userId) }),
  ),

  POST: implement(createRmhTypeTextApi, { rateLimit: 'write', body: createTextBody }, async ({ userId, body }) => {
    const created = await createText(userId, body);
    if (!created.ok) {
      return created.reason === 'cap'
        ? Response.json({ error: 'You can keep up to 50 texts' }, { status: 409 })
        : Response.json({ error: 'Invalid text' }, { status: 400 });
    }
    return Response.json({ text: created.text }, { status: 201 });
  }),
});

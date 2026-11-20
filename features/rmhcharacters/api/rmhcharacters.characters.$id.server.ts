import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { normalizeCharacter } from '@features/rmhcharacters/engine/factory';
import { characterIdParams, MAX_CHARACTERS, saveCharacterBody } from '@features/rmhcharacters/engine/characters-schema';
import { deleteCharacterApi, saveCharacterApi } from '@features/rmhcharacters/engine/characters.contract';

/** A sheet with a portrait (capped at 400 KB by the normaliser) fits well inside this. */
const MAX_SHEET_BYTES = 1_000_000;

/**
 * /api/rmhcharacters/characters/$id — save (create or replace) or delete one character.
 *
 * The body is untrusted JSON, so it goes through the same normaliser an imported file
 * does: unknown fields are dropped, strings capped, and only an image data URL is kept as
 * a portrait. The id is the client's own, so ownership is checked on every write: an id
 * that belongs to another account is refused with 409, never overwritten.
 */
export const route = apiRoute('/api/rmhcharacters/characters/$id', {
  PUT: implement(
    saveCharacterApi,
    {
      // Saves are debounced per character on the client; this caps a runaway loop.
      rateLimit: { policy: 'write', limit: 60, prefix: 'rmhc-save', scope: 'user' },
      body: saveCharacterBody,
      maxBodyBytes: MAX_SHEET_BYTES,
    },
    async ({ userId, params, body }) => {
      const p = characterIdParams.safeParse(params);
      if (!p.success) return Response.json({ error: 'Not found.' }, { status: 404 });
      const id = p.data.id;
      const c = normalizeCharacter({ ...body.character, id });
      if (!c) return Response.json({ error: 'That is not a character sheet.' }, { status: 400 });
      const data = { ...c, id };
      if (JSON.stringify(data).length > MAX_SHEET_BYTES)
        return Response.json({ error: 'That character sheet is too large.' }, { status: 413 });

      const existing = await prisma.rmhCharacter.findUnique({ where: { id }, select: { userId: true } });
      if (existing && existing.userId !== userId)
        return Response.json({ error: 'That character id is taken.' }, { status: 409 });
      if (!existing) {
        const count = await prisma.rmhCharacter.count({ where: { userId } });
        if (count >= MAX_CHARACTERS)
          return Response.json({ error: `You can save up to ${MAX_CHARACTERS} characters.` }, { status: 422 });
      }
      const fields = { system: c.system, name: c.name.slice(0, 120), data: data as object };
      const row = existing
        ? await prisma.rmhCharacter.update({ where: { id }, data: fields, select: { updatedAt: true } })
        : await prisma.rmhCharacter.create({ data: { id, userId, ...fields }, select: { updatedAt: true } });
      return { updatedAt: row.updatedAt.getTime() };
    },
  ),
  DELETE: implement(deleteCharacterApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const p = characterIdParams.safeParse(params);
    if (!p.success) return Response.json({ error: 'Not found.' }, { status: 404 });
    // deleteMany scoped to the owner: another account's id simply matches nothing.
    await prisma.rmhCharacter.deleteMany({ where: { id: p.data.id, userId } });
    return { ok: true as const };
  }),
});

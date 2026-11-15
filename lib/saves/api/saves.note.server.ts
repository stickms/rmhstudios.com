import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { SAVE_ENTITY_TYPES, type SaveEntityType } from '@/lib/saves/types';
import { setSaveNote } from '@/lib/saves/saves.server';
import { setSaveNoteApi } from '@/lib/saves/saves.contract';
import { saveNoteSchema } from '@/lib/posts-plus/schema';

/**
 * PUT /api/saves/note { entityType, entityId, note } - set the private note on one of
 * the caller's saves (X9). `note: null` or whitespace clears it. 404 when the
 * caller has not saved that item - a note cannot exist without its save.
 */
export const route = apiRoute('/api/saves/note', {
  PUT: implement(
    setSaveNoteApi,
    { rateLimit: { limit: 60, windowMs: 60_000, prefix: 'saves-note' }, body: saveNoteSchema },
    async ({ session, body }) => {
      if (!(SAVE_ENTITY_TYPES as readonly string[]).includes(body.entityType)) {
        return Response.json({ error: 'Unknown item type' }, { status: 400 });
      }
      const ok = await setSaveNote(
        session.user.id,
        body.entityType as SaveEntityType,
        body.entityId,
        body.note,
      );
      if (!ok) return Response.json({ error: 'Not saved' }, { status: 404 });
      return Response.json({ note: body.note?.trim() ? body.note.trim() : null });
    },
  ),
});

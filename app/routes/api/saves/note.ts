import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { SAVE_ENTITY_TYPES, type SaveEntityType } from '@/lib/saves/types';
import { setSaveNote } from '@/lib/saves/saves.server';
import { saveNoteSchema } from '@/lib/posts-plus/constants';

/**
 * PUT /api/saves/note { entityType, entityId, note } - set the private note on one of
 * the caller's saves (X9). `note: null` or whitespace clears it. 404 when the
 * caller has not saved that item - a note cannot exist without its save.
 */
export const Route = createFileRoute('/api/saves/note')({
  server: {
    handlers: {
      PUT: defineHandler(
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
    },
  },
});

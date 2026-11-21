/** Contracts for community moderator notes (client-safe; types by `import type`). Moderators only. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { NoteDTO } from '@/lib/communities/member-notes';
import type {
  createNoteBody,
  editNoteBody,
  noteCountsQuery,
} from './member-notes-schema';

/** Live notes about one member, newest first. */
export const listNotesApi = endpoint<{
  res: { notes: NoteDTO[] };
}>()({ method: 'GET', path: '/api/communities/$slug/notes/$userId' });

/** 201. The 51st live note about a member is refused with 409. */
export const addNoteApi = endpoint<{
  body: z.infer<typeof createNoteBody>;
  res: { note: NoteDTO };
}>()({ method: 'POST', path: '/api/communities/$slug/notes/$userId' });

/** Author only, within 15 minutes of writing. */
export const editNoteApi = endpoint<{
  body: z.infer<typeof editNoteBody>;
  res: { note: NoteDTO };
}>()({ method: 'PATCH', path: '/api/communities/$slug/notes/$userId/$noteId' });

/** Any moderator; a soft delete, logged as `note_deleted`. */
export const deleteNoteApi = endpoint<{
  res: { success: true };
}>()({ method: 'DELETE', path: '/api/communities/$slug/notes/$userId/$noteId' });

/** Counts for a page of members; `counts` has an entry (0 when none) for every id asked for. */
export const noteCountsApi = endpoint<{
  query: z.infer<typeof noteCountsQuery>;
  res: { counts: Record<string, number> };
}>()({ method: 'GET', path: '/api/communities/$slug/notes/counts' });

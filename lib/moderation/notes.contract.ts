/** Contracts for moderator notes (s03-04). Client-safe: request types come from the zod schemas by `import type`. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { AdminQueueUser } from '@/lib/admin/admin-ops.contract';
import type {
  createNoteBody,
  listNotesQuery,
  patchNoteBody,
} from '@/lib/moderation/notes-schema';

/** One note as an admin reads it. A deleted note carries no text or history. */
export interface ModeratorNoteRow {
  id: string;
  /** Null for a deleted note. */
  body:
    | string
    | null;
  /** Earlier texts, oldest first; empty for a deleted note. */
  editedFrom: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  /** Null once the author's account is erased. */
  author: AdminQueueUser | null;
  /** The author may still edit until this time (null once it has passed or the note is deleted). */
  editableUntil:
    | string
    | null;
  report: {
    id: string;
    reason: string;
    status: string;
  } | null;
  strike: {
    id: string;
    reason: string;
  } | null;
  deleted: {
    at: string;
    by: AdminQueueUser | null;
  } | null;
}

/** What a new note can point at: the member's own newest reports and strikes. */
export interface NoteLinkChoices {
  reports: {
    id: string;
    reason: string;
    status: string;
    createdAt: string;
  }[];
  strikes: {
    id: string;
    reason: string;
    createdAt: string;
  }[];
}

export interface ModeratorNotesPage {
  notes: ModeratorNoteRow[];
  nextCursor:
    | string
    | null;
  /** Live (not deleted) notes of the member, whatever the search. */
  total: number;
  pinned: number;
  choices: NoteLinkChoices;
}

export const listModeratorNotesApi =
  endpoint<{
    query: z.infer<
      typeof listNotesQuery
    >;
    res: ModeratorNotesPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/users/$id/notes',
    },
  );

export const createModeratorNoteApi =
  endpoint<{
    body: z.infer<
      typeof createNoteBody
    >;
    res: {
      note: ModeratorNoteRow;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/users/$id/notes',
    },
  );

export const updateModeratorNoteApi =
  endpoint<{
    body: z.infer<
      typeof patchNoteBody
    >;
    res: {
      note: ModeratorNoteRow;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/admin/users/$id/notes/$noteId',
    },
  );

export const deleteModeratorNoteApi =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/admin/users/$id/notes/$noteId',
    },
  );

/**
 * Unified Saves — client-safe types, constants, and zod schemas (§4 of
 * docs/plans/2026-07-20-parity-qol-customization-design.md).
 *
 * A saved item is polymorphic — it addresses any content by
 * `entityType`/`entityId`, reusing the coin ledger's convention. Wave 1
 * hydrates + exposes save buttons for posts and builds; the full type list is
 * accepted by the API so later surfaces adopt without a schema change.
 */
import { z } from 'zod';

export const SAVE_ENTITY_TYPES = [
  'rmhark',
  'build',
  'song',
  'tube_video',
  'library_doc',
  'news',
  'replay',
  'listing',
] as const;
export type SaveEntityType = (typeof SAVE_ENTITY_TYPES)[number];

export const MAX_FOLDERS = 20;
export const MAX_FOLDER_NAME = 40;

export const saveEntitySchema = z.object({
  entityType: z.enum(SAVE_ENTITY_TYPES),
  entityId: z.string().min(1).max(64),
  folderId: z.string().min(1).max(64).nullable().optional(),
});

export const folderCreateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_FOLDER_NAME),
});

export const folderUpdateSchema = z.object({
  name: z.string().trim().min(1).max(MAX_FOLDER_NAME).optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

export type SaveEntityInput = z.infer<typeof saveEntitySchema>;

/** A saved item resolved to its display shape for the hub grid. */
export interface HydratedSave {
  id: string;
  entityType: SaveEntityType;
  entityId: string;
  folderId: string | null;
  createdAt: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  thumbnail: string | null;
  /** The target is gone or no longer visible to the viewer. */
  tombstone: boolean;
}

export interface SaveFolderView {
  id: string;
  name: string;
  sortOrder: number;
  count: number;
}

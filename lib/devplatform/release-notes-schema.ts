/**
 * Release notes — the zod schemas for the admin release-notes API. Split from
 * `./release-notes`, which the public /changelog page imports for the view
 * type and the body parser.
 */
import { z } from 'zod';

export const releaseNoteSchema = z.object({
  version: z.string().trim().min(1).max(40),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(8000),
  publish: z.boolean().optional(),
});

export const releaseNotePatchSchema = releaseNoteSchema.partial();

export const draftSchema = z.object({ prs: z.string().trim().min(10).max(12_000) });

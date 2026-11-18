/**
 * Site moderation of user-created things — the client-safe half: which kinds
 * of content an admin can act on, and which fields of each an admin may edit.
 * The server half is `content.server.ts`; the admin dialog is
 * `components/moderation/moderation-ui.tsx`.
 *
 * `entityType` uses the vocabulary ContentReport and UserStrike already use
 * ('rmhark' | 'comment' | …), so a strike issued from here links to the same
 * thing a report would.
 */

import type { RestrictableFeature } from '@/lib/moderation/restrictions';

export const MODERATABLE_TYPES = ['rmhark', 'comment', 'community', 'space', 'vibe', 'persona'] as const;
export type ModeratableType = (typeof MODERATABLE_TYPES)[number];

export type ModerationAction = 'remove' | 'edit' | 'restore';

/** One editable field: its key, its English label and its length cap. */
export interface EditableField {
  key: string;
  label: string;
  max: number;
  multiline?: boolean;
  /** May be cleared to empty. */
  optional?: boolean;
}

export const EDITABLE_FIELDS: Record<ModeratableType, readonly EditableField[]> = {
  rmhark: [{ key: 'content', label: 'Text', max: 5000, multiline: true }],
  comment: [{ key: 'content', label: 'Text', max: 2000, multiline: true }],
  community: [
    { key: 'name', label: 'Name', max: 60 },
    { key: 'description', label: 'Description', max: 500, multiline: true, optional: true },
  ],
  space: [{ key: 'title', label: 'Title', max: 120 }],
  vibe: [
    { key: 'title', label: 'Title', max: 200 },
    { key: 'description', label: 'Description', max: 500, multiline: true, optional: true },
  ],
  persona: [
    { key: 'name', label: 'Name', max: 40 },
    { key: 'tagline', label: 'Tagline', max: 120, optional: true },
  ],
};

/**
 * Removal of these is a soft delete the admin can undo; the rest are deleted
 * outright (a community, a space and a persona have no tombstone to show).
 */
export const RESTORABLE: ReadonlySet<ModeratableType> = new Set(['rmhark', 'comment', 'vibe']);

/** English nouns for notices ("Your post was removed…"). */
export const TYPE_NOUN: Record<ModeratableType, string> = {
  rmhark: 'post',
  comment: 'reply',
  community: 'community',
  space: 'space',
  vibe: 'vibe',
  persona: 'persona',
};

/** The feature a timeout for abusing this kind of content most likely targets. */
export const DEFAULT_FEATURE: Record<ModeratableType, RestrictableFeature> = {
  rmhark: 'post',
  comment: 'comment',
  community: 'community',
  space: 'space',
  vibe: 'vibe',
  persona: 'persona',
};

/** What the moderation endpoint answers. */
export interface ModerateContentResult {
  success: true;
  action: ModerationAction;
  /** The owner whose content it was, when known. */
  ownerId: string | null;
  strike?: { activeStrikes: number; autoBanned: boolean } | undefined;
  restrictionId?: string | undefined;
}

/**
 * Copy tables for the recycle bin and bulk cleanup.
 *
 * Every entry is a **literal** `t()` call. A lookup keyed by variable
 * (`t(reasonKeys[reason])`) is invisible to `i18next-parser`: the key never
 * reaches `locales/en/*.json`, so it never reaches the translators either, and
 * all sixteen locales quietly serve the English `defaultValue` forever. The
 * table has to be spelled out one call at a time for the extractor to see it —
 * same pattern as `featureCopy()` in `components/membership/MemberFeatureGrid`.
 *
 * The namespace is `settings-content`, which is registered in
 * `lib/i18n/config.ts` — a namespace that is not in `NAMESPACES` is never
 * loaded, and its strings silently fall back too.
 */

import type { TFunction } from 'i18next';
import type { RestoreRefusal } from '@/lib/trash/types';
import type { BulkKind } from '@/lib/bulk/types';

/** Why a row cannot come back, in the user's language. */
export function refusalCopy(t: TFunction): Record<RestoreRefusal, string> {
  return {
    'not-found': t('trash-reason-not-found', {
      defaultValue: 'This is no longer in the database — it has already been permanently deleted.',
    }),
    'not-owner': t('trash-reason-not-owner', {
      defaultValue: 'This is not yours to restore.',
    }),
    'not-deleted': t('trash-reason-not-deleted', {
      defaultValue: 'This is not deleted, so there is nothing to restore.',
    }),
    moderated: t('trash-reason-moderated', {
      defaultValue: 'This was removed by a moderator and cannot be restored.',
    }),
    expired: t('trash-reason-expired', {
      defaultValue: 'The recovery window for this has passed.',
    }),
    'parent-missing': t('trash-reason-parent-missing', {
      defaultValue: 'The post this replied to no longer exists.',
    }),
    'parent-deleted': t('trash-reason-parent-deleted', {
      defaultValue: 'The post this replied to is also deleted. Restore that one first.',
    }),
  };
}

export interface BulkKindCopy {
  label: string;
  /** What the operation does, in one sentence, shown under the picker. */
  blurb: string;
  /** Noun for the confirm dialog: "Delete 412 posts?" */
  unit: string;
}

export function bulkKindCopy(t: TFunction): Record<BulkKind, BulkKindCopy> {
  return {
    'delete-posts': {
      label: t('bulk-kind-delete-posts', { defaultValue: 'Delete posts' }),
      blurb: t('bulk-kind-delete-posts-blurb', {
        defaultValue: 'Soft-deleted, so everything lands in the bin above and can be restored.',
      }),
      unit: t('bulk-unit-posts', { defaultValue: 'posts' }),
    },
    'delete-comments': {
      label: t('bulk-kind-delete-comments', { defaultValue: 'Delete comments' }),
      blurb: t('bulk-kind-delete-comments-blurb', {
        defaultValue: 'Soft-deleted, so everything lands in the bin above and can be restored.',
      }),
      unit: t('bulk-unit-comments', { defaultValue: 'comments' }),
    },
    unfollow: {
      label: t('bulk-kind-unfollow', { defaultValue: 'Unfollow accounts' }),
      blurb: t('bulk-kind-unfollow-blurb', {
        defaultValue: 'Permanent. Unfollowing cannot be undone from the bin.',
      }),
      unit: t('bulk-unit-accounts', { defaultValue: 'accounts' }),
    },
    'clear-history': {
      label: t('bulk-kind-clear-history', { defaultValue: 'Clear watch history' }),
      blurb: t('bulk-kind-clear-history-blurb', {
        defaultValue: 'Permanent. History rows are removed outright.',
      }),
      unit: t('bulk-unit-entries', { defaultValue: 'entries' }),
    },
    'clear-bookmarks': {
      label: t('bulk-kind-clear-bookmarks', { defaultValue: 'Clear bookmarks' }),
      blurb: t('bulk-kind-clear-bookmarks-blurb', {
        defaultValue: 'Permanent. The posts themselves are untouched.',
      }),
      unit: t('bulk-unit-bookmarks', { defaultValue: 'bookmarks' }),
    },
  };
}

/** Status pill wording. */
export function bulkStatusCopy(t: TFunction): Record<string, string> {
  return {
    PENDING: t('bulk-status-pending', { defaultValue: 'Queued' }),
    RUNNING: t('bulk-status-running', { defaultValue: 'Running' }),
    DONE: t('bulk-status-done', { defaultValue: 'Finished' }),
    CANCELLED: t('bulk-status-cancelled', { defaultValue: 'Cancelled' }),
    FAILED: t('bulk-status-failed', { defaultValue: 'Failed' }),
  };
}

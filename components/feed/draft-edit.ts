/**
 * The edit-a-draft dialog's pure half (s09-01): what the form starts as, which fields changed, and which line a
 * failed save shows. Client-safe: no zod, no React. The dialog translates the codes this returns.
 */
import { MAX_CONTENT_WARNING_LENGTH, checkContentWarningInput } from '@/lib/feed/content-warning';

export type DraftAudience = 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';

/** The row fields the dialog reads. */
export interface DraftEditRow {
  id: string;
  content: string;
  audience: DraftAudience;
  /** ISO instant; null for a plain draft. */
  scheduledAt: string | null;
  contentWarning?: string | null;
  imageUrls: string[];
  imageAlts: string[];
  isCapsule?: boolean;
}

/** What the dialog's fields hold. `time` is a `datetime-local` value in the viewer's zone; '' keeps it a draft. */
export interface DraftEditForm {
  content: string;
  time: string;
  audience: DraftAudience;
  contentWarning: string;
  imageAlts: string[];
}

/** The body sent to `PATCH /api/scheduled/$id`: only what changed. */
export interface DraftPatch {
  content?: string;
  scheduledAt?: string | null;
  audience?: DraftAudience;
  contentWarning?: string | null;
  isSensitive?: boolean;
  imageAlts?: string[];
}

/** A time capsule is sealed; every other draft and scheduled post can be edited. */
export function canEditDraft(row: { isCapsule?: boolean }): boolean {
  return row.isCapsule !== true;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** An ISO instant as a `datetime-local` value in the viewer's zone ('' for none). */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A `datetime-local` value as a UTC ISO instant, or null when it is empty or not a date. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** True when the chosen time is set and not in the future. */
export function isPastTime(value: string, now: number = Date.now()): boolean {
  const iso = localInputToIso(value);
  return iso !== null && new Date(iso).getTime() <= now;
}

/** One description per image, padded or cut to the image count. */
export function alignAlts(alts: readonly string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => alts[i] ?? '');
}

export function formFromRow(row: DraftEditRow): DraftEditForm {
  return {
    content: row.content,
    time: isoToLocalInput(row.scheduledAt),
    audience: row.audience,
    contentWarning: row.contentWarning ?? '',
    imageAlts: alignAlts(row.imageAlts, row.imageUrls.length),
  };
}

/**
 * The fields that differ from the row, as the request body. An empty object means nothing changed and no request is
 * sent. The description list is sent whole (one entry per image) when any of them changed. An invalid warning reason is
 * left out here; the dialog refuses the save before it gets this far.
 */
export function diffDraftEdit(row: DraftEditRow, form: DraftEditForm): DraftPatch {
  const patch: DraftPatch = {};
  if (form.content.trim() !== row.content.trim()) patch.content = form.content;
  if (form.audience !== row.audience) patch.audience = form.audience;

  if (form.time !== isoToLocalInput(row.scheduledAt)) {
    if (form.time === '') {
      patch.scheduledAt = null;
    } else {
      const iso = localInputToIso(form.time);
      if (iso !== null) patch.scheduledAt = iso;
    }
  }

  const before = (row.contentWarning ?? '').trim();
  const check = checkContentWarningInput(form.contentWarning);
  if (check.ok && (check.reason ?? '') !== before) {
    patch.contentWarning = check.reason;
    // Clearing the reason clears the whole warning, as the post editor does.
    if (check.reason === null) patch.isSensitive = false;
  }

  const was = alignAlts(row.imageAlts, row.imageUrls.length).map((a) => a.trim());
  const now = alignAlts(form.imageAlts, row.imageUrls.length).map((a) => a.trim());
  if (now.some((a, i) => a !== was[i])) patch.imageAlts = now;
  return patch;
}

export function hasChanges(patch: DraftPatch): boolean {
  return Object.keys(patch).length > 0;
}

/** True when the warning field holds something that is not a valid reason (over-long or multi-line). */
export function warningInvalid(form: DraftEditForm): boolean {
  return !checkContentWarningInput(form.contentWarning).ok;
}

export { MAX_CONTENT_WARNING_LENGTH };

/** Where an error line goes in the dialog. */
export type DraftEditErrorField = 'time' | 'images' | 'form';
export type DraftEditErrorCode =
  'past' | 'alt_required' | 'published' | 'not_found' | 'capsule_sealed' | 'message' | 'unknown';

export interface DraftEditError {
  field: DraftEditErrorField;
  code: DraftEditErrorCode;
  /** The server's own text, for a refusal with no line of ours (a community's refusal shows its message). */
  message?: string;
  /** Image indexes still missing a description, when the server said. */
  missing?: number[];
}

/**
 * A failed save as one line: from the HTTP status and the JSON body (`{ error, code?, missing? }`) the endpoint
 * sends. Shows only our own wording or, for a refusal we have no line for, the server's `error` text.
 */
export function draftEditError(failure: { status?: number; body?: unknown }): DraftEditError {
  const body =
    typeof failure.body === 'object' && failure.body !== null && !Array.isArray(failure.body)
      ? (failure.body as Record<string, unknown>)
      : {};
  const text = typeof body.error === 'string' ? body.error : undefined;
  const code = typeof body.code === 'string' ? body.code : undefined;
  const status = failure.status;

  if (status === 404) return { field: 'form', code: 'not_found' };
  if (status === 409) {
    return code === 'capsule_sealed' ? { field: 'form', code: 'capsule_sealed' } : { field: 'form', code: 'published' };
  }
  if (code === 'ALT_REQUIRED') {
    const missing = Array.isArray(body.missing) ? body.missing.filter((n): n is number => typeof n === 'number') : [];
    return { field: 'images', code: 'alt_required', missing };
  }
  if (code === 'past') return { field: 'time', code: 'past' };
  if (text) return { field: 'form', code: 'message', message: text };
  return { field: 'form', code: 'unknown' };
}

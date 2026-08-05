'use client';

import { useCallback, useRef, useState } from 'react';
import type { ClipboardEvent, DragEvent, RefObject } from 'react';

import { MAX_MEDIA_PER_POST, MEDIA_MAX_BYTES } from '@/lib/media/policy';

/**
 * Paste and drop that does the obvious thing (B16).
 *
 * Three gestures, one handler:
 *
 *  - paste an image (or any accepted file) from the clipboard → `onFiles`;
 *  - paste a URL while text is selected → `onLink`, i.e. link the selection,
 *    which is what every editor written in the last fifteen years does;
 *  - anything else → **do nothing**, and let the browser paste normally. A
 *    composer that intercepts every paste is a composer that eventually eats
 *    someone's carefully formatted text.
 *
 * Files are screened BEFORE anything is handed to the caller — see
 * `screenMediaFiles`. Dropping a 20 MB photo and finding out it was refused
 * after the upload finished is the bug this exists to prevent, so the size /
 * count / type checks run against `lib/media/policy` locally, at drop time.
 *
 * Rejections come back as reason CODES, not sentences: the strings belong to the
 * component that has a `t()` in scope, and a hook is not a place to hard-code
 * English.
 */

/** Why a file was refused. Mapped to copy by the calling component. */
export type MediaRejectionReason = 'too-large' | 'unsupported-type' | 'over-limit';

export interface MediaRejection {
  file: File;
  reason: MediaRejectionReason;
}

export interface MediaScreenResult {
  accepted: File[];
  rejected: MediaRejection[];
}

export interface MediaScreenOptions {
  /** Slots left for this composer (e.g. 4 images minus what is already attached). */
  remainingSlots?: number;
  /** Per-file byte ceiling. Defaults to the site's media policy. */
  maxBytes?: number;
  /** Accepted MIME prefixes/types. Defaults to images. */
  acceptedTypes?: readonly string[];
}

const DEFAULT_ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

function typeAccepted(file: File, accepted: readonly string[]): boolean {
  return accepted.some((entry) =>
    entry.endsWith('/*') ? file.type.startsWith(entry.slice(0, -1)) : file.type === entry,
  );
}

/**
 * Apply the media quota locally, before a byte leaves the browser.
 *
 * `lib/media/policy.ts` owns the numbers (`MEDIA_MAX_BYTES`,
 * `MAX_MEDIA_PER_POST`) and the server re-enforces every one of them — this is a
 * fast refusal, never the authority.
 */
export function screenMediaFiles(
  files: readonly File[],
  options: MediaScreenOptions = {},
): MediaScreenResult {
  const maxBytes = options.maxBytes ?? MEDIA_MAX_BYTES;
  const accepted = options.acceptedTypes ?? DEFAULT_ACCEPTED;
  const slots = options.remainingSlots ?? MAX_MEDIA_PER_POST;

  const out: MediaScreenResult = { accepted: [], rejected: [] };
  for (const file of files) {
    if (!typeAccepted(file, accepted)) {
      out.rejected.push({ file, reason: 'unsupported-type' });
      continue;
    }
    if (file.size > maxBytes) {
      out.rejected.push({ file, reason: 'too-large' });
      continue;
    }
    if (out.accepted.length >= slots) {
      out.rejected.push({ file, reason: 'over-limit' });
      continue;
    }
    out.accepted.push(file);
  }
  return out;
}

const URL_RE = /^https?:\/\/[^\s]+$/i;

/** True for a single absolute http(s) URL with no surrounding text. */
export function isUrl(text: string): boolean {
  const trimmed = text.trim();
  if (!URL_RE.test(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** The currently selected text in a textarea/input, or `''`. */
export function selectedTextOf(
  element: HTMLTextAreaElement | HTMLInputElement | null | undefined,
): string {
  if (!element) return '';
  const { selectionStart, selectionEnd, value } = element;
  if (selectionStart === null || selectionEnd === null || selectionStart === selectionEnd)
    return '';
  return value.slice(selectionStart, selectionEnd);
}

export interface SmartPasteOptions {
  /** Called with the files that passed the local quota screen. */
  onFiles: (files: File[]) => void;
  /** Called when a URL is pasted over a non-empty selection. */
  onLink?: (url: string, selection: string) => void;
  /** The field whose selection `onLink` applies to. */
  selectionRef?: RefObject<HTMLTextAreaElement | HTMLInputElement | null>;
  /** Called for every refused file, so the surface can explain itself. */
  onRejected?: (rejections: MediaRejection[]) => void;
  /** Quota inputs — evaluated at gesture time, not at mount. */
  screen?: MediaScreenOptions | (() => MediaScreenOptions);
  /** Turn the whole thing off (e.g. no slots left, or a read-only composer). */
  disabled?: boolean;
}

export interface SmartPasteHandlers {
  onPaste: (event: ClipboardEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragEnter: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  /** True while a drag is over the target — render the `.glass-overlay` hint. */
  dragActive: boolean;
}

export function useSmartPaste(options: SmartPasteOptions): SmartPasteHandlers {
  const { onFiles, onLink, selectionRef, onRejected, screen, disabled } = options;
  const [dragActive, setDragActive] = useState(false);
  // dragenter/dragleave fire for every child element the pointer crosses, so a
  // plain boolean flickers the overlay off the moment the cursor moves over the
  // textarea inside the drop zone. Counting entries is the standard fix.
  const dragDepth = useRef(0);

  const resolveScreen = useCallback(
    (): MediaScreenOptions => (typeof screen === 'function' ? screen() : (screen ?? {})),
    [screen],
  );

  const handleFiles = useCallback(
    (files: File[]) => {
      const result = screenMediaFiles(files, resolveScreen());
      if (result.rejected.length > 0) onRejected?.(result.rejected);
      if (result.accepted.length > 0) onFiles(result.accepted);
    },
    [onFiles, onRejected, resolveScreen],
  );

  const onPaste = useCallback(
    (event: ClipboardEvent<HTMLElement>) => {
      if (disabled) return;
      const data = event.clipboardData;
      if (!data) return;

      const files = Array.from(data.files);
      if (files.length > 0) {
        event.preventDefault();
        handleFiles(files);
        return;
      }

      if (onLink) {
        const text = data.getData('text/plain');
        const selection = selectedTextOf(selectionRef?.current);
        if (selection.length > 0 && isUrl(text)) {
          event.preventDefault();
          onLink(text.trim(), selection);
          return;
        }
      }
      // Fall through: the browser pastes normally.
    },
    [disabled, handleFiles, onLink, selectionRef],
  );

  const onDragEnter = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled) return;
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragActive(true);
    },
    [disabled],
  );

  const onDragOver = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled) return;
      if (!Array.from(event.dataTransfer?.types ?? []).includes('Files')) return;
      // Without preventDefault the browser navigates to the dropped file.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    },
    [disabled],
  );

  const onDragLeave = useCallback(
    (event: DragEvent<HTMLElement>) => {
      if (disabled) return;
      event.preventDefault();
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragActive(false);
    },
    [disabled],
  );

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      dragDepth.current = 0;
      setDragActive(false);
      if (disabled) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      handleFiles(files);
    },
    [disabled, handleFiles],
  );

  return { onPaste, onDragOver, onDragEnter, onDragLeave, onDrop, dragActive };
}

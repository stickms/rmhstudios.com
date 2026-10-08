'use client';

/**
 * The scrim the library's five modals share, portalled to `<body>`.
 *
 * All five (`UploadModal`, `LibraryEditControls`, and three inside
 * `LibraryCollections`) rendered `<div className="lib-upload__overlay">` in
 * place. `.lib-upload__overlay` is `position: fixed; inset: 0; z-index: 120`,
 * and `fixed` was fine — `.radial-frame` is `position: relative`, which is not a
 * containing block for fixed descendants — so the 72%-black scrim really did
 * cover the viewport. The **z-index** was the problem: `.radial-frame` is
 * `z-index: var(--z-content)`, a stacking context pinned at 1, so 120 was
 * measured inside that 1 and the shell's chrome kept painting over the scrim.
 *
 * The result was a dialog that claimed modality and did not have it: the top bar
 * stayed crisp and fully interactive above a supposedly-modal 72%-black wash,
 * and the hub orb burned through at bottom-centre. At 360x640 a tall upload form
 * put its title row under the bar and its submit row under the orb — both
 * untappable, because a tap there hit the shell's controls instead.
 *
 * At `<body>` the z-index means what it says, so it drops from 120 to the
 * ordinary 50 dialog band (library.css).
 *
 * `LibraryContextMenu` in this same directory already portals for exactly this
 * reason; this is that precedent applied to the modals.
 *
 * NOTE: this is a scrim, not a `Dialog`. It carries no focus trap and no scroll
 * lock — the callers never had either, and this change is deliberately limited
 * to the layering bug. `components/ui/dialog.tsx` is where these should land.
 */

import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

export interface LibraryDialogShellProps {
  /** Fires on a press on the scrim itself; panels stop propagation. */
  onClose: () => void;
  /** Accessible name, for the dialogs that do not label themselves internally. */
  label?: string;
  children: ReactNode;
}

export function LibraryDialogShell({ onClose, label, children }: LibraryDialogShellProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div
      className="lib-upload__overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onMouseDown={onClose}
    >
      {children}
    </div>,
    document.body,
  );
}

'use client';

/**
 * The Radix dialog the library's five modals share, portalled to `<body>`.
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
 * It is now a Radix dialog (focus trap, scroll lock, Escape) around the same
 * `.lib-upload__overlay` layer, so each panel keeps its own markup and styling.
 */

import type { ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useTranslation } from 'react-i18next';
import { DialogPortal } from '@/components/ui/dialog';

export interface LibraryDialogShellProps {
  /** Fires on a press on the scrim itself, and on Escape; panels stop propagation. */
  onClose: () => void;
  /** Accessible name, for the dialogs that do not label themselves internally. */
  label?: string;
  children: ReactNode;
}

export function LibraryDialogShell({ onClose, label, children }: LibraryDialogShellProps) {
  const { t } = useTranslation('library');
  return (
    <DialogPrimitive.Root open onOpenChange={(o) => !o && onClose()}>
      <DialogPortal>
        {/* The content IS the scrim (`.lib-upload__overlay` is the viewport-covering layer the
            panels centre inside), so a press on it is an outside press; Radix adds Escape, the
            focus trap and focus return. */}
        <DialogPrimitive.Content
          className="lib-upload__overlay outline-none"
          aria-describedby={undefined}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement | null)?.closest?.('[data-slot="anchored-menu"]'))
              e.preventDefault();
          }}
          onMouseDown={onClose}
        >
          <DialogPrimitive.Title className="sr-only">
            {label ?? t('library-heading', { defaultValue: 'Library' })}
          </DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPortal>
    </DialogPrimitive.Root>
  );
}

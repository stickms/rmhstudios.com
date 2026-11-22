import { useRef } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { UnsentChoice } from '@/lib/device-data/sign-out';

/**
 * The keep-or-delete question for work that exists only on this device (Studio projects and samples, unsent drafts).
 * Three answers, so the shared two-button confirm cannot ask it. Keep takes the focus when the dialog opens (the
 * safe answer); Escape and the close button are Cancel. Lazy-loaded by `useDeviceSignOut`, so the Radix dialog stack
 * stays off every page until someone signs out with work to lose. Every string arrives as a prop, already translated.
 */
export interface UnsentWorkDialogProps {
  title: string;
  intro: string;
  lines: readonly string[];
  cancelLabel: string;
  keepLabel: string;
  deleteLabel: string;
  onChoose: (choice: UnsentChoice) => void;
}

export default function UnsentWorkDialog({
  title,
  intro,
  lines,
  cancelLabel,
  keepLabel,
  deleteLabel,
  onChoose,
}: UnsentWorkDialogProps) {
  const keepRef = useRef<HTMLButtonElement | null>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onChoose('cancel');
      }}
    >
      <DialogContent
        className="max-w-sm"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          keepRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{intro}</DialogDescription>
        </DialogHeader>
        <ul className="t-body border-t border-site-border">
          {lines.map((line) => (
            <li key={line} className="border-b border-site-border py-2">
              {line}
            </li>
          ))}
        </ul>
        {/* Three labelled actions do not fit a row in a small dialog: they stack at every width, as on a phone. */}
        <DialogFooter className="sm:flex-col-reverse sm:justify-start">
          <Button variant="default" onClick={() => onChoose('cancel')}>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={() => onChoose('delete')}>
            {deleteLabel}
          </Button>
          <Button ref={keepRef} variant="default" onClick={() => onChoose('keep')}>
            {keepLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

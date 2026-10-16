'use client';

import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { PatchNote } from './PatchNotesMount';

export function PatchNotesDialog({ note, onClose }: { note: PatchNote; onClose: () => void }) {
  const { t } = useTranslation('f-arcade');
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('patch-title', { defaultValue: 'What changed: {{title}}', title: note.title })}
          </DialogTitle>
          <DialogDescription>
            {t('patch-version', { defaultValue: 'Update {{version}}', version: note.version })}
          </DialogDescription>
        </DialogHeader>
        <p className="whitespace-pre-wrap break-words text-sm text-site-text">{note.body}</p>
        <DialogFooter>
          <Button variant="accent" onClick={onClose}>
            {t('patch-ok', { defaultValue: 'Got it' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

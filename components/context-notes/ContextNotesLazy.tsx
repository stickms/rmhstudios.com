'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';

const ContextNotes = lazy(() => import('./ContextNotes'));

/**
 * Posts with a visible note (`hasNote`) open their notes straight away; every
 * other post shows only a small button, so nothing is fetched until asked.
 */
export function ContextNotesLazy({ postId, hasNote }: { postId: string; hasNote?: boolean }) {
  const { t } = useTranslation('f-canvas');
  const [open, setOpen] = useState(!!hasNote);
  if (!open) {
    return (
      <Button size="xs" variant="ghost" className="mt-2" onClick={() => setOpen(true)}>
        <StickyNote />
        {t('notes-open', { defaultValue: 'Context notes' })}
      </Button>
    );
  }
  return (
    <Suspense fallback={<div className="glass-fill mt-2 min-h-16 rounded-site" aria-hidden />}>
      <ContextNotes postId={postId} />
    </Suspense>
  );
}

'use client';

import { useState } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { IconButton } from '@/components/ui/icon-button';
import type { SaveEntityType } from '@/lib/saves/types';

/**
 * SaveButton (§4) — a reusable save toggle for any content. Optimistic; the
 * caller passes the known `initialSaved` state. One tap saves to the default
 * "Saved" bucket (folder move happens from the /saves hub).
 */
export function SaveButton({
  entityType,
  entityId,
  initialSaved = false,
  size = 'icon-sm',
  variant = 'ghost',
}: {
  entityType: SaveEntityType;
  entityId: string;
  initialSaved?: boolean;
  size?: 'icon-xs' | 'icon-sm' | 'icon' | 'icon-lg';
  variant?: 'ghost' | 'outline' | 'secondary';
}) {
  const { t } = useTranslation('c-saves');
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const next = !saved;
    setBusy(true);
    setSaved(next);
    try {
      const res = await fetch('/api/saves', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId }),
      });
      if (!res.ok) throw new Error('save failed');
      if (next) toast.success(t('saved', { defaultValue: 'Saved' }));
    } catch {
      setSaved(!next);
      toast.error(t('error', { defaultValue: "Couldn't update saves" }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButton
      icon={saved ? BookmarkCheck : Bookmark}
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      size={size}
      variant={variant}
      className={saved ? 'text-site-accent' : undefined}
      label={saved ? t('unsave', { defaultValue: 'Remove from saves' }) : t('save', { defaultValue: 'Save' })}
    />
  );
}

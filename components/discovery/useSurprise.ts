'use client';

import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Shuffle } from 'lucide-react';
import { toast } from 'sonner';

let lastId: string | undefined;

/** A1 · Surprise me: fetch one random destination and go there. */
export function useSurprise(onGo?: () => void) {
  const { t } = useTranslation('f-discovery');
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/discovery/surprise${lastId ? `?not=${encodeURIComponent(lastId)}` : ''}`,
        {
          credentials: 'include',
        },
      );
      if (!res.ok) throw new Error(String(res.status));
      const pick = (await res.json()) as { id: string; href: string };
      lastId = pick.id;
      onGo?.();
      void navigate({ to: pick.href });
    } catch {
      toast.error(t('surprise-failed', { defaultValue: 'Nothing to show right now. Try again.' }));
    } finally {
      setBusy(false);
    }
  }, [navigate, onGo, t]);
  return { run, busy };
}

/** The command-palette entry for Surprise me. */
export function useSurpriseCommand(closePalette: () => void) {
  const { t } = useTranslation('f-discovery');
  const { run } = useSurprise(closePalette);
  return useMemo(
    () => ({
      id: 'action-surprise',
      label: t('surprise-label', { defaultValue: 'Surprise me' }),
      section: 'actions' as const,
      keywords: 'random surprise shuffle discover stumble game app book build post',
      icon: Shuffle,
      run: () => void run(),
    }),
    [t, run],
  );
}

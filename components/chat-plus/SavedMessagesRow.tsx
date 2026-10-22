'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Bookmark } from 'lucide-react';
import { toast } from 'sonner';
import { useIdleReady } from '@/hooks/useIdleReady';

/**
 * M2 — Saved Messages, pinned above the conversation list. It is a note-to-self
 * conversation: the row always shows (so the feature is discoverable) and the
 * conversation is only created the first time it is opened.
 */
export function SavedMessagesRow() {
  const { t } = useTranslation('f-messaging');
  const navigate = useNavigate();
  const idle = useIdleReady();
  const [opening, setOpening] = useState(false);
  const { data } = useQuery({
    queryKey: ['saved-messages'],
    enabled: idle,
    staleTime: 30_000,
    queryFn: async () => {
      const res = await fetch('/api/messages/saved', { credentials: 'include' });
      if (!res.ok) throw new Error('saved failed');
      return (await res.json()) as {
        saved: { conversationId: string; preview: string; previewKind: string } | null;
      };
    },
  });
  const saved = data?.saved ?? null;

  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      let id = saved?.conversationId;
      if (!id) {
        const res = await fetch('/api/messages/saved', { method: 'POST', credentials: 'include' });
        if (!res.ok) throw new Error('open failed');
        id = (await res.json()).conversationId as string;
      }
      void navigate({ to: `/messages/${id}` as string });
    } catch {
      toast.error(t('saved-open-failed', { defaultValue: 'Could not open Saved Messages' }));
    } finally {
      setOpening(false);
    }
  };

  const preview = saved?.preview
    ? saved.preview
    : saved?.previewKind === 'image'
      ? t('saved-preview-photo', { defaultValue: 'Photo' })
      : saved?.previewKind === 'gif'
        ? t('saved-preview-gif', { defaultValue: 'GIF' })
        : saved?.previewKind === 'voice'
          ? t('saved-preview-voice', { defaultValue: 'Voice note' })
          : t('saved-empty', { defaultValue: 'Notes, links and media just for you' });

  return (
    <button
      type="button"
      onClick={() => void open()}
      className="flex min-h-14 w-full items-center gap-3 border-b border-site-border px-4 py-3 text-left hover:bg-site-surface/50 focus-visible:ring-2 focus-visible:ring-site-accent"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
        <Bookmark className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-site-text">
          {t('saved-messages', { defaultValue: 'Saved Messages' })}
        </span>
        <span className="block truncate text-sm text-site-text-muted">{preview}</span>
      </span>
    </button>
  );
}

/** Header for the note-to-self conversation (replaces the person + call button). */
export function SavedMessagesHeader() {
  const { t } = useTranslation('f-messaging');
  return (
    <div className="flex items-center gap-2">
      <span className="flex size-8 items-center justify-center rounded-full bg-site-accent-dim text-site-accent">
        <Bookmark className="size-4" aria-hidden />
      </span>
      <div>
        <p className="font-display text-sm font-bold text-site-text">
          {t('saved-messages', { defaultValue: 'Saved Messages' })}
        </p>
        <p className="text-xs text-site-text-dim">
          {t('saved-subtitle', { defaultValue: 'Only you can see this' })}
        </p>
      </div>
    </div>
  );
}

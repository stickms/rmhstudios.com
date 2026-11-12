import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { api } from '@/lib/contract/client';
import { getSavedMessagesApi, openSavedMessagesApi } from '@/lib/messages/messages.contract';
import { toast } from 'sonner';
import { useIdleReady } from '@/hooks/useIdleReady';
import { SpineItem } from '@/components/ui/spine';

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
      return api(getSavedMessagesApi);
    },
  });
  const saved = data?.saved ?? null;

  const open = async () => {
    if (opening) return;
    setOpening(true);
    try {
      let id = saved?.conversationId;
      if (!id) {
        id = (await api(openSavedMessagesApi)).conversationId;
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
    <SpineItem dot={false} className="hover:bg-site-bg-subtle">
      <button
        type="button"
        onClick={() => void open()}
        className="block w-full text-start after:absolute after:inset-x-0 after:-inset-y-px after:content-['']"
      >
        <span className="t-body block font-medium text-site-text">
          {t('saved-messages', { defaultValue: 'Saved Messages' })}
        </span>
        <span className="t-body block truncate text-site-text-muted">{preview}</span>
      </button>
    </SpineItem>
  );
}

/** Header for the note-to-self conversation (replaces the person + call button). */
export function SavedMessagesHeader() {
  const { t } = useTranslation('f-messaging');
  return (
    <div className="flex items-center gap-2">
      <div>
        <p className="t-body font-semibold text-site-text">
          {t('saved-messages', { defaultValue: 'Saved Messages' })}
        </p>
        <p className="text-xs text-site-text-muted">
          {t('saved-subtitle', { defaultValue: 'Only you can see this' })}
        </p>
      </div>
    </div>
  );
}

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSlashCommands } from '@/components/chat-plus/useSlashCommands';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import type { ChatRef } from '@/lib/chat-plus/types';
import { MAX_IMAGES, buildPollPayload, type Msg, type PollDraft } from './group-chat-state';

/**
 * The group composer: draft text, pending GIF/images/poll, uploads, slash
 * commands and send (restoring the whole draft on failure). `useState` order
 * is what the characterization suite seeds by ordinal; keep it stable.
 */
export function useGroupComposer({
  id,
  chatRef,
  appendMessages,
}: {
  id: string;
  chatRef: ChatRef;
  appendMessages: (incoming: Msg[]) => void;
}) {
  const { t } = useTranslation('feed');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const insertEmoji = useEmojiInsert(inputRef, input, setInput);

  const slash = useSlashCommands({
    chat: chatRef,
    draft: input,
    setDraft: setInput,
    inputRef,
    onPosted: (raw) => appendMessages([raw as Msg]),
    onPickGif: (url) => {
      setGifUrl(url);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
  });

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - imageUrls.length;
    if (remaining <= 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      Array.from(files)
        .slice(0, remaining)
        .forEach((f) => form.append('images', f));
      const res = await fetch('/api/rmharks/image', { method: 'POST', body: form });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.urls))
          setImageUrls((prev) => [...prev, ...data.urls].slice(0, MAX_IMAGES));
      }
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  async function send() {
    const text = input.trim();
    const poll = buildPollPayload(pollDraft);
    const hasMedia = !!gifUrl || imageUrls.length > 0;
    if ((!text && !hasMedia && !poll) || sending || uploading) return;

    // M4: slash commands run instead of being sent as text.
    if (text.startsWith('/') && !hasMedia && !poll && (await slash.tryRun(text))) return;

    setSending(true);
    const pendingGif = gifUrl;
    const pendingImages = imageUrls;
    const pendingPollDraft = pollDraft;
    const restore = () => {
      setInput(text);
      setGifUrl(pendingGif);
      setImageUrls(pendingImages);
      setPollDraft(pendingPollDraft);
    };
    setInput('');
    setGifUrl(null);
    setImageUrls([]);
    setPollDraft(null);
    try {
      const res = await fetch(`/api/group-chats/${encodeURIComponent(id)}/messages`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(text ? { content: text } : {}),
          ...(pendingGif ? { gifUrl: pendingGif } : {}),
          ...(pendingImages.length ? { imageUrls: pendingImages } : {}),
          ...(poll ? { poll } : {}),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        appendMessages([data.message]);
      } else {
        // Restore the draft (poll included) on failure.
        restore();
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error || t('failed-to-send-message', { defaultValue: 'Failed to send message' }),
        );
      }
    } catch {
      restore();
      toast.error(t('failed-to-send-message', { defaultValue: 'Failed to send message' }));
    } finally {
      setSending(false);
    }
  }

  const canSend = (input.trim() || gifUrl || imageUrls.length > 0 || pollDraft) && !sending;

  return {
    input,
    setInput,
    sending,
    gifUrl,
    setGifUrl,
    imageUrls,
    setImageUrls,
    uploading,
    showGifPicker,
    setShowGifPicker,
    pollDraft,
    setPollDraft,
    attachOpen,
    setAttachOpen,
    imageInputRef,
    attachBtnRef,
    inputRef,
    insertEmoji,
    slash,
    handleImageFiles,
    send,
    canSend,
  };
}

export type GroupComposer = ReturnType<typeof useGroupComposer>;

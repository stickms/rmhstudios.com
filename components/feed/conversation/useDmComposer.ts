import { useCallback, useRef, useState } from 'react';
import type { Dispatch, KeyboardEvent, SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { useEmojiShortcodes } from '@/lib/emoji/use-emoji-shortcodes';
import { useMessageSuggestion } from '@/lib/useMessageSuggestion';
import { yieldToMain } from '@/lib/scheduler';
import { api } from '@/lib/contract/client';
import { serverError } from '@/lib/http';
import { uploadImagesApi } from '@/lib/media/upload.contract';
import { sendToConversationApi } from '@/lib/messages/message-actions.contract';
import { useSlashCommands } from '@/components/chat-plus/useSlashCommands';
import type { SentVoiceMessage } from '@/lib/messages/voice.contract';
import {
  MAX_DM_IMAGES,
  fromVoiceMessage,
  quotePrefix,
  suggestionContext,
  type Message,
  type OtherUser,
} from './conversation-state';

/**
 * The reply composer: draft text, pending GIF/images, the send itself with its
 * optimistic bubble and rollback, slash commands, emoji shortcodes, AI inline
 * suggestions, voice notes and swipe-to-reply quoting.
 */
export function useDmComposer({
  conversationId,
  session,
  messages,
  setMessages,
  historyIds,
  otherUser,
  scrollToBottom,
  chatRef,
  handleTyping,
  stopTyping,
}: {
  conversationId: string;
  session: { user: { id: string } } | null | undefined;
  messages: Message[];
  setMessages: Dispatch<SetStateAction<Message[]>>;
  historyIds: { current: Set<string> };
  otherUser: OtherUser | null;
  scrollToBottom: () => void;
  chatRef: { kind: 'dm'; id: string };
  handleTyping: () => void;
  stopTyping: () => void;
}) {
  const { t } = useTranslation('feed');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  // Pending rich media to attach to the next message.
  const [gifUrl, setGifUrl] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  // H2 — the voice composer takes over the whole composer row while it is open.
  const [voiceActive, setVoiceActive] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const attachBtnRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const insertEmoji = useEmojiInsert(inputRef, input, setInput);
  const shortcodes = useEmojiShortcodes({ ref: inputRef, value: input, onChange: setInput });

  // AI inline autocomplete, grounded in the recent DM conversation. Tombstoned
  // and voice-only messages contribute nothing, so a retracted line cannot be
  // fed back to the model that suggests the next one.
  const { suggestion, clear: clearSuggestion } = useMessageSuggestion({
    draft: input,
    context: suggestionContext(messages, session?.user.id, otherUser?.name),
  });

  // Swipe-to-reply (U11). DMs have no threaded replies, so a reply quotes the
  // message into the composer — the same thing people already did by hand.
  const quoteReply = useCallback((content: string) => {
    setInput((prev) => `${quotePrefix(content)}${prev}`);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const appendPosted = useCallback(
    (raw: unknown) => {
      const posted = raw as Message;
      historyIds.current.add(posted.id);
      setMessages((prev) => (prev.some((m) => m.id === posted.id) ? prev : [...prev, posted]));
      setTimeout(scrollToBottom, 50);
    },
    [scrollToBottom, historyIds, setMessages],
  );
  const slash = useSlashCommands({
    chat: chatRef,
    draft: input,
    setDraft: setInput,
    inputRef,
    onPosted: appendPosted,
    onPickGif: (url) => {
      setGifUrl(url);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
  });

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = MAX_DM_IMAGES - imageUrls.length;
    if (remaining <= 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      Array.from(files)
        .slice(0, remaining)
        .forEach((f) => form.append('images', f));
      const data = await api(uploadImagesApi, { body: form });
      if (Array.isArray(data.urls)) {
        setImageUrls((prev) => [...prev, ...data.urls].slice(0, MAX_DM_IMAGES));
      }
    } catch (e) {
      setError(
        serverError(e) || t('failed-to-upload-image', { defaultValue: 'Failed to upload image' }),
      );
    } finally {
      setUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleVoiceSent = useCallback(
    (message: SentVoiceMessage) => {
      historyIds.current.add(message.id);
      setMessages((prev) =>
        prev.some((m) => m.id === message.id) ? prev : [...prev, fromVoiceMessage(message)],
      );
      setTimeout(scrollToBottom, 50);
    },
    [scrollToBottom, historyIds, setMessages],
  );

  const handleSend = async () => {
    const content = input.trim();
    const pendingGif = gifUrl;
    const pendingImages = imageUrls;
    if ((!content && !pendingGif && pendingImages.length === 0) || sending || uploading) return;

    // M4: a slash command is run (by the server, or locally for /remind and
    // /gif) instead of being sent as text.
    if (content.startsWith('/') && !pendingGif && pendingImages.length === 0) {
      if (await slash.tryRun(content)) return;
    }

    setSending(true);
    setError(null);

    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      content,
      senderId: session!.user.id,
      read: false,
      createdAt: new Date().toISOString(),
      gifUrl: pendingGif,
      imageUrls: pendingImages,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setInput('');
    shortcodes.dismiss();
    setGifUrl(null);
    setImageUrls([]);
    clearSuggestion();
    stopTyping();
    setTimeout(scrollToBottom, 50);

    // OPT-34. Everything above is the bubble appearing and the composer
    // emptying — eight state updates plus a typing-stop emit, one React commit,
    // and the only thing the sender is waiting to see. Everything below is a
    // POST whose body has to be stringified first (a message can carry several
    // image URLs). Yielding here puts the render in its own task so the bubble
    // lands, then sends. The scroll-to-bottom is left on its own 50ms timer, so
    // no layout read moves across this boundary; the Enter-to-send path calls
    // `preventDefault()` in `handleKeyDown` *before* invoking this function, so
    // the yield cannot cost it its cancelability.
    await yieldToMain();

    try {
      const data = await api(sendToConversationApi, {
        params: { conversationId },
        body: {
          content,
          ...(pendingGif ? { gifUrl: pendingGif } : {}),
          ...(pendingImages.length ? { imageUrls: pendingImages } : {}),
        },
      });
      // The optimistic bubble already animated in; the temp→real id swap
      // remounts it, so mark the real id as history to avoid a second entrance.
      historyIds.current.add(data.message.id);
      // Replace optimistic message with real one
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data.message : m)));
    } catch (err) {
      // Remove the optimistic message and restore the draft + media.
      setError(
        serverError(err) || t('failed-to-send-message', { defaultValue: 'Failed to send message' }),
      );
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(content);
      setGifUrl(pendingGif);
      setImageUrls(pendingImages);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return {
    input,
    setInput,
    sending,
    error,
    showGifPicker,
    setShowGifPicker,
    attachOpen,
    setAttachOpen,
    gifUrl,
    setGifUrl,
    imageUrls,
    setImageUrls,
    uploading,
    voiceActive,
    setVoiceActive,
    inputRef,
    attachBtnRef,
    imageInputRef,
    insertEmoji,
    shortcodes,
    slash,
    suggestion,
    clearSuggestion,
    quoteReply,
    appendPosted,
    handleImageFiles,
    handleVoiceSent,
    handleSend,
    handleKeyDown,
    handleTyping,
    stopTyping,
  };
}

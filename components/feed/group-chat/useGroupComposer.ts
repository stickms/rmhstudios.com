import {
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import { useSlashCommands } from '@/components/chat-plus/useSlashCommands';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { api } from '@/lib/contract/client';
import { errorField, serverError } from '@/lib/http';
import { useMessageImageAlts } from '@/components/feed/useMessageImageAlts';
import { sendGroupMessageApi } from '@/lib/group-chat/group-chat.contract';
import { uploadImagesApi } from '@/lib/media/upload.contract';
import type { ChatRef } from '@/lib/chat-plus/types';
import {
  MAX_IMAGES,
  buildPollPayload,
  type PollDraft,
} from './group-chat-state';
import type { Msg } from '@/lib/group-chat/types';

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
  appendMessages: (
    incoming: Msg[],
  ) => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'feed',
    );
  const [
    input,
    setInput,
  ] =
    useState(
      '',
    );
  const [
    sending,
    setSending,
  ] =
    useState(
      false,
    );
  const [
    gifUrl,
    setGifUrl,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const [
    imageUrls,
    setImageUrls,
  ] =
    useState<
      string[]
    >(
      [],
    );
  const [
    uploading,
    setUploading,
  ] =
    useState(
      false,
    );
  const [
    showGifPicker,
    setShowGifPicker,
  ] =
    useState(
      false,
    );
  const [
    pollDraft,
    setPollDraft,
  ] =
    useState<PollDraft | null>(
      null,
    );
  const [
    attachOpen,
    setAttachOpen,
  ] =
    useState(
      false,
    );
  const imageInputRef =
    useRef<HTMLInputElement>(
      null,
    );
  const attachBtnRef =
    useRef<HTMLButtonElement>(
      null,
    );
  const inputRef =
    useRef<HTMLTextAreaElement>(
      null,
    );
  const insertEmoji =
    useEmojiInsert(
      inputRef,
      input,
      setInput,
    );

  const slash =
    useSlashCommands(
      {
        chat: chatRef,
        draft:
          input,
        setDraft:
          setInput,
        inputRef,
        onPosted:
          (
            raw,
          ) =>
            appendMessages(
              [
                raw as Msg,
              ],
            ),
        onPickGif:
          ({
            url,
            description,
          }) => {
            setGifUrl(
              url,
            );
            setGifAlt(
              description,
            );
            setTimeout(
              () =>
                inputRef.current?.focus(),
              0,
            );
          },
      },
    );

  // Descriptions for the pending images; with "Require image descriptions" on,
  // a missing one blocks sending (the server refuses the same message).
  const imageAlts =
    useMessageImageAlts(
      imageUrls,
    );
  // The pending GIF's description (sprint 06 #15), prefilled from the picker. Declared after the hook the
  // characterization suite counts up to, so its ordinals do not move.
  const [
    gifAlt,
    setGifAlt,
  ] =
    useState(
      '',
    );

  const handleImageFiles =
    async (
      files: FileList | null,
    ) => {
      if (
        !files ||
        files.length ===
          0
      )
        return;
      const remaining =
        MAX_IMAGES -
        imageUrls.length;
      if (
        remaining <=
        0
      )
        return;
      setUploading(
        true,
      );
      try {
        const form =
          new FormData();
        Array.from(
          files,
        )
          .slice(
            0,
            remaining,
          )
          .forEach(
            (
              f,
            ) =>
              form.append(
                'images',
                f,
              ),
          );
        const data =
          await api(
            uploadImagesApi,
            {
              body: form,
            },
          ).catch(
            () =>
              null,
          );
        if (
          data &&
          Array.isArray(
            data.urls,
          )
        )
          setImageUrls(
            (
              prev,
            ) =>
              [
                ...prev,
                ...data.urls,
              ].slice(
                0,
                MAX_IMAGES,
              ),
          );
      } finally {
        setUploading(
          false,
        );
        if (
          imageInputRef.current
        )
          imageInputRef.current.value =
            '';
      }
    };

  async function send() {
    const text =
      input.trim();
    const poll =
      buildPollPayload(
        pollDraft,
      );
    const hasMedia =
      !!gifUrl ||
      imageUrls.length >
        0;
    if (
      (!text &&
        !hasMedia &&
        !poll) ||
      sending ||
      uploading ||
      imageAlts
        .missing
        .length >
        0
    )
      return;

    // M4: slash commands run instead of being sent as text.
    if (
      text.startsWith(
        '/',
      ) &&
      !hasMedia &&
      !poll &&
      (await slash.tryRun(
        text,
      ))
    )
      return;

    setSending(
      true,
    );
    const pendingGif =
      gifUrl;
    const pendingGifAlt =
      gifAlt;
    const pendingImages =
      imageUrls;
    const pendingAlts =
      imageAlts.alts;
    const pendingPollDraft =
      pollDraft;
    const restore =
      () => {
        setInput(
          text,
        );
        setGifUrl(
          pendingGif,
        );
        setGifAlt(
          pendingGifAlt,
        );
        setImageUrls(
          pendingImages,
        );
        setPollDraft(
          pendingPollDraft,
        );
      };
    setInput(
      '',
    );
    setGifUrl(
      null,
    );
    setGifAlt(
      '',
    );
    setImageUrls(
      [],
    );
    setPollDraft(
      null,
    );
    try {
      const data =
        await api(
          sendGroupMessageApi,
          {
            params:
              {
                id,
              },
            body: {
              ...(text
                ? {
                    content:
                      text,
                  }
                : {}),
              ...(pendingGif
                ? {
                    gifUrl:
                      pendingGif,
                    ...(pendingGifAlt.trim()
                      ? {
                          gifAlt:
                            pendingGifAlt.trim(),
                        }
                      : {}),
                  }
                : {}),
              ...(pendingImages.length
                ? {
                    imageUrls:
                      pendingImages,
                    imageAlts:
                      pendingAlts,
                  }
                : {}),
              ...(poll
                ? {
                    poll,
                  }
                : {}),
            },
          },
        );
      appendMessages(
        [
          data.message,
        ],
      );
    } catch (e) {
      // The server's "Require image descriptions" check: turn the composer's own
      // check on, so the images that lack one are named.
      if (
        errorField(
          e,
          'code',
        ) ===
        'alt-text-required'
      )
        imageAlts.markRequired();
      // Restore the draft (poll included) on failure.
      restore();
      toast.error(
        serverError(
          e,
        ) ||
          t(
            'failed-to-send-message',
            {
              defaultValue:
                'Failed to send message',
            },
          ),
      );
    } finally {
      setSending(
        false,
      );
    }
  }

  const canSend =
    (input.trim() ||
      gifUrl ||
      imageUrls.length >
        0 ||
      pollDraft) &&
    !sending &&
    imageAlts
      .missing
      .length ===
      0;

  return {
    input,
    setInput,
    sending,
    gifUrl,
    setGifUrl,
    gifAlt,
    setGifAlt,
    imageUrls,
    setImageUrls,
    imageAlts,
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

export type GroupComposer =
  ReturnType<
    typeof useGroupComposer
  >;

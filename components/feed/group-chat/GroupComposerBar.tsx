/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ImagePlay, ImagePlus, Loader2, Plus } from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { ChecklistComposer } from '@/components/chat-plus/ChecklistComposer';
import { ComposerLengthCounter } from '@/components/messages/ComposerLengthCounter';
import { ScheduledStrip } from '@/components/messages/ScheduledStrip';
import { SendLaterMenu } from '@/components/messages/SendLaterMenu';
import { useSavedReplies } from '@/components/messages/useSavedReplies';
import { MESSAGE_MAX_LENGTH } from '@/lib/messages/edit-policy';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import type { ChatRef } from '@/lib/chat-plus/types';
import { MentionTextarea } from '../MentionTextarea';
import { useMentionPicker } from './MentionPicker';
import { MAX_IMAGES, memberSuggestions } from './group-chat-state';
import type { Group, Msg } from '@/lib/group-chat/types';
import type { GroupComposer } from './useGroupComposer';

/** The composer row: attach (+) menu, emoji, checklist, text field and send. */
export function GroupComposerBar({
  composer,
  group,
  chatRef,
  appendMessages,
  currentUserId,
}: {
  composer: GroupComposer;
  group: Group;
  chatRef: ChatRef;
  appendMessages: (incoming: Msg[]) => void;
  currentUserId: string;
}) {
  const { t } = useTranslation('feed');
  const {
    input,
    setInput,
    sending,
    gifUrl,
    setGifUrl,
    gifAlt,
    imageUrls,
    setImageUrls,
    imageAlts,
    uploading,
    pollDraft,
    attachOpen,
    setAttachOpen,
    setShowGifPicker,
    setPollDraft,
    imageInputRef,
    attachBtnRef,
    inputRef,
    insertEmoji,
    slash,
    handleImageFiles,
    send,
    canSend,
  } = composer;
  const savedReplies = useSavedReplies({
    chatKind: 'group',
    draft: input,
    setDraft: setInput,
    inputRef,
    maxLength: MESSAGE_MAX_LENGTH,
    buttonClassName: 'h-9',
  });
  // `@` offers the group's members (s07-05); `#` and `:` stay with the text field.
  const mentionPicker = useMentionPicker({
    members: group.members,
    viewerId: currentUserId,
    draft: input,
    setDraft: setInput,
    inputRef,
    maxLength: MESSAGE_MAX_LENGTH,
  });
  const suggestions = useMemo(() => memberSuggestions(group.members), [group.members]);
  // A poll is not schedulable; text, a GIF and images are.
  const canSchedule =
    !!(input.trim() || gifUrl || imageUrls.length > 0) &&
    !pollDraft &&
    !sending &&
    !uploading &&
    imageAlts.missing.length === 0;
  return (
    <>
    <ScheduledStrip
      chatId={group.id}
      onDelivered={(message) => appendMessages([message as Msg])}
    />
    <div className="conversation__composer">
      <div className="flex flex-wrap items-end gap-2">
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleImageFiles(e.target.files)}
        />
        {/* Attach (+) menu — image, GIF, poll. Mirrors the rmhark composer. */}
        <div className="relative">
          <button
            ref={attachBtnRef}
            type="button"
            onClick={() => setAttachOpen((v) => !v)}
            aria-label={t('add-to-message', { defaultValue: 'Add to message' })}
            aria-haspopup="menu"
            aria-expanded={attachOpen}
            className="flex h-9 w-9 items-center justify-center rounded-full text-site-text-muted hover:bg-site-accent/10 hover:text-site-accent disabled:opacity-40"
            disabled={uploading}
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-5 w-5" />
            )}
          </button>
          <AnchoredMenu
            open={attachOpen}
            onClose={() => setAttachOpen(false)}
            anchorRef={attachBtnRef}
            label={t('add-to-message', { defaultValue: 'Add to message' })}
            side="top"
            align="start"
            className="w-40"
          >
            <MenuItem
              icon={ImagePlus}
              disabled={imageUrls.length >= MAX_IMAGES}
              onSelect={() => {
                setAttachOpen(false);
                imageInputRef.current?.click();
              }}
            >
              {t('menu-add-image', { defaultValue: 'Add Image' })}
            </MenuItem>
            <MenuItem
              icon={ImagePlay}
              onSelect={() => {
                setAttachOpen(false);
                setShowGifPicker((v) => !v);
              }}
            >
              {t('menu-add-gif', { defaultValue: 'Add GIF' })}
            </MenuItem>
            <MenuItem
              icon={BarChart3}
              onSelect={() => {
                setAttachOpen(false);
                setPollDraft((p) => (p ? null : { question: '', options: ['', ''] }));
              }}
            >
              {t('menu-create-poll', { defaultValue: 'Create Poll' })}
            </MenuItem>
          </AnchoredMenu>
        </div>
        <EmojiPickerButton
          direction="up"
          onSelect={insertEmoji}
          className="flex h-9 items-center"
        />
        {savedReplies.menu}
        <ChecklistComposer
          chat={chatRef}
          onPosted={(raw) => appendMessages([raw as Msg])}
          disabled={sending}
        />
        <div className="relative order-first min-w-full flex-1 sm:order-none sm:min-w-0">
          {slash.popover}
          {mentionPicker.popover}
          {savedReplies.popover}
          <MentionTextarea
            ref={inputRef}
            value={input}
            onChange={setInput}
            priorityUsers={suggestions}
            skipAtTrigger
            onKeyDown={(e) => {
              if (mentionPicker.onKeyDown(e)) return;
              if (savedReplies.onKeyDown(e)) return;
              if (slash.onKeyDown(e)) return;
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t('message-placeholder', {
              name: group.name,
              defaultValue: 'Message {{name}}…',
            })}
            rows={1}
            maxLength={MESSAGE_MAX_LENGTH}
            {...savedReplies.fieldProps}
            {...(mentionPicker.open ? mentionPicker.fieldProps : {})}
            className="max-h-32 w-full resize-none rounded-site surface-field px-3 py-2 text-sm text-site-text"
          />
          <ComposerLengthCounter used={input.length} />
        </div>
        <Button variant="primary" disabled={!canSend} onClick={send} className="h-9">
          {t('conversation-send', { defaultValue: 'Send' })}
        </Button>
        <SendLaterMenu
          chatId={group.id}
          disabled={!canSchedule}
          getDraft={() => ({ content: input, gifUrl, gifAlt, imageUrls, imageAlts: imageAlts.alts })}
          onScheduled={() => {
            setInput('');
            setGifUrl(null);
            setImageUrls([]);
          }}
          className="h-9"
        />
      </div>
    </div>
    </>
  );
}

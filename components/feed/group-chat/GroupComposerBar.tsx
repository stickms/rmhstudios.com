/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ImagePlay, ImagePlus, Loader2, Plus, Send } from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { MenuItem } from '@/components/ui/menu';
import { ChecklistComposer } from '@/components/chat-plus/ChecklistComposer';
import { ComposerLengthCounter } from '@/components/messages/ComposerLengthCounter';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import type { ChatRef } from '@/lib/chat-plus/types';
import { MentionTextarea } from '../MentionTextarea';
import { MAX_IMAGES, memberSuggestions } from './group-chat-state';
import type { Group, Msg } from '@/lib/group-chat/types';
import type { GroupComposer } from './useGroupComposer';

/** The composer row: attach (+) menu, emoji, checklist, text field and send. */
export function GroupComposerBar({
  composer,
  group,
  chatRef,
  appendMessages,
}: {
  composer: GroupComposer;
  group: Group;
  chatRef: ChatRef;
  appendMessages: (incoming: Msg[]) => void;
}) {
  const { t } = useTranslation('feed');
  const {
    input,
    setInput,
    sending,
    imageUrls,
    uploading,
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
  // Chat members get priority in @-mention autocomplete.
  const suggestions = useMemo(() => memberSuggestions(group.members), [group.members]);
  return (
    <div className="border-t border-site-border px-4 py-3">
      <div className="flex items-end gap-2">
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
        <ChecklistComposer
          chat={chatRef}
          onPosted={(raw) => appendMessages([raw as Msg])}
          disabled={sending}
        />
        <div className="flex-1 min-w-0">
          {slash.popover}
          <MentionTextarea
            ref={inputRef}
            value={input}
            onChange={setInput}
            priorityUsers={suggestions}
            onKeyDown={(e) => {
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
            maxLength={2000}
            className="max-h-32 w-full resize-none rounded-site glass-inset px-3 py-2 text-sm text-site-text outline-none focus:border-site-accent"
          />
          <ComposerLengthCounter used={input.length} />
        </div>
        <Button variant="default" size="sm" disabled={!canSend} onClick={send} className="h-9">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

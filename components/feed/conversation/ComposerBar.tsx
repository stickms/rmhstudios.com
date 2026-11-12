/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { Loader2, ImagePlus, ImagePlay, X, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem } from '@/components/ui/menu';
import { GifPicker } from '@/components/feed/GifPicker';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { ComposerLengthCounter } from '@/components/messages/ComposerLengthCounter';
import { VoiceComposer } from '@/components/voice/VoiceComposer';
import { ChecklistComposer } from '@/components/chat-plus/ChecklistComposer';
import { GhostTextArea } from '../GhostTextArea';
import { SmartReplies } from '../SmartReplies';
import { MAX_DM_IMAGES } from './conversation-state';
import type { useDmComposer } from './useDmComposer';

/**
 * The thread's bottom edge: the error banner, then the composer row — pending
 * media, suggested replies, the text field, attach menu, voice and send.
 */
export function ComposerBar({
  conversationId,
  chatRef,
  composer: c,
  replyToMessageId,
}: {
  conversationId: string;
  chatRef: { kind: 'dm'; id: string };
  composer: ReturnType<typeof useDmComposer>;
  /** The message suggested replies would answer, if any. */
  replyToMessageId: string | null;
}) {
  const { t } = useTranslation('feed');
  const {
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
    appendPosted,
    handleImageFiles,
    handleVoiceSent,
    handleSend,
    handleKeyDown,
    handleTyping,
    stopTyping,
  } = c;

  return (
    <>
      {/* Error banner */}
      {error && (
        <p className="t-body border-t border-site-border py-2 text-site-danger" role="alert">
          {error}
        </p>
      )}

      {/* Input. `--safe-bottom` keeps the send row clear of the home indicator and
          iOS Safari's floating tab bar — this row is the bottom edge of the column
          now that the column stops at the viewport. */}
      <div className="conversation__composer">
        {showGifPicker && !voiceActive && (
          <GifPicker
            className="mx-2 mb-2"
            onClose={() => setShowGifPicker(false)}
            onSelect={(u) => {
              setGifUrl(u);
              setShowGifPicker(false);
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
          />
        )}

        {/* Pending media preview */}
        {!voiceActive && (imageUrls.length > 0 || gifUrl) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {imageUrls.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="h-20 w-20 rounded-site-sm object-cover" />
                <button
                  type="button"
                  aria-label={t('remove-image', { defaultValue: 'Remove image' })}
                  onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-site-media-scrim-strong p-0.5 text-site-media-ink hover:bg-site-media-scrim-hover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {gifUrl && (
              <div className="relative">
                <img src={gifUrl} alt="" className="h-20 w-auto rounded-site-sm" />
                <button
                  type="button"
                  aria-label={t('remove-gif', { defaultValue: 'Remove GIF' })}
                  onClick={() => setGifUrl(null)}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-site-media-scrim-strong p-0.5 text-site-media-ink hover:bg-site-media-scrim-hover"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        )}

        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleImageFiles(e.currentTarget.files)}
        />
        {/* Suggested replies. Gated on the thread ending with THEIR message: a
            thread waiting on them has nothing to suggest a reply to, and a
            media-only or unsent message has no text to answer. Hidden while the
            voice composer is open — these chips fill the text field, which is
            not on screen then. */}
        {!voiceActive && (
          <SmartReplies
            conversationId={conversationId}
            replyToMessageId={replyToMessageId}
            draft={input}
            onPick={(reply) => {
              setInput(reply);
              inputRef.current?.focus();
            }}
          />
        )}

        <div className="flex flex-wrap items-end gap-2">
          {/* While recording or reviewing, the voice composer IS the composer —
              a text field beside a live recording is a second thing to look at
              and does not fit at 360px anyway. */}
          {!voiceActive && (
            <>
              <div className="relative min-w-full flex-1 sm:min-w-0">
                <GhostTextArea
                  ref={inputRef}
                  value={input}
                  suggestion={suggestion}
                  onAcceptSuggestion={() => {
                    setInput((v) => v + suggestion);
                    clearSuggestion();
                  }}
                  onChange={(e) => {
                    shortcodes.onValueChange(e.target.value);
                    if (e.target.value.trim()) handleTyping();
                    else stopTyping();
                  }}
                  onBlur={stopTyping}
                  onKeyDown={(e) => {
                    if (slash.onKeyDown(e)) return;
                    if (shortcodes.onKeyDown(e)) return;
                    handleKeyDown(e);
                  }}
                  placeholder={t('type-a-message', { defaultValue: 'Type a message...' })}
                  rows={1}
                  maxLength={2000}
                  className="glass-inset text-site-text placeholder:text-site-text-muted text-sm rounded-site px-3 py-2 resize-none max-h-32 overflow-y-auto"
                  style={{ minHeight: '42px' }}
                />
                {shortcodes.menu}
                {slash.popover}
                <ComposerLengthCounter used={input.length} />
              </div>
              <ChecklistComposer chat={chatRef} onPosted={appendPosted} disabled={sending} />
              <EmojiPickerButton
                direction="up"
                onSelect={insertEmoji}
                className="flex h-[42px] shrink-0 items-center"
              />
              {/* Attach (+) menu — image, GIF. Mirrors the rmhark composer. */}
              <div className="relative shrink-0">
                <button
                  ref={attachBtnRef}
                  type="button"
                  aria-label={t('add-to-message', { defaultValue: 'Add to message' })}
                  aria-haspopup="menu"
                  aria-expanded={attachOpen}
                  onClick={() => setAttachOpen((v) => !v)}
                  disabled={uploading}
                  className="h-[42px] rounded-site px-3 text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-accent disabled:opacity-50"
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
                  className="w-40"
                >
                  <MenuItem
                    icon={ImagePlus}
                    disabled={imageUrls.length >= MAX_DM_IMAGES}
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
                </AnchoredMenu>
              </div>
            </>
          )}

          <VoiceComposer
            conversationId={conversationId}
            onSent={handleVoiceSent}
            onActiveChange={setVoiceActive}
            disabled={sending || uploading}
          />

          {!voiceActive && (
            <Button
              variant="primary"
              disabled={(!input.trim() && !gifUrl && imageUrls.length === 0) || sending}
              onClick={handleSend}
              className="h-[42px]"
            >
              {t('conversation-send', { defaultValue: 'Send' })}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}

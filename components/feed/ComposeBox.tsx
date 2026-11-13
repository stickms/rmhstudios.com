import { lazy, Suspense, useState, useRef, useEffect, useCallback } from 'react';
import { ImagePlus, Check } from 'lucide-react';
import { AIGenerateButton } from './AIGenerateButton';
import { AIImageButton } from './AIImageButton';
import { ComposeAssist } from './ComposeAssist';
import { TagSuggest } from './TagSuggest';
import { MentionTextarea } from './MentionTextarea';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { useSession, useResolvedUser } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { ScheduleControl } from '@/components/ui/schedule-control';
import { useSmartPaste } from '@/hooks/useSmartPaste';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';
import { Link } from '@tanstack/react-router';
import { TakeChip } from './TakeCompose';
import { AltTextNotice, useRequireAltText } from './AltTextNotice';
import {
  PostsPlusChips,
  PostsPlusDialogs,
  usePostsPlusCompose,
} from '@/components/posts-plus/PostsPlusCompose';
import {
  CodeEmbedChip,
  CodeEmbedDialog,
  useCodeEmbedCompose,
} from '@/components/code-embed/CodeEmbedCompose';
import { missingAltIndexes } from '@/lib/feed/alt-text';
import { useTranslation } from 'react-i18next';
import {
  readComposeDraft,
  clearComposeDraft,
  useComposeDraftAutosave,
  type ComposeDraft,
} from '@/hooks/useComposeDraft';
import { ComposerAvatar, ContentWarningPill, UnlockPricePill } from './compose/ComposeChips';
import { DraftRestoreBanner } from './compose/DraftRestoreBanner';
import { PollEditor } from './compose/PollEditor';
import { GifAttachment } from './compose/GifAttachment';
import { ImagePreviewStrip } from './compose/ImagePreviewStrip';
import { ComposeMenu } from './compose/ComposeMenu';
import { AudiencePickerDialog, ReplyPickerDialog } from './compose/PickerDialogs';
import { AltTextDialog, CheatSheetDialog, UnlockPriceDialog } from './compose/ComposeDialogs';
import { useComposeUploads } from './compose/useComposeUploads';
import { useComposeSubmit } from './compose/useComposeSubmit';
import {
  MAX_IMAGES,
  appendImages,
  buildComposeBody,
  buildOptimisticItem,
  computeCanSubmit,
  counterToneClass,
  emptyPoll,
  isComposerEmpty,
  isGifPostable,
  isPollPostable,
  prependFailedContent,
  removeAt,
  threadBlockedBy,
  type Attachment,
  type AudienceValue,
  type PollDraft,
  type ReplyControlValue,
  type SessionUserShape,
} from './compose/compose-state';

// X1: the "Post as thread" preview + splitter. Mounted only once a draft is
// longer than one post, so it is a separate chunk almost nobody downloads.
const ThreadPostPanel = lazy(() => import('./ThreadPostPanel'));

export function ComposeBox({
  communityId,
  onPosted,
  extraBody,
  initialContent = '',
  openMenuOnMount = false,
  menuTrigger = 'plus',
}: {
  /** Text the composer starts with: what was typed in the home feed's one-line row before it was expanded. */
  initialContent?: string;
  /** Open the options menu as the composer mounts: the home row's three dots expand it and show the options at once. */
  openMenuOnMount?: boolean;
  /** The options menu's trigger: the plus sign, or the three dots the home row expanded from. */
  menuTrigger?: 'plus' | 'dots';
  communityId?: string;
  onPosted?: (item: any) => void;
  /** Extra fields merged into the create body (community flair / challenge entry). */
  extraBody?: Record<string, unknown>;
} = {}) {
  const [content, setContent] = useState(initialContent);
  const [audience, setAudience] = useState<AudienceValue>('PUBLIC');
  const [replyControl, setReplyControl] = useState<ReplyControlValue>('EVERYONE');
  const [replyOpen, setReplyOpen] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [isTake, setIsTake] = useState(false); // X6: readers vote agree/disagree
  const codeEmbed = useCodeEmbedCompose(); // F14 runnable snippet
  const postsPlus = usePostsPlusCompose(); // X8 expiry, X5 series, X4 QOTD tag, Z7 capsule
  const [pollDuration, setPollDuration] = useState(0); // hours; 0 = no limit
  const [unlockPrice, setUnlockPrice] = useState(''); // coins to unlock;''= free
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [menuOpen, setMenuOpen] = useState(openMenuOnMount);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [poll, setPoll] = useState<PollDraft>(emptyPoll);
  const [gifUrl, setGifUrl] = useState('');
  const {
    imageUrls,
    setImageUrls,
    imageAlts,
    setImageAlts,
    altEditIndex,
    setAltEditIndex,
    imageError,
    setImageError,
    uploadingCount,
    uploadEpochRef,
    uploadImages,
    handleImageFiles,
    explainRejection,
  } = useComposeUploads();
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(''); // datetime-local value
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<ComposeDraft | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false); // unlock-price popover
  const [showCheatSheet, setShowCheatSheet] = useState(false); // markdown cheat sheet
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const insertEmoji = useEmojiInsert(textareaRef, content, setContent);

  // Autosave the draft text so a refresh/navigation can't eat an unsent post;
  // offer any stored draft back once on mount.
  useComposeDraftAutosave(content, gifUrl);
  useEffect(() => {
    setPendingDraft(readComposeDraft());
  }, []);

  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  // HARD-R and above can generate images. Server re-enforces this.
  const userTier = (session?.user as { tier?: string } | undefined)?.tier;
  const canGenerateImage =
    userTier === 'starter' || userTier === 'pro' || userTier === 'enterprise';
  const { resolved: resolvedUser } = useResolvedUser();
  const remaining = MAX_RMHARK_LENGTH - content.length;

  // Outside-press dismissal, Escape, and focus return all live in AnchoredMenu —
  // they have to, now that the panel is portaled away from this subtree and a
  // "did the press land inside the menu?" test can no longer be a `contains`
  // check on the trigger's wrapper.
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const hasPoll = isPollPostable(attachment, poll);
  const hasGif = isGifPostable(attachment, gifUrl);
  const hasImages = imageUrls.length > 0;
  const hasContent = content.trim().length > 0;
  // X12: with "Require alt text" on, every attached image needs a description.
  const requireAlt = useRequireAltText(hasImages);
  const missingAlt = requireAlt ? missingAltIndexes(imageUrls, imageAlts) : [];
  const canSubmit = computeCanSubmit({
    hasContent,
    hasPoll,
    hasGif,
    hasImages,
    hasCodeEmbed: !!codeEmbed.embed,
    remaining,
    submitting,
    uploadingCount,
    missingAltCount: missingAlt.length,
  });

  const smartPaste = useSmartPaste({
    onFiles: (files) => void uploadImages(files),
    onRejected: explainRejection,
    selectionRef: textareaRef,
    // Read at gesture time: the number of free slots changes as images attach.
    screen: () => ({ remainingSlots: MAX_IMAGES - imageUrls.length }),
    disabled: submitting,
    // Pasting a URL over selected text links it, the way every editor does.
    onLink: (url, selection) => {
      const el = textareaRef.current;
      if (!el || el.selectionStart === null || el.selectionEnd === null) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const linked = `[${selection}](${url})`;
      setContent((prev) => prev.slice(0, start) + linked + prev.slice(end));
      requestAnimationFrame(() => {
        el.focus();
        const caret = start + linked.length;
        el.setSelectionRange(caret, caret);
      });
    },
  });

  const buildBody = (): Record<string, unknown> =>
    buildComposeBody({
      content,
      hasPoll,
      poll,
      pollDuration,
      hasGif,
      gifUrl,
      hasImages,
      imageUrls,
      imageAlts,
      audience,
      isSensitive,
      isTake,
      replyControl,
      unlockPrice,
      communityId,
      extraBody,
      featureFields: [postsPlus.bodyFields, codeEmbed.bodyFields],
    });

  const resetForm = () => {
    uploadEpochRef.current += 1;
    clearComposeDraft();
    setContent('');
    setAudience('PUBLIC');
    setReplyControl('EVERYONE');
    setReplyOpen(false);
    setIsSensitive(false);
    setIsTake(false);
    setUnlockPrice('');
    setAttachment(null);
    setPoll(emptyPoll());
    setGifUrl('');
    setImageUrls([]);
    setImageAlts([]);
    setAltEditIndex(null);
    setImageError(null);
    setShowSchedule(false);
    setScheduleAt('');
    setShowPriceModal(false);
    setShowCheatSheet(false);
    postsPlus.reset();
    codeEmbed.reset();
  };

  // A snapshot of the composer's contents, so an optimistic post that fails to
  // save can be restored into the box for a one-tap retry.
  const snapshotDraft = () => ({
    content,
    audience,
    replyControl,
    isSensitive,
    isTake,
    codeEmbed: codeEmbed.embed,
    unlockPrice,
    attachment,
    poll,
    gifUrl,
    imageUrls,
    imageAlts,
    postsPlus: { ttl: postsPlus.ttl, series: postsPlus.series, answering: postsPlus.answering },
  });
  const restoreDraft = (d: ReturnType<typeof snapshotDraft>) => {
    setContent(d.content);
    setAudience(d.audience);
    setReplyControl(d.replyControl);
    setIsSensitive(d.isSensitive);
    setIsTake(d.isTake);
    codeEmbed.setEmbed(d.codeEmbed);
    setUnlockPrice(d.unlockPrice);
    setAttachment(d.attachment);
    setPoll(d.poll);
    setGifUrl(d.gifUrl);
    setImageUrls(d.imageUrls);
    setImageAlts(d.imageAlts);
    postsPlus.restore(d.postsPlus);
  };
  // Whether the composer is still as `resetForm` left it. A failed optimistic
  // post restores its draft only into an empty box; if the user has started the
  // next post meanwhile, the failed text is prepended instead of overwriting it.
  const composerEmptyRef = useRef(true);
  useEffect(() => {
    composerEmptyRef.current = isComposerEmpty({
      content,
      attachment,
      imageCount: imageUrls.length,
      gifUrl,
      hasCodeEmbed: !!codeEmbed.embed,
    });
  });
  const restoreFailedDraft = (d: ReturnType<typeof snapshotDraft>) => {
    if (composerEmptyRef.current) {
      restoreDraft(d);
      return;
    }
    if (d.content.trim()) {
      setContent((cur) => prependFailedContent(d.content, cur));
    }
  };

  const { handleSubmit, handleThreadPosted, handleSaveScheduled } = useComposeSubmit({
    canSubmit,
    buildBody,
    buildOptimisticItem: (id) =>
      buildOptimisticItem({
        id,
        content,
        sessionUser: session!.user as SessionUserShape,
        resolvedUser: resolvedUser ?? null,
        hasImages,
        imageUrls,
        imageAlts,
        isSensitive,
        isTake,
        replyControl,
        hasGif,
        gifUrl,
        hasPoll,
        poll,
        unlockPrice,
      }),
    snapshotDraft,
    restoreFailedDraft,
    resetForm,
    onPosted,
    setSubmitting,
    setSavedMsg,
  });

  if (!session) {
    return (
      <div className="relative rounded-site mx-3 px-4 py-6 text-center">
        <p className="text-sm text-site-text-muted mb-2">
          {t('sign-in-prompt', { defaultValue: 'Sign in to post RMHarks' })}
        </p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="default" size="sm">
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    // Floating composer slab (§8.3): its own L2 .relative over the aurora
    // gutter (mx-3), separated from the first post by the feed gap; one L2 per
    // page is in budget. focus-within lifts the pane's hairline while writing,
    // then settles back — an activation cue, not a layout change.
    <div
      className="relative px-4 py-3"
      onPaste={smartPaste.onPaste}
      onDragEnter={smartPaste.onDragEnter}
      onDragOver={smartPaste.onDragOver}
      onDragLeave={smartPaste.onDragLeave}
      onDrop={smartPaste.onDrop}
    >
      {/* Drop hint. L4 .surface-overlay: it floats over the composer's own
 content, and anything below L4 has no blur, so the text under it
 would ghost through. */}
      {smartPaste.dragActive && (
        <div className="surface-overlay pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="flex items-center gap-2 text-sm font-semibold text-site-text">
            <ImagePlus className="h-4 w-4" aria-hidden />
            {t('drop-images-here', { defaultValue: 'Drop images to attach' })}
          </span>
        </div>
      )}
      {pendingDraft && !content && (
        <DraftRestoreBanner
          draft={pendingDraft}
          onRestore={() => {
            setContent(pendingDraft.content);
            if (pendingDraft.gifUrl) {
              // `hasGif` needs the attachment too, or the GIF is restored
              // invisibly and never posted.
              setAttachment('gif');
              setGifUrl(pendingDraft.gifUrl);
            }
            setPendingDraft(null);
          }}
          onDiscard={() => {
            clearComposeDraft();
            setPendingDraft(null);
          }}
        />
      )}
      <div className="flex gap-3">
        {/* Avatar */}
        <ComposerAvatar
          image={resolvedUser?.image || session.user.image}
          name={resolvedUser?.name || session.user.name}
        />

        {/* Compose area */}
        <div className="flex-1 min-w-0">
          <MentionTextarea
            ref={textareaRef}
            id="compose-box"
            value={content}
            onChange={setContent}
            placeholder={t('compose-placeholder', { defaultValue: "What's on your mind?" })}
            rows={3}
            // X1: no hard cap outside communities — a longer draft is offered as a
            // thread below, and the Post button stays blocked while it is over the
            // limit, so an over-length single post still cannot be sent.
            maxLength={communityId ? MAX_RMHARK_LENGTH : undefined}
            // Recessed text well (§8.3): .surface-field carries the border, radius and
            // inner shadow; accent border on focus is the input affordance.
            // `block`: a textarea is inline-block by default, so its wrapper
            // reserved ~6px of baseline descender space under it — a gap nobody
            // meant, and the last 6px of layout shift when this composer replaced
            // its placeholder (which has no wrapper) on the feed.
            className="block w-full surface-field text-site-text placeholder:text-site-text-muted text-base resize-none px-3 py-2 outline-none transition-colors focus:border-site-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />

          <ComposeAssist value={content} onChange={setContent} />

          <TagSuggest value={content} onChange={setContent} />

          {remaining < 0 && !communityId && (
            <Suspense fallback={null}>
              <ThreadPostPanel
                content={content}
                blockedBy={threadBlockedBy({
                  hasImages,
                  hasGif,
                  hasPoll,
                  audience,
                  isSensitive,
                  replyControl,
                  unlockPrice,
                })}
                onPosted={handleThreadPosted}
              />
            </Suspense>
          )}

          {parseInt(unlockPrice, 10) > 0 && (
            <UnlockPricePill
              price={parseInt(unlockPrice, 10)}
              onEdit={() => setShowPriceModal(true)}
            />
          )}

          {isSensitive && <ContentWarningPill onRemove={() => setIsSensitive(false)} />}

          {isTake && <TakeChip onRemove={() => setIsTake(false)} />}
          <CodeEmbedChip ce={codeEmbed} />
          <PostsPlusChips pp={postsPlus} />

          {/* Poll creator */}
          {attachment === 'poll' && (
            <PollEditor
              poll={poll}
              setPoll={setPoll}
              pollDuration={pollDuration}
              setPollDuration={setPollDuration}
              onRemove={() => {
                setAttachment(null);
                setPoll(emptyPoll());
              }}
            />
          )}

          {/* GIF picker */}
          {attachment === 'gif' && (
            <GifAttachment
              gifUrl={gifUrl}
              onSelect={(u) => setGifUrl(u)}
              onClear={() => setGifUrl('')}
              onClose={() => {
                setAttachment(null);
                setGifUrl('');
              }}
            />
          )}

          {/* Uploaded image preview strip */}
          {imageUrls.length > 0 && (
            <ImagePreviewStrip
              imageUrls={imageUrls}
              imageAlts={imageAlts}
              onEditAlt={setAltEditIndex}
              onRemove={(i) => {
                setImageUrls((prev) => removeAt(prev, i));
                setImageAlts((prev) => removeAt(prev, i));
              }}
            />
          )}
          <AltTextNotice missing={missingAlt} onFix={setAltEditIndex} />
          {imageError && <p className="text-xs text-site-danger mt-1">{imageError}</p>}

          {/* Hidden file input */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleImageFiles(e.target.files)}
          />

          {/* Schedule panel — the shared control (B17), so the community composer
 and the drafts list get the same field, the same zone label and the
 same "must be in the future" refusal without a second copy. */}
          {showSchedule && (
            <ScheduleControl
              className="mt-2"
              value={scheduleAt}
              onChange={setScheduleAt}
              disabled={!canSubmit}
              submitting={submitting}
              onSubmit={(iso) => handleSaveScheduled(iso)}
              onCancel={() => {
                setShowSchedule(false);
                setScheduleAt('');
              }}
            />
          )}

          {savedMsg && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-site-accent">
              <Check className="h-3.5 w-3.5" /> {savedMsg}
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              {/* Character counter */}
              <span className={`text-xs font-mono ${counterToneClass(remaining)}`}>
                {remaining}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* AI draft button */}
              <AIGenerateButton
                request={{ mode: 'post', draft: content }}
                onGenerated={(text) => setContent(text)}
                title={t('ai-generate-title', { defaultValue: 'Generate a reply with AI' })}
              />

              {/* AI image button — locked (greyed + upgrade nudge) below HARD-R */}
              <AIImageButton
                draft={content}
                locked={!canGenerateImage}
                disabled={imageUrls.length >= MAX_IMAGES}
                onGenerated={(url) => setImageUrls((prev) => appendImages(prev, [url]))}
              />

              {/* Emoji picker — sits next to the GIF/poll (+) menu */}
              <EmojiPickerButton direction="down" onSelect={insertEmoji} />

              {/* Plus button — image upload, GIF, poll, draft, schedule. */}
              <ComposeMenu
                trigger={menuTrigger}
                menuOpen={menuOpen}
                setMenuOpen={setMenuOpen}
                closeMenu={closeMenu}
                imageInputRef={imageInputRef}
                audience={audience}
                replyControl={replyControl}
                setAudienceOpen={setAudienceOpen}
                setReplyOpen={setReplyOpen}
                isSensitive={isSensitive}
                setIsSensitive={setIsSensitive}
                isTake={isTake}
                setIsTake={setIsTake}
                codeEmbed={codeEmbed}
                postsPlus={postsPlus}
                imageCount={imageUrls.length}
                attachment={attachment}
                setAttachment={setAttachment}
                setGifUrl={setGifUrl}
                setPoll={setPoll}
                setShowPriceModal={setShowPriceModal}
                setShowCheatSheet={setShowCheatSheet}
                canSubmit={canSubmit}
                onSaveDraft={() => handleSaveScheduled(null)}
                setShowSchedule={setShowSchedule}
              />

              <Button variant="default" size="sm" disabled={!canSubmit} onClick={handleSubmit}>
                {submitting
                  ? t('posting', { defaultValue: 'Posting…' })
                  : t('post-button', { defaultValue: 'Post' })}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <CodeEmbedDialog ce={codeEmbed} />
      <PostsPlusDialogs
        pp={postsPlus}
        getBody={buildBody}
        canSubmit={canSubmit}
        onSealed={resetForm}
      />

      {/* Post visibility (audience) picker — opened from the (+) menu */}
      {audienceOpen && (
        <AudiencePickerDialog
          audience={audience}
          onSelect={setAudience}
          onClose={() => setAudienceOpen(false)}
        />
      )}

      {/* Who-can-reply picker — opened from the (+) menu */}
      {replyOpen && (
        <ReplyPickerDialog
          replyControl={replyControl}
          onSelect={setReplyControl}
          onClose={() => setReplyOpen(false)}
        />
      )}

      {/* Unlock-price popover — opened from the (+) menu */}
      {showPriceModal && (
        <UnlockPriceDialog
          unlockPrice={unlockPrice}
          setUnlockPrice={setUnlockPrice}
          onClose={() => setShowPriceModal(false)}
        />
      )}

      {/* Markdown cheat sheet — opened from the (+) menu */}
      {showCheatSheet && <CheatSheetDialog onClose={() => setShowCheatSheet(false)} />}

      {/* Image alt-text editor — opened from the ALT pill on a preview image */}
      {altEditIndex !== null && imageUrls[altEditIndex] && (
        <AltTextDialog
          imageUrl={imageUrls[altEditIndex]}
          imageAlts={imageAlts}
          index={altEditIndex}
          setImageAlts={setImageAlts}
          onClose={() => setAltEditIndex(null)}
        />
      )}
    </div>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { modalContent } from '@/lib/motion';
import {
  Plus,
  BarChart3,
  History,
  ImagePlay,
  X,
  ImagePlus,
  Globe,
  Users,
  Lock,
  Star,
  Coins,
  Type,
  FileText,
  CalendarClock,
  Check,
  MessageCircle,
  AtSign,
  AlertTriangle,
} from 'lucide-react';
import { GifEmbed } from './GifEmbed';
import { GifPicker } from './GifPicker';
import { AIGenerateButton } from './AIGenerateButton';
import { AIImageButton } from './AIImageButton';
import { ComposeAssist } from './ComposeAssist';
import { TagSuggest } from './TagSuggest';
import { MentionTextarea } from './MentionTextarea';
import { EmojiPickerButton } from '@/components/shared/EmojiPickerButton';
import { useEmojiInsert } from '@/lib/emoji/use-emoji-insert';
import { useSession, useResolvedUser } from '@/components/Providers';
import { buildOptimizedUrl } from '@/components/ui/OptimizedImage';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { ScheduleControl } from '@/components/ui/schedule-control';
import { useSmartPaste, type MediaRejection } from '@/hooks/useSmartPaste';
import { postWithOutbox, subscribeOutbox } from '@/lib/offline/outbox';
import { yieldToMain } from '@/lib/scheduler';
import { useFeedStore } from '@/stores/feedStore';
import {
  MAX_RMHARK_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
  MAX_IMAGE_ALT_LENGTH,
} from '@/lib/rmhark-schema';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { FeedItem } from '@/lib/feed-types';
import {
  readComposeDraft,
  clearComposeDraft,
  useComposeDraftAutosave,
  type ComposeDraft,
} from '@/hooks/useComposeDraft';

const MAX_IMAGES = 4;

type Attachment = 'poll' | 'gif' | null;

interface PollDraft {
  question: string;
  options: string[];
  multiSelect: boolean;
}

export function ComposeBox({
  communityId,
  onPosted,
}: { communityId?: string; onPosted?: (item: any) => void } = {}) {
  const [content, setContent] = useState('');
  const [audience, setAudience] = useState<'PUBLIC' | 'FOLLOWERS' | 'PRIVATE' | 'CIRCLE'>('PUBLIC');
  const [replyControl, setReplyControl] = useState<'EVERYONE' | 'FOLLOWING' | 'MENTIONED'>(
    'EVERYONE',
  );
  const [replyOpen, setReplyOpen] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
  const [pollDuration, setPollDuration] = useState(0); // hours; 0 = no limit
  const [unlockPrice, setUnlockPrice] = useState(''); // coins to unlock;''= free
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [poll, setPoll] = useState<PollDraft>({
    question: '',
    options: ['', ''],
    multiSelect: false,
  });
  const [gifUrl, setGifUrl] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  // Per-image alt text, aligned by index with imageUrls. A missing/empty entry
  // means"no description"; the ALT pill on each preview opens the editor.
  const [imageAlts, setImageAlts] = useState<string[]>([]);
  const [altEditIndex, setAltEditIndex] = useState<number | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(''); // datetime-local value
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<ComposeDraft | null>(null);
  const [showPriceModal, setShowPriceModal] = useState(false); // unlock-price popover
  const [showCheatSheet, setShowCheatSheet] = useState(false); // markdown cheat sheet
  const imageInputRef = useRef<HTMLInputElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const insertEmoji = useEmojiInsert(textareaRef, content, setContent);

  // Autosave the draft text so a refresh/navigation can't eat an unsent post;
  // offer any stored draft back once on mount.
  useComposeDraftAutosave(content, gifUrl);
  useEffect(() => {
    setPendingDraft(readComposeDraft());
  }, []);
  const { prependItem, removeItem, reconcileItem } = useFeedStore();

  // Idempotency key -> the optimistic card that is waiting on it (B10). A write
  // the service worker parked keeps its dimmed"posting"row on screen; when the
  // worker finally sends it, the real post swaps in through the same reconcile
  // path a normal post uses.
  const queuedPosts = useRef(new Map<string, string>());

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

  const hasPoll =
    attachment === 'poll' &&
    poll.question.trim() &&
    poll.options.filter((o) => o.trim()).length >= MIN_POLL_OPTIONS;
  const hasGif = attachment === 'gif' && gifUrl.trim().length > 0;
  const hasImages = imageUrls.length > 0;
  const hasContent = content.trim().length > 0;
  const canSubmit = (hasContent || hasPoll || hasGif || hasImages) && remaining >= 0 && !submitting;

  const uploadImages = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    setImageError(null);
    const form = new FormData();
    files.forEach((f) => form.append('images', f));
    try {
      const res = await fetch('/api/rmharks/image', { method: 'POST', body: form });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Upload failed' }));
        setImageError(error ?? 'Upload failed');
        return;
      }
      const { urls } = await res.json();
      setImageUrls((prev) => [...prev, ...urls].slice(0, MAX_IMAGES));
    } catch {
      setImageError('Upload failed');
    }
  }, []);

  const handleImageFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    void uploadImages(Array.from(files).slice(0, MAX_IMAGES - imageUrls.length));
  };

  // ── Paste / drop (B16) ───────────────────────────────────────────────────
  // Files are screened against the media policy BEFORE the upload starts, so an
  // over-quota drop is refused in the same frame instead of after 20 MB has gone
  // up the wire. The hook ships reason CODES, not sentences — it has no `t()` —
  // so this maps them to copy.
  const explainRejection = useCallback(
    (rejections: MediaRejection[]) => {
      const [first] = rejections;
      if (!first) return;
      if (first.reason === 'too-large') {
        setImageError(
          t('image-too-large', {
            name: first.file.name,
            defaultValue: '{{name}} is too large — images must be under 5 MB.',
          }),
        );
      } else if (first.reason === 'unsupported-type') {
        setImageError(
          t('image-unsupported', {
            name: first.file.name,
            defaultValue: "{{name}} isn't a supported image (PNG, JPEG, GIF or WebP).",
          }),
        );
      } else {
        setImageError(
          t('image-over-limit', {
            count: MAX_IMAGES,
            defaultValue: 'You can attach at most {{count}} images.',
          }),
        );
      }
    },
    [t],
  );

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

  const buildBody = (): Record<string, unknown> => {
    const body: Record<string, unknown> = {};
    if (content.trim()) body.content = content.trim();
    if (hasPoll) {
      body.poll = {
        question: poll.question.trim(),
        options: poll.options.filter((o) => o.trim()).map((o) => o.trim()),
        multiSelect: poll.multiSelect,
        ...(pollDuration > 0 ? { durationHours: pollDuration } : {}),
      };
    }
    if (hasGif) body.gifUrl = gifUrl.trim();
    if (hasImages) {
      body.imageUrls = imageUrls;
      // Only send alts when the author described at least one image; send the
      // full index-aligned array so the server can pair them by position.
      if (imageAlts.some((a) => a?.trim())) {
        body.imageAlts = imageUrls.map((_, i) => imageAlts[i]?.trim() ?? '');
      }
    }
    if (audience !== 'PUBLIC') body.audience = audience;
    if (isSensitive) body.isSensitive = true;
    if (replyControl !== 'EVERYONE') body.replyControl = replyControl;
    const price = parseInt(unlockPrice, 10);
    if (price > 0) body.unlockPrice = price;
    if (communityId) body.communityId = communityId;
    return body;
  };

  const resetForm = () => {
    clearComposeDraft();
    setContent('');
    setAudience('PUBLIC');
    setReplyControl('EVERYONE');
    setReplyOpen(false);
    setIsSensitive(false);
    setUnlockPrice('');
    setAttachment(null);
    setPoll({ question: '', options: ['', ''], multiSelect: false });
    setGifUrl('');
    setImageUrls([]);
    setImageAlts([]);
    setAltEditIndex(null);
    setImageError(null);
    setShowSchedule(false);
    setScheduleAt('');
    setShowPriceModal(false);
    setShowCheatSheet(false);
  };

  // A snapshot of the composer's contents, so an optimistic post that fails to
  // save can be restored into the box for a one-tap retry.
  const snapshotDraft = () => ({
    content,
    audience,
    replyControl,
    isSensitive,
    unlockPrice,
    attachment,
    poll,
    gifUrl,
    imageUrls,
    imageAlts,
  });
  const restoreDraft = (d: ReturnType<typeof snapshotDraft>) => {
    setContent(d.content);
    setAudience(d.audience);
    setReplyControl(d.replyControl);
    setIsSensitive(d.isSensitive);
    setUnlockPrice(d.unlockPrice);
    setAttachment(d.attachment);
    setPoll(d.poll);
    setGifUrl(d.gifUrl);
    setImageUrls(d.imageUrls);
    setImageAlts(d.imageAlts);
  };

  // Build the post the user *would* see, so it can appear at the top of the
  // feed the instant they hit Post — before the server has replied. The real
  // record (correct id, poll option ids, etc.) is swapped in on reconcile.
  const buildOptimisticItem = (id: string): FeedItem => {
    const price = parseInt(unlockPrice, 10);
    const sessionUser = session!.user as {
      id: string;
      name?: string | null;
      image?: string | null;
      handle?: string | null;
      username?: string | null;
      isVerified?: boolean;
      isAdmin?: boolean;
    };
    return {
      id,
      type: 'rmhark',
      createdAt: new Date().toISOString(),
      content: content.trim() || undefined,
      user: {
        id: sessionUser.id,
        name: resolvedUser?.name ?? sessionUser.name ?? null,
        image: resolvedUser?.image ?? sessionUser.image ?? null,
        handle: resolvedUser?.handle ?? sessionUser.handle ?? null,
        username: sessionUser.username ?? null,
        isVerified: sessionUser.isVerified,
        isAdmin: sessionUser.isAdmin,
      },
      imageUrls: hasImages ? imageUrls : undefined,
      imageAlts: hasImages ? imageUrls.map((_, i) => imageAlts[i]?.trim() ?? '') : undefined,
      isSensitive,
      replyControl,
      gifUrl: hasGif ? gifUrl.trim() : undefined,
      poll: hasPoll
        ? {
            id: `${id}-poll`,
            question: poll.question.trim(),
            multiSelect: poll.multiSelect,
            totalVotes: 0,
            options: poll.options
              .filter((o) => o.trim())
              .map((o, i) => ({ id: `${id}-opt-${i}`, text: o.trim(), voteCount: 0 })),
          }
        : undefined,
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      viewCount: 0,
      liked: false,
      reposted: false,
      bookmarked: false,
      // The author always sees their own content, even a paid post.
      locked: false,
      unlockPrice: price > 0 ? price : undefined,
      pending: true,
    };
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const body = buildBody();

    // Scoped surfaces (e.g. a community) let the parent own the list, so keep
    // the simple awaited insert there rather than reaching into the home feed.
    if (onPosted) {
      setSubmitting(true);
      try {
        const { response, data, queued } = await postWithOutbox<Record<string, unknown>>(
          '/api/rmharks',
          body,
        );
        if (queued) {
          toast.info(
            t('post-queued', { defaultValue: "Saved — it'll post when you're back online" }),
          );
          resetForm();
          return;
        }
        if (!response.ok) {
          const message = (data as { error?: string } | null)?.error;
          toast.error(message || t('post-error', { defaultValue: 'Could not post' }));
          return;
        }
        onPosted(data);
        resetForm();
      } catch (error) {
        console.error('Post error:', error);
        toast.error(t('post-error', { defaultValue: 'Could not post' }));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Home feed: optimistic insert. The post shows at the top immediately in a
    // dimmed"posting"state, the form clears, and we reconcile (or roll back
    // and restore the draft) once the server responds.
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimistic = buildOptimisticItem(tempId);
    const draft = snapshotDraft();
    prependItem(optimistic);
    resetForm();

    // OPT-34. Posting is the site's heaviest single interaction: the two calls
    // above insert a card at the head of the timeline and tear the composer
    // back down (text, media previews, poll rows, the schedule control), which
    // is a large React commit — and `postWithOutbox` then installs the service
    // worker message bridge and stringifies the whole body, including base64
    // media, before the request leaves. All of that in one task means the post
    // the user just wrote does not appear until the upload has been assembled.
    // Yield once, here: the optimistic card and the emptied composer are the
    // frame the user is waiting for, and everything after this line is work
    // they never see. No layout is read after the yield, and this is not a
    // cancelable-event handler — the Cmd+Enter path deliberately lets the
    // keystroke through, and the button path is a plain click.
    await yieldToMain();

    try {
      const { response, data, queued, idempotencyKey } = await postWithOutbox<
        Record<string, unknown>
      >('/api/rmharks', body);

      // Parked by the service worker (B10). The optimistic card STAYS, still in
      // its dimmed pending state, and the queue listener below reconciles or
      // rolls it back when the worker finishes — a queue nobody can see is worse
      // than the failure it replaced.
      if (queued) {
        queuedPosts.current.set(idempotencyKey, tempId);
        toast.info(
          t('post-queued', { defaultValue: "Saved — it'll post when you're back online" }),
        );
        return;
      }

      if (!response.ok) {
        const message = (data as { error?: string } | null)?.error;
        removeItem(tempId);
        restoreDraft(draft);
        toast.error(message || t('post-error', { defaultValue: 'Could not post' }));
        return;
      }
      // A 2xx with an unparseable body cannot replace the optimistic card —
      // reconciling with null would blank the post the user just wrote. Roll back
      // and restore the draft, same as an explicit failure.
      if (!data) {
        removeItem(tempId);
        restoreDraft(draft);
        toast.error(t('post-error', { defaultValue: 'Could not post' }));
        return;
      }
      reconcileItem(tempId, data as unknown as FeedItem);
    } catch (error) {
      console.error('Post error:', error);
      removeItem(tempId);
      restoreDraft(draft);
      toast.error(t('post-error', { defaultValue: 'Could not post' }));
    }
  };

  // Save the composer contents as a draft (scheduledAt = null) or, when a time
  // is given, as a scheduled post.
  const handleSaveScheduled = async (scheduledAtIso: string | null) => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSavedMsg(null);
    try {
      const body = { ...buildBody(), scheduledAt: scheduledAtIso };
      const res = await fetch('/api/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSavedMsg(data.error ?? t('could-not-save', { defaultValue: 'Could not save' }));
        return;
      }
      resetForm();
      setSavedMsg(
        scheduledAtIso
          ? t('scheduled-msg', { defaultValue: 'Scheduled' })
          : t('saved-to-drafts-msg', { defaultValue: 'Saved to drafts' }),
      );
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (error) {
      console.error('Save draft error:', error);
      setSavedMsg(t('could-not-save', { defaultValue: 'Could not save' }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return (
      <div className="glass-fill rounded-site mx-3 px-4 py-6 text-center">
        <p className="text-sm text-site-text-muted mb-2">
          {t('sign-in-prompt', { defaultValue: 'Sign in to post RMHarks' })}
        </p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="accent" size="sm">
            {t('sign-in', { defaultValue: 'Sign In' })}
          </Button>
        </Link>
      </div>
    );
  }

  const audienceOptions = [
    { value: 'PUBLIC', label: t('audience-everyone', { defaultValue: 'Everyone' }), icon: Globe },
    {
      value: 'FOLLOWERS',
      label: t('audience-followers', { defaultValue: 'Followers' }),
      icon: Users,
    },
    {
      value: 'CIRCLE',
      label: t('audience-circle', { defaultValue: 'Close friends' }),
      icon: Star,
    },
    { value: 'PRIVATE', label: t('audience-only-me', { defaultValue: 'Only me' }), icon: Lock },
  ] as const;
  const currentAudience = audienceOptions.find((o) => o.value === audience) ?? audienceOptions[0];
  const CurrentAudienceIcon = currentAudience.icon;

  const replyOptions = [
    {
      value: 'EVERYONE',
      label: t('reply-everyone', { defaultValue: 'Everyone can reply' }),
      short: t('reply-everyone-short', { defaultValue: 'Everyone' }),
      icon: Globe,
    },
    {
      value: 'FOLLOWING',
      label: t('reply-following', { defaultValue: 'Accounts you follow' }),
      short: t('reply-following-short', { defaultValue: 'Following' }),
      icon: Users,
    },
    {
      value: 'MENTIONED',
      label: t('reply-mentioned', { defaultValue: 'Only accounts you mention' }),
      short: t('reply-mentioned-short', { defaultValue: 'Mentioned' }),
      icon: AtSign,
    },
  ] as const;
  const currentReply = replyOptions.find((o) => o.value === replyControl) ?? replyOptions[0];
  const CurrentReplyIcon = currentReply.icon;

  return (
    // Floating composer slab (§8.3): its own L2 .glass-pane over the aurora
    // gutter (mx-3), separated from the first post by the feed gap; one L2 per
    // page is in budget. focus-within lifts the pane's hairline while writing,
    // then settles back — an activation cue, not a layout change.
    <div
      className="glass-pane social-composer relative px-4 py-3"
      onPaste={smartPaste.onPaste}
      onDragEnter={smartPaste.onDragEnter}
      onDragOver={smartPaste.onDragOver}
      onDragLeave={smartPaste.onDragLeave}
      onDrop={smartPaste.onDrop}
    >
      {/* Drop hint. L4 .glass-overlay: it floats over the composer's own
 content, and anything below L4 has no blur, so the text under it
 would ghost through. */}
      {smartPaste.dragActive && (
        <div className="glass-overlay pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <span className="flex items-center gap-2 text-sm font-semibold text-site-text">
            <ImagePlus className="h-4 w-4" aria-hidden />
            {t('drop-images-here', { defaultValue: 'Drop images to attach' })}
          </span>
        </div>
      )}
      {pendingDraft && !content && (
        <div className="mb-3 flex items-center gap-2 rounded-site border border-site-border bg-site-bg-subtle px-3 py-2">
          <History className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
          <p className="min-w-0 flex-1 truncate text-xs text-site-text-muted">
            {t('draft-restore-prompt', { defaultValue: 'You have an unsent draft:' })}
            {''}
            <span className="text-site-text">{pendingDraft.content}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              setContent(pendingDraft.content);
              if (pendingDraft.gifUrl) setGifUrl(pendingDraft.gifUrl);
              setPendingDraft(null);
            }}
            className="shrink-0 text-xs font-semibold text-site-accent hover:underline"
          >
            {t('draft-restore', { defaultValue: 'Restore' })}
          </button>
          <button
            type="button"
            onClick={() => {
              clearComposeDraft();
              setPendingDraft(null);
            }}
            className="shrink-0 text-xs text-site-text-dim hover:text-site-text"
          >
            {t('draft-discard', { defaultValue: 'Discard' })}
          </button>
        </div>
      )}
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-site-text font-bold text-sm ring-2 ring-site-bg shrink-0">
          {resolvedUser?.image || session.user.image ? (
            // Optimized at ~2x the 40px display size (avoids the raw CDN original).
            <img
              src={buildOptimizedUrl(resolvedUser?.image || session.user.image!, 80, 80)}
              alt={
                resolvedUser?.name || session.user.name || t('user-alt', { defaultValue: 'User' })
              }
              loading="lazy"
              decoding="async"
              width={40}
              height={40}
              className="w-full h-full rounded-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).src = '/images/social/default_avatar.png';
              }}
            />
          ) : (
            ((resolvedUser?.name || session.user.name)?.[0] || 'U').toUpperCase()
          )}
        </div>

        {/* Compose area */}
        <div className="flex-1 min-w-0">
          <MentionTextarea
            ref={textareaRef}
            id="compose-box"
            value={content}
            onChange={setContent}
            placeholder={t('compose-placeholder', { defaultValue: "What's on your mind?" })}
            rows={3}
            maxLength={MAX_RMHARK_LENGTH}
            // Recessed text well (§8.3): .glass-inset carries the border, radius and
            // inner shadow; accent border on focus is the input affordance.
            className="w-full glass-inset text-site-text placeholder:text-site-text-dim text-base resize-none px-3 py-2 outline-none transition-colors focus:border-site-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />

          <ComposeAssist value={content} onChange={setContent} />

          <TagSuggest value={content} onChange={setContent} />

          {parseInt(unlockPrice, 10) > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPriceModal(true)}
                title={t('edit-unlock-price-title', { defaultValue: 'Edit unlock price' })}
                className="inline-flex items-center gap-1 rounded-full border border-site-accent/40 bg-site-accent/10 px-3 py-1 text-xs font-medium text-site-accent transition-colors hover:bg-site-accent/20"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>
                  {t('unlock-price-pill', {
                    price: parseInt(unlockPrice, 10),
                    defaultValue: 'Locked · {{price}} coins',
                  })}
                </span>
              </button>
            </div>
          )}

          {/* Active content-warning pill — the toggle lives in the (+) menu, so
 this keeps an enabled CW visible and one-tap removable. */}
          {isSensitive && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSensitive(false)}
                title={t('mark-sensitive-title', {
                  defaultValue: 'Mark media as sensitive (content warning)',
                })}
                className="inline-flex items-center gap-1 rounded-full border border-site-warning/50 bg-site-warning/10 px-3 py-1 text-xs font-medium text-site-warning transition-colors hover:bg-site-warning/20"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{t('mark-sensitive-short', { defaultValue: 'CW' })}</span>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Poll creator */}
          {attachment === 'poll' && (
            <div className="mt-2 border border-site-border rounded-site p-3 bg-site-surface/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">
                  {t('poll-heading', { defaultValue: 'Poll' })}
                </span>
                <button
                  onClick={() => {
                    setAttachment(null);
                    setPoll({ question: '', options: ['', ''], multiSelect: false });
                  }}
                  className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <input
                type="text"
                value={poll.question}
                onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
                placeholder={t('poll-question-placeholder', { defaultValue: 'Ask a question...' })}
                aria-label={t('poll-question-aria', { defaultValue: 'Poll question' })}
                maxLength={MAX_POLL_QUESTION_LENGTH}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site-sm p-2 border border-site-border outline-none focus:border-site-accent transition-colors mb-2"
              />

              <div className="space-y-2">
                {poll.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const newOptions = [...poll.options];
                        newOptions[i] = e.target.value;
                        setPoll((p) => ({ ...p, options: newOptions }));
                      }}
                      placeholder={t('poll-option-placeholder', {
                        count: i + 1,
                        defaultValue: 'Option {{count}}',
                      })}
                      aria-label={t('poll-option-aria', {
                        count: i + 1,
                        defaultValue: 'Poll option {{count}}',
                      })}
                      maxLength={MAX_POLL_OPTION_LENGTH}
                      className="flex-1 bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-site-sm p-2 border border-site-border outline-none focus:border-site-accent transition-colors"
                    />
                    {poll.options.length > MIN_POLL_OPTIONS && (
                      <button
                        type="button"
                        onClick={() => {
                          const newOptions = poll.options.filter((_, j) => j !== i);
                          setPoll((p) => ({ ...p, options: newOptions }));
                        }}
                        aria-label={t('poll-remove-option', {
                          count: i + 1,
                          defaultValue: 'Remove option {{count}}',
                        })}
                        className="p-1 rounded-full text-site-text-dim hover:text-site-danger hover:bg-site-danger/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {poll.options.length < MAX_POLL_OPTIONS && (
                <button
                  onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}
                  className="mt-2 text-xs text-site-accent hover:text-site-accent-hover transition-colors"
                >
                  {t('poll-add-option', { defaultValue: '+ Add option' })}
                </button>
              )}

              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={poll.multiSelect}
                  onChange={(e) => setPoll((p) => ({ ...p, multiSelect: e.target.checked }))}
                  className="rounded border-site-border text-site-accent focus:ring-site-accent"
                />
                <span className="text-xs text-site-text-dim">
                  {t('poll-multi-select', { defaultValue: 'Allow multiple selections' })}
                </span>
              </label>

              <label className="mt-3 flex items-center gap-2">
                <span className="text-xs text-site-text-dim">
                  {t('poll-length-label', { defaultValue: 'Poll length' })}
                </span>
                <Select
                  controlSize="sm"
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                  containerClassName="inline-block w-auto"
                  className="w-auto min-w-28"
                >
                  <option value={0}>
                    {t('poll-duration-no-limit', { defaultValue: 'No limit' })}
                  </option>
                  <option value={1}>{t('poll-duration-1h', { defaultValue: '1 hour' })}</option>
                  <option value={6}>{t('poll-duration-6h', { defaultValue: '6 hours' })}</option>
                  <option value={24}>{t('poll-duration-1d', { defaultValue: '1 day' })}</option>
                  <option value={72}>{t('poll-duration-3d', { defaultValue: '3 days' })}</option>
                  <option value={168}>{t('poll-duration-1w', { defaultValue: '1 week' })}</option>
                </Select>
              </label>
            </div>
          )}

          {/* GIF picker */}
          {attachment === 'gif' && (
            <div className="mt-2 border border-site-border rounded-site p-3 bg-site-surface/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">
                  {t('gif-heading', { defaultValue: 'GIF' })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    setGifUrl('');
                  }}
                  className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {gifUrl.trim() ? (
                <div className="relative">
                  <GifEmbed url={gifUrl.trim()} />
                  <button
                    type="button"
                    onClick={() => setGifUrl('')}
                    aria-label={t('remove-gif-aria', { defaultValue: 'Remove GIF' })}
                    className="absolute top-1 right-1 p-1 rounded-full bg-site-media-scrim-strong text-site-media-ink hover:bg-site-media-scrim-hover transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <GifPicker onSelect={(u) => setGifUrl(u)} />
              )}
            </div>
          )}

          {/* Uploaded image preview strip */}
          {imageUrls.length > 0 && (
            <div
              className={`mt-2 grid gap-1 ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}
            >
              {imageUrls.map((url, i) => {
                const hasAlt = !!imageAlts[i]?.trim();
                return (
                  <div key={url} className="relative group">
                    <img
                      src={url}
                      alt={imageAlts[i]?.trim() || ''}
                      loading="lazy"
                      className="w-full rounded-site-sm object-cover max-h-48"
                    />
                    {/* ALT pill — accent when described, so authors can see at a
 glance which images still need a description. */}
                    <button
                      type="button"
                      onClick={() => setAltEditIndex(i)}
                      aria-label={
                        hasAlt
                          ? t('edit-alt-text-aria', { defaultValue: 'Edit image description' })
                          : t('add-alt-text-aria', { defaultValue: 'Add image description' })
                      }
                      title={
                        imageAlts[i]?.trim() ||
                        t('alt-text-title', {
                          defaultValue: 'Describe this image for screen readers',
                        })
                      }
                      className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase leading-none tracking-wide transition-colors ${
                        hasAlt
                          ? 'bg-site-accent text-site-accent-fg'
                          : 'bg-site-media-scrim-strong text-site-media-ink/90 hover:bg-site-media-scrim-hover'
                      }`}
                    >
                      {t('alt-badge', { defaultValue: 'Alt' })}
                    </button>
                    <button
                      type="button"
                      aria-label={t('remove-image-aria', { defaultValue: 'Remove image' })}
                      onClick={() => {
                        setImageUrls((prev) => prev.filter((_, j) => j !== i));
                        setImageAlts((prev) => prev.filter((_, j) => j !== i));
                      }}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-site-media-scrim-strong text-site-media-ink opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
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
              <span
                className={`text-xs font-mono ${
                  remaining <= 0
                    ? 'text-site-danger'
                    : remaining <= 20
                      ? 'text-site-warning'
                      : 'text-site-text-dim'
                }`}
              >
                {remaining}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              {/* AI draft button */}
              <AIGenerateButton
                request={{ mode: 'post', draft: content }}
                onGenerated={(text) => setContent(text)}
                title={t('ai-generate-title', { defaultValue: 'Generate a post with AI' })}
              />

              {/* AI image button — locked (greyed + upgrade nudge) below HARD-R */}
              <AIImageButton
                draft={content}
                locked={!canGenerateImage}
                disabled={imageUrls.length >= MAX_IMAGES}
                onGenerated={(url) => setImageUrls((prev) => [...prev, url].slice(0, MAX_IMAGES))}
              />

              {/* Emoji picker — sits next to the GIF/poll (+) menu */}
              <EmojiPickerButton direction="down" onSelect={insertEmoji} />

              {/* Plus button — image upload, GIF, poll, draft, schedule.
 The panel is an AnchoredMenu: it portals to <body> (in place it is
 trapped inside `.radial-frame`'s stacking context, so the top bar and
 the floating chrome paint over it) and it opens on whichever side of
 the composer has room, rather than being shoved back down the screen
 by a viewport clamp. */}
              <button
                ref={menuBtnRef}
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t('add-to-post-aria', { defaultValue: 'Add to post' })}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>

              <AnchoredMenu
                open={menuOpen}
                onClose={closeMenu}
                anchorRef={menuBtnRef}
                label={t('add-to-post-aria', { defaultValue: 'Add to post' })}
                side="top"
                align="end"
                className="w-56"
              >
                {/* Post visibility (audience) — opens a picker modal */}
                <button
                  type="button"
                  onClick={() => {
                    setAudienceOpen(true);
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <CurrentAudienceIcon className="w-4 h-4 text-site-text-dim" />
                  <span className="flex-1 text-left">
                    {t('menu-audience', { defaultValue: 'Visibility' })}
                  </span>
                  <span className="text-xs text-site-text-dim">{currentAudience.label}</span>
                </button>
                {/* Who can reply — opens a picker modal */}
                <button
                  type="button"
                  onClick={() => {
                    setReplyOpen(true);
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <CurrentReplyIcon className="w-4 h-4 text-site-text-dim" />
                  <span className="flex-1 text-left">
                    {t('menu-reply-control', { defaultValue: 'Replies' })}
                  </span>
                  <span className="text-xs text-site-text-dim">{currentReply.short}</span>
                </button>
                {/* Content-warning toggle — flips in place so the check is
 visible; the active pill above mirrors the state. */}
                <button
                  type="button"
                  onClick={() => setIsSensitive((v) => !v)}
                  aria-pressed={isSensitive}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <AlertTriangle
                    className={`w-4 h-4 ${isSensitive ? 'text-site-warning' : 'text-site-text-dim'}`}
                  />
                  <span className="flex-1 text-left">
                    {t('menu-content-warning', { defaultValue: 'Content warning' })}
                  </span>
                  {isSensitive && <Check className="w-4 h-4 text-site-warning" />}
                </button>
                <div className="my-1 border-t border-site-border" />
                <button
                  type="button"
                  disabled={imageUrls.length >= MAX_IMAGES}
                  onClick={() => {
                    imageInputRef.current?.click();
                    setMenuOpen(false);
                  }}
                  title={
                    imageUrls.length >= MAX_IMAGES
                      ? t('max-images-title', { defaultValue: 'Maximum 4 images' })
                      : undefined
                  }
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ImagePlus className="w-4 h-4 text-site-text-dim" />
                  {t('menu-add-image', { defaultValue: 'Add Image' })}
                </button>
                <button
                  onClick={() => {
                    setAttachment((a) => (a === 'gif' ? null : 'gif'));
                    setPoll({ question: '', options: ['', ''], multiSelect: false });
                    setMenuOpen(false);
                  }}
                  aria-pressed={attachment === 'gif'}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <ImagePlay className="w-4 h-4 text-site-text-dim" />
                  {t('menu-add-gif', { defaultValue: 'Add GIF' })}
                </button>
                <button
                  onClick={() => {
                    setAttachment('poll');
                    setGifUrl('');
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <BarChart3 className="w-4 h-4 text-site-text-dim" />
                  {t('menu-create-poll', { defaultValue: 'Create Poll' })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPriceModal(true);
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <Coins className="w-4 h-4 text-site-text-dim" />
                  {t('menu-set-unlock-price', { defaultValue: 'Set unlock price' })}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCheatSheet(true);
                    setMenuOpen(false);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors"
                >
                  <Type className="w-4 h-4 text-site-text-dim" />
                  {t('menu-markdown-cheatsheet', { defaultValue: 'Formatting help' })}
                </button>
                <div className="my-1 border-t border-site-border" />
                <button
                  onClick={() => {
                    handleSaveScheduled(null);
                    setMenuOpen(false);
                  }}
                  disabled={!canSubmit}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileText className="w-4 h-4 text-site-text-dim" />
                  {t('menu-save-draft', { defaultValue: 'Save as draft' })}
                </button>
                <button
                  onClick={() => {
                    setShowSchedule(true);
                    setMenuOpen(false);
                  }}
                  disabled={!canSubmit}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CalendarClock className="w-4 h-4 text-site-text-dim" />
                  {t('menu-schedule', { defaultValue: 'Schedule…' })}
                </button>
                <Link
                  to="/drafts"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text-muted hover:bg-site-surface-hover hover:text-site-text transition-colors"
                >
                  <FileText className="w-4 h-4 text-site-text-dim" />
                  {t('menu-view-drafts', { defaultValue: 'View drafts' })}
                </Link>
              </AnchoredMenu>

              <Button variant="accent" size="sm" disabled={!canSubmit} onClick={handleSubmit}>
                {submitting
                  ? t('posting', { defaultValue: 'Posting...' })
                  : t('post-button', { defaultValue: 'Post' })}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Post visibility (audience) picker — opened from the (+) menu */}
      {audienceOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t('close', { defaultValue: 'Close' })}
            tabIndex={-1}
            className="absolute inset-0 bg-site-media-scrim-strong"
            onClick={() => setAudienceOpen(false)}
          />
          <motion.div
            variants={modalContent}
            initial="initial"
            animate="animate"
            className="motion-cage relative w-full max-w-xs p-2 glass-overlay"
          >
            <div className="mb-1 flex items-center justify-between px-1 pt-1">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
                <CurrentAudienceIcon className="h-4 w-4 text-site-text-muted" />
                {t('audience-group-label', { defaultValue: 'Who can see this post' })}
              </h3>
              <button
                type="button"
                onClick={() => setAudienceOpen(false)}
                aria-label={t('close', { defaultValue: 'Close' })}
                className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div role="listbox" className="py-1">
              {audienceOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={audience === value}
                  onClick={() => {
                    setAudience(value);
                    setAudienceOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full rounded-site-sm px-3 py-2 text-sm transition-colors hover:bg-site-surface-hover ${
                    audience === value ? 'text-site-accent' : 'text-site-text'
                  }`}
                >
                  <Icon className="w-4 h-4 text-site-text-dim" />
                  <span className="flex-1 text-left">{label}</span>
                  {audience === value && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Who-can-reply picker — opened from the (+) menu */}
      {replyOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label={t('close', { defaultValue: 'Close' })}
            tabIndex={-1}
            className="absolute inset-0 bg-site-media-scrim-strong"
            onClick={() => setReplyOpen(false)}
          />
          <motion.div
            variants={modalContent}
            initial="initial"
            animate="animate"
            className="motion-cage relative w-full max-w-xs p-2 glass-overlay"
          >
            <div className="mb-1 flex items-center justify-between px-1 pt-1">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
                <CurrentReplyIcon className="h-4 w-4 text-site-text-muted" />
                {t('reply-control-heading', { defaultValue: 'Who can reply?' })}
              </h3>
              <button
                type="button"
                onClick={() => setReplyOpen(false)}
                aria-label={t('close', { defaultValue: 'Close' })}
                className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div role="listbox" className="py-1">
              {replyOptions.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="option"
                  aria-selected={replyControl === value}
                  onClick={() => {
                    setReplyControl(value);
                    setReplyOpen(false);
                  }}
                  className={`flex items-center gap-2 w-full rounded-site-sm px-3 py-2 text-sm transition-colors hover:bg-site-surface-hover ${
                    replyControl === value ? 'text-site-accent' : 'text-site-text'
                  }`}
                >
                  <Icon className="w-4 h-4 text-site-text-dim" />
                  <span className="flex-1 text-left">{label}</span>
                  {replyControl === value && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Unlock-price popover — opened from the (+) menu */}
      {showPriceModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-site-media-scrim-strong"
            onClick={() => setShowPriceModal(false)}
          />
          <motion.div
            variants={modalContent}
            initial="initial"
            animate="animate"
            className="motion-cage relative w-full max-w-xs p-4 glass-overlay"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
                <Lock className="h-4 w-4 text-site-text-muted" />
                {t('unlock-price-label', { defaultValue: 'Unlock price' })}
              </h3>
              <button
                type="button"
                onClick={() => setShowPriceModal(false)}
                aria-label={t('close', { defaultValue: 'Close' })}
                className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-site-text-muted">
              {t('unlock-price-help', {
                defaultValue: 'Charge coins to unlock this post. Leave empty to keep it free.',
              })}
            </p>
            <div className="flex items-center gap-2 rounded-site border border-site-border bg-site-surface px-3 py-2">
              <Coins className="h-4 w-4 text-site-text-muted" />
              <input
                type="number"
                inputMode="numeric"
                min={0}
                autoFocus
                value={unlockPrice}
                onChange={(e) => setUnlockPrice(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') setShowPriceModal(false);
                }}
                placeholder={t('unlock-price-placeholder', { defaultValue: 'free' })}
                aria-label={t('unlock-price-aria', {
                  defaultValue: 'Coins required to unlock this post',
                })}
                className="w-full bg-transparent text-sm text-site-text placeholder:text-site-text-dim focus:outline-none"
              />
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setUnlockPrice('');
                  setShowPriceModal(false);
                }}
                className="rounded-full px-3 py-1.5 text-xs font-medium text-site-text-muted hover:text-site-text transition-colors"
              >
                {t('unlock-price-clear', { defaultValue: 'Make free' })}
              </button>
              <Button variant="accent" size="sm" onClick={() => setShowPriceModal(false)}>
                {t('done', { defaultValue: 'Done' })}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Markdown cheat sheet — opened from the (+) menu */}
      {showCheatSheet && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-site-media-scrim-strong"
            onClick={() => setShowCheatSheet(false)}
          />
          <motion.div
            variants={modalContent}
            initial="initial"
            animate="animate"
            className="motion-cage relative w-full max-w-sm p-4 glass-overlay"
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-site-text">
                <Type className="h-4 w-4 text-site-text-muted" />
                {t('cheatsheet-title', { defaultValue: 'Formatting cheat sheet' })}
              </h3>
              <button
                type="button"
                onClick={() => setShowCheatSheet(false)}
                aria-label={t('close', { defaultValue: 'Close' })}
                className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-site-text-dim">
                  <th className="pb-2 font-medium">
                    {t('cheatsheet-col-type', { defaultValue: 'Type this' })}
                  </th>
                  <th className="pb-2 font-medium">
                    {t('cheatsheet-col-result', { defaultValue: 'Result' })}
                  </th>
                </tr>
              </thead>
              <tbody className="align-top">
                {[
                  {
                    code: '**bold**',
                    node: (
                      <strong className="font-bold">
                        {t('cheatsheet-bold', { defaultValue: 'bold' })}
                      </strong>
                    ),
                  },
                  {
                    code: '*italic*',
                    node: (
                      <em className="italic">
                        {t('cheatsheet-italic', { defaultValue: 'italic' })}
                      </em>
                    ),
                  },
                  {
                    code: '~~strike~~',
                    node: <del>{t('cheatsheet-strike', { defaultValue: 'strike' })}</del>,
                  },
                  {
                    code: '||spoiler||',
                    node: (
                      <span className="rounded bg-site-text/15 px-1 text-transparent [filter:blur(3px)]">
                        {t('cheatsheet-spoiler', { defaultValue: 'spoiler' })}
                      </span>
                    ),
                  },
                ].map((row) => (
                  <tr key={row.code} className="border-t border-site-border">
                    <td className="py-2 pr-3">
                      <code className="rounded bg-site-surface px-1.5 py-0.5 text-xs text-site-text">
                        {row.code}
                      </code>
                    </td>
                    <td className="py-2 text-site-text">{row.node}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      )}

      {/* Image alt-text editor — opened from the ALT pill on a preview image */}
      {altEditIndex !== null && imageUrls[altEditIndex] && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-site-media-scrim-strong"
            onClick={() => setAltEditIndex(null)}
          />
          <motion.div
            variants={modalContent}
            initial="initial"
            animate="animate"
            className="motion-cage relative w-full max-w-md p-4 glass-overlay"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-site-text">
                {t('alt-text-heading', { defaultValue: 'Describe this image' })}
              </h3>
              <button
                type="button"
                onClick={() => setAltEditIndex(null)}
                aria-label={t('close', { defaultValue: 'Close' })}
                className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface-hover transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-3 text-xs text-site-text-muted">
              {t('alt-text-help', {
                defaultValue:
                  "Alt text lets people who use screen readers understand your image. Describe what's in it.",
              })}
            </p>
            <img
              src={imageUrls[altEditIndex]}
              alt={imageAlts[altEditIndex]?.trim() || ''}
              className="mb-3 max-h-40 w-full rounded-site-sm object-contain bg-site-surface"
            />
            <label htmlFor="alt-text-input" className="sr-only">
              {t('alt-text-heading', { defaultValue: 'Describe this image' })}
            </label>
            <textarea
              id="alt-text-input"
              autoFocus
              rows={3}
              maxLength={MAX_IMAGE_ALT_LENGTH}
              value={imageAlts[altEditIndex] ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setImageAlts((prev) => {
                  const next = [...prev];
                  // Pad so the edited index is addressable even if earlier
                  // images have no description yet.
                  while (next.length <= altEditIndex) next.push('');
                  next[altEditIndex] = value;
                  return next;
                });
              }}
              placeholder={t('alt-text-placeholder', {
                defaultValue: 'e.g. A golden retriever running on a beach at sunset',
              })}
              className="w-full resize-none rounded-site-sm border border-site-border bg-site-surface p-2 text-sm text-site-text placeholder:text-site-text-dim outline-none focus:border-site-accent transition-colors"
            />
            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs font-mono text-site-text-dim">
                {MAX_IMAGE_ALT_LENGTH - (imageAlts[altEditIndex]?.length ?? 0)}
              </span>
              <Button variant="accent" size="sm" onClick={() => setAltEditIndex(null)}>
                {t('done', { defaultValue: 'Done' })}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

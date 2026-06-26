'use client';

import { useState, useRef, useEffect } from 'react';
import { Plus, BarChart3, ImagePlay, X, ImagePlus, Globe, Users, Lock, Unlock, EyeOff, FileText, CalendarClock, Check } from 'lucide-react';
import { GifEmbed } from './GifEmbed';
import { GifPicker } from './GifPicker';
import { AIGenerateButton } from './AIGenerateButton';
import { AIImageButton } from './AIImageButton';
import { ComposeAssist } from './ComposeAssist';
import { MentionTextarea } from './MentionTextarea';
import { useSession, useResolvedUser } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { useFeedStore } from '@/stores/feedStore';
import {
  MAX_RMHARK_LENGTH,
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
} from '@/lib/rmhark-schema';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

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
  const [audience, setAudience] = useState<'PUBLIC' | 'FOLLOWERS' | 'PRIVATE'>('PUBLIC');
  const [pollDuration, setPollDuration] = useState(0); // hours; 0 = no limit
  const [unlockPrice, setUnlockPrice] = useState(''); // coins to unlock; '' = free
  const [submitting, setSubmitting] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [poll, setPoll] = useState<PollDraft>({
    question: '',
    options: ['', ''],
    multiSelect: false,
  });
  const [gifUrl, setGifUrl] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(''); // datetime-local value
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { prependItem } = useFeedStore();

  // Wrap the current selection (or insert a placeholder) in spoiler markers.
  function insertSpoiler() {
    const el = textareaRef.current;
    if (!el) {
      setContent((c) => `${c}||spoiler||`);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    const selected = content.slice(start, end) || 'spoiler';
    const next = `${content.slice(0, start)}||${selected}||${content.slice(end)}`;
    setContent(next);
    // Restore focus + place the cursor just inside the spoiler markers.
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + 2 + selected.length;
      el.setSelectionRange(pos, pos);
    });
  }

  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  // Starter and above can generate images. Server re-enforces this.
  const userTier = (session?.user as { tier?: string } | undefined)?.tier;
  const canGenerateImage =
    userTier === 'starter' || userTier === 'pro' || userTier === 'enterprise';
  const { resolved: resolvedUser } = useResolvedUser();
  const remaining = MAX_RMHARK_LENGTH - content.length;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const hasPoll = attachment === 'poll' && poll.question.trim() &&
    poll.options.filter((o) => o.trim()).length >= MIN_POLL_OPTIONS;
  const hasGif = attachment === 'gif' && gifUrl.trim().length > 0;
  const hasImages = imageUrls.length > 0;
  const hasContent = content.trim().length > 0;
  const canSubmit = (hasContent || hasPoll || hasGif || hasImages) && remaining >= 0 && !submitting;

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageError(null);
    const remainingSlots = MAX_IMAGES - imageUrls.length;
    const form = new FormData();
    Array.from(files).slice(0, remainingSlots).forEach((f) => form.append('images', f));
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
  };

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
    if (hasImages) body.imageUrls = imageUrls;
    if (audience !== 'PUBLIC') body.audience = audience;
    const price = parseInt(unlockPrice, 10);
    if (price > 0) body.unlockPrice = price;
    if (communityId) body.communityId = communityId;
    return body;
  };

  const resetForm = () => {
    setContent('');
    setAudience('PUBLIC');
    setUnlockPrice('');
    setAttachment(null);
    setPoll({ question: '', options: ['', ''], multiSelect: false });
    setGifUrl('');
    setImageUrls([]);
    setImageError(null);
    setShowSchedule(false);
    setScheduleAt('');
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/rmharks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('Post error:', data.error);
        return;
      }

      const item = await res.json();
      // In a scoped surface (e.g. a community) the parent owns the list, so
      // hand it the new post; otherwise prepend to the global home feed.
      if (onPosted) onPosted(item);
      else prependItem(item);
      resetForm();
    } catch (error) {
      console.error('Post error:', error);
    } finally {
      setSubmitting(false);
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
        setSavedMsg(data.error ?? t("could-not-save", { defaultValue: "Could not save" }));
        return;
      }
      resetForm();
      setSavedMsg(scheduledAtIso ? t("scheduled-msg", { defaultValue: "Scheduled" }) : t("saved-to-drafts-msg", { defaultValue: "Saved to drafts" }));
      setTimeout(() => setSavedMsg(null), 3000);
    } catch (error) {
      console.error('Save draft error:', error);
      setSavedMsg(t("could-not-save", { defaultValue: "Could not save" }));
    } finally {
      setSubmitting(false);
    }
  };

  if (!session) {
    return (
      <div className="px-4 py-6 border-b border-site-border text-center">
        <p className="text-sm text-site-text-muted mb-2">{t("sign-in-prompt", { defaultValue: "Sign in to post RMHarks" })}</p>
        <Link to="/login" search={{ callbackURL: undefined }}>
          <Button variant="accent" size="sm">{t("sign-in", { defaultValue: "Sign In" })}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-site-border">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-site-text font-bold text-sm ring-2 ring-site-bg shrink-0">
          {(resolvedUser?.image || session.user.image) ? (
            <img
              src={resolvedUser?.image || session.user.image!}
              alt={resolvedUser?.name || session.user.name || t("user-alt", { defaultValue: "User" })}
              className="w-full h-full rounded-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = '/images/social/default_avatar.png'; }}
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
            placeholder={t("compose-placeholder", { defaultValue: "What's on your mind?" })}
            rows={3}
            maxLength={MAX_RMHARK_LENGTH}
            className="w-full bg-transparent text-site-text placeholder:text-site-text-dim text-base resize-none border-none outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />

          <ComposeAssist value={content} onChange={setContent} />

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface p-0.5" role="group" aria-label={t("audience-group-label", { defaultValue: "Who can see this post" })}>
              {([
                { value: 'PUBLIC', label: t("audience-everyone", { defaultValue: "Everyone" }), icon: Globe },
                { value: 'FOLLOWERS', label: t("audience-followers", { defaultValue: "Followers" }), icon: Users },
                { value: 'PRIVATE', label: t("audience-only-me", { defaultValue: "Only me" }), icon: Lock },
              ] as const).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAudience(value)}
                  aria-pressed={audience === value}
                  title={label}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    audience === value ? 'bg-site-accent text-(--site-accent-fg)' : 'text-site-text-muted hover:text-site-text'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
            <div className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface px-3 py-1">
              <Unlock className="h-3.5 w-3.5 text-site-text-muted" />
              <span className="text-xs text-site-text-muted">{t("unlock-price-label", { defaultValue: "Unlock price" })}</span>
              <input
                type="number"
                min={0}
                value={unlockPrice}
                onChange={(e) => setUnlockPrice(e.target.value)}
                placeholder={t("unlock-price-placeholder", { defaultValue: "free" })}
                aria-label={t("unlock-price-aria", { defaultValue: "Coins required to unlock this post" })}
                className="w-16 bg-transparent text-xs text-site-text placeholder:text-site-text-dim focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={insertSpoiler}
              title={t("spoiler-title", { defaultValue: "Mark selection as a spoiler" })}
              className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-surface px-3 py-1 text-xs font-medium text-site-text-muted transition-colors hover:text-site-text"
            >
              <EyeOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("spoiler-label", { defaultValue: "Spoiler" })}</span>
            </button>
          </div>

          {/* Poll creator */}
          {attachment === 'poll' && (
            <div className="mt-2 border border-site-border rounded-xl p-3 bg-site-surface/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">{t("poll-heading", { defaultValue: "Poll" })}</span>
                <button
                  onClick={() => {
                    setAttachment(null);
                    setPoll({ question: '', options: ['', ''], multiSelect: false });
                  }}
                  className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <input
                type="text"
                value={poll.question}
                onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
                placeholder={t("poll-question-placeholder", { defaultValue: "Ask a question..." })}
                maxLength={MAX_POLL_QUESTION_LENGTH}
                className="w-full bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-lg p-2 border border-site-border outline-none focus:border-site-accent transition-colors mb-2"
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
                      placeholder={t("poll-option-placeholder", { count: i + 1, defaultValue: "Option {{count}}" })}
                      maxLength={MAX_POLL_OPTION_LENGTH}
                      className="flex-1 bg-site-surface text-site-text placeholder:text-site-text-dim text-sm rounded-lg p-2 border border-site-border outline-none focus:border-site-accent transition-colors"
                    />
                    {poll.options.length > MIN_POLL_OPTIONS && (
                      <button
                        onClick={() => {
                          const newOptions = poll.options.filter((_, j) => j !== i);
                          setPoll((p) => ({ ...p, options: newOptions }));
                        }}
                        className="p-1 rounded-full text-site-text-dim hover:text-site-danger hover:bg-site-danger/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
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
                  {t("poll-add-option", { defaultValue: "+ Add option" })}
                </button>
              )}

              <label className="flex items-center gap-2 mt-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={poll.multiSelect}
                  onChange={(e) => setPoll((p) => ({ ...p, multiSelect: e.target.checked }))}
                  className="rounded border-site-border text-site-accent focus:ring-site-accent"
                />
                <span className="text-xs text-site-text-dim">{t("poll-multi-select", { defaultValue: "Allow multiple selections" })}</span>
              </label>

              <label className="mt-3 flex items-center gap-2">
                <span className="text-xs text-site-text-dim">{t("poll-length-label", { defaultValue: "Poll length" })}</span>
                <select
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                  className="rounded-lg border border-site-border bg-site-surface px-2 py-1 text-xs text-site-text focus:outline-none"
                >
                  <option value={0}>{t("poll-duration-no-limit", { defaultValue: "No limit" })}</option>
                  <option value={1}>{t("poll-duration-1h", { defaultValue: "1 hour" })}</option>
                  <option value={6}>{t("poll-duration-6h", { defaultValue: "6 hours" })}</option>
                  <option value={24}>{t("poll-duration-1d", { defaultValue: "1 day" })}</option>
                  <option value={72}>{t("poll-duration-3d", { defaultValue: "3 days" })}</option>
                  <option value={168}>{t("poll-duration-1w", { defaultValue: "1 week" })}</option>
                </select>
              </label>
            </div>
          )}

          {/* GIF picker */}
          {attachment === 'gif' && (
            <div className="mt-2 border border-site-border rounded-xl p-3 bg-site-surface/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-site-text-dim uppercase tracking-wide">{t("gif-heading", { defaultValue: "GIF" })}</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    setGifUrl('');
                  }}
                  className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
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
                    aria-label={t("remove-gif-aria", { defaultValue: "Remove GIF" })}
                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
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
            <div className={`mt-2 grid gap-1 ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {imageUrls.map((url) => (
                <div key={url} className="relative group">
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="w-full rounded-lg object-cover max-h-48"
                  />
                  <button
                    type="button"
                    aria-label={t("remove-image-aria", { defaultValue: "Remove image" })}
                    onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                    className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {imageError && (
            <p className="text-xs text-site-danger mt-1">{imageError}</p>
          )}

          {/* Hidden file input */}
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleImageFiles(e.target.files)}
          />

          {/* Schedule panel */}
          {showSchedule && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-site-border bg-site-surface/20 p-3">
              <CalendarClock className="h-4 w-4 text-site-text-dim" />
              <span className="text-xs text-site-text-dim">{t("schedule-publish-at", { defaultValue: "Publish at" })}</span>
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="rounded-lg border border-site-border bg-site-surface px-2 py-1 text-xs text-site-text outline-none focus:border-site-accent"
              />
              <Button
                size="sm"
                variant="accent"
                disabled={!canSubmit || !scheduleAt}
                onClick={() => {
                  const iso = scheduleAt ? new Date(scheduleAt).toISOString() : null;
                  if (iso) handleSaveScheduled(iso);
                }}
              >
                {t("schedule-button", { defaultValue: "Schedule" })}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setShowSchedule(false);
                  setScheduleAt('');
                }}
                className="p-1 rounded-full text-site-text-dim hover:text-site-text hover:bg-site-surface transition-colors"
                aria-label={t("cancel-scheduling-aria", { defaultValue: "Cancel scheduling" })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {savedMsg && (
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-site-accent">
              <Check className="h-3.5 w-3.5" /> {savedMsg}
            </p>
          )}

          <div className="flex items-center justify-between mt-2">
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

            <div className="flex items-center gap-1.5">
              {/* AI draft button */}
              <AIGenerateButton
                request={{ mode: 'post', draft: content }}
                onGenerated={(text) => setContent(text)}
                title={t("ai-generate-title", { defaultValue: "Generate a post with AI" })}
              />

              {/* AI image button — locked (greyed + upgrade nudge) below Starter */}
              <AIImageButton
                draft={content}
                locked={!canGenerateImage}
                disabled={imageUrls.length >= MAX_IMAGES}
                onGenerated={(url) =>
                  setImageUrls((prev) => [...prev, url].slice(0, MAX_IMAGES))
                }
              />

              {/* Image upload button */}
              <button
                type="button"
                disabled={imageUrls.length >= MAX_IMAGES}
                onClick={() => imageInputRef.current?.click()}
                title={imageUrls.length >= MAX_IMAGES ? t("max-images-title", { defaultValue: "Maximum 4 images" }) : t("attach-images-title", { defaultValue: "Attach images" })}
                className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ImagePlus className="w-4.5 h-4.5" />
              </button>

              {/* Plus button */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((v) => !v)}
                  className="p-1.5 rounded-full text-site-text-dim hover:text-site-accent hover:bg-site-accent/10 transition-colors"
                >
                  <Plus className="w-4.5 h-4.5" />
                </button>

                {menuOpen && (
                  <div className="absolute bottom-full right-0 mb-1 w-40 bg-site-bg border border-site-border rounded-xl shadow-xl py-1 z-30">
                    <button
                      onClick={() => {
                        setAttachment('poll');
                        setGifUrl('');
                        setMenuOpen(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                    >
                      <BarChart3 className="w-4 h-4 text-site-text-dim" />
                      {t("menu-create-poll", { defaultValue: "Create Poll" })}
                    </button>
                    <button
                      onClick={() => {
                        setAttachment('gif');
                        setPoll({ question: '', options: ['', ''], multiSelect: false });
                        setMenuOpen(false);
                      }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors"
                    >
                      <ImagePlay className="w-4 h-4 text-site-text-dim" />
                      {t("menu-add-gif", { defaultValue: "Add GIF" })}
                    </button>
                    <div className="my-1 border-t border-site-border" />
                    <button
                      onClick={() => {
                        handleSaveScheduled(null);
                        setMenuOpen(false);
                      }}
                      disabled={!canSubmit}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileText className="w-4 h-4 text-site-text-dim" />
                      {t("menu-save-draft", { defaultValue: "Save as draft" })}
                    </button>
                    <button
                      onClick={() => {
                        setShowSchedule(true);
                        setMenuOpen(false);
                      }}
                      disabled={!canSubmit}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text hover:bg-site-surface transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <CalendarClock className="w-4 h-4 text-site-text-dim" />
                      {t("menu-schedule", { defaultValue: "Schedule…" })}
                    </button>
                    <Link
                      to="/drafts"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-site-text-muted hover:bg-site-surface hover:text-site-text transition-colors"
                    >
                      <FileText className="w-4 h-4 text-site-text-dim" />
                      {t("menu-view-drafts", { defaultValue: "View drafts" })}
                    </Link>
                  </div>
                )}
              </div>

              <Button
                variant="accent"
                size="sm"
                disabled={!canSubmit}
                onClick={handleSubmit}
              >
                {submitting ? t("posting", { defaultValue: "Posting..." }) : t("post-button", { defaultValue: "Post" })}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

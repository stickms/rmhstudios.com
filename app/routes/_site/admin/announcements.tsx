import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Megaphone, Trash2, BarChart3, Image as ImageIcon, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { AIGenerateButton } from '@/components/feed/AIGenerateButton';
import { MentionTextarea } from '@/components/feed/MentionTextarea';
import { GifEmbed } from '@/components/feed/GifEmbed';
import {
  MAX_POLL_QUESTION_LENGTH,
  MAX_POLL_OPTION_LENGTH,
  MIN_POLL_OPTIONS,
  MAX_POLL_OPTIONS,
  MAX_ANNOUNCEMENT_IMAGES,
} from '@/lib/announcement-schema';
import { toast } from 'sonner';

const getAdminSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
    throw redirect({ to: '/' });
  }
  return null;
});

export const Route = createFileRoute('/_site/admin/announcements')({
  head: () => ({ meta: [{ title: 'Announcements | RMH Studios' }] }),
  beforeLoad: () => getAdminSession(),
  component: AdminAnnouncementsPage,
});

interface Announcement {
  id: string;
  title: string;
  body: string;
  linkUrl: string | null;
  linkLabel: string | null;
  variant: string;
  active: boolean;
  pinned: boolean;
  createdAt: string;
  expiresAt: string | null;
  imageUrls?: string[];
  gifUrl?: string | null;
  poll?: { id: string; question: string } | null;
}

const VARIANTS = ['info', 'success', 'warning', 'event'] as const;

type Attachment = 'poll' | 'gif' | null;

interface PollDraft {
  question: string;
  options: string[];
  multiSelect: boolean;
}

const IMAGE_EXT_REGEX = /\.(gif|png|jpe?g|webp|avif)(\?[^\s]*)?$/i;

function isValidMediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('tenor.com') || parsed.hostname.endsWith('giphy.com')) return true;
    if (IMAGE_EXT_REGEX.test(parsed.pathname)) return true;
    return false;
  } catch {
    return false;
  }
}

function AdminAnnouncementsPage() {
  const { t } = useTranslation('admin');
  const [list, setList] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [variant, setVariant] = useState<(typeof VARIANTS)[number]>('info');
  const [submitting, setSubmitting] = useState(false);

  // Attachments
  const [attachment, setAttachment] = useState<Attachment>(null);
  const [poll, setPoll] = useState<PollDraft>({ question: '', options: ['', ''], multiSelect: false });
  const [pollDuration, setPollDuration] = useState(0); // hours; 0 = no limit
  const [gifUrl, setGifUrl] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/announcements', { credentials: 'include' });
      if (res.ok) setList((await res.json()).announcements);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hasPoll =
    attachment === 'poll' &&
    poll.question.trim() &&
    poll.options.filter((o) => o.trim()).length >= MIN_POLL_OPTIONS;
  const hasGif = attachment === 'gif' && gifUrl.trim() && isValidMediaUrl(gifUrl.trim());

  const resetForm = () => {
    setTitle('');
    setBody('');
    setLinkUrl('');
    setLinkLabel('');
    setAttachment(null);
    setPoll({ question: '', options: ['', ''], multiSelect: false });
    setPollDuration(0);
    setGifUrl('');
    setImageUrls([]);
    setImageError(null);
  };

  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImageError(null);
    const remainingSlots = MAX_ANNOUNCEMENT_IMAGES - imageUrls.length;
    if (remainingSlots <= 0) return;
    const form = new FormData();
    Array.from(files).slice(0, remainingSlots).forEach((f) => form.append('images', f));
    try {
      const res = await fetch('/api/rmharks/image', { method: 'POST', body: form, credentials: 'include' });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Upload failed' }));
        setImageError(error ?? 'Upload failed');
        return;
      }
      const { urls } = await res.json();
      setImageUrls((prev) => [...prev, ...urls].slice(0, MAX_ANNOUNCEMENT_IMAGES));
    } catch {
      setImageError('Upload failed');
    }
  };

  const create = async () => {
    if (!title.trim() || !body.trim()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        body: body.trim(),
        linkUrl: linkUrl.trim() || undefined,
        linkLabel: linkLabel.trim() || undefined,
        variant,
      };
      if (imageUrls.length > 0) payload.imageUrls = imageUrls;
      if (hasGif) payload.gifUrl = gifUrl.trim();
      if (hasPoll) {
        payload.poll = {
          question: poll.question.trim(),
          options: poll.options.filter((o) => o.trim()).map((o) => o.trim()),
          multiSelect: poll.multiSelect,
          ...(pollDuration > 0 ? { durationHours: pollDuration } : {}),
        };
      }
      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success(t('announcement-published', { defaultValue: 'Announcement published' }));
        resetForm();
        load();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error(d.error || t('failed-to-publish', { defaultValue: 'Failed to publish' }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (a: Announcement) => {
    await fetch(`/api/admin/announcements/${a.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ active: !a.active }),
    });
    load();
  };

  const remove = async (a: Announcement) => {
    if (!confirm(t('confirm-delete', { defaultValue: 'Delete this announcement?' }))) return;
    await fetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const inputCls =
    'w-full rounded-site-sm border border-site-border bg-site-bg px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim focus:border-site-accent focus:outline-none';

  return (
    <PageLayout title="Announcements" wide backTo="/admin">
      <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div className="flex items-center gap-2 text-sm text-site-text-muted">
          <Megaphone className="h-5 w-5 shrink-0 text-site-accent" />
          {t('feed-announcements-description', { defaultValue: "Pinned banners shown at the top of everyone's feed." })}
        </div>

        {/* Create form */}
        <div className="space-y-3 rounded-site border border-site-border bg-site-surface p-4">
          <div className="relative">
            <input className={`${inputCls} pr-10`} placeholder={t('title-placeholder', { defaultValue: 'Title' })} value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <AIGenerateButton
                size="sm"
                request={{ mode: 'announcement-title', title, body }}
                onGenerated={setTitle}
                title="Generate a title with AI"
              />
            </div>
          </div>
          <div className="relative">
            <MentionTextarea
              className={`${inputCls} pr-10`}
              placeholder={t('message-placeholder', { defaultValue: 'Message — use @ to mention and # for hashtags' })}
              rows={3}
              maxLength={1000}
              value={body}
              onChange={setBody}
            />
            <div className="absolute right-1.5 top-1.5">
              <AIGenerateButton
                size="sm"
                request={{ mode: 'announcement-body', title, body }}
                onGenerated={setBody}
                title="Generate a message with AI"
              />
            </div>
          </div>
          <p className="text-xs text-site-text-dim">
            {t('mention-tip-prefix', { defaultValue: 'Tip: type' })} <span className="font-mono">@</span> {t('mention-tip-middle', { defaultValue: 'to mention a user or' })} <span className="font-mono">#</span> {t('mention-tip-suffix', { defaultValue: 'for a hashtag — both autocomplete.' })}
          </p>

          {/* Poll creator */}
          {attachment === 'poll' && (
            <div className="rounded-site border border-site-border bg-site-bg p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">Poll</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    setPoll({ question: '', options: ['', ''], multiSelect: false });
                  }}
                  className="rounded-full p-1 text-site-text-dim transition-colors hover:bg-site-surface hover:text-site-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="text"
                value={poll.question}
                onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
                placeholder={t('poll-question-placeholder', { defaultValue: 'Ask a question...' })}
                maxLength={MAX_POLL_QUESTION_LENGTH}
                className={`${inputCls} mb-2`}
              />
              <div className="space-y-2">
                {poll.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...poll.options];
                        next[i] = e.target.value;
                        setPoll((p) => ({ ...p, options: next }));
                      }}
                      placeholder={t('poll-option-placeholder', { count: i + 1, defaultValue: 'Option {{count}}' })}
                      maxLength={MAX_POLL_OPTION_LENGTH}
                      className={inputCls}
                    />
                    {poll.options.length > MIN_POLL_OPTIONS && (
                      <button
                        type="button"
                        onClick={() => setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))}
                        className="rounded-full p-1 text-site-text-dim transition-colors hover:bg-site-danger/10 hover:text-site-danger"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {poll.options.length < MAX_POLL_OPTIONS && (
                <button
                  type="button"
                  onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}
                  className="mt-2 text-xs text-site-accent transition-colors hover:text-site-accent-hover"
                >
                  {t('add-option', { defaultValue: '+ Add option' })}
                </button>
              )}
              <label className="mt-3 flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={poll.multiSelect}
                  onChange={(e) => setPoll((p) => ({ ...p, multiSelect: e.target.checked }))}
                  className="rounded border-site-border text-site-accent focus:ring-site-accent"
                />
                <span className="text-xs text-site-text-dim">{t('allow-multiple-selections', { defaultValue: 'Allow multiple selections' })}</span>
              </label>
              <label className="mt-3 flex items-center gap-2">
                <span className="text-xs text-site-text-dim">{t('poll-length', { defaultValue: 'Poll length' })}</span>
                <select
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                  className="rounded-site-sm border border-site-border bg-site-bg px-2 py-1 text-xs text-site-text focus:outline-none"
                >
                  <option value={0}>{t('poll-no-limit', { defaultValue: 'No limit' })}</option>
                  <option value={1}>{t('poll-1-hour', { defaultValue: '1 hour' })}</option>
                  <option value={6}>{t('poll-6-hours', { defaultValue: '6 hours' })}</option>
                  <option value={24}>{t('poll-1-day', { defaultValue: '1 day' })}</option>
                  <option value={72}>{t('poll-3-days', { defaultValue: '3 days' })}</option>
                  <option value={168}>{t('poll-1-week', { defaultValue: '1 week' })}</option>
                </select>
              </label>
            </div>
          )}

          {/* GIF input */}
          {attachment === 'gif' && (
            <div className="rounded-site border border-site-border bg-site-bg p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-site-text-dim">Image / GIF</span>
                <button
                  type="button"
                  onClick={() => {
                    setAttachment(null);
                    setGifUrl('');
                  }}
                  className="rounded-full p-1 text-site-text-dim transition-colors hover:bg-site-surface hover:text-site-text"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <input
                type="url"
                value={gifUrl}
                onChange={(e) => setGifUrl(e.target.value)}
                placeholder={t('gif-url-placeholder', { defaultValue: 'Paste an image URL or Tenor/Giphy link...' })}
                className={inputCls}
              />
              {gifUrl.trim() && isValidMediaUrl(gifUrl.trim()) && <GifEmbed url={gifUrl.trim()} className="mt-2" />}
              {gifUrl.trim() && !isValidMediaUrl(gifUrl.trim()) && (
                <p className="mt-1 text-xs text-site-danger">{t('gif-url-invalid', { defaultValue: 'Must be a direct image URL or Tenor/Giphy link' })}</p>
              )}
            </div>
          )}

          {/* Uploaded image preview strip */}
          {imageUrls.length > 0 && (
            <div className={`grid gap-1 ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {imageUrls.map((url) => (
                <div key={url} className="group relative">
                  <img src={url} alt="" loading="lazy" className="max-h-48 w-full rounded-site-sm object-cover" />
                  <button
                    type="button"
                    aria-label={t('remove-image', { defaultValue: 'Remove image' })}
                    onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                    className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {imageError && <p className="text-xs text-site-danger">{imageError}</p>}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            className="hidden"
            onChange={(e) => handleImageFiles(e.target.files)}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input className={inputCls} placeholder={t('link-url-placeholder', { defaultValue: 'Link URL (optional)' })} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <input className={inputCls} placeholder={t('link-label-placeholder', { defaultValue: 'Link label (optional)' })} value={linkLabel} maxLength={60} onChange={(e) => setLinkLabel(e.target.value)} />
          </div>

          {/* Attachment toolbar */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={imageUrls.length >= MAX_ANNOUNCEMENT_IMAGES}
              title={imageUrls.length >= MAX_ANNOUNCEMENT_IMAGES ? t('max-images-title', { count: MAX_ANNOUNCEMENT_IMAGES, defaultValue: 'Maximum {{count}} images' }) : t('attach-images', { defaultValue: 'Attach images' })}
              className="inline-flex items-center gap-1 rounded-full border border-site-border bg-site-bg px-3 py-1 text-xs font-medium text-site-text-muted transition-colors hover:text-site-text disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ImagePlus className="h-3.5 w-3.5" /> {t('images-button', { defaultValue: 'Images' })}
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachment('gif');
                setPoll({ question: '', options: ['', ''], multiSelect: false });
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                attachment === 'gif' ? 'border-site-accent bg-site-accent text-(--site-accent-fg)' : 'border-site-border bg-site-bg text-site-text-muted hover:text-site-text'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" /> {t('gif-button', { defaultValue: 'GIF' })}
            </button>
            <button
              type="button"
              onClick={() => {
                setAttachment('poll');
                setGifUrl('');
              }}
              className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                attachment === 'poll' ? 'border-site-accent bg-site-accent text-(--site-accent-fg)' : 'border-site-border bg-site-bg text-site-text-muted hover:text-site-text'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" /> {t('poll-button', { defaultValue: 'Poll' })}
            </button>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-1.5">
              {VARIANTS.map((v) => (
                <button
                  key={v}
                  onClick={() => setVariant(v)}
                  className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${
                    variant === v ? 'bg-site-accent text-(--site-accent-fg)' : 'border border-site-border bg-site-bg text-site-text-muted'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <Button variant="accent" onClick={create} disabled={submitting || !title.trim() || !body.trim()}>
              {submitting ? t('publishing', { defaultValue: 'Publishing…' }) : t('publish', { defaultValue: 'Publish' })}
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState description={t('no-announcements', { defaultValue: 'No announcements yet.' })} />
        ) : (
          <ul className="space-y-2">
            {list.map((a) => (
              <li key={a.id} className="rounded-site border border-site-border bg-site-surface p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-site-bg px-1.5 py-0.5 text-[10px] uppercase text-site-text-muted">{a.variant}</span>
                      {!a.active && <span className="rounded bg-site-danger/15 px-1.5 py-0.5 text-[10px] uppercase text-site-danger">inactive</span>}
                      {a.poll && <span className="rounded bg-site-accent-dim px-1.5 py-0.5 text-[10px] uppercase text-site-accent">poll</span>}
                      {(a.imageUrls?.length ?? 0) > 0 && <span className="rounded bg-site-accent-dim px-1.5 py-0.5 text-[10px] uppercase text-site-accent">{a.imageUrls!.length} img</span>}
                      {a.gifUrl && <span className="rounded bg-site-accent-dim px-1.5 py-0.5 text-[10px] uppercase text-site-accent">gif</span>}
                      <p className="truncate font-semibold text-site-text">{a.title}</p>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-site-text-muted">{a.body}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => toggleActive(a)}>
                      {a.active ? t('deactivate', { defaultValue: 'Deactivate' }) : t('activate', { defaultValue: 'Activate' })}
                    </Button>
                    <Button size="icon-sm" variant="ghost" aria-label={t('delete', { defaultValue: 'Delete' })} onClick={() => remove(a)}>
                      <Trash2 className="h-4 w-4 text-site-danger" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
}

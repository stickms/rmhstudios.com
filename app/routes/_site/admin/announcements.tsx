import { createFileRoute } from '@tanstack/react-router';
import { PageLayout } from '@/components/feed/PageLayout';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, BarChart3, Image as ImageIcon, ImagePlus, X } from 'lucide-react';
import { AdminBody } from '@/components/admin/AdminBody';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconButton } from '@/components/ui/icon-button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Select } from '@/components/ui/select';
import { useConfirm } from '@/components/ui/confirm-dialog';
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

export const Route = createFileRoute('/_site/admin/announcements')({
  head: () => ({ meta: [{ title: 'Announcements | RMH Studios' }] }),
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
  const confirm = useConfirm();
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
  const [poll, setPoll] = useState<PollDraft>({
    question: '',
    options: ['', ''],
    multiSelect: false,
  });
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
    Array.from(files)
      .slice(0, remainingSlots)
      .forEach((f) => form.append('images', f));
    try {
      const res = await fetch('/api/rmharks/image', {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
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
    if (
      !(await confirm({
        title: t('confirm-delete', { defaultValue: 'Delete this announcement?' }),
        danger: true,
      }))
    )
      return;
    await fetch(`/api/admin/announcements/${a.id}`, { method: 'DELETE', credentials: 'include' });
    load();
  };

  const variantLabel: Record<(typeof VARIANTS)[number], string> = {
    info: t('variant-info', { defaultValue: 'Info' }),
    success: t('variant-success', { defaultValue: 'Success' }),
    warning: t('variant-warning', { defaultValue: 'Warning' }),
    event: t('variant-event', { defaultValue: 'Event' }),
  };

  // MentionTextarea is the only raw field left; it takes the same inset material
  // as `Input`/`Textarea` through its className.
  const textareaCls =
    'glass-inset w-full rounded-site-sm px-3 py-2 text-sm text-site-text placeholder:text-site-text-dim';

  return (
    <PageLayout
      title={t('announcements-title-announcements', { defaultValue: 'Announcements' })}
      description={t('feed-announcements-description', {
        defaultValue: "Pinned banners shown at the top of everyone's feed.",
      })}
      backTo="/admin"
      backLabel={t('back-to-admin', { defaultValue: 'Back to admin' })}
      wide
    >
      <AdminBody width="narrow">
        {/* Create form — a singular composer panel gets the L2 pane. */}
        <div className="glass-pane space-y-3 rounded-site p-4">
          <div className="relative">
            <Input
              className="pr-12"
              placeholder={t('title-placeholder', { defaultValue: 'Title' })}
              aria-label={t('title-placeholder', { defaultValue: 'Title' })}
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
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
              className={`${textareaCls} pr-12`}
              placeholder={t('message-placeholder', {
                defaultValue: 'Message — use @ to mention and # for hashtags',
              })}
              rows={3}
              maxLength={1000}
              value={body}
              onChange={setBody}
            />
            <div className="absolute right-2 top-2">
              <AIGenerateButton
                size="sm"
                request={{ mode: 'announcement-body', title, body }}
                onGenerated={setBody}
                title="Generate a message with AI"
              />
            </div>
          </div>
          <p className="text-xs text-site-text-dim">
            {t('mention-tip-prefix', { defaultValue: 'Tip: type' })}{' '}
            <span className="font-mono">@</span>{' '}
            {t('mention-tip-middle', { defaultValue: 'to mention a user or' })}{' '}
            <span className="font-mono">#</span>{' '}
            {t('mention-tip-suffix', { defaultValue: 'for a hashtag — both autocomplete.' })}
          </p>

          {/* Poll creator */}
          {attachment === 'poll' && (
            <div className="glass-fill space-y-2 rounded-site p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="site-section-label">
                  {t('poll-button', { defaultValue: 'Poll' })}
                </span>
                <IconButton
                  icon={X}
                  size="icon-xs"
                  label={t('remove-poll', { defaultValue: 'Remove poll' })}
                  onClick={() => {
                    setAttachment(null);
                    setPoll({ question: '', options: ['', ''], multiSelect: false });
                  }}
                />
              </div>
              <Input
                type="text"
                value={poll.question}
                onChange={(e) => setPoll((p) => ({ ...p, question: e.target.value }))}
                placeholder={t('poll-question-placeholder', { defaultValue: 'Ask a question...' })}
                maxLength={MAX_POLL_QUESTION_LENGTH}
                aria-label={t('poll-question-placeholder', { defaultValue: 'Ask a question...' })}
              />
              <div className="space-y-2">
                {poll.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={opt}
                      onChange={(e) => {
                        const next = [...poll.options];
                        next[i] = e.target.value;
                        setPoll((p) => ({ ...p, options: next }));
                      }}
                      placeholder={t('poll-option-placeholder', {
                        count: i + 1,
                        defaultValue: 'Option {{count}}',
                      })}
                      maxLength={MAX_POLL_OPTION_LENGTH}
                      aria-label={t('poll-option-placeholder', {
                        count: i + 1,
                        defaultValue: 'Option {{count}}',
                      })}
                    />
                    {poll.options.length > MIN_POLL_OPTIONS && (
                      <IconButton
                        icon={X}
                        size="icon-xs"
                        label={t('remove-option', {
                          count: i + 1,
                          defaultValue: 'Remove option {{count}}',
                        })}
                        onClick={() =>
                          setPoll((p) => ({ ...p, options: p.options.filter((_, j) => j !== i) }))
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
              {poll.options.length < MAX_POLL_OPTIONS && (
                <Button
                  type="button"
                  size="xs"
                  variant="accent-ghost"
                  onClick={() => setPoll((p) => ({ ...p, options: [...p.options, ''] }))}
                >
                  {t('add-option', { defaultValue: '+ Add option' })}
                </Button>
              )}
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={poll.multiSelect}
                  onChange={(e) => setPoll((p) => ({ ...p, multiSelect: e.target.checked }))}
                  className="rounded border-site-border text-site-accent focus:ring-site-accent"
                />
                <span className="text-xs text-site-text-dim">
                  {t('allow-multiple-selections', { defaultValue: 'Allow multiple selections' })}
                </span>
              </label>
              <label className="flex items-center gap-2">
                <span className="text-xs text-site-text-dim">
                  {t('poll-length', { defaultValue: 'Poll length' })}
                </span>
                <Select
                  controlSize="sm"
                  value={pollDuration}
                  onChange={(e) => setPollDuration(Number(e.target.value))}
                >
                  <option value={0}>{t('poll-no-limit', { defaultValue: 'No limit' })}</option>
                  <option value={1}>{t('poll-1-hour', { defaultValue: '1 hour' })}</option>
                  <option value={6}>{t('poll-6-hours', { defaultValue: '6 hours' })}</option>
                  <option value={24}>{t('poll-1-day', { defaultValue: '1 day' })}</option>
                  <option value={72}>{t('poll-3-days', { defaultValue: '3 days' })}</option>
                  <option value={168}>{t('poll-1-week', { defaultValue: '1 week' })}</option>
                </Select>
              </label>
            </div>
          )}

          {/* GIF input */}
          {attachment === 'gif' && (
            <div className="glass-fill space-y-2 rounded-site p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="site-section-label">
                  {t('image-gif-label', { defaultValue: 'Image / GIF' })}
                </span>
                <IconButton
                  icon={X}
                  size="icon-xs"
                  label={t('remove-gif', { defaultValue: 'Remove image or GIF' })}
                  onClick={() => {
                    setAttachment(null);
                    setGifUrl('');
                  }}
                />
              </div>
              <Input
                type="url"
                value={gifUrl}
                onChange={(e) => setGifUrl(e.target.value)}
                placeholder={t('gif-url-placeholder', {
                  defaultValue: 'Paste an image URL or Tenor/Giphy link...',
                })}
                aria-label={t('gif-url-placeholder', {
                  defaultValue: 'Paste an image URL or Tenor/Giphy link...',
                })}
              />
              {gifUrl.trim() && isValidMediaUrl(gifUrl.trim()) && <GifEmbed url={gifUrl.trim()} />}
              {gifUrl.trim() && !isValidMediaUrl(gifUrl.trim()) && (
                <p className="text-xs text-site-danger">
                  {t('gif-url-invalid', {
                    defaultValue: 'Must be a direct image URL or Tenor/Giphy link',
                  })}
                </p>
              )}
            </div>
          )}

          {/* Uploaded image preview strip */}
          {imageUrls.length > 0 && (
            <div className={`grid gap-2 ${imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {imageUrls.map((url) => (
                <div key={url} className="group relative">
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="max-h-48 w-full rounded-site-sm object-cover"
                  />
                  <button
                    type="button"
                    aria-label={t('remove-image', { defaultValue: 'Remove image' })}
                    onClick={() => setImageUrls((prev) => prev.filter((u) => u !== url))}
                    className="absolute right-2 top-2 flex size-11 items-center justify-center rounded-full bg-site-media-scrim-strong text-site-media-ink transition-opacity sm:size-7 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                  >
                    <X className="size-3.5" aria-hidden />
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
            <Input
              placeholder={t('link-url-placeholder', { defaultValue: 'Link URL (optional)' })}
              aria-label={t('link-url-placeholder', { defaultValue: 'Link URL (optional)' })}
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <Input
              placeholder={t('link-label-placeholder', { defaultValue: 'Link label (optional)' })}
              aria-label={t('link-label-placeholder', { defaultValue: 'Link label (optional)' })}
              value={linkLabel}
              maxLength={60}
              onChange={(e) => setLinkLabel(e.target.value)}
            />
          </div>

          {/* Attachment toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => imageInputRef.current?.click()}
              disabled={imageUrls.length >= MAX_ANNOUNCEMENT_IMAGES}
              title={
                imageUrls.length >= MAX_ANNOUNCEMENT_IMAGES
                  ? t('max-images-title', {
                      count: MAX_ANNOUNCEMENT_IMAGES,
                      defaultValue: 'Maximum {{count}} images',
                    })
                  : t('attach-images', { defaultValue: 'Attach images' })
              }
            >
              <ImagePlus aria-hidden /> {t('images-button', { defaultValue: 'Images' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={attachment === 'gif' ? 'accent' : 'outline'}
              aria-pressed={attachment === 'gif'}
              onClick={() => {
                setAttachment('gif');
                setPoll({ question: '', options: ['', ''], multiSelect: false });
              }}
            >
              <ImageIcon aria-hidden /> {t('gif-button', { defaultValue: 'GIF' })}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={attachment === 'poll' ? 'accent' : 'outline'}
              aria-pressed={attachment === 'poll'}
              onClick={() => {
                setAttachment('poll');
                setGifUrl('');
              }}
            >
              <BarChart3 aria-hidden /> {t('poll-button', { defaultValue: 'Poll' })}
            </Button>
          </div>

          {/* Variant is a one-of-four switch, so it is a tab strip like every other. */}
          <LiquidTabs
            aria-label={t('variant-label', { defaultValue: 'Banner style' })}
            value={variant}
            onChange={(id) => setVariant(id as (typeof VARIANTS)[number])}
            tabs={VARIANTS.map((v) => ({ id: v, label: variantLabel[v] }))}
          />

          <div className="flex justify-end">
            <Button
              variant="accent"
              onClick={create}
              loading={submitting}
              disabled={!title.trim() || !body.trim()}
            >
              {submitting
                ? t('publishing', { defaultValue: 'Publishing…' })
                : t('publish', { defaultValue: 'Publish' })}
            </Button>
          </div>
        </div>

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            description={t('no-announcements', { defaultValue: 'No announcements yet.' })}
          />
        ) : (
          <ul className="space-y-3">
            {list.map((a) => (
              <li key={a.id} className="glass-fill rounded-site px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 basis-48 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge size="sm" variant="default" className="capitalize">
                        {variantLabel[a.variant as (typeof VARIANTS)[number]] ?? a.variant}
                      </Badge>
                      {!a.active && (
                        <Badge size="sm" variant="danger">
                          {t('status-inactive', { defaultValue: 'Inactive' })}
                        </Badge>
                      )}
                      {a.poll && (
                        <Badge size="sm" variant="accent">
                          {t('poll-button', { defaultValue: 'Poll' })}
                        </Badge>
                      )}
                      {(a.imageUrls?.length ?? 0) > 0 && (
                        <Badge size="sm" variant="accent">
                          {t('badge-images', {
                            count: a.imageUrls!.length,
                            defaultValue: '{{count}} img',
                          })}
                        </Badge>
                      )}
                      {a.gifUrl && (
                        <Badge size="sm" variant="accent">
                          {t('gif-button', { defaultValue: 'GIF' })}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate font-semibold text-site-text">{a.title}</p>
                    <p className="line-clamp-2 text-sm text-site-text-muted">{a.body}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => toggleActive(a)}>
                      {a.active
                        ? t('deactivate', { defaultValue: 'Deactivate' })
                        : t('activate', { defaultValue: 'Activate' })}
                    </Button>
                    <IconButton
                      icon={Trash2}
                      className="text-site-danger"
                      label={t('delete', { defaultValue: 'Delete' })}
                      onClick={() => remove(a)}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </AdminBody>
    </PageLayout>
  );
}

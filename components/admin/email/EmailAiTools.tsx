import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ImagePlus, PenLine, Sparkles, Wand2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuLabel, MenuSeparator } from '@/components/ui/menu';
import { toast } from '@/lib/toast';
import { serverError } from '@/lib/http';
import { AI_IMAGE_TIMEOUT_MS, AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { uploadImagesApi } from '@/lib/media/upload.contract';
import {
  adminEmailAiDraft,
  adminEmailAiImage,
  adminEmailAiRewrite,
} from '@/lib/admin/email.contract';
import {
  EMAIL_REWRITE_ACTIONS,
  MAX_EMAIL_IMAGES,
  type EmailRewriteAction,
} from '@/lib/email/campaign-limits';
import type { CampaignCategory } from '@/lib/email/preferences';

// Literal t() keys per action: i18next-parser cannot see a templated key. The
// same six rewrites as the feed composer's AI writing assist.
function actionLabel(t: TFunction, action: EmailRewriteAction): string {
  switch (action) {
    case 'improve':
      return t('email-ai-improve', { defaultValue: 'Improve' });
    case 'fix':
      return t('email-ai-fix', { defaultValue: 'Fix grammar' });
    case 'shorten':
      return t('email-ai-shorten', { defaultValue: 'Shorten' });
    case 'expand':
      return t('email-ai-expand', { defaultValue: 'Expand' });
    case 'casual':
      return t('email-ai-casual', { defaultValue: 'Casual' });
    case 'formal':
      return t('email-ai-formal', { defaultValue: 'Formal' });
  }
}

function failure(t: TFunction, e: unknown): string {
  return serverError(e) || t('email-ai-failed', { defaultValue: 'AI could not do that. Try again.' });
}

interface Draft {
  subject: string;
  body: string;
  category: CampaignCategory;
}

/** The sparkles button inside the subject field: write or sharpen the subject. */
export function SubjectAiButton({
  draft,
  onSubject,
}: {
  draft: Draft;
  onSubject: (subject: string) => void;
}) {
  const { t } = useTranslation('admin');
  const [busy, setBusy] = useState(false);
  const label = draft.subject.trim()
    ? t('email-ai-improve-subject', { defaultValue: 'Improve the subject with AI' })
    : t('email-ai-write-subject', { defaultValue: 'Write a subject with AI' });

  async function run() {
    setBusy(true);
    try {
      const r = await api(adminEmailAiDraft, {
        body: { target: 'subject', ...draft },
        timeoutMs: AI_TIMEOUT_MS,
      });
      onSubject(r.text);
    } catch (e) {
      toast.error(failure(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButton
      icon={Sparkles}
      size="icon-xs"
      label={label}
      loading={busy}
      disabled={busy}
      onClick={() => void run()}
    />
  );
}

/** The selected range of the body field, or null when nothing is highlighted. */
export interface BodySelection {
  start: number;
  end: number;
}

/**
 * The body's AI menu: write the message (or finish the draft), and the six
 * rewrites. With text highlighted in the body, a rewrite replaces only the
 * highlighted part; otherwise it rewrites the whole message.
 */
export function BodyAiMenu({
  draft,
  onBody,
  selection,
  textareaRef,
}: {
  draft: Draft;
  onBody: (body: string) => void;
  selection: BodySelection | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const { t } = useTranslation('admin');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const selected =
    selection && selection.end > selection.start
      ? draft.body.slice(selection.start, selection.end)
      : '';
  const hasSelection = selected.trim().length > 0;
  const canRewrite = hasSelection || draft.body.trim().length >= 3;

  async function write() {
    setBusy(true);
    try {
      const r = await api(adminEmailAiDraft, {
        body: { target: 'body', ...draft },
        timeoutMs: AI_TIMEOUT_MS,
      });
      onBody(r.text);
    } catch (e) {
      toast.error(failure(t, e));
    } finally {
      setBusy(false);
    }
  }

  async function rewrite(action: EmailRewriteAction) {
    // Fix the range now: the admin may keep typing while the model works.
    const range = hasSelection && selection ? { ...selection } : null;
    const original = draft.body;
    const text = range ? original.slice(range.start, range.end) : original;
    setBusy(true);
    try {
      const r = await api(adminEmailAiRewrite, {
        body: { text, action, ...(draft.subject.trim() ? { subject: draft.subject } : {}) },
        timeoutMs: AI_TIMEOUT_MS,
      });
      if (!range) {
        onBody(r.text);
        return;
      }
      const next = original.slice(0, range.start) + r.text + original.slice(range.end);
      onBody(next);
      // Select the replacement, so the admin sees what changed and can run another rewrite on it.
      // After React has rendered the new value.
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(range.start, range.start + r.text.length);
      }, 0);
    } catch (e) {
      toast.error(failure(t, e));
    } finally {
      setBusy(false);
    }
  }

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const label = t('email-ai-tools', { defaultValue: 'AI writing' });

  return (
    <>
      <Button
        ref={buttonRef}
        size="sm"
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        loading={busy}
        onClick={() => setOpen(!open)}
      >
        <Sparkles aria-hidden /> {label}
      </Button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={buttonRef}
        label={label}
        side="bottom"
        align="start"
        className="w-72"
      >
        <MenuItem
          icon={PenLine}
          disabled={busy}
          onSelect={pick(() => void write())}
        >
          {draft.body.trim()
            ? t('email-ai-finish-body', { defaultValue: 'Finish the message with AI' })
            : t('email-ai-write-body', { defaultValue: 'Write the message with AI' })}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>
          {hasSelection
            ? t('email-ai-rewrite-selection', { defaultValue: 'Rewrite the highlighted text' })
            : t('email-ai-rewrite-all', { defaultValue: 'Rewrite the whole message' })}
        </MenuLabel>
        {EMAIL_REWRITE_ACTIONS.map((action) => (
          <MenuItem
            key={action}
            disabled={busy || !canRewrite}
            onSelect={pick(() => void rewrite(action))}
          >
            {actionLabel(t, action)}
          </MenuItem>
        ))}
      </AnchoredMenu>
    </>
  );
}

/**
 * Pictures under the message: generate one with AI from the draft, or upload
 * your own. Both are stored as site images, the only kind an email accepts.
 */
export function EmailImages({
  draft,
  images,
  onImages,
}: {
  draft: Draft;
  images: string[];
  onImages: (next: string[] | ((prev: string[]) => string[])) => void;
}) {
  const { t } = useTranslation('admin');
  const inputRef = useRef<HTMLInputElement>(null);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const full = images.length >= MAX_EMAIL_IMAGES;

  async function generate() {
    setGenerating(true);
    try {
      const r = await api(adminEmailAiImage, {
        body: { subject: draft.subject, body: draft.body },
        timeoutMs: AI_IMAGE_TIMEOUT_MS,
      });
      onImages((prev) => [...prev, r.url].slice(0, MAX_EMAIL_IMAGES));
    } catch (e) {
      toast.error(failure(t, e));
    } finally {
      setGenerating(false);
    }
  }

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const form = new FormData();
    Array.from(files)
      .slice(0, MAX_EMAIL_IMAGES - images.length)
      .forEach((f) => form.append('images', f));
    setUploading(true);
    try {
      const { urls } = await api(uploadImagesApi, { body: form });
      onImages((prev) => [...prev, ...urls].slice(0, MAX_EMAIL_IMAGES));
    } catch (e) {
      toast.error(serverError(e) || t('email-image-upload-failed', { defaultValue: 'Upload failed' }));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2">
          {images.map((url) => (
            <li
              key={url}
              className="relative"
            >
              <img
                src={url}
                alt=""
                loading="lazy"
                className="aspect-video w-full rounded-site border border-site-border bg-site-bg-subtle object-cover"
              />
              <IconButton
                icon={X}
                size="icon-xs"
                variant="default"
                className="absolute right-2 top-2"
                label={t('email-image-remove', { defaultValue: 'Remove picture' })}
                onClick={() => onImages((prev) => prev.filter((u) => u !== url))}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          loading={generating}
          disabled={full || generating}
          onClick={() => void generate()}
        >
          <Wand2 aria-hidden />{' '}
          {t('email-image-generate', { defaultValue: 'Generate a picture with AI' })}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={uploading}
          disabled={full || uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus aria-hidden /> {t('email-image-upload', { defaultValue: 'Add a picture' })}
        </Button>
        <span className="t-meta">
          {t('email-image-count', {
            n: images.length,
            max: MAX_EMAIL_IMAGES,
            defaultValue: '{{n}} of {{max}} pictures',
          })}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
    </div>
  );
}

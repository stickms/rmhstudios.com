/**
 * Library upload modal.
 *
 * Flow: pick a PDF → pdf.js derives page count + cover + opening text → the text
 * is sent to /api/library/draft for an AI title/description → user reviews/edits
 * → publish uploads the PDF + cover to /api/library/upload and opens the book.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { analyzeBook, isEpubFile } from '@/lib/library/pdf-client';
import { libraryPdfMaxBytes } from '@/lib/library/upload-validation';

type Status = 'idle' | 'analyzing' | 'drafting' | 'ready' | 'uploading';

function humanizeFilename(name: string): string {
  return name
    .replace(/\.(pdf|epub)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function UploadModal({
  onClose,
  isAdmin = false,
  onUploaded,
}: {
  onClose: () => void;
  isAdmin?: boolean;
  onUploaded?: () => void;
}) {
  const navigate = useNavigate();
  const { t } = useTranslation("c-library");
  const maxBytes = libraryPdfMaxBytes(isAdmin);
  const maxMb = Math.round(maxBytes / 1024 / 1024);
  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [format, setFormat] = useState<'pdf' | 'epub'>('pdf');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!cover) return;
    const url = URL.createObjectURL(cover);
    setCoverUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [cover]);

  async function handleFile(f: File) {
    setError(null);
    const name = f.name.toLowerCase();
    const looksValid =
      isEpubFile(f) ||
      f.type === 'application/pdf' ||
      name.endsWith('.pdf') ||
      (!f.type && name.endsWith('.epub'));
    if (!looksValid) {
      setError(t("error-not-book", { defaultValue: "That doesn't look like a PDF or EPUB." }));
      return;
    }
    if (f.size > maxBytes) {
      setError(t("error-too-large", { maxMb, defaultValue: "File too large. Maximum size is {{maxMb}} MB." }));
      return;
    }
    setFile(f);
    setStatus('analyzing');
    let analysis;
    try {
      analysis = await analyzeBook(f);
    } catch {
      setError(t("error-book-read", { defaultValue: "Couldn't read this file. It may be encrypted or corrupt." }));
      setStatus('idle');
      setFile(null);
      return;
    }
    setFormat(analysis.format);
    setPages(analysis.pages);
    setCover(analysis.cover);
    setTitle(humanizeFilename(f.name));

    setStatus('drafting');
    try {
      const res = await fetch('/api/library/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: analysis.text }),
      });
      if (res.ok) {
        const draft = await res.json();
        if (draft.title) setTitle(draft.title);
        if (draft.description) setDescription(draft.description);
      }
    } catch {
      /* keep the filename-derived title */
    }
    setStatus('ready');
  }

  async function publish() {
    if (!file) return;
    if (!title.trim()) {
      setError(t("error-title-required", { defaultValue: "A title is required." }));
      return;
    }
    setError(null);
    setStatus('uploading');
    const form = new FormData();
    form.set('file', file);
    if (cover) form.set('cover', new File([cover], 'cover.jpg', { type: 'image/jpeg' }));
    form.set('title', title.trim());
    form.set('description', description.trim());
    form.set('pages', String(pages));

    try {
      const res = await fetch('/api/library/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("error-upload-failed", { defaultValue: "Upload failed, nothing was saved." }));
        setStatus('ready');
        return;
      }
      onUploaded?.();
      onClose();
      navigate({ to: '/library/$slug', params: { slug: data.slug } });
    } catch {
      setError(t("error-upload-failed", { defaultValue: "Upload failed, nothing was saved." }));
      setStatus('ready');
    }
  }

  const busy = status === 'analyzing' || status === 'drafting' || status === 'uploading';
  // While reading the PDF or drafting metadata, the title/description are being
  // produced for the user — lock them so an inline edit isn't clobbered.
  const generating = status === 'analyzing' || status === 'drafting';
  const statusLabel = status === 'uploading'
    ? t("status-uploading", { defaultValue: "Publishing…" })
    : null;

  return (
    <div className="lib-upload__overlay" role="dialog" aria-modal="true" aria-label={t("dialog-label", { defaultValue: "Upload a PDF" })} onMouseDown={onClose}>
      <div className="lib-upload" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lib-upload__head">
          <h2 className="lib-upload__title">{t("dialog-label", { defaultValue: "Upload a book" })}</h2>
          <button type="button" className="lib-upload__close" onClick={onClose} aria-label={t("close", { defaultValue: "Close" })}>×</button>
        </div>

        {status === 'idle' && !file ? (
          <button
            type="button"
            className="lib-upload__drop"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) handleFile(f);
            }}
          >
            <span>{t("drop-prompt-book", { defaultValue: "Drop a PDF or EPUB here, or click to choose one." })}</span>
            <span className="lib-upload__limit">{t("size-limit", { maxMb, defaultValue: "Up to {{maxMb}} MB." })}</span>
          </button>
        ) : (
          <div className="lib-upload__body">
            <div className="lib-upload__cover">
              {coverUrl ? <img src={coverUrl} alt="" /> : <div className="lib-upload__cover--blank" />}
              <span className="lib-upload__pages">
                {pages ? (format === 'epub' ? t('n-sections', { count: pages, defaultValue: `${pages} sections` }) : `${pages} pages`) : ''}
              </span>
            </div>
            <div className={`lib-upload__fields ${generating ? 'is-generating' : ''}`}>
              {generating && (
                <div className="lib-upload__generating" role="status" aria-live="polite">
                  <Loader2 size={16} className="lib-upload__spin" aria-hidden="true" />
                  <span>
                    {status === 'analyzing'
                      ? t("status-analyzing", { defaultValue: "Reading the PDF…" })
                      : t("status-drafting", { defaultValue: "Generating title & description…" })}
                  </span>
                </div>
              )}
              <label className="lib-upload__label">
                {t("label-title", { defaultValue: "Title" })}
                <input
                  className="lib-upload__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  disabled={generating}
                  placeholder={t("placeholder-title", { defaultValue: "Book title" })}
                />
              </label>
              <label className="lib-upload__label">
                {t("label-description", { defaultValue: "Description" })}
                <textarea
                  className="lib-upload__input lib-upload__textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                  disabled={generating}
                  placeholder={t("placeholder-description", { defaultValue: "One-sentence description" })}
                />
              </label>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,application/epub+zip,.epub"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />

        {error && <p className="lib-upload__error">{error}</p>}
        {statusLabel && <p className="lib-upload__status">{statusLabel}</p>}

        <div className="lib-upload__actions">
          <button type="button" className="lib-upload__btn" onClick={onClose} disabled={status === 'uploading'}>
            {t("cancel", { defaultValue: "Cancel" })}
          </button>
          <button
            type="button"
            className="lib-upload__btn lib-upload__btn--primary"
            onClick={publish}
            disabled={!file || busy || !title.trim()}
          >
            {status === 'uploading' ? t("status-uploading", { defaultValue: "Publishing…" }) : t("publish", { defaultValue: "Publish" })}
          </button>
        </div>
      </div>
    </div>
  );
}

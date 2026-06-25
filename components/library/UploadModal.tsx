/**
 * Library upload modal.
 *
 * Single file (default): pick a PDF/EPUB → pdf.js derives page count + cover +
 * opening text → the text is sent to /api/library/draft for an AI title/
 * description → review/edit → publish uploads the file + cover and opens the book.
 *
 * Admins can pick MANY files at once: each becomes a queue row that is analysed
 * and AI-drafted independently (cover + title + description), the metadata stays
 * editable per row, and "Publish" uploads them one after another (the upload API
 * is one-file-per-request), reporting per-row success/failure.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Check, Loader2, Plus, X } from 'lucide-react';
import { analyzeBook, isEpubFile } from '@/lib/library/pdf-client';
import { libraryPdfMaxBytes } from '@/lib/library/upload-validation';

type ItemStatus = 'queued' | 'analyzing' | 'drafting' | 'ready' | 'uploading' | 'done' | 'error';

type UploadItem = {
  id: string;
  file: File;
  format: 'pdf' | 'epub';
  pages: number;
  cover: Blob | null;
  coverUrl: string | null;
  title: string;
  description: string;
  status: ItemStatus;
  error?: string;
  slug?: string;
};

const MAX_BATCH = 25;

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
  const { t } = useTranslation('c-library');
  const maxBytes = libraryPdfMaxBytes(isAdmin);
  const maxMb = Math.round(maxBytes / 1024 / 1024);

  const [items, setItems] = useState<UploadItem[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Live mirror so the sequential analysis loop reads fresh state across awaits.
  const itemsRef = useRef<UploadItem[]>(items);
  itemsRef.current = items;
  const startedRef = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !publishing && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, publishing]);

  // Revoke every cover object URL on unmount.
  useEffect(
    () => () => {
      for (const it of itemsRef.current) if (it.coverUrl) URL.revokeObjectURL(it.coverUrl);
    },
    [],
  );

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  // Analyse + AI-draft each queued item, one at a time (pdf.js is heavy).
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((i) => i.status === 'queued' && !startedRef.current.has(i.id));
        if (!next) break;
        startedRef.current.add(next.id);
        patch(next.id, { status: 'analyzing' });

        let analysis;
        try {
          analysis = await analyzeBook(next.file);
        } catch {
          patch(next.id, { status: 'error', error: t('error-book-read', { defaultValue: "Couldn't read this file. It may be encrypted or corrupt." }) });
          continue;
        }
        const coverUrl = analysis.cover ? URL.createObjectURL(analysis.cover) : null;
        patch(next.id, {
          format: analysis.format,
          pages: analysis.pages,
          cover: analysis.cover,
          coverUrl,
          title: humanizeFilename(next.file.name),
          status: 'drafting',
        });

        try {
          const res = await fetch('/api/library/draft', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: analysis.text }),
          });
          if (res.ok) {
            const draft = await res.json();
            patch(next.id, {
              title: draft.title || humanizeFilename(next.file.name),
              description: draft.description || '',
            });
          }
        } catch {
          /* keep the filename-derived title */
        }
        patch(next.id, { status: 'ready' });
      }
    } finally {
      processingRef.current = false;
    }
  }, [patch, t]);

  // Validate + enqueue freshly picked files, then kick the analysis loop.
  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      setError(null);
      const files = Array.from(fileList);
      if (!files.length) return;
      const allowMany = isAdmin;
      const room = allowMany ? MAX_BATCH - itemsRef.current.length : 1;
      if (room <= 0) {
        setError(t('error-too-many', { max: MAX_BATCH, defaultValue: `You can upload up to ${MAX_BATCH} files at once.` }));
        return;
      }
      const accepted: UploadItem[] = [];
      for (const f of files.slice(0, room)) {
        const name = f.name.toLowerCase();
        const looksValid = isEpubFile(f) || f.type === 'application/pdf' || name.endsWith('.pdf') || (!f.type && name.endsWith('.epub'));
        if (!looksValid) {
          setError(t('error-not-book', { defaultValue: "That doesn't look like a PDF or EPUB." }));
          continue;
        }
        if (f.size > maxBytes) {
          setError(t('error-too-large', { maxMb, defaultValue: 'File too large. Maximum size is {{maxMb}} MB.' }));
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file: f,
          format: 'pdf',
          pages: 0,
          cover: null,
          coverUrl: null,
          title: humanizeFilename(f.name),
          description: '',
          status: 'queued',
        });
      }
      if (!accepted.length) return;
      // Non-admins keep a single file: replace whatever was there.
      setItems((prev) => {
        if (!allowMany) {
          for (const it of prev) if (it.coverUrl) URL.revokeObjectURL(it.coverUrl);
          startedRef.current = new Set();
          return accepted.slice(0, 1);
        }
        return [...prev, ...accepted];
      });
      // Run after state commits.
      requestAnimationFrame(() => void processQueue());
    },
    [isAdmin, maxBytes, maxMb, processQueue, t],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it?.coverUrl) URL.revokeObjectURL(it.coverUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  async function publishAll() {
    const ready = items.filter((i) => i.status === 'ready');
    if (!ready.length) return;
    // Every row we're about to publish needs a title.
    const untitled = ready.find((i) => !i.title.trim());
    if (untitled) {
      setError(t('error-title-required', { defaultValue: 'A title is required.' }));
      return;
    }
    setError(null);
    setPublishing(true);
    let lastSlug: string | null = null;
    let okCount = 0;
    for (const it of ready) {
      patch(it.id, { status: 'uploading' });
      const form = new FormData();
      form.set('file', it.file);
      if (it.cover) form.set('cover', new File([it.cover], 'cover.jpg', { type: 'image/jpeg' }));
      form.set('title', it.title.trim());
      form.set('description', it.description.trim());
      form.set('pages', String(it.pages));
      try {
        const res = await fetch('/api/library/upload', { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          patch(it.id, { status: 'error', error: data.error ?? t('error-upload-failed', { defaultValue: 'Upload failed, nothing was saved.' }) });
          continue;
        }
        patch(it.id, { status: 'done', slug: data.slug });
        lastSlug = data.slug;
        okCount++;
      } catch {
        patch(it.id, { status: 'error', error: t('error-upload-failed', { defaultValue: 'Upload failed, nothing was saved.' }) });
      }
    }
    setPublishing(false);
    if (okCount > 0) onUploaded?.();
    // Single-file flow: jump straight into the book, preserving the old UX.
    const leftover = itemsRef.current.filter((i) => i.status !== 'done');
    if (lastSlug && okCount === 1 && ready.length === 1 && leftover.length === 0) {
      onClose();
      navigate({ to: '/library/$slug', params: { slug: lastSlug } });
    }
  }

  const analyzing = items.some((i) => i.status === 'analyzing' || i.status === 'drafting');
  const readyCount = items.filter((i) => i.status === 'ready').length;
  const allDone = items.length > 0 && items.every((i) => i.status === 'done' || i.status === 'error');
  const hasItems = items.length > 0;

  return (
    <div
      className="lib-upload__overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('dialog-label', { defaultValue: 'Upload a book' })}
      onMouseDown={() => !publishing && onClose()}
    >
      <div className={`lib-upload ${hasItems && isAdmin ? 'lib-upload--multi' : ''}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="lib-upload__head">
          <h2 className="lib-upload__title">
            {isAdmin
              ? t('dialog-label-multi', { defaultValue: 'Upload books' })
              : t('dialog-label', { defaultValue: 'Upload a book' })}
          </h2>
          <button type="button" className="lib-upload__close" onClick={onClose} disabled={publishing} aria-label={t('close', { defaultValue: 'Close' })}>
            ×
          </button>
        </div>

        {!hasItems ? (
          <button
            type="button"
            className="lib-upload__drop"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
            }}
          >
            <span>
              {isAdmin
                ? t('drop-prompt-multi', { defaultValue: 'Drop PDFs or EPUBs here, or click to choose. You can pick several.' })
                : t('drop-prompt-book', { defaultValue: 'Drop a PDF or EPUB here, or click to choose one.' })}
            </span>
            <span className="lib-upload__limit">{t('size-limit', { maxMb, defaultValue: 'Up to {{maxMb}} MB.' })}</span>
          </button>
        ) : (
          <ul className="lib-upload__queue">
            {items.map((it) => (
              <UploadRow key={it.id} item={it} onPatch={patch} onRemove={removeItem} t={t} />
            ))}
            {isAdmin && (
              <li>
                <button
                  type="button"
                  className="lib-upload__addmore"
                  onClick={() => inputRef.current?.click()}
                  disabled={publishing || items.length >= MAX_BATCH}
                >
                  <Plus size={15} aria-hidden="true" />
                  {t('add-more', { defaultValue: 'Add more files' })}
                </button>
              </li>
            )}
          </ul>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf,application/epub+zip,.epub"
          multiple={isAdmin}
          hidden
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = ''; // allow re-picking the same file
          }}
        />

        {error && <p className="lib-upload__error">{error}</p>}

        <div className="lib-upload__actions">
          <button type="button" className="lib-upload__btn" onClick={onClose} disabled={publishing}>
            {allDone ? t('done', { defaultValue: 'Done' }) : t('cancel', { defaultValue: 'Cancel' })}
          </button>
          <button
            type="button"
            className="lib-upload__btn lib-upload__btn--primary"
            onClick={publishAll}
            disabled={publishing || readyCount === 0}
          >
            {publishing
              ? t('status-uploading', { defaultValue: 'Publishing…' })
              : readyCount > 1
                ? t('publish-n', { count: readyCount, defaultValue: `Publish ${readyCount} books` })
                : analyzing && readyCount === 0
                  ? t('status-analyzing', { defaultValue: 'Reading…' })
                  : t('publish', { defaultValue: 'Publish' })}
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadRow({
  item: it,
  onPatch,
  onRemove,
  t,
}: {
  item: UploadItem;
  onPatch: (id: string, next: Partial<UploadItem>) => void;
  onRemove: (id: string) => void;
  t: TFunction;
}) {
  const generating = it.status === 'analyzing' || it.status === 'drafting';
  const locked = generating || it.status === 'uploading' || it.status === 'done';
  const pagesLabel = it.pages
    ? it.format === 'epub'
      ? t('n-sections', { count: it.pages, defaultValue: `${it.pages} sections` })
      : `${it.pages} pages`
    : '';

  return (
    <li className={`lib-upload__row is-${it.status}`}>
      <div className="lib-upload__cover lib-upload__row-cover">
        {it.coverUrl ? <img src={it.coverUrl} alt="" /> : <div className="lib-upload__cover--blank" />}
        {pagesLabel && <span className="lib-upload__pages">{pagesLabel}</span>}
      </div>

      <div className="lib-upload__row-fields">
        {generating ? (
          <div className="lib-upload__generating" role="status" aria-live="polite">
            <Loader2 size={15} className="lib-upload__spin" aria-hidden="true" />
            <span>
              {it.status === 'analyzing'
                ? t('status-analyzing', { defaultValue: 'Reading the file…' })
                : t('status-drafting', { defaultValue: 'Generating title & description…' })}
            </span>
          </div>
        ) : (
          <>
            <input
              className="lib-upload__input"
              value={it.title}
              onChange={(e) => onPatch(it.id, { title: e.target.value })}
              maxLength={200}
              disabled={locked}
              placeholder={t('placeholder-title', { defaultValue: 'Book title' })}
              aria-label={t('label-title', { defaultValue: 'Title' })}
            />
            <textarea
              className="lib-upload__input lib-upload__textarea"
              value={it.description}
              onChange={(e) => onPatch(it.id, { description: e.target.value })}
              maxLength={1000}
              disabled={locked}
              placeholder={t('placeholder-description', { defaultValue: 'One-sentence description' })}
              aria-label={t('label-description', { defaultValue: 'Description' })}
            />
          </>
        )}
        {it.status === 'done' && (
          <span className="lib-upload__row-ok">
            <Check size={14} aria-hidden="true" /> {t('published', { defaultValue: 'Published' })}
          </span>
        )}
        {it.status === 'uploading' && (
          <span className="lib-upload__generating">
            <Loader2 size={14} className="lib-upload__spin" aria-hidden="true" /> {t('status-uploading', { defaultValue: 'Publishing…' })}
          </span>
        )}
        {it.status === 'error' && <span className="lib-upload__row-err">{it.error}</span>}
      </div>

      <button
        type="button"
        className="lib-upload__row-remove"
        onClick={() => onRemove(it.id)}
        disabled={it.status === 'uploading'}
        aria-label={t('remove', { defaultValue: 'Remove' })}
        title={t('remove', { defaultValue: 'Remove' })}
      >
        <X size={15} />
      </button>
    </li>
  );
}

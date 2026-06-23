/**
 * Library upload modal.
 *
 * Flow: pick a PDF → pdf.js derives page count + cover + opening text → the text
 * is sent to /api/library/draft for an AI title/description → user reviews/edits
 * → publish uploads the PDF + cover to /api/library/upload and opens the book.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { analyzePdf } from '@/lib/library/pdf-client';

type Status = 'idle' | 'analyzing' | 'drafting' | 'ready' | 'uploading';

function humanizeFilename(name: string): string {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function UploadModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
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
    if (f.type && f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError("That doesn't look like a PDF.");
      return;
    }
    setFile(f);
    setStatus('analyzing');
    let analysis;
    try {
      analysis = await analyzePdf(f);
    } catch {
      setError("Couldn't read this PDF. It may be encrypted or corrupt.");
      setStatus('idle');
      setFile(null);
      return;
    }
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
      setError('A title is required.');
      return;
    }
    setError(null);
    setStatus('uploading');
    const form = new FormData();
    form.set('pdf', file);
    if (cover) form.set('cover', new File([cover], 'cover.jpg', { type: 'image/jpeg' }));
    form.set('title', title.trim());
    form.set('description', description.trim());
    form.set('pages', String(pages));

    try {
      const res = await fetch('/api/library/upload', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? 'Upload failed, nothing was saved.');
        setStatus('ready');
        return;
      }
      onClose();
      navigate({ to: '/library/$slug', params: { slug: data.slug } });
    } catch {
      setError('Upload failed, nothing was saved.');
      setStatus('ready');
    }
  }

  const busy = status === 'analyzing' || status === 'drafting' || status === 'uploading';
  const statusLabel =
    status === 'analyzing' ? 'Reading the PDF…' :
    status === 'drafting' ? 'Drafting a title…' :
    status === 'uploading' ? 'Publishing…' : null;

  return (
    <div className="lib-upload__overlay" role="dialog" aria-modal="true" aria-label="Upload a PDF" onMouseDown={onClose}>
      <div className="lib-upload" onMouseDown={(e) => e.stopPropagation()}>
        <div className="lib-upload__head">
          <h2 className="lib-upload__title">Upload a PDF</h2>
          <button type="button" className="lib-upload__close" onClick={onClose} aria-label="Close">×</button>
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
            Drop a PDF here, or click to choose one.
          </button>
        ) : (
          <div className="lib-upload__body">
            <div className="lib-upload__cover">
              {coverUrl ? <img src={coverUrl} alt="" /> : <div className="lib-upload__cover--blank" />}
              <span className="lib-upload__pages">{pages ? `${pages} pages` : ''}</span>
            </div>
            <div className="lib-upload__fields">
              <label className="lib-upload__label">
                Title
                <input
                  className="lib-upload__input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Book title"
                />
              </label>
              <label className="lib-upload__label">
                Description
                <textarea
                  className="lib-upload__input lib-upload__textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                  placeholder="One-sentence description"
                />
              </label>
            </div>
          </div>
        )}

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
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
            Cancel
          </button>
          <button
            type="button"
            className="lib-upload__btn lib-upload__btn--primary"
            onClick={publish}
            disabled={!file || busy || !title.trim()}
          >
            {status === 'uploading' ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

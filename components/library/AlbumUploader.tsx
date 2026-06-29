/**
 * Admin album bulk uploader.
 *
 * Uploads each file as its OWN request (bounded concurrency) so progress is
 * truly per-item — a live "Uploading 36/69" counter + overall bar, plus per-row
 * byte-level upload progress, a "processing" state while the server compresses
 * (sharp/ffmpeg), and automatic retry with backoff on transient failures (with a
 * manual Retry button as a fallback). Themed with album-admin.css to match the
 * rest of the site.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Film, Loader2, RotateCw, UploadCloud, X } from 'lucide-react';

export type AdminSlide = { id: string; type: string; position: number; thumb: string; src: string };

type Status = 'queued' | 'uploading' | 'processing' | 'done' | 'error';

type QueueItem = {
  id: string;
  file: File;
  isVideo: boolean;
  preview: string | null;
  status: Status;
  progress: number; // 0..1 byte-upload progress
  attempt: number;
  error?: string;
  permanent?: boolean;
};

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 4; // initial try + 3 retries
const BACKOFF_MS = [800, 2000, 4500];

const MAX_IMAGE_BYTES = 64 * 1024 * 1024;
const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const VIDEO_EXT = /\.(mp4|mov|webm|m4v|avi|mkv|m2ts)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|heic|heif|tiff?|bmp)$/i;

const isVideoFile = (f: File) => f.type.startsWith('video/') || VIDEO_EXT.test(f.name);
const isImageFile = (f: File) => f.type.startsWith('image/') || IMAGE_EXT.test(f.name);
const fmtSize = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`;
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const isPermanent = (msg?: string) =>
  !!msg && /unsupported|too large|not found|unauthor|invalid|no files/i.test(msg);

/** Run `worker` over `ids` with at most `concurrency` in flight at once. */
async function runPool<T>(ids: T[], concurrency: number, worker: (id: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (cursor < ids.length) await worker(ids[cursor++]);
  });
  await Promise.all(lanes);
}

type XhrResult = { status: number; body: { created?: AdminSlide[]; errors?: { error: string }[]; error?: string } | null };

/** POST a FormData with real upload-progress events (fetch can't report these). */
function xhrUpload(url: string, form: FormData, onProgress: (p: number) => void): Promise<XhrResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      onProgress(1);
      let body: XhrResult['body'] = null;
      try {
        body = JSON.parse(xhr.responseText || 'null');
      } catch {
        /* non-JSON error body */
      }
      resolve({ status: xhr.status, body });
    };
    xhr.onerror = () => reject(new Error('network'));
    xhr.ontimeout = () => reject(new Error('timeout'));
    xhr.send(form);
  });
}

export function AlbumUploader({
  albumId,
  onUploaded,
}: {
  albumId: string;
  onUploaded: (slides: AdminSlide[]) => void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const itemsRef = useRef<QueueItem[]>(items);
  itemsRef.current = items;
  const runningRef = useRef(false);
  const startedRef = useRef<Set<string>>(new Set());

  const patch = useCallback((id: string, next: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  // Revoke preview object URLs on unmount.
  useEffect(
    () => () => {
      for (const it of itemsRef.current) if (it.preview) URL.revokeObjectURL(it.preview);
    },
    [],
  );

  // One attempt. Returns the created slides, or whether it's worth retrying.
  const attemptUpload = useCallback(
    async (item: QueueItem, onProgress: (p: number) => void): Promise<{ done?: AdminSlide[]; retry?: boolean; message?: string }> => {
      const form = new FormData();
      form.append('files', item.file);
      form.append('uploadKey', item.id); // stable across retries → idempotent server-side
      let res: XhrResult;
      try {
        res = await xhrUpload(`/api/admin/albums/${albumId}/slides`, form, onProgress);
      } catch {
        return { retry: true, message: 'Network error' };
      }
      if (res.status >= 200 && res.status < 300) {
        const created = res.body?.created ?? [];
        if (created.length) return { done: created };
        const msg = res.body?.errors?.[0]?.error;
        return isPermanent(msg) ? { message: msg } : { retry: true, message: msg ?? 'Processing failed' };
      }
      if (res.status === 429 || res.status >= 500) return { retry: true, message: `Server error ${res.status}` };
      return { message: res.body?.error ?? `Error ${res.status}` }; // 4xx → permanent
    },
    [albumId],
  );

  // Upload a single item, retrying transient failures with backoff.
  const uploadOne = useCallback(
    async (item: QueueItem) => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        patch(item.id, { status: 'uploading', attempt, progress: 0, error: undefined });
        const r = await attemptUpload(item, (p) => patch(item.id, { progress: p, status: p >= 1 ? 'processing' : 'uploading' }));
        if (r.done) {
          patch(item.id, { status: 'done', progress: 1, error: undefined });
          onUploaded(r.done);
          return;
        }
        if (!r.retry || attempt >= MAX_ATTEMPTS) {
          patch(item.id, { status: 'error', error: r.message ?? 'Upload failed', permanent: !r.retry });
          return;
        }
        // Transient — wait, then retry (the row shows "Retrying…").
        patch(item.id, { status: 'uploading', error: r.message });
        await wait(BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)]);
      }
    },
    [attemptUpload, onUploaded, patch],
  );

  // Drain queued items with bounded concurrency. Re-scans so manually-retried
  // (re-queued) items get picked up too.
  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      let pending: QueueItem[];
      while ((pending = itemsRef.current.filter((i) => i.status === 'queued' && !startedRef.current.has(i.id))).length) {
        for (const it of pending) startedRef.current.add(it.id);
        await runPool(pending, CONCURRENCY, uploadOne);
      }
    } finally {
      runningRef.current = false;
    }
  }, [uploadOne]);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (!files.length) return;
      const next: QueueItem[] = files.map((f) => {
        const video = isVideoFile(f);
        const image = isImageFile(f);
        let status: Status = 'queued';
        let error: string | undefined;
        let permanent = false;
        if (!video && !image) {
          status = 'error';
          error = 'Unsupported file type';
          permanent = true;
        } else if (video && f.size > MAX_VIDEO_BYTES) {
          status = 'error';
          error = 'Video too large (max 1 GB)';
          permanent = true;
        } else if (!video && f.size > MAX_IMAGE_BYTES) {
          status = 'error';
          error = 'Image too large (max 64 MB)';
          permanent = true;
        }
        return {
          id: crypto.randomUUID(),
          file: f,
          isVideo: video,
          preview: image && status === 'queued' ? URL.createObjectURL(f) : null,
          status,
          progress: 0,
          attempt: 0,
          error,
          permanent,
        };
      });
      setItems((prev) => [...prev, ...next]);
      requestAnimationFrame(() => void run());
    },
    [run],
  );

  const retryItem = useCallback(
    (id: string) => {
      startedRef.current.delete(id);
      patch(id, { status: 'queued', error: undefined, progress: 0, attempt: 0, permanent: false });
      requestAnimationFrame(() => void run());
    },
    [patch, run],
  );

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const it = prev.find((i) => i.id === id);
      if (it?.preview) URL.revokeObjectURL(it.preview);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => {
      for (const it of prev) if (it.status === 'done' && it.preview) URL.revokeObjectURL(it.preview);
      return prev.filter((i) => i.status !== 'done');
    });
  }, []);

  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const busy = items.some((i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'processing');
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="aa__panel">
      <div
        className={`aa__drop${dragging ? ' is-drag' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
      >
        <span className="aa__drop-strong">
          <UploadCloud size={18} aria-hidden="true" /> Drop photos &amp; videos, or click to choose
        </span>
        <span className="aa__drop-hint">Select many at once. Images → WebP, videos → compressed MP4 + poster.</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {total > 0 && (
        <>
          <div className="aa__overall" role="status" aria-live="polite">
            <span className="aa__overall-label">
              {busy ? `Uploading ${done}/${total}…` : `${done}/${total} uploaded${failed ? `, ${failed} failed` : ''}`}
            </span>
            <div className="aa__track" aria-hidden="true">
              <div className="aa__fill" style={{ width: `${pct}%` }} />
            </div>
            {!busy && done > 0 && (
              <button type="button" className="aa__btn aa__btn--ghost" onClick={clearFinished}>
                Clear finished
              </button>
            )}
          </div>

          <ul className="aa__queue">
            {items.map((it) => (
              <UploadRow key={it.id} item={it} onRetry={retryItem} onRemove={removeItem} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function UploadRow({
  item: it,
  onRetry,
  onRemove,
}: {
  item: QueueItem;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const active = it.status === 'uploading' || it.status === 'processing';
  const pct = Math.round(it.progress * 100);

  return (
    <li className="aa__row">
      <div className="aa__thumb">
        {it.preview ? (
          <img src={it.preview} alt="" />
        ) : (
          <div className="aa__thumb-badge">
            <Film size={18} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="aa__info">
        <span className="aa__name" title={it.file.name}>
          {it.file.name}
        </span>
        <span className="aa__meta">
          <span>{fmtSize(it.file.size)}</span>
          <StateBadge item={it} />
        </span>
        {active && (
          <div className="aa__rowtrack" aria-hidden="true">
            <div className="aa__rowfill" style={{ width: `${it.status === 'processing' ? 100 : pct}%` }} />
          </div>
        )}
      </div>

      {it.status === 'error' && !it.permanent && (
        <button type="button" className="aa__rowbtn aa__rowbtn--retry" onClick={() => onRetry(it.id)} title="Retry">
          <RotateCw size={13} aria-hidden="true" /> Retry
        </button>
      )}
      {!active && (
        <button
          type="button"
          className="aa__rowbtn aa__rowbtn--remove"
          onClick={() => onRemove(it.id)}
          aria-label="Remove"
          title="Remove"
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function StateBadge({ item: it }: { item: QueueItem }) {
  const name = it.file.name;
  switch (it.status) {
    case 'queued':
      return (
        <span className="aa__state aa__state--queued" aria-label={`${name}: queued`}>
          Queued
        </span>
      );
    case 'uploading': {
      const text =
        it.attempt > 1
          ? `Retrying (${it.attempt - 1}/${MAX_ATTEMPTS - 1})…`
          : `Uploading ${Math.round(it.progress * 100)}%`;
      return (
        <span className="aa__state aa__state--up" aria-label={`${name}: ${text}`}>
          <Loader2 size={12} className="aa__spin" aria-hidden="true" />
          {text}
        </span>
      );
    }
    case 'processing':
      return (
        <span className="aa__state aa__state--proc" aria-label={`${name}: processing`}>
          <Loader2 size={12} className="aa__spin" aria-hidden="true" /> Processing…
        </span>
      );
    case 'done':
      return (
        <span className="aa__state aa__state--done" aria-label={`${name}: added`}>
          <Check size={12} aria-hidden="true" /> Added
        </span>
      );
    case 'error':
      return (
        <span className="aa__state aa__state--err" aria-label={`${name}: failed — ${it.error ?? 'error'}`}>
          <AlertCircle size={12} aria-hidden="true" /> {it.error ?? 'Failed'}
        </span>
      );
    default:
      return null;
  }
}

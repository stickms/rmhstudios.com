/**
 * Admin album bulk uploader.
 *
 * Uploads each file as its OWN request (bounded concurrency) so progress is
 * truly per-item — a live "Uploading 36/69" counter + overall bar, plus per-row
 * byte-level upload progress, a "processing" state while the server compresses
 * (sharp/ffmpeg), and automatic retry with backoff on transient failures (with a
 * manual Retry button as a fallback). Built from the site primitives and tokens
 * (the bespoke album-admin.css it used to ship is gone).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Film, Loader2, RotateCw, UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
async function runPool<T>(
  ids: T[],
  concurrency: number,
  worker: (id: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const lanes = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (cursor < ids.length) await worker(ids[cursor++]);
  });
  await Promise.all(lanes);
}

type XhrResult = {
  status: number;
  body: { created?: AdminSlide[]; errors?: { error: string }[]; error?: string } | null;
};

/** POST a FormData with real upload-progress events (fetch can't report these). */
function xhrUpload(
  url: string,
  form: FormData,
  onProgress: (p: number) => void,
): Promise<XhrResult> {
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
    async (
      item: QueueItem,
      onProgress: (p: number) => void,
    ): Promise<{ done?: AdminSlide[]; retry?: boolean; message?: string }> => {
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
        return isPermanent(msg)
          ? { message: msg }
          : { retry: true, message: msg ?? 'Processing failed' };
      }
      if (res.status === 429 || res.status >= 500)
        return { retry: true, message: `Server error ${res.status}` };
      return { message: res.body?.error ?? `Error ${res.status}` }; // 4xx → permanent
    },
    [albumId],
  );

  // Upload a single item, retrying transient failures with backoff.
  const uploadOne = useCallback(
    async (item: QueueItem) => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        patch(item.id, { status: 'uploading', attempt, progress: 0, error: undefined });
        const r = await attemptUpload(item, (p) =>
          patch(item.id, { progress: p, status: p >= 1 ? 'processing' : 'uploading' }),
        );
        if (r.done) {
          patch(item.id, { status: 'done', progress: 1, error: undefined });
          onUploaded(r.done);
          return;
        }
        if (!r.retry || attempt >= MAX_ATTEMPTS) {
          patch(item.id, {
            status: 'error',
            error: r.message ?? 'Upload failed',
            permanent: !r.retry,
          });
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
      while (
        (pending = itemsRef.current.filter(
          (i) => i.status === 'queued' && !startedRef.current.has(i.id),
        )).length
      ) {
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
      for (const it of prev)
        if (it.status === 'done' && it.preview) URL.revokeObjectURL(it.preview);
      return prev.filter((i) => i.status !== 'done');
    });
  }, []);

  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'error').length;
  const busy = items.some(
    (i) => i.status === 'queued' || i.status === 'uploading' || i.status === 'processing',
  );
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="glass-pane space-y-3 rounded-site p-4">
      <div
        className={cn(
          'flex w-full cursor-pointer flex-col items-center gap-2 rounded-site border-2 border-dashed px-5 py-8 text-center text-site-text-muted transition-colors duration-site-fast',
          dragging
            ? 'border-site-accent bg-site-accent-dim text-site-text'
            : 'border-site-border-bright hover:border-site-accent hover:text-site-text',
        )}
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
        <span className="inline-flex items-center gap-2 font-semibold text-site-text">
          <UploadCloud className="size-5" aria-hidden="true" /> Drop photos &amp; videos, or click
          to choose
        </span>
        <span className="text-xs">
          Select many at once. Images → WebP, videos → compressed MP4 + poster.
        </span>
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
          <div className="flex items-center gap-3" role="status" aria-live="polite">
            <span className="whitespace-nowrap text-sm tabular-nums text-site-text">
              {busy
                ? `Uploading ${done}/${total}…`
                : `${done}/${total} uploaded${failed ? `, ${failed} failed` : ''}`}
            </span>
            <ProgressBar value={pct / 100} className="flex-1" />
            {!busy && done > 0 && (
              <Button type="button" variant="ghost" size="sm" onClick={clearFinished}>
                Clear finished
              </Button>
            )}
          </div>

          <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto sm:max-h-112">
            {items.map((it) => (
              <UploadRow key={it.id} item={it} onRetry={retryItem} onRemove={removeItem} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Determinate bar: a full-width fill scaled on X (transform, not width). */
function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div
      className={cn('h-2 overflow-hidden rounded-full bg-site-surface-active', className)}
      aria-hidden="true"
    >
      <div
        className="h-full origin-left rounded-full bg-site-accent transition-transform duration-site"
        style={{ transform: `scaleX(${Math.min(1, Math.max(0, value))})` }}
      />
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
    <li className="glass-fill flex items-center gap-3 rounded-site px-3 py-3">
      <div className="relative size-12 shrink-0 overflow-hidden rounded-site-sm bg-site-surface-active">
        {it.preview ? (
          <img src={it.preview} alt="" className="size-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-site-media-scrim text-site-media-ink">
            <Film className="size-5" aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm text-site-text" title={it.file.name}>
          {it.file.name}
        </span>
        <span className="flex items-center gap-2 text-xs text-site-text-muted">
          <span>{fmtSize(it.file.size)}</span>
          <StateBadge item={it} />
        </span>
        {active && (
          <ProgressBar value={it.status === 'processing' ? 1 : pct / 100} className="h-1" />
        )}
      </div>

      {it.status === 'error' && !it.permanent && (
        <Button type="button" variant="accent-outline" size="xs" onClick={() => onRetry(it.id)}>
          <RotateCw aria-hidden="true" /> Retry
        </Button>
      )}
      {!active && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => onRemove(it.id)}
          aria-label="Remove"
          title="Remove"
        >
          <X aria-hidden="true" />
        </Button>
      )}
    </li>
  );
}

const STATE = 'inline-flex items-center gap-1';

function StateBadge({ item: it }: { item: QueueItem }) {
  const name = it.file.name;
  switch (it.status) {
    case 'queued':
      return (
        <span className={STATE} aria-label={`${name}: queued`}>
          Queued
        </span>
      );
    case 'uploading': {
      const text =
        it.attempt > 1
          ? `Retrying (${it.attempt - 1}/${MAX_ATTEMPTS - 1})…`
          : `Uploading ${Math.round(it.progress * 100)}%`;
      return (
        <span className={STATE} aria-label={`${name}: ${text}`}>
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {text}
        </span>
      );
    }
    case 'processing':
      return (
        <span className={STATE} aria-label={`${name}: processing`}>
          <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Processing…
        </span>
      );
    case 'done':
      return (
        <span className={cn(STATE, 'text-site-success')} aria-label={`${name}: added`}>
          <Check className="size-3" aria-hidden="true" /> Added
        </span>
      );
    case 'error':
      return (
        <span
          className={cn(STATE, 'text-site-danger')}
          aria-label={`${name}: failed — ${it.error ?? 'error'}`}
        >
          <AlertCircle className="size-3" aria-hidden="true" /> {it.error ?? 'Failed'}
        </span>
      );
    default:
      return null;
  }
}

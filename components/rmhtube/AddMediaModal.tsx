/**
 * AddMediaModal — URL input with paste detection and preview.
 *
 * Two shortcuts on top of the single link:
 *  - **Start at** — "1:30", "90", "1m30s". Stored on the item as its start
 *    offset (`withStart`), which the hub makes the item's first anchor, so the
 *    whole room starts there. A link that already carries one (`?t=`, `#t=`)
 *    fills it in.
 *  - **Several links at once** — pasting text with more than one URL queues
 *    them all (up to `MAX_BATCH`, inside the hub's add rate limit).
 */
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { X, Link as LinkIcon, Radio, ListPlus } from 'lucide-react';
import { maybeRawMediaUrl, parseMedia, parseTimestamp, startOffset, withStart } from '@/lib/rmhtube/media';
import { formatDuration } from '@/lib/rmhtube/utils';
import { useTranslation } from 'react-i18next';

interface AddMediaModalProps {
  onClose: () => void;
  onAdd: (items: Array<{ url: string; title: string }>) => void;
}

/** The hub allows 20 adds a minute; leave room for the next manual one. */
const MAX_BATCH = 15;

function linksIn(text: string): string[] {
  return text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//i.test(s) && (parseMedia(s) || maybeRawMediaUrl(s)));
}

export default function AddMediaModal({ onClose, onAdd }: AddMediaModalProps) {
  const { t } = useTranslation("c-rmhtube");
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [batch, setBatch] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The same parser the server validates with, so the preview and the outcome
  // cannot disagree.
  const media = useMemo(() => (url.trim() ? parseMedia(url.trim()) : null), [url]);
  // No provider or extension, but it could still be a raw video link (a signed
  // CDN URL, `/video/123`). The server asks the host what it is when it's added.
  const rawCandidate = useMemo(() => !media && !!url.trim() && maybeRawMediaUrl(url.trim()), [media, url]);

  const startSeconds = useMemo(() => parseTimestamp(start), [start]);
  const startInvalid = start.trim() !== '' && startSeconds === null;

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const links = linksIn(e.clipboardData.getData('text'));
    if (links.length < 2) return;
    e.preventDefault();
    setBatch(links.slice(0, MAX_BATCH));
    setError('');
  }, []);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (batch) {
      onAdd(batch.map((u) => ({ url: u, title: '' })));
      return;
    }
    if (startInvalid) {
      setError(t("error-start-time", { defaultValue: "Start time should look like 1:30, 90 or 1m30s." }));
      return;
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError(t("error-enter-url", { defaultValue: "Please enter a URL" }));
      return;
    }
    if (!parseMedia(trimmedUrl) && !maybeRawMediaUrl(trimmedUrl)) {
      setError(t("error-unsupported-url", {
        defaultValue: "That link can't be played here. Use a YouTube video or live stream, a Twitch channel or VOD, Vimeo, or a direct video/stream URL (.mp4, .webm, .m3u8).",
      }));
      return;
    }
    onAdd([{ url: start.trim() ? withStart(trimmedUrl, startSeconds) : trimmedUrl, title: title.trim() }]);
  }, [url, title, start, startSeconds, startInvalid, batch, onAdd, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-xl border border-(--app-border) bg-(--app-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t("add-video", { defaultValue: "Add Video" })}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors text-(--app-text-muted) hover:text-(--app-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {batch ? (
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-(--app-text-muted)">
                <ListPlus className="h-4 w-4" aria-hidden />
                {t("batch-count", { defaultValue_one: "{{count}} link found", defaultValue: "{{count}} links found", count: batch.length })}
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-(--app-border) bg-(--app-bg) p-2 text-xs">
                {batch.map((link) => (
                  <li key={link} className="truncate text-(--app-text-muted)" title={link}>
                    {link}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setBatch(null)}
                className="mt-2 text-xs text-(--app-text-dim) underline hover:text-(--app-text)"
              >
                {t("batch-cancel", { defaultValue: "Add one link instead" })}
              </button>
            </div>
          ) : (
          <>
          {/* URL Input */}
          <div>
            <label htmlFor="media-url" className="block text-sm font-medium mb-1 text-(--app-text-muted)">
              {t("video-url-label", { defaultValue: "Video URL" })}
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--app-text-dim)" />
              <input
                ref={inputRef}
                id="media-url"
                type="url"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError('');
                  const linked = startOffset(e.target.value.trim());
                  if (linked > 0) setStart(formatDuration(linked));
                }}
                onPaste={handlePaste}
                placeholder={t("url-placeholder", { defaultValue: "https://youtube.com/watch?v=..." })}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-(--app-border) bg-(--app-bg) text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
              />
            </div>
            {media && (
              <div className="mt-2 flex items-center gap-2">
                {media.thumbnailUrl && (
                  <img
                    src={media.thumbnailUrl}
                    alt=""
                    width={64}
                    height={36}
                    className="h-9 w-16 shrink-0 rounded object-cover"
                  />
                )}
                <p className="flex items-center gap-1.5 text-xs text-(--app-success)">
                  {t("detected-media-type", { defaultValue: "Detected: {{type}}", type: media.mediaType })}
                  {media.liveHint === 'live' && (
                    <span className="inline-flex items-center gap-1 font-semibold uppercase tracking-wide text-(--app-danger)">
                      <Radio className="h-3 w-3" aria-hidden />
                      {t("live", { defaultValue: "Live" })}
                    </span>
                  )}
                </p>
              </div>
            )}
            {rawCandidate && (
              <p className="mt-2 text-xs text-(--app-text-muted)">
                {t("raw-link-check", {
                  defaultValue: "Direct link — we'll check it's a playable video when you add it.",
                })}
              </p>
            )}
            {error && (
              <p className="mt-1 text-xs text-(--app-danger)">{error}</p>
            )}
          </div>

          {/* Title Input (optional) */}
          <div>
            <label htmlFor="media-title" className="block text-sm font-medium mb-1 text-(--app-text-muted)">
              {t("title-label", { defaultValue: "Title" })} <span className="text-(--app-text-dim)">{t("optional", { defaultValue: "(optional)" })}</span>
            </label>
            <input
              id="media-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={256}
              placeholder={t("title-placeholder", { defaultValue: "Custom title..." })}
              className="w-full px-4 py-2.5 rounded-lg border border-(--app-border) bg-(--app-bg) text-(--app-text) placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
            />
          </div>

          {/* Start offset (optional) — becomes the item's first anchor */}
          {media?.liveHint !== 'live' && (
            <div>
              <label htmlFor="media-start" className="block text-sm font-medium mb-1 text-(--app-text-muted)">
                {t("start-at-label", { defaultValue: "Start at" })} <span className="text-(--app-text-dim)">{t("optional", { defaultValue: "(optional)" })}</span>
              </label>
              <input
                id="media-start"
                type="text"
                inputMode="numeric"
                value={start}
                onChange={(e) => { setStart(e.target.value); setError(''); }}
                maxLength={12}
                placeholder="0:00"
                aria-invalid={startInvalid || undefined}
                className="w-32 px-4 py-2.5 rounded-lg border border-(--app-border) bg-(--app-bg) text-(--app-text) tabular-nums placeholder:text-(--app-text-dim) outline-none focus:ring-1 focus:ring-(--app-accent)"
              />
            </div>
          )}
          </>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!batch && !url.trim()}
            className="w-full py-2.5 rounded-lg font-semibold text-(--app-accent-fg) transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--app-accent) hover:bg-(--app-accent-hover)"
          >
            {batch
              ? t("add-batch-to-queue", { defaultValue: "Add {{count}} to Queue", count: batch.length })
              : t("add-to-queue", { defaultValue: "Add to Queue" })}
          </button>
        </form>
      </div>
    </div>
  );
}

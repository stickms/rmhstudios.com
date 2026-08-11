/**
 * AddMediaModal — URL input with paste detection and preview.
 */
'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { X, Link as LinkIcon, Radio } from 'lucide-react';
import { parseMedia } from '@/lib/rmhtube/media';
import { useTranslation } from 'react-i18next';

interface AddMediaModalProps {
  onClose: () => void;
  onAdd: (url: string, title: string) => void;
}

export default function AddMediaModal({ onClose, onAdd }: AddMediaModalProps) {
  const { t } = useTranslation("c-rmhtube");
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // The same parser the server validates with, so the preview and the outcome
  // cannot disagree.
  const media = useMemo(() => (url.trim() ? parseMedia(url.trim()) : null), [url]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError(t("error-enter-url", { defaultValue: "Please enter a URL" }));
      return;
    }
    if (!parseMedia(trimmedUrl)) {
      setError(t("error-unsupported-url", {
        defaultValue: "That link can't be played here. Use a YouTube video or live stream, a Twitch channel or VOD, Vimeo, or a direct video/stream URL (.mp4, .webm, .m3u8).",
      }));
      return;
    }
    onAdd(trimmedUrl, title.trim());
  }, [url, title, onAdd, t]);

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
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
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

          {/* Submit */}
          <button
            type="submit"
            disabled={!url.trim()}
            className="w-full py-2.5 rounded-lg font-semibold text-(--app-accent-fg) transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--app-accent) hover:bg-(--app-accent-hover)"
          >
            {t("add-to-queue", { defaultValue: "Add to Queue" })}
          </button>
        </form>
      </div>
    </div>
  );
}

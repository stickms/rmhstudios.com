/**
 * AddMediaModal — URL input with paste detection and preview.
 */
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { X, Link as LinkIcon } from 'lucide-react';
import { detectMediaType } from '@/lib/rmhtube/utils';
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

  const mediaType = url ? detectMediaType(url) : null;

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setError(t("error-enter-url", { defaultValue: "Please enter a URL" }));
      return;
    }
    if (!detectMediaType(trimmedUrl)) {
      setError(t("error-unsupported-url", { defaultValue: "Unsupported URL. Use YouTube, Twitch, or a direct video link (.mp4, .webm)" }));
      return;
    }
    onAdd(trimmedUrl, title.trim());
  }, [url, title, onAdd]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{t("add-video", { defaultValue: "Add Video" })}</h3>
          <button
            onClick={onClose}
            className="rounded p-1 transition-colors text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL Input */}
          <div>
            <label htmlFor="media-url" className="block text-sm font-medium mb-1 text-(--rmhtube-text-muted)">
              {t("video-url-label", { defaultValue: "Video URL" })}
            </label>
            <div className="relative">
              <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-(--rmhtube-text-dim)" />
              <input
                ref={inputRef}
                id="media-url"
                type="url"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder={t("url-placeholder", { defaultValue: "https://youtube.com/watch?v=..." })}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-bg) text-(--rmhtube-text) placeholder:text-(--rmhtube-text-dim) outline-none focus:ring-1 focus:ring-(--rmhtube-accent)"
              />
            </div>
            {mediaType && (
              <p className="mt-1 text-xs text-(--rmhtube-success)">
                {t("detected-media-type", { defaultValue: "Detected: {{type}}", type: mediaType })}
              </p>
            )}
            {error && (
              <p className="mt-1 text-xs text-(--rmhtube-danger)">{error}</p>
            )}
          </div>

          {/* Title Input (optional) */}
          <div>
            <label htmlFor="media-title" className="block text-sm font-medium mb-1 text-(--rmhtube-text-muted)">
              {t("title-label", { defaultValue: "Title" })} <span className="text-(--rmhtube-text-dim)">{t("optional", { defaultValue: "(optional)" })}</span>
            </label>
            <input
              id="media-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={256}
              placeholder={t("title-placeholder", { defaultValue: "Custom title..." })}
              className="w-full px-4 py-2.5 rounded-lg border border-(--rmhtube-border) bg-(--rmhtube-bg) text-(--rmhtube-text) placeholder:text-(--rmhtube-text-dim) outline-none focus:ring-1 focus:ring-(--rmhtube-accent)"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={!url.trim()}
            className="w-full py-2.5 rounded-lg font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-(--rmhtube-accent) hover:bg-(--rmhtube-accent-hover)"
          >
            {t("add-to-queue", { defaultValue: "Add to Queue" })}
          </button>
        </form>
      </div>
    </div>
  );
}

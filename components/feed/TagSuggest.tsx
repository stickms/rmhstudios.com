'use client';

import { useEffect, useRef, useState } from 'react';
import { Hash, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Below this a draft is too thin to tag honestly, and the endpoint rejects it. */
const MIN_CHARS = 12;

/**
 * Suggested hashtag chips under the composer. Tapping one appends `#tag` to the
 * draft, which is all a hashtag is here — the write path parses tags back out of
 * the post body (`extractHashtags`), so there is no separate tag field to keep
 * in sync, and a tag added this way is identical to one typed by hand.
 *
 * The suggestions refresh as the draft settles rather than on every keystroke:
 * a 1.2s debounce, and only when the text has actually changed since the last
 * request. Tags for a half-written sentence are wrong tags anyway.
 */
export function TagSuggest({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation('feed');
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const lastQueried = useRef('');

  useEffect(() => {
    const text = value.trim();
    if (text.length < MIN_CHARS) {
      setTags([]);
      return;
    }
    if (text === lastQueried.current) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      lastQueried.current = text;
      setLoading(true);
      try {
        const res = await fetch('/api/ai/suggest-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ text }),
        });
        if (cancelled) return;
        const data = await res.json().catch(() => ({}));
        setTags(res.ok && Array.isArray(data.tags) ? data.tags : []);
      } catch {
        if (!cancelled) setTags([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  if (tags.length === 0 && !loading) return null;

  const append = (tag: string) => {
    // Separate from whatever the draft ends with, and drop the tag from the
    // strip — it is in the post now, so offering it again is offering a
    // duplicate the parser would collapse anyway.
    const sep = value.length === 0 || /\s$/.test(value) ? '' : ' ';
    onChange(`${value}${sep}#${tag} `);
    setTags((prev) => prev.filter((x) => x !== tag));
  };

  return (
    <div
      className="mt-2 flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t('tag-suggest-label', { defaultValue: 'Suggested tags' })}
      aria-busy={loading}
    >
      <span className="flex items-center gap-1 text-xs text-site-text-dim">
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Hash className="h-3.5 w-3.5 text-site-accent" aria-hidden />
        )}
        {t('tag-suggest-title', { defaultValue: 'Tags' })}
      </span>
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => append(tag)}
          className="rounded-full border border-site-border px-2.5 py-1 text-xs text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          #{tag}
        </button>
      ))}
    </div>
  );
}

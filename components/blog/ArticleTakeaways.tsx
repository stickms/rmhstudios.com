'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * "Key takeaways" for a devlog post — 3–5 bullets a reader can scan before
 * committing to a long article.
 *
 * Fetched client-side, after paint, rather than in the route loader. The
 * takeaways are generated on first request and cached server-side for half a
 * day, which means the very first reader of a post would otherwise wait several
 * seconds for the ARTICLE — the thing they came for — behind a summary of it.
 * As a client fetch, a slow or dead generation costs that reader nothing: the
 * strip simply never appears, and the post is already on screen.
 */
export function ArticleTakeaways({ slug }: { slug: string }) {
  const { t } = useTranslation('c-blog');
  const [takeaways, setTakeaways] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ai/takeaways?slug=${encodeURIComponent(slug)}`, {
          credentials: 'include',
        });
        if (cancelled || !res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (!cancelled && Array.isArray(data.takeaways)) setTakeaways(data.takeaways);
      } catch {
        // Progressive enhancement: no strip, same article.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (takeaways.length === 0) return null;

  return (
    <aside
      className="glass-pane p-4 sm:p-5"
      aria-label={t('takeaways-title', { defaultValue: 'Key takeaways' })}
    >
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-site-text">
        <Sparkles className="size-4 text-site-accent" aria-hidden />
        {t('takeaways-title', { defaultValue: 'Key takeaways' })}
      </h2>
      <ul className="space-y-2">
        {takeaways.map((line) => (
          <li key={line} className="flex gap-2 text-sm text-site-text-muted">
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-site-accent" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>
      {/* Said plainly, once. A summary a reader mistakes for the author's own
          words is a summary they can't calibrate. */}
      <p className="mt-3 text-xs text-site-text-dim">
        {t('takeaways-disclaimer', { defaultValue: 'Summarized by AI from this post.' })}
      </p>
    </aside>
  );
}

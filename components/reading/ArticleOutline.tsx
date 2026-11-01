'use client';

/**
 * "Contents" for a long article: a collapsed list of its `##`/`###` headings.
 *
 * The list is derived from the Markdown source (`extractOutline`), so it is in
 * the server HTML and adds no layout shift. After mount the same ids are handed
 * to the rendered headings, in order, which also makes any heading deep-linkable
 * (`/blog/post#section`). If the rendered heading count disagrees with the
 * source (an MDX/HTML heading, say) the ids are left alone and the list hides
 * rather than linking to nothing.
 */

import { useEffect, useState, type RefObject } from 'react';
import { ListTree } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { MIN_OUTLINE_ITEMS, type OutlineItem } from '@/lib/reading/outline';

export function ArticleOutline({
  items,
  containerRef,
}: {
  items: OutlineItem[];
  containerRef: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation('f-reading');
  const [matched, setMatched] = useState(true);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const heads = Array.from(root.querySelectorAll<HTMLElement>('h2, h3')).filter(
      (h) => !h.closest('[data-rf-skip]'),
    );
    if (heads.length !== items.length) {
      setMatched(false);
      return;
    }
    heads.forEach((h, i) => {
      h.id = items[i].id;
    });
    setMatched(true);
    // Arriving on a `#section` link: the heading did not exist at first paint.
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash) document.getElementById(hash)?.scrollIntoView();
  }, [items, containerRef]);

  if (!matched || items.length < MIN_OUTLINE_ITEMS) return null;

  return (
    <details data-rf-skip="" className="glass-fill mb-6 max-w-2xl rounded-site-sm text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 font-semibold text-site-text">
        <ListTree className="size-4 text-site-text-muted" aria-hidden />
        {t('outline-title', { defaultValue: 'Contents' })}
        <span className="text-site-text-muted">({items.length})</span>
      </summary>
      <nav aria-label={t('outline-title', { defaultValue: 'Contents' })} className="px-2 pb-2">
        <ol className="m-0 list-none p-0">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={cn(
                  'flex min-h-11 items-center rounded-site-sm px-2 py-2 text-site-text-muted hover:text-site-text',
                  item.level === 3 && 'ps-6',
                )}
              >
                {item.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

/**
 * The small pieces every RMH News view shares: a story's picture and its meta line.
 *
 * Pictures are the outlet's own, linked rather than copied (lib/news-wire/parse.ts): they load lazily, send no
 * referrer, and a picture that fails to load leaves its Steel placeholder (`--site-bg-subtle`, 1px border, 8px radius)
 * instead of a broken-image glyph.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RelativeTime } from '@/components/ui/RelativeTime';
import { isNewsCategory, type NewsCategory } from '@/lib/news-wire/categorize';
import { relativeTimeShort, cn } from '@/lib/utils';

interface NewsPictureProps {
  src: string | null | undefined;
  /** Decorative beside its headline, so empty by default; the article page passes the headline. */
  alt?: string;
  className?: string;
  /** The first picture on a page: load it with the page rather than when it scrolls near. */
  eager?: boolean;
}

export function NewsPicture({ src, alt = '', className, eager = false }: NewsPictureProps) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('overflow-hidden rounded-site border border-site-border bg-site-bg-subtle', className)}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="block h-full w-full object-cover"
        />
      ) : null}
    </div>
  );
}

interface NewsMetaProps {
  category?: string | null;
  publisher?: string | null;
  publishedAt?: Date | string | null;
  className?: string;
}

/** "Science · BBC News · 2h": the category, the outlet and how long ago, in `t-meta`. */
export function NewsMeta({ category, publisher, publishedAt, className }: NewsMetaProps) {
  const { t } = useTranslation('c-news');
  const parts: React.ReactNode[] = [];
  if (category) parts.push(<span key="c">{isNewsCategory(category) ? categoryLabel(t, category) : category}</span>);
  if (publisher) parts.push(<span key="p">{publisher}</span>);
  if (publishedAt) parts.push(<RelativeTime key="t" date={publishedAt} format={relativeTimeShort} />);
  return (
    <p className={cn('t-meta flex flex-wrap items-center gap-x-1.5', className)}>
      {parts.map((part, i) => (
        <span key={i} className="inline-flex items-center gap-x-1.5">
          {i > 0 ? <span aria-hidden>·</span> : null}
          {part}
        </span>
      ))}
    </p>
  );
}

/** The category names, one `t()` call each so the extractor finds them. */
export function categoryLabel(
  t: (key: string, opts: { defaultValue: string }) => string,
  category: NewsCategory,
): string {
  switch (category) {
    case 'World':
      return t('cat-world', { defaultValue: 'World' });
    case 'Politics':
      return t('cat-politics', { defaultValue: 'Politics' });
    case 'Business':
      return t('cat-business', { defaultValue: 'Business' });
    case 'Technology':
      return t('cat-technology', { defaultValue: 'Technology' });
    case 'AI':
      return t('cat-ai', { defaultValue: 'AI' });
    case 'Science':
      return t('cat-science', { defaultValue: 'Science' });
    case 'Space':
      return t('cat-space', { defaultValue: 'Space' });
    case 'Health':
      return t('cat-health', { defaultValue: 'Health' });
    case 'Climate':
      return t('cat-climate', { defaultValue: 'Climate' });
    case 'Gaming':
      return t('cat-gaming', { defaultValue: 'Gaming' });
    case 'Entertainment':
      return t('cat-entertainment', { defaultValue: 'Entertainment' });
    case 'Sports':
      return t('cat-sports', { defaultValue: 'Sports' });
  }
}

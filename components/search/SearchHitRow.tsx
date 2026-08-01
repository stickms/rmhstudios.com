'use client';

/**
 * One universal-search result.
 *
 * Search now spans nine corpora (people, posts, builds, blog, news, library,
 * games, apps, pages) and the "Top" tab interleaves them by score, so a result
 * row has to say *what kind of thing it is* without a section heading above it
 * to lean on. That is the whole job of this component: a per-kind medallion (or
 * the author's avatar, where a face is the better identifier) plus a kind label,
 * so a mixed list stays readable.
 */

import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  Compass,
  Gamepad2,
  LayoutGrid,
  Library,
  MessageSquare,
  Newspaper,
  Package,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';
import type { SearchHit, SearchKind } from '@/lib/search/types';

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  person: User,
  post: MessageSquare,
  build: Package,
  blog: BookOpen,
  news: Newspaper,
  library: Library,
  game: Gamepad2,
  app: LayoutGrid,
  page: Compass,
};

/**
 * Kind labels, as one static `t()` call each.
 *
 * A computed key (``t(`kind-${hit.kind}`)``) is invisible to `i18next-parser`:
 * the key never lands in `locales/`, and every non-English locale silently
 * serves the English `defaultValue` forever. Spelling the calls out is what
 * makes them extractable.
 */
export function useKindLabel(): (kind: SearchKind) => string {
  const { t } = useTranslation('feed');
  return (kind) => {
    switch (kind) {
      case 'person':
        return t('kind-person', { defaultValue: 'Person' });
      case 'post':
        return t('kind-post', { defaultValue: 'Post' });
      case 'build':
        return t('kind-build', { defaultValue: 'Build' });
      case 'blog':
        return t('kind-blog', { defaultValue: 'Blog' });
      case 'news':
        return t('kind-news', { defaultValue: 'News' });
      case 'library':
        return t('kind-library', { defaultValue: 'Book' });
      case 'game':
        return t('kind-game', { defaultValue: 'Game' });
      case 'app':
        return t('kind-app', { defaultValue: 'App' });
      case 'page':
        return t('kind-page', { defaultValue: 'Page' });
    }
  };
}

/** Plural section headings for the per-kind groups on a focused tab. */
export function useKindHeading(): (kind: SearchKind) => string {
  const { t } = useTranslation('feed');
  return (kind) => {
    switch (kind) {
      case 'person':
        return t('tab-people', { defaultValue: 'People' });
      case 'post':
        return t('tab-posts', { defaultValue: 'Posts' });
      case 'build':
        return t('tab-builds', { defaultValue: 'Builds' });
      case 'blog':
        return t('tab-blog', { defaultValue: 'Blog' });
      case 'news':
        return t('heading-news', { defaultValue: 'News' });
      case 'library':
        return t('heading-library', { defaultValue: 'Library' });
      case 'game':
        return t('heading-games', { defaultValue: 'Games' });
      case 'app':
        return t('heading-apps', { defaultValue: 'Apps' });
      case 'page':
        return t('heading-pages', { defaultValue: 'Pages' });
    }
  };
}

/** Kinds identified by a face rather than a glyph. */
const AVATAR_KINDS: ReadonlySet<SearchKind> = new Set<SearchKind>(['person', 'post']);

const ROW_CLASS =
  'flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-site-surface-hover';

export function SearchHitRow({ hit, showKind = true }: { hit: SearchHit; showKind?: boolean }) {
  const kindLabel = useKindLabel();
  const Icon = KIND_ICON[hit.kind];
  const external = Boolean(hit.meta?.external) || /^https?:\/\//.test(hit.href);

  const body = (
    <>
      {AVATAR_KINDS.has(hit.kind) ? (
        <UserAvatar src={hit.image} alt="" size={40} fallbackName={hit.title || 'U'} />
      ) : (
        // Etched medallion, matching EmptyState's treatment of an icon.
        <div className="glass-fill flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <Icon className="h-4 w-4 text-site-text-dim" aria-hidden />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-sm font-semibold text-site-text">{hit.title}</p>
          {showKind && (
            <span className="shrink-0 text-[0.6875rem] uppercase tracking-wide text-site-text-dim">
              {kindLabel(hit.kind)}
            </span>
          )}
        </div>
        {hit.subtitle && <p className="truncate text-xs text-site-text-muted">{hit.subtitle}</p>}
        {hit.snippet && (
          <p className="mt-0.5 line-clamp-2 text-sm text-site-text-muted">{hit.snippet}</p>
        )}
      </div>
    </>
  );

  if (external) {
    return (
      <a href={hit.href} target="_blank" rel="noopener noreferrer" className={ROW_CLASS}>
        {body}
      </a>
    );
  }

  return (
    <Link to={hit.href as string} className={ROW_CLASS}>
      {body}
    </Link>
  );
}

/**
 * A run of results under an optional heading. Used for the per-kind sections on
 * focused tabs and for the "less certain" tail on the Top tab.
 */
export function SearchHitSection({
  heading,
  hits,
  showKind = true,
  className,
}: {
  heading?: string;
  hits: SearchHit[];
  showKind?: boolean;
  className?: string;
}) {
  if (hits.length === 0) return null;
  return (
    <section className={cn('py-2', className)}>
      {heading && (
        <h2 className="px-4 py-1 text-xs font-semibold uppercase text-site-text-dim">{heading}</h2>
      )}
      {hits.map((hit) => (
        <SearchHitRow key={hit.key} hit={hit} showKind={showKind} />
      ))}
    </section>
  );
}

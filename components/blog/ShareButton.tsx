'use client';

import { Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { CopyButton } from '@/components/ui/copy-button';
import { SITE_URL } from '@/lib/seo';

interface ShareButtonProps {
  /** Article slug. */
  slug: string;
  /**
   * URL section the slug lives under. Defaults to `blog`, which is what this
   * button hardcoded before — so `/news/$slug` was copying a `/blog/…` link
   * that 404s.
   */
  section?: 'blog' | 'news';
  /** Extra classes for positioning at the call site. */
  className?: string;
}

/**
 * Copies a permalink to the current article.
 *
 * This used to be a bespoke button with its own `copied` state and a
 * `bg-black/60 text-white/70 hover:text-(--neon-cyan)` skin — one of the
 * hand-rolled copy affordances `CopyButton` exists to replace
 * (page-consistency.md §3 "States"). It now delegates: same icon, but the
 * shared control's tokens, focus ring, sonner toast and screen-reader
 * announcement.
 *
 * The URL is built from `SITE_URL` rather than `window.location.origin` so the
 * value is identical during SSR and after hydration — reading `window` in the
 * render path made this component client-only for no benefit.
 */
export function ShareButton({ slug, section = 'blog', className }: ShareButtonProps) {
  const { t } = useTranslation('c-blog');

  return (
    <CopyButton
      value={`${SITE_URL}/${section}/${slug}`}
      icon={Share2}
      label={t('copy-link', { defaultValue: 'Copy Link' })}
      className={className}
    />
  );
}

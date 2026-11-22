import { Rss } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

/**
 * The "RSS" text link on a page that has a feed: the lucide `Rss` icon at 16 px and the word, no badge or box. It is a
 * navigation word, so it is not underlined. The site pages use the default Steel look; the game updates page is an app
 * surface and passes its own class.
 */
export function RssLink({ href, className }: { href: string; className?: string }) {
  const { t } = useTranslation('rss-feeds');
  return (
    <a
      href={href}
      className={cn(
        'inline-flex items-center gap-1.5',
        className ?? 't-label min-h-9 text-site-text-muted hover:text-site-text [@media(pointer:coarse)]:min-h-11',
      )}
    >
      <Rss size={16} aria-hidden="true" />
      {t('link', { defaultValue: 'RSS' })}
    </a>
  );
}

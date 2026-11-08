/**
 * HomeHero — the top of the RMH Music home, matching the app's catalog card: the card's own
 * banner art in a 3:1 frame with the wordmark set on its lower edge.
 *
 * Both images come from the catalog entry (one source of truth with the card) through
 * `OptimizedImage`, so the build-time variants (AVIF/WebP at several widths) are used. Their boxes
 * are reserved by CSS (`.rmm-hero__frame`'s aspect ratio, `.rmm-hero__logo`'s), the banner is the
 * page's one priority image, and the frame's paper tone shows until it loads — so nothing moves
 * when the art arrives, and the layout does not depend on what the art shows (it is redrawn later
 * at the same paths and aspect ratios).
 */

import { useTranslation } from 'react-i18next';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import entry from '@/lib/catalog/apps/rmhmusic';

export function HomeHero() {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <div className="rmm-hero">
      <div className="rmm-hero__frame">
        {entry.bannerPath && (
          <OptimizedImage
            src={entry.bannerPath}
            alt=""
            width={896}
            height={299}
            priority
            // Stamped `data-loaded` by the site's media-reveal script as it loads.
            suppressHydrationWarning
          />
        )}
      </div>
      {entry.logoPath && (
        <div className="rmm-hero__logo">
          <OptimizedImage
            src={entry.logoPath}
            alt={t('hero-logo-alt', { defaultValue: 'RMH Music' })}
            width={320}
            height={84}
            loading="eager"
            suppressHydrationWarning
          />
        </div>
      )}
    </div>
  );
}

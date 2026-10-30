'use client';

import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import type { HeroSource } from '@/lib/games/library';

/**
 * The title's page header, the way Steam's game page opens: a wide hero with the
 * title on it, then the one primary action. The image is the banner when the title
 * has one, else its card art cropped, else a flat tile — never a missing hero.
 */
export function DetailHero({
  title,
  hero,
  playHref,
  cta,
  tags,
}: {
  title: string;
  hero: HeroSource;
  playHref: string;
  cta: string;
  tags: string[];
}) {
  const { t } = useTranslation('games-hub');
  return (
    <section aria-labelledby="library-detail-title" className="space-y-3">
      {/* The clip is on the image itself, not a wrapper: nothing may `overflow-hidden`
          directly around a jelly body, and the hero is plain media. */}
      <div className="relative">
        {hero.src ? (
          <OptimizedImage
            src={hero.src}
            alt=""
            width={1280}
            height={427}
            priority
            className="aspect-[3/1] w-full rounded-site object-cover"
            // Stamped `data-loaded` by the site's media-reveal script as it loads.
            suppressHydrationWarning
          />
        ) : (
          <div
            aria-hidden
            className="flex aspect-[3/1] w-full items-center justify-center rounded-site font-display text-6xl font-semibold text-site-media-ink"
            style={{ background: `hsl(${hero.hue} 32% 20%)` }}
          >
            {title.charAt(0)}
          </div>
        )}
        <div aria-hidden className="absolute inset-0 rounded-site bg-site-media-scrim" />
        <h1
          id="library-detail-title"
          className="absolute inset-x-5 bottom-4 font-display text-2xl font-semibold tracking-[-0.02em] text-site-media-ink sm:text-3xl"
        >
          {title}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="signal" size="lg">
          <a href={playHref}>
            <Play aria-hidden />
            {cta || t('play', { defaultValue: 'Play' })}
          </a>
        </Button>
        <ul className="flex min-w-0 flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <Badge>{tag}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

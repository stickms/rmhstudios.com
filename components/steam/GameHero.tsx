import { Play } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { heroSource } from '@/lib/games/library';

export interface GameHeroProps {
  title: string;
  /** The portrait card (`imagePath`). */
  image:
    | string
    | null;
  /** The wide key art (`bannerPath`). */
  bannerUrl:
    | string
    | null;
  /** The title as a wordmark (`logoPath`). */
  logoUrl:
    | string
    | null;
  hue: number;
}

/**
 * The hero of a title's library page: banner behind, card in front, wordmark over
 * the fade — Steam's layout.
 *
 * Lifted out of `GamePage` so every page about a title draws the same art. Slice It!
 * has its own hub page (`/games/slice-it`, which wins over `$gameId`) and it used to
 * skip this entirely, so selecting the game in the library showed neither its card nor
 * its banner.
 */
export function GameHero({
  title,
  image,
  bannerUrl,
  logoUrl,
  hue,
}: GameHeroProps) {
  const hero =
    heroSource(
      {
        thumbnailUrl:
          image,
        bannerUrl,
        hue,
      },
    );
  // The card stands in front of the hero art whenever it has one to show (over the banner,
  // or alone with a blurred copy).
  const hasCapsule =
    hero.kind ===
      'cropped-card' ||
    (hero.kind ===
      'banner' &&
      !!image);

  return (
    <div
      className="stm-hero"
      data-hero={
        hero.kind
      }
      data-capsule={
        hasCapsule
          ? 'true'
          : undefined
      }
    >
      {hero.kind ===
        'banner' &&
      hero.src ? (
        <>
          {/* The title's own banner is the backdrop; the card sits in front of it, as on Steam. */}
          <OptimizedImage
            src={
              hero.src
            }
            alt=""
            // Full-bleed across the viewport: `fullWidth` sizes the candidate from the real viewport and the screen's
            // density (not from the 1280 hint), and `width` picks the default file for browsers that ignore srcset.
            layout="fullWidth"
            width={
              1920
            }
            priority
            className="stm-hero-img"
            // Stamped `data-loaded` by the site's media-reveal script as it loads.
            suppressHydrationWarning
          />
          {image ? (
            <OptimizedImage
              src={
                image
              }
              alt=""
              width={
                320
              }
              height={
                480
              }
              priority
              className="stm-hero-capsule"
              suppressHydrationWarning
            />
          ) : null}
        </>
      ) : hero.kind ===
          'cropped-card' &&
        hero.src ? (
        <>
          {/* No wide art: a blurred copy fills the banner and the sharp capsule sits
              beside the title, as Steam does for a game that only has a capsule. */}
          <OptimizedImage
            src={
              hero.src
            }
            alt=""
            width={
              320
            }
            height={
              480
            }
            className="stm-hero-backdrop"
            suppressHydrationWarning
          />
          <OptimizedImage
            src={
              hero.src
            }
            alt=""
            width={
              320
            }
            height={
              480
            }
            priority
            className="stm-hero-capsule"
            suppressHydrationWarning
          />
        </>
      ) : (
        <div
          className="stm-hero-tile"
          aria-hidden
          style={{
            background: `hsl(${hue} 32% 22%)`,
          }}
        >
          {title.charAt(
            0,
          )}
        </div>
      )}
      <div
        className="stm-hero-fade"
        aria-hidden
      />
      <h1 className="stm-hero-title">
        {logoUrl ? (
          // The wordmark carries the title's name and typeface; its alt text keeps the heading readable.
          <img
            className="stm-hero-logo"
            src={
              logoUrl
            }
            alt={
              title
            }
            decoding="async"
          />
        ) : (
          title
        )}
      </h1>
    </div>
  );
}

/** The green Play bar under the hero, for pages that have no stats to show beside it. */
export function GamePlayBar({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'games-hub',
    );
  return (
    <div className="stm-actionbar">
      <a
        className="stm-btn stm-btn-play"
        href={
          href
        }
      >
        <Play
          aria-hidden
        />
        {label ||
          t(
            'play',
            {
              defaultValue:
                'Play',
            },
          )}
      </a>
    </div>
  );
}

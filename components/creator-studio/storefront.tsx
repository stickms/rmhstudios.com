/**
 * Create · Storefront.
 *
 * A Steam-style "store" layout shared by every Create surface (Games,
 * Apps, User Builds, AI Personas, and the Pages gallery). Instead of a flat,
 * uniform grid, items are laid out as:
 *
 *   1. a big rotating HERO banner (one spotlighted item, landscape art + CTA),
 *   2. a horizontally-scrollable SPOTLIGHT rail of a few featured items, and
 *   3. a varied catalog MOSAIC where some cards are wide and some are narrow.
 *
 * The storefront never reorders what it is given. The caller's list arrives ranked
 * (`lib/ranking/best.ts`: Best by default), so the first item is the hero, the next
 * few the rail and the rest the mosaic, and the same list always draws the same
 * page. It used to shuffle the list with a seed minted on every load, which put a
 * different creation in each position on each visit and made the chosen sort
 * meaningless. When the user is searching or has picked another sort we drop the
 * hero + rail and show the plain mosaic of results (`featured={false}`).
 *
 * The component is purely presentational: callers map their own data into the
 * common `StoreItem` shape, already in the order it should read.
 */

import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Info } from 'lucide-react';
import { IMAGE_VARIANTS, variantUrl } from '@/lib/images/variants.gen';
import { DeferOnNavigate } from '@/components/ui/defer-on-navigate';
import { EmptyState } from '@/components/ui/empty-state';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import '@/components/creator-studio/storefront.css';

/** A single thing on the shelf — a game, app, persona, build, or page. */
export type StoreItem = {
  id: string;
  title: string;
  description?: string;
  /** Cover/thumbnail. When absent we render the flat placeholder with the item's mark. */
  coverUrl?: string | null;
  /** Small pill in the art corner (status / category / like count node). */
  badge?: ReactNode;
  /** Short tag chips, shown on the hero + spotlight cards. */
  tags?: string[];
  /** Caption line under the title (e.g. "by Ada", "1.2k chats", "3d ago"). */
  meta?: ReactNode;
  /** Call-to-action label for the hero / spotlight ("Play now", "Open"). */
  cta?: string;
  /** Emoji fallback (personas) shown when there is no cover. */
  emoji?: string | null;
  /** Primary link — internal (full router path string) … */
  to?: string;
  /** … or external / playable href. One of `to`/`href` should be set. */
  href?: string;
  /** Optional secondary "details" link (router path), shown as an ⓘ button. */
  detailsTo?: string;
  detailsLabel?: string;
};

/** Initials/emoji used for the art placeholder when there's no cover. */
function fallbackMark(item: StoreItem): string {
  if (item.emoji) return item.emoji;
  return item.title.slice(0, 1).toUpperCase();
}

// ── Layout ───────────────────────────────────────────────────────────────────

/**
 * Which mosaic tiles are wide (span two columns): the third, and then every fifth.
 * A fixed function of position, so a list lays out the same way on every visit, and
 * never two wide tiles in a row, which keeps the dense grid from leaving holes.
 */
export function isWideTile(index: number): boolean {
  return index % 5 === 2;
}

// ── Cards ────────────────────────────────────────────────────────────────────

function PrimaryWrapper({
  item,
  className,
  children,
  ariaLabel,
}: {
  item: StoreItem;
  className: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  // No `data-evert` here. `data-evert="over"` laid the shared hover state layer over the whole card,
  // above its art; when Steel made that layer an opaque `--site-bg-subtle` fill, hovering, focusing or
  // pressing a card painted a solid block over its thumbnail and its title. A card's hover is its border.
  const shared = { className, 'aria-label': ariaLabel };
  if (item.to) {
    // Full router-path strings (cast like the rest of the app's dynamic links).
    return (
      <Link to={item.to as string} {...shared}>
        {children}
      </Link>
    );
  }
  return (
    <a href={item.href} {...shared}>
      {children}
    </a>
  );
}

/** Pick the cover source — the item's own thumbnail/object image, falling back
 *  to the flat placeholder when it has none. */
function coverFor(item: StoreItem): { src?: string } {
  return { src: item.coverUrl || undefined };
}

/**
 * The cards on `/games` and `/apps` are the site's heaviest image surface —
 * measured 2026-08-09, `/games` transferred 2,070 KB of art, with masters up to
 * 6.1x oversized for the box they render in (1280x720 shown at 209x117).
 *
 * `scripts/gen-image-variants.ts` pre-generates width variants for everything
 * under `public/images/**` and records them in the manifest below, so catalog
 * art can advertise a real srcSet. Anything NOT in the manifest — a user build's
 * `coverUrl`, an external URL — is deliberately left alone: those are not
 * pre-generated, and routing them through the resize proxy here would put image
 * work on the SSR tier for every card.
 */
function variantSrcSet(src: string): string | undefined {
  const entry = IMAGE_VARIANTS[src];
  if (!entry?.widths.length) return undefined;
  return entry.widths.map((w) => `${variantUrl(src, w)} ${w}w`).join(', ');
}

/**
 * The grid is 2 columns below 720px, then 3, 4 and 5 as it widens, inside a
 * 1400px container (see storefront.css) — so a card tops out around 280px. The
 * hero spans the full container and passes its own `sizes`.
 */
const CARD_SIZES = '(max-width: 719px) 48vw, (max-width: 1100px) 33vw, 300px';

function Art({
  item,
  src,
  fallbackSrc,
  eager = false,
  sizes = CARD_SIZES,
}: {
  item: StoreItem;
  src?: string;
  fallbackSrc?: string;
  eager?: boolean;
  sizes?: string;
}) {
  // Covers can 404 — e.g. a vibe screenshot the worker hasn't rendered yet.
  // Walk src → fallbackSrc → the flat placeholder instead of ever
  // showing a broken image.
  const candidates = [src, fallbackSrc].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const current = idx < candidates.length ? candidates[idx] : null;

  // A `srcset` carrying `w` descriptors REPLACES `src` in the candidate set
  // (HTML "update the source set": `src` is only appended when no candidate has
  // a width descriptor). So a variant URL that 404s does NOT quietly fall back
  // to the master sitting right there in `src` — the load fails and the card
  // drops to its letter placeholder.
  //
  // That is not hypothetical: the manifest is committed while the files it names
  // are gitignored and generated by `pnpm images:variants`, so any build path
  // that skips that step (the Dockerfile did; `pnpm dev` did) blanks every image
  // on the site while the masters are untouched on disk. Both are fixed, but the
  // failure was invisible — `images:variants:check` validates the MANIFEST, not
  // the files — so treat a variant error as "serve the master" rather than
  // "give up on this image".
  const [useVariants, setUseVariants] = useState(true);
  const srcSet = current && useVariants ? variantSrcSet(current) : undefined;

  // The card's text comes from the build-time catalog and is painted with the
  // first frame; only the art arrives over the network, over `.store-art`'s
  // flat placeholder fill.
  //
  // An image served from cache can already be `complete` before React attaches
  // `onLoad`, which would leave it stuck at opacity 0 — hence the ref check on
  // mount. `src` is in the dep list so the fallback walk re-arms it.
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    // Re-arm the variant attempt for each new candidate. Keyed on `current`, so
    // the drop-the-srcSet retry below (which leaves `current` alone) can't
    // re-enable itself and spin.
    setUseVariants(true);
    setLoaded(false);
  }, [current]);
  useEffect(() => {
    const image = imgRef.current;
    if (!image?.complete) return;
    // A cached failure can finish before hydration attaches onError. Treat it
    // exactly like a live failure, while keeping the reserved art rectangle.
    if (image.naturalWidth > 0) setLoaded(true);
    else if (srcSet) setUseVariants(false);
    else setIdx((i) => i + 1);
  }, [current, srcSet]);

  return current ? (
    <img
      ref={imgRef}
      className={`store-art__img${loaded ? ' is-loaded' : ''}`}
      src={current}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setLoaded(true)}
      // Two steps down, not one. A failure while we are serving variants means
      // the variant is missing, not the art — so retry this same candidate with
      // the srcSet dropped, which puts the master back in play. Only once the
      // master itself fails do we move to the next candidate (and finally the
      // gradient placeholder). The fallback walk changes `current`, so the
      // srcSet follows it — a fallback with no variants is a bare src already.
      onError={() => {
        setLoaded(false);
        if (srcSet) setUseVariants(false);
        else setIdx((i) => i + 1);
      }}
    />
  ) : (
    <div className="store-art__placeholder" aria-hidden="true">
      <span className="store-art__mark">{fallbackMark(item)}</span>
    </div>
  );
}

function TagRow({ tags }: { tags?: string[] }) {
  if (!tags?.length) return null;
  return (
    <span className="store-tags">
      {tags.slice(0, 3).map((tag) => (
        <span key={tag} className="store-tag">
          {tag}
        </span>
      ))}
    </span>
  );
}

/** The big top banner. */
function HeroCard({ item, className }: { item: StoreItem; className?: string | undefined }) {
  const { t } = useTranslation('feed');
  return (
    <div className={cn('store-hero', className)}>
      <PrimaryWrapper item={item} className="store-hero__link" ariaLabel={item.title}>
        <div className="store-hero__art">
          <Art item={item} {...coverFor(item)} eager sizes="100vw" />
          <span className="store-hero__scrim" aria-hidden="true" />
        </div>
        <div className="store-hero__body">
          <span className="store-hero__eyebrow">
            {item.badge ?? t('store-featured', { defaultValue: 'Featured' })}
          </span>
          <h3 className="store-hero__title">{item.title}</h3>
          {item.description && <p className="store-hero__desc">{item.description}</p>}
          <TagRow tags={item.tags} />
          <span className="store-hero__cta">
            {item.cta ?? 'Open'}
            <ArrowRight size={16} />
          </span>
        </div>
      </PrimaryWrapper>
    </div>
  );
}

/** A medium card for the horizontal "featured" rail. */
function SpotlightCard({ item }: { item: StoreItem }) {
  return (
    <div className="store-spot">
      <PrimaryWrapper item={item} className="store-spot__link" ariaLabel={item.title}>
        <div className="store-art store-spot__art">
          <Art item={item} {...coverFor(item)} />
          {item.badge && <span className="store-art__badge">{item.badge}</span>}
        </div>
        <div className="store-spot__body">
          <p className="store-spot__title">{item.title}</p>
          {item.description && <p className="store-spot__desc">{item.description}</p>}
          {item.meta && <p className="store-spot__meta">{item.meta}</p>}
        </div>
      </PrimaryWrapper>
    </div>
  );
}

/** A catalog tile — `wide` ones span two columns and show their description. */
function MosaicCard({
  item,
  wide,
  className,
}: {
  item: StoreItem;
  wide: boolean;
  className?: string | undefined;
}) {
  const { t } = useTranslation('feed');
  const detailsLabel = item.detailsLabel ?? t('store-details', { defaultValue: 'Details' });
  return (
    <div className={cn('store-card', wide && 'is-wide', className)}>
      <PrimaryWrapper item={item} className="store-card__link" ariaLabel={item.title}>
        <div className="store-art store-card__art">
          <Art item={item} {...coverFor(item)} />
          {item.badge && <span className="store-art__badge">{item.badge}</span>}
        </div>
        <div className="store-card__body">
          <p className="store-card__title">{item.title}</p>
          {wide && item.description && <p className="store-card__desc">{item.description}</p>}
          {item.meta && <p className="store-card__meta">{item.meta}</p>}
        </div>
      </PrimaryWrapper>
      {item.detailsTo && (
        <Link
          to={item.detailsTo as string}
          className="store-card__details"
          aria-label={detailsLabel}
          title={detailsLabel}
        >
          <Info size={15} aria-hidden />
        </Link>
      )}
    </div>
  );
}

// ── Storefront ────────────────────────────────────────────────────────────────

export function Storefront({
  items,
  featured = true,
  spotlightCount = 4,
  toolbar,
  emptyLabel,
}: {
  /** In display order. The storefront does not sort or shuffle. */
  items: StoreItem[];
  /** When false (an active search, a non-default sort), show only the plain mosaic. */
  featured?: boolean;
  spotlightCount?: number;
  /** Optional controls (search/sort/submit) rendered above the storefront. */
  toolbar?: ReactNode;
  emptyLabel?: ReactNode;
}) {
  const { hero, spotlight, mosaic } = useMemo(() => {
    if (!featured || items.length < 5) {
      return { hero: null as StoreItem | null, spotlight: [] as StoreItem[], mosaic: items };
    }
    return {
      hero: items[0] ?? null,
      spotlight: items.slice(1, 1 + spotlightCount),
      mosaic: items.slice(1 + spotlightCount),
    };
  }, [items, featured, spotlightCount]);

  const { t } = useTranslation('feed');
  // Callers that fetch start with no items (the empty label says Loading); what replaces it fades in,
  // and so does every tile a later page appends (Steel M9). A catalogue given on first render does not.
  const arrival = useArrival(items.length > 0);
  const isNew = useArrivingKeys(items.map((item) => item.id));

  return (
    <div className="store">
      {toolbar}

      {items.length === 0 ? (
        <EmptyState
          description={emptyLabel ?? t('store-empty', { defaultValue: 'Nothing here yet.' })}
        />
      ) : (
        <>
          {hero && <HeroCard item={hero} className={arrival} />}

          {spotlight.length > 0 && (
            <section
              className={cn('store-rail', arrival)}
              aria-label={t('store-featured', { defaultValue: 'Featured' })}
            >
              <div className="store-rail__track">
                {spotlight.map((item) => (
                  <SpotlightCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          {/* With a hero, the mosaic starts below the fold, and it is most of
              the page's DOM — so on a page switch it is built after the hero
              has painted rather than inside the same commit. */}
          <DeferOnNavigate enabled={Boolean(hero)} minHeight="60vh">
            <div className={cn('store-mosaic', arrival)}>
              {mosaic.map((item, i) => (
                <MosaicCard
                  key={item.id}
                  item={item}
                  wide={isWideTile(i)}
                  className={isNew(item.id) ? ARRIVE : undefined}
                />
              ))}
            </div>
          </DeferOnNavigate>
        </>
      )}
    </div>
  );
}

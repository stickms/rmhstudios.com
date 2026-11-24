/**
 * Create · Storefront.
 *
 * A Steam-style "store" layout shared by every Create surface (Games,
 * Apps, User Builds, AI Personas, and the Pages gallery). Instead of a flat,
 * uniform grid, items are laid out as:
 *
 *   1. a big rotating HERO banner (one spotlighted item, landscape art + CTA),
 *   2. a few featured items, and
 *   3. the catalogue, both drawn as news-style rows on rules, two to a row where they fit (storefront.css).
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
import '@/components/create/storefront.css';

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
  const shared = {
    className,
    'aria-label': ariaLabel,
  };
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
function coverFor(item: StoreItem): {
  src?: string;
} {
  return {
    src: item.coverUrl || undefined,
  };
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
 * The grid is one column on a phone and two or three tiles of at least 344px
 * otherwise, inside a 1400px container (see storefront.css), so a card tops out
 * around 450px. The hero spans the full container and passes its own `sizes`.
 */
const CARD_SIZES = '(max-width: 719px) 100vw, 460px';

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
            {item.badge ??
              t('store-featured', {
                defaultValue: 'Featured',
              })}
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

/** A description longer than this needs the full row to read; shorter ones pair up, two to a row. */
const WIDE_DESCRIPTION = 100;

type RowSlot = { item: StoreItem; wide: boolean; col: 0 | 1; last: boolean };

/**
 * Lay the items out two to a row where they fit, in the order given. An item with a long description takes a whole
 * row; a short one before it, left without a partner, takes a whole row too, so no row has a hole. `col` says which
 * side of a pair an item is on (the second side draws the vertical rule) and `last` marks the items of the final row,
 * which draw no rule under them.
 */
export function layoutRows(items: StoreItem[]): RowSlot[] {
  const slots: RowSlot[] = [];
  let col: 0 | 1 = 0;
  for (const item of items) {
    const wide = (item.description?.length ?? 0) > WIDE_DESCRIPTION;
    if (wide) {
      const lone = slots[slots.length - 1];
      if (col === 1 && lone) lone.wide = true;
      slots.push({ item, wide: true, col: 0, last: false });
      col = 0;
    } else {
      slots.push({ item, wide: false, col, last: false });
      col = col === 0 ? 1 : 0;
    }
  }
  const final = slots[slots.length - 1];
  if (final) {
    if (col === 1) final.wide = true;
    final.last = true;
    const partner = slots[slots.length - 2];
    if (!final.wide && final.col === 1 && partner) partner.last = true;
  }
  return slots;
}

/** One catalogue entry as a news-style row: title, description and meta on the start side, a small picture at the end. */
function StoreRow({ slot, className }: { slot: RowSlot; className?: string | undefined }) {
  const { item, wide, col, last } = slot;
  const { t } = useTranslation('feed');
  const detailsLabel =
    item.detailsLabel ??
    t('store-details', {
      defaultValue: 'Details',
    });
  return (
    <li
      className={cn('store-row', className)}
      data-wide={wide ? '' : undefined}
      data-col={col}
      data-last={last ? '' : undefined}
    >
      <PrimaryWrapper item={item} className="store-row__link" ariaLabel={item.title}>
        <div className="store-row__text">
          {item.meta && <p className="store-row__meta t-meta">{item.meta}</p>}
          <p className="store-row__title t-heading">{item.title}</p>
          {item.description && <p className="store-row__desc t-body">{item.description}</p>}
        </div>
        <div className="store-art store-row__art">
          <Art item={item} {...coverFor(item)} />
          {item.badge && <span className="store-art__badge">{item.badge}</span>}
        </div>
      </PrimaryWrapper>
      {item.detailsTo && (
        <Link
          to={item.detailsTo as string}
          className="store-row__details"
          aria-label={detailsLabel}
          title={detailsLabel}
        >
          <Info size={15} aria-hidden />
        </Link>
      )}
    </li>
  );
}

/** A list of catalogue rows, two to a row where the container is wide enough (storefront.css). */
function StoreRows({
  items,
  className,
  isNew,
}: {
  items: StoreItem[];
  className?: string | undefined;
  isNew?: ((id: string) => boolean) | undefined;
}) {
  const slots = useMemo(() => layoutRows(items), [items]);
  return (
    <div className="store-rows-wrap">
      <ul className={cn('store-rows', className)}>
        {slots.map((slot) => (
          <StoreRow key={slot.item.id} slot={slot} className={isNew?.(slot.item.id) ? ARRIVE : undefined} />
        ))}
      </ul>
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
      return {
        hero: null as StoreItem | null,
        spotlight: [] as StoreItem[],
        mosaic: items,
      };
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
          description={
            emptyLabel ??
            t('store-empty', {
              defaultValue: 'Nothing here yet.',
            })
          }
        />
      ) : (
        <>
          {hero && <HeroCard item={hero} className={arrival} />}

          {spotlight.length > 0 && (
            <section
              className={arrival}
              aria-label={t('store-featured', {
                defaultValue: 'Featured',
              })}
            >
              <StoreRows items={spotlight} />
            </section>
          )}

          {/* With a hero, the mosaic starts below the fold, and it is most of
              the page's DOM — so on a page switch it is built after the hero
              has painted rather than inside the same commit. */}
          <DeferOnNavigate enabled={Boolean(hero)} minHeight="60vh">
            <StoreRows items={mosaic} className={arrival} isNew={isNew} />
          </DeferOnNavigate>
        </>
      )}
    </div>
  );
}

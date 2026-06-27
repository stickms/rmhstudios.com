/**
 * Creator Studio · Storefront.
 *
 * A Steam-style "store" layout shared by every Creator Studio surface (Games,
 * Apps, User Builds, AI Personas, and the Pages gallery). Instead of a flat,
 * uniform grid, items are laid out as:
 *
 *   1. a big rotating HERO banner (one spotlighted item, landscape art + CTA),
 *   2. a horizontally-scrollable SPOTLIGHT rail of a few featured items, and
 *   3. a varied catalog MOSAIC where some cards are wide and some are narrow.
 *
 * Which items get featured — and which mosaic tiles are wide — is chosen from a
 * `seed`. Routes mint a fresh seed per load, so a refresh re-advertises a
 * different mix of games/apps/personas/pages while staying deterministic between
 * server render and client hydration (no layout flash). When the user is
 * searching/filtering we drop the hero + rail and just show the plain mosaic of
 * results (`featured={false}`).
 *
 * The component is purely presentational: callers map their own data into the
 * common `StoreItem` shape and hand it a `seed`.
 */

import { type PointerEvent as ReactPointerEvent, type ReactNode, useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowRight, Info } from 'lucide-react';

/** A single thing on the shelf — a game, app, persona, build, or page. */
export type StoreItem = {
  id: string;
  title: string;
  description?: string;
  /** Cover/thumbnail. When absent we render a tinted gradient placeholder. */
  coverUrl?: string | null;
  /** Deterministic accent hue (0–359) for the gradient placeholder + glow. */
  hue?: number;
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

function hueGradient(hue: number | undefined): string {
  const h = hue ?? 220;
  return `linear-gradient(150deg, hsl(${h} 42% 24%), hsl(${(h + 40) % 360} 38% 11%))`;
}

/** Initials/emoji used for the art placeholder when there's no cover. */
function fallbackMark(item: StoreItem): string {
  if (item.emoji) return item.emoji;
  return item.title.slice(0, 1).toUpperCase();
}

// ── Seeded helpers (pure; identical on server + client) ─────────────────────

/** mulberry32 — tiny deterministic PRNG. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  const rng = makeRng(seed || 1);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Decide which mosaic tiles are "wide" (span 2 columns) from the seed. We make
 * roughly every third tile wide, offset by the seed, but never two wide tiles
 * back-to-back — that keeps the dense grid from leaving big holes.
 */
function wideFlags(count: number, seed: number): boolean[] {
  const rng = makeRng((seed || 1) ^ 0x9e3779b9);
  const flags: boolean[] = [];
  let sinceWide = 0;
  for (let i = 0; i < count; i++) {
    const wide = sinceWide >= 1 && rng() < 0.34;
    flags.push(wide);
    sinceWide = wide ? 0 : sinceWide + 1;
  }
  return flags;
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** Follow the pointer so the card's glow + subtle tilt track the cursor. */
function trackPointer(e: ReactPointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const mx = ((e.clientX - r.left) / r.width) * 100;
  const my = ((e.clientY - r.top) / r.height) * 100;
  el.style.setProperty('--mx', `${mx}%`);
  el.style.setProperty('--my', `${my}%`);
}

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
  const shared = {
    className,
    'aria-label': ariaLabel,
    onPointerMove: trackPointer,
    style: { '--card-hue': String(item.hue ?? 220) } as React.CSSProperties,
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
 *  to the tinted gradient placeholder when it has none. */
function coverFor(item: StoreItem): { src?: string } {
  return { src: item.coverUrl || undefined };
}

function Art({
  item,
  src,
  fallbackSrc,
  eager = false,
}: {
  item: StoreItem;
  src?: string;
  fallbackSrc?: string;
  eager?: boolean;
}) {
  // Covers can 404 — e.g. a vibe screenshot the worker hasn't rendered yet.
  // Walk src → fallbackSrc → the tinted gradient placeholder instead of ever
  // showing a broken image.
  const candidates = [src, fallbackSrc].filter(Boolean) as string[];
  const [idx, setIdx] = useState(0);
  const current = idx < candidates.length ? candidates[idx] : null;
  return current ? (
    <img
      className="store-art__img"
      src={current}
      alt=""
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
    />
  ) : (
    <div className="store-art__placeholder" style={{ backgroundImage: hueGradient(item.hue) }} aria-hidden="true">
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
function HeroCard({ item }: { item: StoreItem }) {
  return (
    <div className="store-hero" style={{ '--card-hue': String(item.hue ?? 220) } as React.CSSProperties}>
      <PrimaryWrapper item={item} className="store-hero__link" ariaLabel={item.title}>
        <div className="store-hero__art">
          <Art item={item} {...coverFor(item)} eager />
          <span className="store-hero__scrim" aria-hidden="true" />
        </div>
        <div className="store-hero__body">
          <span className="store-hero__eyebrow">
            {item.badge ?? 'Featured'}
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
          <span className="store-spot__glow" aria-hidden="true" />
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
function MosaicCard({ item, wide, index }: { item: StoreItem; wide: boolean; index: number }) {
  return (
    <div
      className={`store-card ${wide ? 'is-wide' : ''}`}
      style={{ animationDelay: `${(index % 10) * 45}ms` }}
    >
      <PrimaryWrapper item={item} className="store-card__link" ariaLabel={item.title}>
        <div className="store-art store-card__art">
          <Art item={item} {...coverFor(item)} />
          {item.badge && <span className="store-art__badge">{item.badge}</span>}
          <span className="store-card__glow" aria-hidden="true" />
          {item.description && <p className="store-card__hoverdesc">{item.description}</p>}
        </div>
        <div className="store-card__body">
          <p className="store-card__title">{item.title}</p>
          {wide && item.description && <p className="store-card__desc">{item.description}</p>}
          {item.meta && <p className="store-card__meta">{item.meta}</p>}
        </div>
      </PrimaryWrapper>
      {item.detailsTo && (
        <Link to={item.detailsTo as string} className="store-card__details" aria-label={item.detailsLabel ?? 'Details'} title={item.detailsLabel ?? 'Details'}>
          <Info size={15} />
        </Link>
      )}
    </div>
  );
}

// ── Storefront ────────────────────────────────────────────────────────────────

export function Storefront({
  items,
  seed,
  featured = true,
  spotlightCount = 4,
  toolbar,
  emptyLabel,
}: {
  items: StoreItem[];
  seed: number;
  /** When false (e.g. an active search), show only the plain mosaic. */
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
    const shuffled = seededShuffle(items, seed);
    return {
      hero: shuffled[0],
      spotlight: shuffled.slice(1, 1 + spotlightCount),
      mosaic: shuffled.slice(1 + spotlightCount),
    };
  }, [items, seed, featured, spotlightCount]);

  const flags = useMemo(() => wideFlags(mosaic.length, seed), [mosaic.length, seed]);

  return (
    <div className="store">
      {toolbar}

      {items.length === 0 ? (
        <p className="store__empty">{emptyLabel ?? 'Nothing here yet.'}</p>
      ) : (
        <>
          {hero && <HeroCard item={hero} />}

          {spotlight.length > 0 && (
            <section className="store-rail" aria-label="Featured">
              <div className="store-rail__track">
                {spotlight.map((item) => (
                  <SpotlightCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          )}

          <div className="store-mosaic">
            {mosaic.map((item, i) => (
              <MosaicCard key={item.id} item={item} wide={flags[i] ?? false} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

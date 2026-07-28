'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';
import { RmhLogo } from './RmhLogo';

type HubUser = { id: string; handle?: string | null; isAdmin?: boolean };

/** closed → open (orb glides to centre AS the menu blooms) → closing → closed. */
type Phase = 'closed' | 'open' | 'closing';

interface Wedge extends NavLeaf {
  /** clip-path polygon (in % of the square dial) that carves this ring sector. */
  clip: string;
  /** The same sector, bled outward, for the goo-filtered decorative layer. */
  clipArt: string;
  /** Centroid of the visible annulus, in % — where the icon + label sit. */
  cx: number;
  cy: number;
  /** 0 = inner ring, 1 = outer ring. Drives the label budget and the stagger. */
  ring: 0 | 1;
  /** Bloom order across both rings (inner first), for the open stagger. */
  order: number;
}

const DEG = Math.PI / 180;

/**
 * Ring geometry, as a percentage of the dial's width (the dial is a square, so
 * its radius is 50%). The hole in the middle clears the orb, which glides to the
 * exact centre when the menu opens.
 *
 *   0 ──── 19 ─────────────── 34 ── 36 ─────────────── 50
 *    hole        inner ring     gap      outer ring     rim
 *
 * The gap between the decks is deliberately wide enough to read as a track, not
 * a seam — `RadialHub` also renders a hairline at every boundary below, so the
 * two levels are separated by a drawn border rather than by absence of fill.
 */
const RINGS = [
  { r0: 19, r1: 34 },
  { r0: 36, r1: 50 },
] as const;
/** With few enough destinations one ring is clearer than two. */
const SINGLE_RING = { r0: 19, r1: 50 } as const;
/**
 * The art layer is drawn slightly wider ANGULARLY than the hit layer. The goo
 * filter blurs-then-thresholds each sector, which erodes a couple of pixels off
 * every edge; without the bleed that erosion turns the thin angular dividers
 * inside a ring into wide gaps. It is deliberately NOT applied radially: the
 * boundaries between levels are meant to be pronounced, so the erosion there is
 * welcome and the drawn hairlines sit on top of it. Hit testing always uses the
 * exact geometry, so the bleed can't steal a neighbour's clicks.
 */
const ART_BLEED_DEG = 0.25;
const SINGLE_RING_MAX = 6;
/** Cap on the inner ring — it has the shorter circumference of the two. */
const INNER_MAX = 6;
// One synchronous motion: the orb, the circular blur, the wedges and the foot all
// animate together over this long. It also gates how long the overlay stays
// mounted while closing so the whole thing animates OUT before it hides.
const MOTION_MS = 500;

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/**
 * An annulus sector — the ring-segment polygon that carves one destination out
 * of a ring: out along the outer arc over [a0,a1], then back along the inner one.
 * Coordinates are percentages of the dial's box, which is what `clip-path`
 * resolves against (and, because a clip bounds hit-testing too, is also exactly
 * the region that catches this destination's clicks).
 */
function ringSector(a0: number, a1: number, r0: number, r1: number): string {
  const pts: string[] = [];
  const steps = 10;
  const at = (k: number) => (a0 + ((a1 - a0) * k) / steps) * DEG;
  for (let k = 0; k <= steps; k++) {
    const t = at(k);
    pts.push(`${(50 + r1 * Math.cos(t)).toFixed(2)}% ${(50 + r1 * Math.sin(t)).toFixed(2)}%`);
  }
  for (let k = steps; k >= 0; k--) {
    const t = at(k);
    pts.push(`${(50 + r0 * Math.cos(t)).toFixed(2)}% ${(50 + r0 * Math.sin(t)).toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}

/**
 * The RMH radial navigator. Tapping the fixed RMH orb glides it to the **centre of
 * the screen** while — in the SAME synchronous motion — the backdrop reveals under
 * an expanding **circular blur** and a **pie/wedge menu** blooms around it (no
 * drawn colour disc; just frosted glass growing from the centre). Closing reverses
 * every layer together. framer-motion-free (CSS transitions/clip-path) to stay
 * light on mobile; icon-only wedges under 480px so destinations never crowd.
 */
export function RadialHub() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const reduced = useReducedMotion();
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as HubUser | undefined;

  const [phase, setPhase] = useState<Phase>('closed');
  /**
   * Name of the wedge the pointer/focus is on. Below 480px the dial is
   * icon-only — sixteen unlabelled glyphs as the site's whole navigation — and
   * there is genuinely no room for sixteen labels on a 320px dial. So the label
   * moves to the one place that has room: the hole in the middle. CSS shows it
   * only where the per-wedge labels are hidden.
   */
  const [hoveredLabel, setHoveredLabel] = useState<string | null>(null);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuVisible = phase === 'open' || phase === 'closing';
  useEffect(() => {
    if (phase === 'closed') setHoveredLabel(null);
  }, [phase]);

  const leaves = useMemo<NavLeaf[]>(() => {
    const out: NavLeaf[] = [];
    for (const item of SIDEBAR_NAV) {
      if (isNavGroup(item)) out.push(...item.children);
      else out.push(item);
    }
    return out.filter((leaf) => {
      if (leaf.requiresAuth && !session) return false;
      if (leaf.requiresAdmin && !user?.isAdmin) return false;
      return true;
    });
  }, [session, user?.isAdmin]);

  // Carve the dial into one sector per destination, starting at the top and
  // going clockwise, with a thin gap between sectors and the icon + label at the
  // centroid of each sector's visible band.
  //
  // Sixteen destinations on ONE ring gave slivers too narrow to label or to hit
  // reliably, so the dial is double-decked: the primary destinations take the
  // inner ring and the rest take the outer one, which — being the longer arc —
  // comfortably holds the tail. Each ring is divided independently, so neither
  // one's crowding is inherited from the other. Below SINGLE_RING_MAX the split
  // is pointless and a single wide ring reads better.
  //
  // It also returns the BOUNDARY RADII it used. The drawn borders between levels
  // and the mask that carves the centre hole are derived from the same numbers
  // as the sectors themselves, so a change to the geometry can never leave the
  // hairlines sitting somewhere the bands are not.
  const { wedges, bounds } = useMemo<{ wedges: Wedge[]; bounds: number[] }>(() => {
    if (leaves.length === 0) return { wedges: [], bounds: [] };

    const groups: Array<{ items: NavLeaf[]; band: { r0: number; r1: number }; ring: 0 | 1 }> =
      leaves.length <= SINGLE_RING_MAX
        ? [{ items: leaves, band: SINGLE_RING, ring: 0 }]
        : (() => {
            const innerCount = Math.min(INNER_MAX, Math.ceil(leaves.length / 2));
            return [
              { items: leaves.slice(0, innerCount), band: RINGS[0], ring: 0 as const },
              { items: leaves.slice(innerCount), band: RINGS[1], ring: 1 as const },
            ];
          })();

    const out: Wedge[] = [];
    let order = 0;
    for (const { items, band, ring } of groups) {
      const n = Math.max(1, items.length);
      const seg = 360 / n;
      const gap = Math.min(1.4, seg * 0.06);
      const rm = (band.r0 + band.r1) / 2;
      for (let i = 0; i < items.length; i++) {
        const a0 = -90 + i * seg + gap / 2;
        const a1 = -90 + (i + 1) * seg - gap / 2;
        const am = ((a0 + a1) / 2) * DEG;
        out.push({
          ...items[i],
          clip: ringSector(a0, a1, band.r0, band.r1),
          clipArt: ringSector(a0 - gap * ART_BLEED_DEG, a1 + gap * ART_BLEED_DEG, band.r0, band.r1),
          cx: 50 + rm * Math.cos(am),
          cy: 50 + rm * Math.sin(am),
          ring,
          order: order++,
        });
      }
    }
    const bounds = [...new Set(groups.flatMap(({ band }) => [band.r0, band.r1]))].sort(
      (a, b) => a - b,
    );
    return { wedges: out, bounds };
  }, [leaves]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const close = useCallback(() => {
    clearTimer();
    setPhase((p) => (p === 'closed' ? p : 'closing'));
    // Keep the overlay mounted while every layer animates out, then hide it.
    timerRef.current = setTimeout(() => setPhase('closed'), reduced ? 0 : MOTION_MS);
  }, [reduced]);

  const toggle = useCallback(() => {
    clearTimer();
    setPhase((p) => {
      // Opening is a single synchronous transition — no pre-centring step.
      if (p === 'closed') return 'open';
      timerRef.current = setTimeout(() => setPhase('closed'), reduced ? 0 : MOTION_MS);
      return 'closing';
    });
  }, [reduced]);

  // Block background scroll + wire Escape while the menu is active; move focus
  // into the dial once it has bloomed.
  //
  // Deliberately NOT a CSS scroll-lock on the document. Both `overflow: hidden`
  // and the position:fixed body technique clip the document to the visual
  // viewport, which on iOS clips away the content that normally scrolls under
  // Safari's floating bottom bar and leaves the bare page background showing
  // there as a stray coloured band. That was established on-device for the
  // mobile push-drawer this hub replaced, and is why that drawer blocked
  // background scroll from its scrim instead — the same approach used here.
  // Touch panning is blocked by `touch-action: none` on the overlay (radial.css);
  // wheel is blocked here, since touch-action doesn't cover pointer devices.
  useEffect(() => {
    if (phase === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault();
    };
    const overlay = overlayRef.current;
    window.addEventListener('keydown', onKey);
    overlay?.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      overlay?.removeEventListener('wheel', onWheel);
    };
  }, [phase, close]);

  useEffect(() => {
    if (phase !== 'open') return;
    const raf = requestAnimationFrame(() =>
      dialRef.current?.querySelector<HTMLElement>('a[href], [tabindex]')?.focus(),
    );
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  useEffect(() => () => clearTimer(), []);

  const signOut = useCallback(async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          close();
          navigate({ to: '/' });
          window.location.reload();
        },
      },
    });
  }, [navigate, close]);

  const tab = menuVisible ? 0 : -1;

  return (
    <div className="radial-hub" data-phase={phase}>
      {/* Metaball aura — a decorative layer BEHIND the orb holding a disc the
          orb's size plus a few orbiting blobs, all under the goo filter so they
          stretch and fuse into one wobbling liquid mass around it. It is its own
          layer (not a pseudo-element on the orb) because filtering the orb would
          also chew the RMH mark's hairline strokes. It tracks the orb's docked /
          centred position from the same tokens, and carries no `data-floating`
          so it never joins the mobile floating-bottom stack. */}
      {/* Legibility scrim — fades the page ground in behind the docked orb so
          content scrolling through its band dissolves instead of colliding
          with it (see radial.css). Paints under the aura and the orb. */}
      <div className="radial-hub__scrim" aria-hidden />

      <div className="radial-hub__aura" aria-hidden>
        <span className="radial-hub__aura-core" />
        {[0, 1, 2].map((i) => (
          <span key={i} className="radial-hub__aura-blob" style={{ ['--i' as string]: i }} />
        ))}
      </div>

      <button
        type="button"
        className="radial-hub__orb"
        // §5.5x A.1: bottom member of the mobile floating-bottom stack. Present on
        // every _site page, so globals.css lifts the cookie bar, mini-player and
        // back-to-top clear of it (and of the feed's compose FAB, which shares
        // this row but is shorter).
        data-floating="hub"
        aria-haspopup="menu"
        aria-expanded={phase !== 'closed'}
        aria-label={t('open-menu', { defaultValue: 'Open navigation' })}
        onClick={toggle}
      >
        <RmhLogo className="radial-hub__logo" />
      </button>

      <div
        ref={overlayRef}
        className="radial-hub__overlay"
        role="presentation"
        aria-hidden={!menuVisible}
      >
        <button
          type="button"
          className="radial-hub__scrim"
          onClick={close}
          aria-label={t('close', { defaultValue: 'Close' })}
          tabIndex={tab}
        />

        <div className="radial-hub__blur" aria-hidden />

        <div
          ref={dialRef}
          className="radial-hub__dial"
          role="menu"
          aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
          // The mask that carves the centre hole reads the innermost band's own
          // radius (doubled: a radial-gradient stop is a fraction of the RADIUS,
          // and these radii are fractions of the WIDTH).
          // Pulled in by the border width so the innermost hairline, which
          // straddles this radius, is not half-eaten by the mask.
          style={
            {
              '--dial-hole': `calc(${(bounds[0] ?? 19) * 2}% - var(--dial-level-w))`,
            } as CSSProperties
          }
        >
          {/* ART LAYER — decorative sector fills, shapes only, and the only
              thing the goo filter touches: the clipped sectors swell and fuse
              into one liquid dial. Nothing readable lives here (the filter's
              alpha ramp would chew glyph antialiasing), and it never takes a
              pointer event. */}
          <ul className="radial-hub__wedges radial-hub__wedges--art" aria-hidden>
            {wedges.map((w) => {
              const active = isActive(pathname, w.href);
              const wrapStyle = { '--i': w.order } as CSSProperties;
              return (
                <li
                  key={w.id}
                  className="radial-hub__wedge-wrap"
                  data-ring={w.ring}
                  style={wrapStyle}
                >
                  <span
                    className={'radial-hub__wedge-art' + (active ? ' is-active' : '')}
                    style={{ clipPath: w.clipArt }}
                  />
                </li>
              );
            })}
          </ul>

          {/* LEVEL BORDERS — a hairline at every band boundary, so the decks are
              separated by a drawn edge instead of by a gap in the fill. Real
              circles rather than radial-gradient stops: a bordered element
              antialiases cleanly at any dial size, hard gradient stops do not.
              Painted between the two layers — above the goo, which would chew
              them, and below the links, which must keep every pixel of their
              own sector (these are `pointer-events: none` regardless). */}
          <span className="radial-hub__levels" aria-hidden>
            {bounds.map((r) => (
              <span
                key={r}
                className="radial-hub__level"
                style={{ '--r': `${r}%` } as CSSProperties}
              />
            ))}
          </span>

          {/* CENTRE CAPTION — names the wedge under the pointer/focus. Only
              painted where the per-wedge labels are not (see radial.css). */}
          <span className="radial-hub__caption" aria-hidden>
            {hoveredLabel}
          </span>

          {/* HIT LAYER — the real links, unfiltered, with their icon + label
              inside them. Keeping the glyph inside its own sector is what makes
              the colour correct by construction: it inherits the sector's
              `color`, which is the theme's ink on the resting (transparent)
              sector and the accent's contrast ink once the sector fills on
              hover/focus/active. No blend modes, no cross-layer state. */}
          <ul className="radial-hub__wedges radial-hub__wedges--hit">
            {wedges.map((w) => {
              const Icon = w.icon as LucideIcon;
              const active = isActive(pathname, w.href);
              const label = t(w.tKey, { defaultValue: w.label });
              const wrapStyle = { '--i': w.order } as CSSProperties;
              const cls = 'radial-hub__wedge' + (active ? ' is-active' : '');
              const naming = {
                onPointerEnter: () => setHoveredLabel(label),
                onPointerLeave: () => setHoveredLabel((cur) => (cur === label ? null : cur)),
                onFocus: () => setHoveredLabel(label),
                onBlur: () => setHoveredLabel((cur) => (cur === label ? null : cur)),
              };
              const innerStyle = { left: `${w.cx}%`, top: `${w.cy}%` } as CSSProperties;
              const inner = (
                <span className="radial-hub__wedge-inner" data-ring={w.ring} style={innerStyle}>
                  <Icon aria-hidden />
                  <span className="radial-hub__wedge-label">{label}</span>
                </span>
              );
              return (
                <li
                  key={w.id}
                  className="radial-hub__wedge-wrap"
                  data-ring={w.ring}
                  style={wrapStyle}
                  role="none"
                >
                  {w.external ? (
                    <a
                      href={w.href}
                      className={cls}
                      style={{ clipPath: w.clip }}
                      role="menuitem"
                      onClick={close}
                      tabIndex={tab}
                      aria-current={active ? 'page' : undefined}
                      aria-label={label}
                      {...naming}
                    >
                      {inner}
                    </a>
                  ) : (
                    <Link
                      to={w.href}
                      className={cls}
                      style={{ clipPath: w.clip }}
                      role="menuitem"
                      onClick={close}
                      tabIndex={tab}
                      aria-current={active ? 'page' : undefined}
                      aria-label={label}
                      {...naming}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="radial-hub__foot">
          {session && user ? (
            <>
              <Link
                to={`/u/${user.handle || user.id}` as string}
                className="radial-hub__identity"
                onClick={close}
                tabIndex={tab}
              >
                <UserAvatar
                  src={resolved?.image || session.user.image}
                  alt={resolved?.name || session.user.name || 'You'}
                  size={30}
                  fallbackName={resolved?.name || session.user.name}
                />
                <span>{resolved?.name || session.user.name}</span>
              </Link>
              <Link
                to="/settings"
                className="radial-hub__foot-btn"
                onClick={close}
                tabIndex={tab}
                aria-label={t('settings', { defaultValue: 'Settings' })}
              >
                <Settings aria-hidden />
              </Link>
              <button
                type="button"
                className="radial-hub__foot-btn"
                onClick={signOut}
                tabIndex={tab}
                aria-label={t('sign-out', { defaultValue: 'Sign out' })}
              >
                <LogOut aria-hidden />
              </button>
            </>
          ) : (
            <Link
              to="/login"
              search={{ callbackURL: undefined }}
              className="radial-hub__signin"
              onClick={close}
              tabIndex={tab}
            >
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          )}
          <button
            type="button"
            className="radial-hub__foot-btn radial-hub__close"
            onClick={close}
            tabIndex={tab}
            aria-label={t('close', { defaultValue: 'Close' })}
          >
            <X aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

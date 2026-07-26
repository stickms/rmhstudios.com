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
  /** clip-path polygon (in % of the square dial) that carves this pie slice. */
  clip: string;
  /** Centroid of the visible annulus, in % — where the icon + label sit. */
  cx: number;
  cy: number;
}

const DEG = Math.PI / 180;
// One synchronous motion: the orb, the circular blur, the wedges and the foot all
// animate together over this long. It also gates how long the overlay stays
// mounted while closing so the whole thing animates OUT before it hides.
const MOTION_MS = 500;

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/** A pie-slice polygon from the dial centre out to its edge, over [a0,a1] degrees. */
function slicePolygon(a0: number, a1: number): string {
  const pts = ['50% 50%'];
  const steps = 8;
  for (let k = 0; k <= steps; k++) {
    const t = (a0 + ((a1 - a0) * k) / steps) * DEG;
    const x = 50 + 50 * Math.cos(t);
    const y = 50 + 50 * Math.sin(t);
    pts.push(`${x.toFixed(2)}% ${y.toFixed(2)}%`);
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
  const dialRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuVisible = phase === 'open' || phase === 'closing';

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

  // Carve the disc into one wedge per destination, starting at the top and going
  // clockwise, with a thin gap between wedges and the icon + label in the middle
  // of each wedge's visible annulus.
  const wedges = useMemo<Wedge[]>(() => {
    const n = Math.max(1, leaves.length);
    const seg = 360 / n;
    const gap = Math.min(1.4, seg * 0.06);
    return leaves.map((leaf, i) => {
      const a0 = -90 + i * seg + gap / 2;
      const a1 = -90 + (i + 1) * seg - gap / 2;
      const am = ((a0 + a1) / 2) * DEG;
      const rm = 36; // centroid radius (% of dial) — between the core and the rim
      return {
        ...leaf,
        clip: slicePolygon(a0, a1),
        cx: 50 + rm * Math.cos(am),
        cy: 50 + rm * Math.sin(am),
      };
    });
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
        >
          {/* Shapes only — this layer carries the goo filter, so the clipped
              sectors swell and fuse into one liquid dial. Anything with text in
              it would come out chewed by the filter's alpha ramp, which is why
              the icons + labels ride in the sibling glyph layer below. Each
              sector is still the real link (aria-label carries its name), so
              hit-testing and semantics are unchanged. */}
          <ul className="radial-hub__wedges">
            {wedges.map((w, i) => {
              const active = isActive(pathname, w.href);
              const label = t(w.tKey, { defaultValue: w.label });
              const wrapStyle = { '--i': i } as CSSProperties;
              const cls = 'radial-hub__wedge' + (active ? ' is-active' : '');
              return (
                <li key={w.id} className="radial-hub__wedge-wrap" style={wrapStyle} role="none">
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
                    />
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
                    />
                  )}
                </li>
              );
            })}
          </ul>

          {/* Crisp glyph layer: rides above the fused sectors, unfiltered and
              click-through, so icons and labels stay razor sharp. */}
          <div className="radial-hub__glyphs" aria-hidden>
            {wedges.map((w, i) => {
              const Icon = w.icon as LucideIcon;
              const active = isActive(pathname, w.href);
              const style = { left: `${w.cx}%`, top: `${w.cy}%`, '--i': i } as CSSProperties;
              return (
                <span
                  key={w.id}
                  className={'radial-hub__glyph' + (active ? ' is-active' : '')}
                  style={style}
                >
                  <Icon aria-hidden />
                  <span className="radial-hub__wedge-label">
                    {t(w.tKey, { defaultValue: w.label })}
                  </span>
                </span>
              );
            })}
          </div>
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

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Link, useLocation } from '@tanstack/react-router';
import { Bell, MessageCircle, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { BackToTop } from '@/components/ui/back-to-top';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { RadialHub } from './RadialHub';
import { MetaballCursor } from './MetaballCursor';
import { LiquidGoo } from './LiquidGoo';

/**
 * Fixed monochrome backdrop: concentric hairline rings centred on the viewport
 * that drift a few pixels against the pointer for parallax depth. Pointer-driven
 * transforms are written on a single rAF tick and skipped entirely under
 * reduced-motion or on coarse (touch) pointers.
 */
function RadialBackdrop() {
  const reduced = useReducedMotion();
  const ringsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (reduced) return;
    const el = ringsRef.current;
    if (!el || !window.matchMedia?.('(pointer: fine)').matches) return;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf = 0;
    let running = false;
    let lastT = 0;

    const tick = (now: number) => {
      // Delta-time exponential smoothing (`1 - e^(-rate·dt)`) so the parallax
      // drifts at the same speed on 60Hz, 120Hz and 144Hz displays instead of
      // over-chasing on fast panels — the same frame-rate independence the
      // metaball cursor uses.
      const dt = lastT === 0 ? 1 / 60 : Math.min((now - lastT) / 1000, 1 / 30);
      lastT = now;
      const k = 1 - Math.exp(-5 * dt);
      curX += (targetX - curX) * k;
      curY += (targetY - curY) * k;
      el.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
      if (Math.abs(targetX - curX) > 0.1 || Math.abs(targetY - curY) > 0.1) {
        raf = requestAnimationFrame(tick);
      } else {
        running = false;
      }
    };

    const onMove = (e: PointerEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * -28;
      targetY = (e.clientY / window.innerHeight - 0.5) * -28;
      if (!running) {
        running = true;
        lastT = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <div className="radial-backdrop" aria-hidden>
      <div className="radial-backdrop__rings" ref={ringsRef}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className="radial-backdrop__ring" style={{ ['--i' as string]: i }} />
        ))}
      </div>
      {/* Metaball field: a few slow-drifting blobs under a wide goo filter, so
          they swell together and pull apart like lava — the liquid substrate the
          glass surfaces float over. Shapes only (no text), and CSS keeps the
          whole layer off phones / reduced-motion for paint cost. */}
      <div className="radial-backdrop__field">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="radial-backdrop__blob" style={{ ['--i' as string]: i }} />
        ))}
      </div>
    </div>
  );
}

/** Slim, quiet utility bar. Identity + search + inbox; the radial hub owns nav. */
function RadialTopBar() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as { id: string; handle?: string | null } | undefined;
  const profileHref = user ? `/u/${user.handle || user.id}` : '/login';

  return (
    <header className="radial-topbar">
      <Link
        to="/"
        className="radial-topbar__brand"
        aria-label={t('nav-home', { defaultValue: 'RMH Studios home' })}
      >
        <span className="radial-topbar__mark" aria-hidden>
          RMH
        </span>
        <small>{t('studio-wordmark', { defaultValue: 'Studios' })}</small>
      </Link>

      <div className="radial-topbar__actions">
        <Link
          to="/search"
          search={{ q: '', tab: 'top' }}
          className="radial-topbar__btn"
          aria-label={t('nav-explore', { defaultValue: 'Search' })}
        >
          <Search aria-hidden />
        </Link>
        {session ? (
          <>
            <Link
              to="/messages"
              className="radial-topbar__btn max-sm:hidden"
              aria-label={t('messages', { defaultValue: 'Messages' })}
            >
              <MessageCircle aria-hidden />
            </Link>
            <Link
              to="/notifications"
              className="radial-topbar__btn"
              aria-label={t('notifications', { defaultValue: 'Notifications' })}
            >
              <Bell aria-hidden />
            </Link>
            <Link
              to={profileHref as string}
              className="radial-topbar__avatar"
              aria-label={t('profile', { defaultValue: 'Profile' })}
            >
              <UserAvatar
                src={resolved?.image || session.user.image}
                alt={resolved?.name || session.user.name || 'You'}
                size={32}
                fallbackName={resolved?.name || session.user.name}
              />
            </Link>
          </>
        ) : (
          <Link to="/login" search={{ callbackURL: undefined }} className="radial-topbar__signin">
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        )}
      </div>
    </header>
  );
}

interface RadialShellProps {
  children: ReactNode;
  overlays?: ReactNode;
}

/** The radial application frame shared by every standard (`_site`) route. */
export function RadialShell({ children, overlays }: RadialShellProps) {
  const { t } = useTranslation('common');
  const { pathname } = useLocation();
  const isHome = pathname === '/';

  return (
    <div className="vibe-app site-shell radial-shell" data-home={isHome || undefined}>
      <a href="#main-content" className="radial-skip">
        {t('skipToContent', { defaultValue: 'Skip to content' })}
      </a>

      {/* The metaball filter bank every liquid surface references from CSS. */}
      <LiquidGoo />

      <RadialBackdrop />
      <RadialTopBar />

      <main id="main-content" tabIndex={-1} className="radial-shell__main page-root">
        {children}
      </main>

      <RadialHub />

      {overlays}
      <BackToTop />
      {/* Site-wide gooey metaball — trails the mouse on desktop and blooms under
          the thumb on touch, so the flowy liquid layer is on every device. */}
      <MetaballCursor />
    </div>
  );
}

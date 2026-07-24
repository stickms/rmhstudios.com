'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';
import { RmhLogo } from './RmhLogo';

type HubUser = { id: string; handle?: string | null; isAdmin?: boolean };

interface Wedge extends NavLeaf {
  /** clip-path polygon (in % of the square dial) that carves this pie slice. */
  clip: string;
  /** Centroid of the visible annulus, in % — where the icon + label sit. */
  cx: number;
  cy: number;
}

const DEG = Math.PI / 180;

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
 * The RMH radial navigator. A fixed central orb that opens a **pie/wedge menu**:
 * the platform's destinations tile a disc as clickable sectors radiating from
 * the RMH core, so there are no gaps for a click to fall through to the feed
 * behind. framer-motion-free (CSS-only open/bloom) to keep the shell light on
 * mobile; icon-only wedges under 480px so 14 destinations never crowd.
 */
export function RadialHub() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as HubUser | undefined;

  const [open, setOpen] = useState(false);
  const dialRef = useRef<HTMLDivElement | null>(null);

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
  // clockwise, with a thin gap between wedges (thin radial dividers) and the icon
  // + label placed in the middle of each wedge's visible annulus.
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

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() =>
      dialRef.current?.querySelector<HTMLElement>('a[href], [tabindex]')?.focus(),
    );
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
    };
  }, [open]);

  const signOut = useCallback(async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          setOpen(false);
          navigate({ to: '/' });
          window.location.reload();
        },
      },
    });
  }, [navigate]);

  return (
    <>
      <button
        type="button"
        className="radial-hub__orb"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('open-menu', { defaultValue: 'Open navigation' })}
        onClick={() => setOpen((v) => !v)}
      >
        <RmhLogo className="radial-hub__logo" />
      </button>

      <div
        className={'radial-hub__overlay' + (open ? ' is-open' : '')}
        aria-hidden={!open}
        role="presentation"
      >
        <button
          type="button"
          className="radial-hub__scrim"
          onClick={close}
          aria-label={t('close', { defaultValue: 'Close' })}
          tabIndex={open ? 0 : -1}
        />

        <div
          ref={dialRef}
          className="radial-hub__dial"
          role="menu"
          aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
        >
          <ul className="radial-hub__wedges">
            {wedges.map((w, i) => {
              const Icon = w.icon as LucideIcon;
              const active = isActive(pathname, w.href);
              const label = t(w.tKey, { defaultValue: w.label });
              const wrapStyle = { '--i': i } as CSSProperties;
              const cls = 'radial-hub__wedge' + (active ? ' is-active' : '');
              const innerStyle = { left: `${w.cx}%`, top: `${w.cy}%` } as CSSProperties;
              const inner = (
                <span className="radial-hub__wedge-inner" style={innerStyle}>
                  <Icon aria-hidden />
                  <span className="radial-hub__wedge-label">{label}</span>
                </span>
              );
              return (
                <li key={w.id} className="radial-hub__wedge-wrap" style={wrapStyle} role="none">
                  {w.external ? (
                    <a
                      href={w.href}
                      className={cls}
                      style={{ clipPath: w.clip }}
                      role="menuitem"
                      onClick={close}
                      tabIndex={open ? 0 : -1}
                      aria-current={active ? 'page' : undefined}
                      aria-label={label}
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
                      tabIndex={open ? 0 : -1}
                      aria-current={active ? 'page' : undefined}
                      aria-label={label}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="radial-hub__core" aria-hidden>
            <span>RMH</span>
            <small>{t('studio-wordmark', { defaultValue: 'Studios' })}</small>
          </div>
        </div>

        <div className="radial-hub__foot">
          {session && user ? (
            <>
              <Link
                to={`/u/${user.handle || user.id}` as string}
                className="radial-hub__identity"
                onClick={close}
                tabIndex={open ? 0 : -1}
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
                tabIndex={open ? 0 : -1}
                aria-label={t('settings', { defaultValue: 'Settings' })}
              >
                <Settings aria-hidden />
              </Link>
              <button
                type="button"
                className="radial-hub__foot-btn"
                onClick={signOut}
                tabIndex={open ? 0 : -1}
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
              tabIndex={open ? 0 : -1}
            >
              {t('sign-in', { defaultValue: 'Sign in' })}
            </Link>
          )}
          <button
            type="button"
            className="radial-hub__foot-btn radial-hub__close"
            onClick={close}
            tabIndex={open ? 0 : -1}
            aria-label={t('close', { defaultValue: 'Close' })}
          >
            <X aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}

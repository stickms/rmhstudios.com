'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate } from '@tanstack/react-router';
import { LogOut, Settings, X, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { useResolvedUser, useSession } from '@/components/Providers';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { SIDEBAR_NAV, isNavGroup, type NavLeaf } from '@/lib/sidebar-nav';

type HubUser = { id: string; handle?: string | null; isAdmin?: boolean };

interface Spoke extends NavLeaf {
  ux: number;
  uy: number;
}

const DEG = Math.PI / 180;

const isActive = (pathname: string, href: string) =>
  href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

/**
 * The RMH radial navigator. A fixed central orb that, on open, blooms the
 * platform's destinations outward along a ring — each spoke travelling from the
 * core to its resting position with a staggered, GPU-composited transform.
 *
 * Deliberately framer-motion-free: the orb is plain HTML/CSS and the bloom is a
 * CSS keyframe, so the always-rendered shell keeps no animation library on the
 * critical path — which is what keeps first load light on mobile.
 */
export function RadialHub() {
  const { t } = useTranslation('feed');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const { resolved } = useResolvedUser();
  const user = session?.user as HubUser | undefined;

  const [open, setOpen] = useState(false);
  const stageRef = useRef<HTMLElement | null>(null);

  // Flatten the canonical nav into a single ring of reachable destinations,
  // honouring auth/admin gating so signed-out visitors never see gated spokes.
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

  // Lay the spokes on a unit ring starting at the top (−90°), clockwise. The
  // pixel radius is a CSS var so the ring stays responsive without JS re-layout.
  const spokes = useMemo<Spoke[]>(() => {
    const n = Math.max(1, leaves.length);
    return leaves.map((leaf, i) => {
      const a = (-90 + (360 / n) * i) * DEG;
      return { ...leaf, ux: Math.cos(a), uy: Math.sin(a) };
    });
  }, [leaves]);

  const close = useCallback(() => setOpen(false), []);

  // Lock body scroll, wire Escape, and move focus into the menu on open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    const raf = requestAnimationFrame(() =>
      stageRef.current?.querySelector<HTMLElement>('a[href], [tabindex]')?.focus(),
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
        <span className="radial-hub__mark" aria-hidden>
          RMH
        </span>
        <span className="radial-hub__ring" aria-hidden />
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

        <nav
          ref={stageRef}
          className="radial-hub__ring-stage"
          style={{ '--radial-hub-r': 'min(30vh, 32vw, 210px)' } as CSSProperties}
          aria-label={t('section-navigation', { defaultValue: 'Browse RMH Studios' })}
        >
          <div className="radial-hub__core" aria-hidden>
            <span>RMH</span>
            <small>{t('studio-wordmark', { defaultValue: 'Studios' })}</small>
          </div>

          <ul className="radial-hub__spokes">
            {spokes.map((spoke, i) => {
              const Icon = spoke.icon as LucideIcon;
              const active = isActive(pathname, spoke.href);
              const label = t(spoke.tKey, { defaultValue: spoke.label });
              const style = {
                '--sx': spoke.ux,
                '--sy': spoke.uy,
                '--i': i,
              } as CSSProperties;
              const cls = 'radial-hub__spoke' + (active ? ' is-active' : '');
              const inner = (
                <>
                  <span className="radial-hub__spoke-icon">
                    <Icon aria-hidden />
                  </span>
                  <span className="radial-hub__spoke-label">{label}</span>
                </>
              );
              return (
                <li key={spoke.id} className="radial-hub__spoke-wrap" style={style}>
                  {spoke.external ? (
                    <a
                      href={spoke.href}
                      className={cls}
                      onClick={close}
                      tabIndex={open ? 0 : -1}
                      aria-current={active ? 'page' : undefined}
                    >
                      {inner}
                    </a>
                  ) : (
                    <Link
                      to={spoke.href}
                      className={cls}
                      onClick={close}
                      tabIndex={open ? 0 : -1}
                      aria-current={active ? 'page' : undefined}
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

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

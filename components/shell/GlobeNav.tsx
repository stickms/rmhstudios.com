import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { globeKeyAction } from './globe-nav-state';
import { SIDEBAR_NAV, isNavGroup, isNavLeafActive, type NavLeaf } from '@/lib/sidebar-nav';
import { WRITE_HREF } from './sections';
import { usePathname } from './shell-router-state';
import { useSectionLabels } from './use-section-labels';
import { useInboxCount } from './use-inbox-count';
import { useGlobeView } from './use-globe-view';
import './globe-nav.css';

/** The open globe's diameter and the docked one's, px, phone and desktop (globe-nav.css holds the same numbers). */
const OPEN_D = { phone: 288, desktop: 440 } as const;
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches;

/**
 * The navigator: the liquid globe, in chrome (owner, 2026-11-12: "basically keep the original liquid globe, just with
 * the new material"). One component for phone and desktop.
 *
 *  - DOCKED it is a chrome ball carrying a dot for every destination; the dots orbit as it drifts and as the page
 *    scrolls. On a phone it floats 64px above the bottom edge and is the only navigator; on desktop it is the larger
 *    ball at the foot of the sidebar.
 *  - A click or tap OPENS it: the same element travels to the middle of the screen and grows (transform only), over a
 *    flat veil, and every destination becomes an icon pin on the sphere: every page the old globe carried
 *    (lib/sidebar-nav), not five words.
 *  - THE GESTURE is the liquid globe's (lib/globe): press anywhere and drag to turn it, release to coast; a pin inside
 *    the reticle is locked and names itself; hold and its ring fills; let go with the ring full and you go there. A
 *    plain tap on a pin is a link, and Tab turns the globe to each one. A press ripples and dents the ball.
 *  - Accessibility (G7): a `<button aria-expanded aria-controls>`; the pins are a `<nav>` of real links; while open,
 *    Tab stays inside and focus returns to the button on close; Escape, the veil or the globe closes it. With
 *    scripting off the same place is a link to `/sections`.
 *  - It has no canvas, worker or simulation of its own: the one shared renderer (lib/chrome) draws the ball, and the
 *    physics is an idle chunk (`data-globe-live` on the root once it has landed; the pins wait for it).
 */
export function GlobeNav() {
  const { t } = useTranslation('feed');
  const pathname = usePathname();
  const { data: session } = useSession();
  const inbox = useInboxCount(Boolean(session));
  const labels = useSectionLabels();
  const isAdmin = Boolean((session?.user as { isAdmin?: boolean } | undefined)?.isAdmin);
  const signedIn = Boolean(session);

  // Every destination, flattened, as the liquid globe had them. Placement on the sphere is deterministic from the
  // list, so the same account always finds the same page in the same place.
  const nodes = useMemo<NavLeaf[]>(() => {
    const out: NavLeaf[] = [];
    for (const item of SIDEBAR_NAV) {
      if (isNavGroup(item)) out.push(...item.children);
      else out.push(item);
    }
    return out.filter((leaf) => (!leaf.requiresAuth || signedIn) && (!leaf.requiresAdmin || isAdmin));
  }, [signedIn, isAdmin]);
  const active = nodes.findIndex((n) => isNavLeafActive(pathname, n));
  // Nothing is current on, say, /terms: the first destination faces the viewer without claiming `aria-current`.
  const centreIndex = Math.max(0, active);

  const navId = useId();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState(false);
  const [lock, setLock] = useState(-1);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const veilRef = useRef<HTMLDivElement | null>(null);
  const navRef = useRef<HTMLElement | null>(null);
  const pinRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const labelRefs = useRef<Array<HTMLElement | null>>([]);
  const wasOpen = useRef(false);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const go = useCallback(
    (leaf: NavLeaf | undefined) => {
      if (!leaf) return;
      if (leaf.external) window.location.assign(leaf.href);
      else void navigate({ to: leaf.href });
    },
    [navigate],
  );

  const globe = useGlobeView(
    () =>
      buttonRef.current
        ? {
            stage: buttonRef.current,
            points: nodesRef.current.length,
            pins: pinRefs.current,
            labels: labelRefs.current,
            reticle: navRef.current,
            surfaces: [veilRef.current, navRef.current],
            pinRadius: () => (isDesktop() ? OPEN_D.desktop : OPEN_D.phone) / 2,
            openSize: () => (isDesktop() ? OPEN_D.desktop : OPEN_D.phone),
            onLock: setLock,
            onGo: (i) => {
              go(nodesRef.current[i]);
              setOpen(false);
            },
          }
        : null,
    () => setLive(true),
    nodes.length,
  );
  useEffect(() => {
    globe.current?.setOpen(open, centreIndex);
  }, [open, live, centreIndex, globe]);

  const announce = useCallback(() => {
    // V9: the renderer redraws every frame of the 360 ms move, then stops. A dynamic import, never a static one.
    void import('@/lib/chrome').then((m) => m.animateChrome(360));
  }, []);

  const setOpenAnd = useCallback(
    (next: boolean) => {
      setOpen((was) => {
        if (was !== next) announce();
        return next;
      });
    },
    [announce],
  );

  // A committed navigation brings the globe home.
  useEffect(() => setOpenAnd(false), [pathname, setOpenAnd]);

  // Focus: into the nav on open, back to the button on close (G7).
  useEffect(() => {
    if (open) {
      pinRefs.current[centreIndex]?.focus();
    } else if (wasOpen.current) {
      buttonRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  // Escape closes; Tab is kept inside the nav and the globe button while open (globe-nav-state.ts).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      const stops = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>('[data-pin], [data-globe-button]') ?? [],
      );
      const action = globeKeyAction({
        key: event.key,
        shiftKey: event.shiftKey,
        open,
        stops: stops.length,
        active: stops.indexOf(document.activeElement as HTMLElement),
      });
      if (action.type === 'none') return;
      event.preventDefault();
      if (action.type === 'close') setOpenAnd(false);
      else stops[action.index]?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpenAnd]);

  const unreadText = t('shell-unread-count', {
    count: inbox,
    defaultValue_one: '{{count}} unread',
    defaultValue_other: '{{count}} unread',
  });

  return (
    <div
      ref={rootRef}
      className="globe-nav"
      data-open={open ? '' : undefined}
      data-globe-live={live ? '' : undefined}
      // The floating stack (cookie notice, mini-player) lifts clear of the docked globe (comfort-suite.css).
      data-floating="hub"
    >
      <div className="globe-nav__fade" aria-hidden />
      <div ref={veilRef} className="globe-nav__veil" onClick={() => setOpenAnd(false)} aria-hidden />

      <div className="globe-nav__dock">
        <button
          ref={buttonRef}
          type="button"
          className="globe-nav__globe chrome-globe"
          style={{ '--d': 'var(--globe-d)' } as CSSProperties}
          data-chrome="ball"
          data-globe-button=""
          aria-expanded={open}
          aria-controls={navId}
          aria-label={
            open
              ? t('shell-globe-close', { defaultValue: 'Close navigation' })
              : t('shell-globe-open', { defaultValue: 'Open navigation' })
          }
          onClick={() => setOpenAnd(!open)}
        />
        {inbox > 0 && (
          <span className="globe-nav__dot">
            <span className="sr-only">{unreadText}</span>
          </span>
        )}
        <noscript>
          <a className="globe-nav__fallback" href="/sections">
            {t('shell-globe-open', { defaultValue: 'Open navigation' })}
          </a>
        </noscript>
      </div>

      <nav
        ref={navRef}
        id={navId}
        className="globe-nav__pins"
        aria-label={t('shell-sections-label', { defaultValue: 'Sections' })}
      >
        <span className="globe-nav__reticle" aria-hidden />
        {nodes.map((node, i) => {
          const Icon = node.icon;
          const label = node.href === '/' ? labels.front : t(node.tKey, { defaultValue: node.label });
          const count = node.badge === 'inbox' ? inbox : 0;
          const shared = {
            className: 'globe-nav__pin',
            'data-pin': i === active ? 'current' : '',
            draggable: false,
            'aria-current': i === active ? ('page' as const) : undefined,
            onClick: () => setOpenAnd(false),
          };
          const body = (
            <>
              <span className="globe-nav__pin-dot">
                <Icon aria-hidden />
                <svg className="globe-nav__pin-ring" viewBox="0 0 44 44" aria-hidden>
                  <circle cx="22" cy="22" r="20.5" pathLength={1} />
                </svg>
              </span>
              <span
                className="globe-nav__pin-name"
                ref={(el: HTMLElement | null) => {
                  labelRefs.current[i] = el;
                }}
              >
                {label}
              </span>
              {count > 0 && (
                <span className="globe-nav__count">
                  <span aria-hidden>{count > 99 ? '99+' : count}</span>
                  <span className="sr-only">{unreadText}</span>
                </span>
              )}
            </>
          );
          const setRef = (el: HTMLAnchorElement | null) => {
            pinRefs.current[i] = el;
          };
          return node.external ? (
            <a key={node.id} ref={setRef} href={node.href} {...shared}>
              {body}
            </a>
          ) : (
            <Link key={node.id} ref={setRef} to={node.href} {...shared}>
              {body}
            </Link>
          );
        })}
        <span className="sr-only" aria-live="polite">
          {open && lock >= 0 && nodes[lock]
            ? nodes[lock].href === '/'
              ? labels.front
              : t(nodes[lock].tKey, { defaultValue: nodes[lock].label })
            : ''}
        </span>
        <Link to={WRITE_HREF} className="globe-nav__write" data-pin="" onClick={() => setOpenAnd(false)}>
          {t('shell-write-post', { defaultValue: 'Write a post' })}
        </Link>
        <Link to="/sections" className="globe-nav__more" data-pin="" onClick={() => setOpenAnd(false)}>
          {t('shell-all-sections', { defaultValue: 'All sections' })}
        </Link>
      </nav>
    </div>
  );
}

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { globeKeyAction } from './globe-nav-state';
import { SECTIONS, WRITE_HREF, currentSection, viewerPathFor, type SectionId } from './sections';
import { usePathname } from './shell-router-state';
import { useSectionLabels } from './use-section-labels';
import { useInboxCount } from './use-inbox-count';
import './globe-nav.css';

/** Where the four pins that are not current sit around the centre one (G3), in section order. */
const AROUND = ['ul', 'ur', 'll', 'lr'] as const;

/**
 * The phone navigator (Steel 8.1, G1 to G8): a 64px chrome globe docked above the bottom edge that opens, by transform
 * alone, into a 288px globe carrying the five sections as pins.
 *
 *  - G5: markup and CSS. No canvas, worker or simulation here. The element carries `data-chrome="ball"` and
 *    `data-chrome-max="288"`, so the one shared renderer (lib/chrome, loaded at idle) draws its reflection and keeps it
 *    sharp when open. This file reaches the renderer only through a dynamic import, to tell it a 360 ms move began.
 *  - G7: a `<button aria-expanded aria-controls>`; the pins are a `<nav>` of real links; while open, Tab stays inside
 *    the nav and focus returns to the button on close. With scripting off the same place is a link to `/sections`
 *    (the `<noscript>` anchor lies over the button).
 *  - G4: tapping the globe, the veil or pressing Escape closes it; choosing a pin navigates and the globe comes home.
 *  - G8: Inbox unread shows as a danger number on its pin when open, and an 8px danger dot on the docked globe, each
 *    with a visually hidden equivalent.
 *
 * State is one `data-open` attribute on the root; every motion is CSS on that attribute (globe-nav.css).
 */
export function GlobeNav() {
  const { t } = useTranslation('feed');
  const pathname = usePathname();
  const { data: session } = useSession();
  const viewerPath = viewerPathFor(session?.user as { id: string; handle?: string | null } | undefined);
  const inbox = useInboxCount(Boolean(session));
  const current = currentSection(pathname);
  const labels = useSectionLabels();
  // Nothing of the five is current on, say, /library: Front takes the centre without claiming `aria-current`.
  const centre: SectionId = current ?? 'front';

  const navId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpen = useRef(false);

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
      const first = rootRef.current?.querySelector<HTMLElement>('[data-pin="current"]');
      first?.focus();
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

  const around = SECTIONS.filter((s) => s.id !== centre);

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
      // The floating stack (cookie notice, mini-player) lifts clear of the docked globe (comfort-suite.css).
      data-floating="hub"
    >
      <div className="globe-nav__fade" aria-hidden />
      <div className="globe-nav__veil" onClick={() => setOpenAnd(false)} aria-hidden />

      <div className="globe-nav__dock">
        <button
          ref={buttonRef}
          type="button"
          className="globe-nav__globe chrome-globe"
          style={{ '--d': '64px' } as CSSProperties}
          data-chrome="ball"
          data-chrome-max="288"
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
        id={navId}
        className="globe-nav__pins"
        aria-label={t('shell-sections-label', { defaultValue: 'Sections' })}
      >
        {SECTIONS.filter((s) => s.id === centre)
          .concat(around)
          .map((section) => {
            const isCentre = section.id === centre;
            const slot = isCentre ? 'c' : AROUND[around.indexOf(section)];
            const count = section.id === 'inbox' ? inbox : 0;
            return (
              <Link
                key={section.id}
                to={section.href(viewerPath)}
                className="globe-nav__pin"
                data-pin={isCentre ? 'current' : ''}
                data-slot-pos={slot}
                aria-current={current === section.id ? 'page' : undefined}
                onClick={() => setOpenAnd(false)}
              >
                {labels[section.id]}
                {count > 0 && (
                  <span className="globe-nav__count">
                    <span aria-hidden>{count > 99 ? '99+' : count}</span>
                    <span className="sr-only">{unreadText}</span>
                  </span>
                )}
              </Link>
            );
          })}
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

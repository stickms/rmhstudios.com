import { lazy, Suspense, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUp, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { scrollPageToTop, useScrolledPast } from '@/components/ui/back-to-top';
import { cn } from '@/lib/utils';
import { WRITE_HREF } from './sections';
import { usePathname } from './shell-router-state';

/** The composer dialog, in its own chunk: only needed once the button is pressed (the sidebar loads it the same way). */
const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({
    default: m.ComposeModal,
  })),
);

const SCROLL_THRESHOLD = 600;

/**
 * The phone's floating actions (owner exception to L1, 2026-11-20; plan section 9, L1a): ONE pill in the bottom-right
 * lane, holding icons rather than buttons that each look like a button (owner, 2026-11-20: "it should look like one
 * element and each button can just be the icon").
 *
 * - "Write a post", on the feed for a signed-in viewer. The pill is just this icon until the page is scrolled.
 * - "Back to top", once the page is scrolled 600px. It grows out of the compose icon: its slot widens from nothing on
 *   the pill's leading side (M3's 280 ms) while its icon fades in (M5). On any other page it is the pill's only icon, and
 *   the pill fades in and out with it.
 *
 * The pill is always mounted, so each change is a CSS transition on `data-shown` (comfort-suite.css, `.fab-lane`), not a
 * mount with a first frame at full opacity. Hidden, it is `inert`. On desktop the sidebar's "Write a post" and the
 * page's own scroll do these jobs and nothing is fixed, so the pill is `lg:hidden`.
 *
 * The composer opens as a card nearly the width of the screen (a phone has little height to spare), and stays mounted
 * after its first open, so it fades and rises in and back out (`compose-sheet.css`) and an unsent draft survives a close.
 * A modified click on the compose icon still follows the link to `/share`.
 */
export function FabLane() {
  const { t } = useTranslation('feed');
  const { t: tUi } = useTranslation('c-ui');
  const pathname = usePathname();
  const { data: session } = useSession();
  const { past, sentinelRef } = useScrolledPast(SCROLL_THRESHOLD);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeLoaded, setComposeLoaded] = useState(false);

  const showCompose = Boolean(session) && pathname === '/';
  const shown = showCompose || past;
  const writeLabel = t('shell-write-post', {
    defaultValue: 'Write a post',
  });
  const topLabel = tUi('back-to-top', {
    defaultValue: 'Back to top',
  });

  return (
    <>
      <div
        ref={sentinelRef}
        className="back-to-top-sentinel"
        style={{
          top: `${SCROLL_THRESHOLD}px`,
        }}
        aria-hidden
      />
      <div
        // §5.5x A.1: part of the floating-bottom stack; `.floating-fab-lane` seats it in the bottom-right lane and lifts
        // it clear of the cookie bar.
        data-floating="fab"
        data-shown={shown || undefined}
        inert={!shown}
        className="fab-lane floating-fab-lane surface-overlay fixed z-40 flex rounded-full lg:hidden"
      >
        <button
          type="button"
          onClick={scrollPageToTop}
          data-shown={past || undefined}
          // Alone on the pill it does not grow: the pill itself fades in.
          data-solo={!showCompose || undefined}
          inert={!past}
          aria-label={topLabel}
          title={topLabel}
          className="fab-lane__top flex size-11 items-center justify-center rounded-full text-site-text hover:bg-site-bg-subtle"
        >
          <ArrowUp className="h-5 w-5 shrink-0" aria-hidden />
        </button>
        {showCompose && (
          <Link
            to={WRITE_HREF}
            aria-label={writeLabel}
            title={writeLabel}
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              setComposeLoaded(true);
              setComposeOpen(true);
            }}
            className="flex size-11 items-center justify-center rounded-full text-site-text hover:bg-site-bg-subtle"
          >
            <PenLine className="h-5 w-5 shrink-0" aria-hidden />
          </Link>
        )}
      </div>
      {composeLoaded && (
        <Suspense fallback={null}>
          <ComposeModal open={composeOpen} onClose={() => setComposeOpen(false)} mobileFullscreen={false} />
        </Suspense>
      )}
    </>
  );
}

import { lazy, Suspense, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowUp, PenLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { scrollPageToTop } from '@/components/ui/back-to-top';
import { WRITE_HREF } from './sections';

/** The composer, in its own chunk: only needed once "Write a post" is pressed. */
const ComposeModal = lazy(() =>
  import('@/components/feed/ComposeModal').then((m) => ({
    default: m.ComposeModal,
  })),
);

/**
 * The desktop's two floating-style actions, "Write a post" and "Back to top", as icons in a row at the foot of the
 * margin column, above `MarginFooter` (owner, 2026-11-28: they replace the sidebar's "Write a post" button). The phone
 * has the same two in `FabLane`; this is displayed from 1280px, where the margin is.
 *
 * "Write a post" stays a link to `/share` (complete with scripting off); a plain click from a signed-in viewer opens the
 * composer over the page they are on.
 */
export function MarginActions() {
  const { t } = useTranslation('feed');
  const { t: tUi } = useTranslation('c-ui');
  const { data: session } = useSession();
  const [composeOpen, setComposeOpen] = useState(false);
  const writeLabel = t('shell-write-post', {
    defaultValue: 'Write a post',
  });
  const topLabel = tUi('back-to-top', {
    defaultValue: 'Back to top',
  });

  return (
    <div className="site-margin__actions">
      <Link
        to={WRITE_HREF}
        aria-label={writeLabel}
        title={writeLabel}
        onClick={(e) => {
          if (!session || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          setComposeOpen(true);
        }}
        className="flex size-11 items-center justify-center rounded-full text-site-text hover:bg-site-bg-subtle"
      >
        <PenLine className="h-5 w-5 shrink-0" aria-hidden />
      </Link>
      <button
        type="button"
        onClick={scrollPageToTop}
        aria-label={topLabel}
        title={topLabel}
        className="flex size-11 items-center justify-center rounded-full text-site-text hover:bg-site-bg-subtle"
      >
        <ArrowUp className="h-5 w-5 shrink-0" aria-hidden />
      </button>
      {composeOpen && (
        <Suspense fallback={null}>
          <ComposeModal open onClose={() => setComposeOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}

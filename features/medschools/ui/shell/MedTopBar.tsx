import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowLeft, House } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { backTargetFor, isMedIndex } from './back-target';
import { ThemeToggle } from './ThemeToggle';

/**
 * The app's top bar: a 44px round button, the app's name in the display face, and the light / dark switch. It is in
 * the document flow (never `fixed`, never `sticky` flush to the edge: the iOS bars take their colour from edge-pinned
 * layers). On the index the button is a plain home link to the site (`/`, a house) and the name is the page's `<h1>`;
 * on every other route, the error and 404 frames included, it is back: through this session's own history when there
 * is one, otherwise to the school index (`backTargetFor`).
 */
export function MedTopBar() {
  const { t } = useTranslation('medschools');
  const goBack = useBackOrFallback();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isIndex = isMedIndex(pathname);
  const appName = t('shell-app-name', { defaultValue: 'RMH Med Schools' });

  return (
    <header className="medapp-bar">
      {isIndex ? (
        <Link to="/" className="medapp-round" aria-label={t('shell-home', { defaultValue: 'RMH home' })}>
          <House aria-hidden size={20} />
        </Link>
      ) : (
        <Link
          to={backTargetFor(pathname)}
          onClick={goBack}
          className="medapp-round"
          aria-label={t('shell-back-schools', { defaultValue: 'Back to all schools' })}
        >
          <ArrowLeft aria-hidden size={20} />
        </Link>
      )}
      {/* The app's name. On the index it is the page's one <h1> (the index has no title of its own); every other page
          has its own h1, so here it is plain text. */}
      {isIndex ? <h1 className="medapp-title">{appName}</h1> : <span className="medapp-title">{appName}</span>}
      <span className="medapp-bar__gap" />
      <ThemeToggle />
    </header>
  );
}

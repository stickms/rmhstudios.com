import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowLeft, House } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { backTargetFor, isMedIndex } from './back-target';
import { HeaderActions } from './HeaderActions';

/**
 * The app's top bar, over the main column only (the live rail starts level with it, owner 2026-11-24): a 44px round
 * button, the app's name, then the actions at its end (`HeaderActions`: practice, live, the member's area, the light /
 * dark switch). On a narrow phone the actions wrap under the title as one group rather than hide. It is in the document
 * flow (never `fixed`, never `sticky` flush to the edge: the iOS bars take their colour from edge-pinned
 * layers). On the index the button is a plain home link to the site (`/`, a house) and the name is the page's `<h1>`;
 * on every other route, the error and 404 frames included, it is back one level, always to the school index
 * (`backTargetFor`), never through the browser history (owner 2026-11-24): the arrow means "up", not "where I was".
 */
export function MedTopBar() {
  const { t } = useTranslation('medschools');
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
          className="medapp-round"
          aria-label={t('shell-back-schools', { defaultValue: 'Back to all schools' })}
        >
          <ArrowLeft aria-hidden size={20} />
        </Link>
      )}
      {/* The app's name. On the index it is the page's one <h1> (the index has no title of its own); every other page
          has its own h1, so here it is plain text. */}
      {isIndex ? <h1 className="medapp-title">{appName}</h1> : <span className="medapp-title">{appName}</span>}
      <HeaderActions />
    </header>
  );
}

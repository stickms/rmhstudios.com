import { Link, useRouterState } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { backTargetFor } from './back-target';
import { ThemeToggle } from './ThemeToggle';

/**
 * The app's top bar: a 44px round back button, the title in the display face, and the light / dark switch. It is in the
 * document flow (never `fixed`, never `sticky` flush to the edge: the iOS bars take their colour from edge-pinned
 * layers). Back is present on every route, the error and 404 frames included: it goes back through this session's own
 * history when there is one, and otherwise to the fallback `backTargetFor` names (the index goes up to the Services hub,
 * everything else to the school index).
 */
export function MedTopBar() {
  const { t } = useTranslation('medschools');
  const goBack = useBackOrFallback();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const target = backTargetFor(pathname);
  const label =
    target === '/services'
      ? t('shell-back-services', { defaultValue: 'Back to services' })
      : t('shell-back-schools', { defaultValue: 'Back to all schools' });

  return (
    <header className="medapp-bar">
      <Link to={target} onClick={goBack} className="medapp-round" aria-label={label}>
        <ArrowLeft aria-hidden size={20} />
      </Link>
      <span className="medapp-title" role="presentation">
        {t('shell-title', { defaultValue: 'Med Schools' })}
      </span>
      <span className="medapp-bar__gap" />
      <ThemeToggle />
    </header>
  );
}

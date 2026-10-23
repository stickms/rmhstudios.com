'use client';

import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Users } from 'lucide-react';
import { useJamStore } from '@/lib/studio/jam/store';

// Both panels load on first click; nothing here runs before the member asks.
const ChallengePanel = lazy(() => import('./ChallengePanel'));
const JamPanel = lazy(() => import('./JamPanel'));

/** Entry points for the Studio sample flip (F12) and live jam (F13). */
export function StudioCreativeButtons() {
  const { t } = useTranslation('f-creative');
  const [panel, setPanel] = useState<'challenge' | 'jam' | null>(null);
  // The panels portal into the app root (not <body>) so they keep the `--app-*` palette.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const open = (e: React.MouseEvent<HTMLElement>, next: 'challenge' | 'jam') => {
    setContainer(e.currentTarget.closest<HTMLElement>('.app-theme'));
    setPanel(next);
  };
  const live = useJamStore((s) => s.status === 'live');
  const cls = 'rounded-(--app-radius-sm) p-1.5 text-(--app-text-muted) hover:bg-(--app-surface-hover) hover:text-(--app-text)';
  return (
    <>
      <button
        type="button"
        className={cls}
        title={t('btn-challenge', { defaultValue: 'Sample flip challenge' })}
        aria-label={t('btn-challenge', { defaultValue: 'Sample flip challenge' })}
        onClick={(e) => open(e, 'challenge')}
      >
        <Trophy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${cls} ${live ? 'text-(--app-accent)' : ''}`}
        title={t('btn-jam', { defaultValue: 'Live jam' })}
        aria-label={t('btn-jam', { defaultValue: 'Live jam' })}
        onClick={(e) => open(e, 'jam')}
      >
        <Users className="h-4 w-4" />
      </button>
      {panel && (
        <Suspense fallback={null}>
          {panel === 'challenge' ? (
            <ChallengePanel container={container} onClose={() => setPanel(null)} />
          ) : (
            <JamPanel container={container} onClose={() => setPanel(null)} />
          )}
        </Suspense>
      )}
    </>
  );
}

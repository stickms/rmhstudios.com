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
  const live = useJamStore((s) => s.status === 'live');
  const cls = 'rounded p-1.5 text-site-text-muted hover:bg-site-surface-hover hover:text-site-text';
  return (
    <>
      <button
        type="button"
        className={cls}
        title={t('btn-challenge', { defaultValue: 'Sample flip challenge' })}
        aria-label={t('btn-challenge', { defaultValue: 'Sample flip challenge' })}
        onClick={() => setPanel('challenge')}
      >
        <Trophy className="h-4 w-4" />
      </button>
      <button
        type="button"
        className={`${cls} ${live ? 'text-site-accent' : ''}`}
        title={t('btn-jam', { defaultValue: 'Live jam' })}
        aria-label={t('btn-jam', { defaultValue: 'Live jam' })}
        onClick={() => setPanel('jam')}
      >
        <Users className="h-4 w-4" />
      </button>
      {panel && (
        <Suspense fallback={null}>
          {panel === 'challenge' ? (
            <ChallengePanel onClose={() => setPanel(null)} />
          ) : (
            <JamPanel onClose={() => setPanel(null)} />
          )}
        </Suspense>
      )}
    </>
  );
}

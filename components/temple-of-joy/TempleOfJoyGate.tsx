/**
 * The gate — resolve the save before the temple opens.
 *
 * It used to resolve the *session* too, and bounce anyone without one to
 * `/login`. It no longer does. An idle game is the least account-shaped thing on
 * this site: nothing in it is shared, nothing in it is competitive, and the only
 * reason it ever wanted an account was to have somewhere to put the save. There
 * is somewhere else — this browser — so a signed-out visitor now simply plays,
 * and their temple is waiting for them if they sign in later.
 *
 * What signing in buys is stated where it is true rather than at the door: the
 * save follows you to another device. That line lives in Settings, next to the
 * save, with a button.
 *
 * The loading screen is the temple's own, not a generic spinner: it is the
 * first thing anyone sees and it should already feel like the game.
 */
'use client';

import './temple-of-joy.css';
import { useTranslation } from 'react-i18next';
import { useCloudSave } from '@/hooks/useCloudSave';
import { saveToState, summarizeTempleSave, templeSave } from '@/lib/temple-of-joy/persistence';
import { TempleOfJoyGame } from './TempleOfJoyGame';

function LoadingScreen() {
  const { t } = useTranslation('c-temple-of-joy');
  return (
    <div className="toj" data-theme="dawn">
      <div className="toj-loading" role="status">
        <h1 className="toj-loading-title">Temple of Joy</h1>
        <p className="toj-loading-note">
          {t('entering-the-temple', { defaultValue: 'Opening the doors…' })}
        </p>
      </div>
    </div>
  );
}

export function TempleOfJoyGate() {
  const { t } = useTranslation('c-temple-of-joy');

  const cloud = useCloudSave(templeSave, {
    gameName: 'Temple of Joy',
    // The store's own summary runs in `lib/`, where there is no translator, so
    // it emits English. Here there is one.
    summarize: (save) => summarizeTempleSave(save, t),
  });

  if (cloud.status === 'loading') return <LoadingScreen />;

  // Two temples that have both been played. The dialog is the only way out of
  // this state — see `SaveConflictDialog` for why it cannot be dismissed — and
  // the game is deliberately not mounted behind it: an autosave from a temple
  // nobody has chosen yet would overwrite the very save being offered.
  if (cloud.status === 'conflict') {
    return (
      <div className="toj" data-theme="dawn">
        <div className="toj-loading">
          <h1 className="toj-loading-title">Temple of Joy</h1>
        </div>
        {cloud.conflictDialog}
      </div>
    );
  }

  return <TempleOfJoyGame initialSave={cloud.save ? saveToState(cloud.save) : null} />;
}

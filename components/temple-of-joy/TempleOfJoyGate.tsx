/**
 * The gate — resolve the session and the save before the temple opens.
 *
 * The loading screen is the temple's own, not a generic spinner: it is the
 * first thing anyone sees and it should already feel like the game.
 */
'use client';

import './temple-of-joy.css';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authClient } from '@/lib/auth-client';
import { loadFromServer } from '@/lib/temple-of-joy/persistence';
import type { SaveData } from '@/lib/temple-of-joy/types';
import { TempleOfJoyGame } from './TempleOfJoyGame';

function TempleLoadingScreen() {
  const { t } = useTranslation('c-temple-of-joy');
  return (
    <div className="toj" data-theme="dark">
      <div className="toj-loading" role="status">
        <h1 className="toj-loading-title">Temple of Joy</h1>
        <p className="toj-loading-note">
          {t('entering-the-temple', { defaultValue: 'Entering the temple…' })}
        </p>
      </div>
    </div>
  );
}

export function TempleOfJoyGate() {
  const session = authClient.useSession();
  /** `undefined` = still fetching, `null` = no save, otherwise the save. */
  const [saveData, setSaveData] = useState<SaveData | null | undefined>(undefined);

  const userId = session.data?.user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setSaveData(undefined);
    loadFromServer()
      .then((data) => {
        // A sign-out mid-fetch would otherwise drop one account's save into
        // the next player's game.
        if (!cancelled) setSaveData(data ?? null);
      })
      // A failed load means "start fresh", not "hang on the gate forever".
      .catch(() => {
        if (!cancelled) setSaveData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Signed in but the save is still in flight, or the session is resolving.
  if (session.isPending || (userId && saveData === undefined)) {
    return <TempleLoadingScreen />;
  }

  if (!session.data?.user) {
    return <SignInRedirect />;
  }

  return <TempleOfJoyGame initialSaveData={saveData} />;
}

/**
 * Navigating from a render body is a side effect React is entitled to run
 * twice (and does, in strict mode), so the redirect lives in an effect.
 */
function SignInRedirect() {
  useEffect(() => {
    window.location.href = '/login?callbackURL=/temple-of-joy';
  }, []);
  return <TempleLoadingScreen />;
}

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
import { loadFromServer, loadLocal, readSave } from '@/lib/temple-of-joy/persistence';
import type { GameState } from '@/lib/temple-of-joy/types';
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
  const session = authClient.useSession();
  /** `undefined` = still fetching, `null` = no save, otherwise the state. */
  const [save, setSave] = useState<Partial<GameState> | null | undefined>(undefined);

  const userId = session.data?.user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setSave(undefined);

    loadFromServer()
      .then((raw) => {
        // A sign-out mid-fetch would otherwise drop one account's save into
        // the next player's game.
        if (cancelled) return;
        // The server is authoritative, but a session that lost its connection
        // mid-play may have a newer local write. Take whichever is later.
        const remote = readSave(raw);
        const local = readSave(loadLocal());
        const newer =
          remote && local
            ? (local.lastSaved ?? 0) > (remote.lastSaved ?? 0)
              ? local
              : remote
            : (remote ?? local);
        setSave(newer ?? null);
      })
      // A failed load means "start fresh", not "hang on the gate forever".
      .catch(() => {
        if (!cancelled) setSave(readSave(loadLocal()) ?? null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Signed in but the save is still in flight, or the session is resolving.
  if (session.isPending || (userId && save === undefined)) return <LoadingScreen />;

  if (!session.data?.user) return <SignInRedirect />;

  return <TempleOfJoyGame initialSave={save} />;
}

/**
 * Navigating from a render body is a side effect React is entitled to run
 * twice (and does, in strict mode), so the redirect lives in an effect.
 */
function SignInRedirect() {
  useEffect(() => {
    window.location.href = '/login?callbackURL=/temple-of-joy';
  }, []);
  return <LoadingScreen />;
}

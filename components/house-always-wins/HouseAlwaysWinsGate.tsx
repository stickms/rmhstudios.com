/**
 * The House Always Wins — the front door, which no longer asks for a name.
 *
 * It used to redirect a signed-out visitor to `/login`, and the account bought
 * exactly one thing on the other side: the player's display name in the corner
 * of the shell. A gate that costs a whole visit in order to render one string
 * is not a gate, it is a toll.
 *
 * Signed in, the name still shows, and the run follows the account: this gate
 * resolves the save (this device's copy against the account's) before the
 * shell mounts, so the game never starts from one copy while another is about
 * to replace it. Two copies that each moved on come back as the shared
 * conflict dialog, which cannot be dismissed. Signed out, the game opens at
 * once and no request is made.
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { useCloudSave } from '@/hooks/useCloudSave';
import { houseAlwaysWinsSave, startHawSync, subscribeHawReresolve } from '@/lib/house-always-wins/cloud';
import { GameShell } from './GameShell';
import { describeHawSave } from './save-summary';
import { useArrival } from '@/components/ui/arrive';

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="app-ground flex items-center justify-center bg-neutral-950">
      <div className="text-neutral-600 text-sm font-mono tracking-widest animate-pulse">{label}</div>
    </div>
  );
}

export function HouseAlwaysWinsGate() {
  const { t } = useTranslation(['c-house-always-wins', 'haw-saves']);
  const session = useSession();
  const cloud = useCloudSave(houseAlwaysWinsSave, {
    gameName: t('save-game-name', { ns: 'haw-saves', defaultValue: 'The House Always Wins' }),
    summarize: (save) => describeHawSave(save, t),
  });
  const ready = cloud.status === 'ready';
  const arrival = useArrival(ready);

  // Once the save resolved, carry the run to the account as it is played.
  useEffect(() => {
    if (!ready) return;
    return startHawSync();
  }, [ready]);

  // After another device saved (a 409), the menu asks for both copies to be read again; that may ask the player.
  const { reload } = cloud;
  useEffect(() => subscribeHawReresolve(reload), [reload]);

  const loading = t('loading', {
    ns: 'c-house-always-wins',
    defaultValue: 'LOADING...',
  });

  // The session is still worth waiting for, and so is the save: the table must not open on one copy while the
  // other is being read. Both resolve in one round-trip, and the shell below is the heavy part anyway.
  if (cloud.status === 'loading') return <LoadingScreen label={loading} />;

  // Two runs that each moved on: the choice comes before the table, and nothing is written until it is made.
  if (cloud.status === 'conflict') {
    return (
      <>
        <LoadingScreen label="" />
        {cloud.conflictDialog}
      </>
    );
  }

  // Neither copy could be read. Starting a new run now would be saved over both, so ask for a retry instead.
  if (cloud.status === 'failed') {
    return (
      <div className="app-ground flex flex-col items-center justify-center gap-4 bg-neutral-950 px-6 text-center">
        <p className="text-neutral-400 text-sm">
          {t('save-failed', { ns: 'haw-saves', defaultValue: 'Your saved run could not be read.' })}
        </p>
        <button
          type="button"
          className="rounded-lg border border-neutral-700 px-6 py-2.5 pointer-coarse:min-h-11 text-sm text-neutral-200"
          onClick={cloud.reload}
        >
          {t('save-retry', { ns: 'haw-saves', defaultValue: 'Try again' })}
        </button>
      </div>
    );
  }

  const shell = <GameShell userName={session.data?.user?.name ?? null} />;
  // The table replaces the wait: it fades in through a box-less wrapper (M9).
  return arrival ? <div className="arrive-group">{shell}</div> : shell;
}

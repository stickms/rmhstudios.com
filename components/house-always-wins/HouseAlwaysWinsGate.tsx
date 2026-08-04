'use client';

/**
 * The House Always Wins — the front door, which no longer asks for a name.
 *
 * It used to redirect a signed-out visitor to `/login`, and the account bought
 * exactly one thing on the other side: the player's display name in the corner
 * of the shell. No coins are spent here, no score is posted, nothing reaches the
 * server at all. A gate that costs a whole visit in order to render one string
 * is not a gate, it is a toll.
 *
 * Signed in, the name still shows. Signed out, the game simply opens.
 */

import { useTranslation } from 'react-i18next';
import { useSession } from '@/components/Providers';
import { GameShell } from './GameShell';

export function HouseAlwaysWinsGate() {
  const { t } = useTranslation('c-house-always-wins');
  const session = useSession();

  // The session is still worth waiting for: the name is chrome, and chrome that
  // pops in a moment after the table reads as a glitch. It resolves in one
  // round-trip, and the shell below is the heavy part anyway.
  if (session.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="text-neutral-600 text-sm font-mono tracking-widest animate-pulse">
          {t('loading', { defaultValue: 'LOADING...' })}
        </div>
      </div>
    );
  }

  return <GameShell userName={session.data?.user?.name ?? null} />;
}

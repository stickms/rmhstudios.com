'use client';

/**
 * Synapse Storm — the front door.
 *
 * It used to redirect a signed-out visitor to `/login`. The account buys one
 * thing here: a row on the global leaderboard. Everything else — the puzzles,
 * the combo, the difficulty ramp — is a single-player arcade game that runs
 * entirely in the browser, and a leaderboard is a reason to sign in *after* a
 * good run rather than a reason to be turned away before the first one.
 *
 * So the game opens for anybody, and posting a score is what quietly does
 * nothing while signed out.
 */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/components/Providers';
import {
  loadSynapseStormSave,
  saveSynapseStormScore,
  type ScoreSaveData,
} from '@/lib/synapse-storm/persistence';
import { SynapseStormGame } from './SynapseStormGame';

export function SynapseStormGate() {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const signedIn = Boolean(session.data?.user);

  useEffect(() => {
    if (session.isPending) return;
    let cancelled = false;

    void (async () => {
      // Nothing to fetch for a guest, and a 401 on every page load is how you
      // teach somebody to ignore their console.
      if (signedIn) await loadSynapseStormSave();
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [signedIn, session.isPending]);

  const handleSaveScore = async (data: ScoreSaveData) => {
    if (!signedIn) return;
    await saveSynapseStormScore(data);
  };

  if (session.isPending || loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-[#0a0a1a]">
        <Loader2 className="w-12 h-12 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <SynapseStormGame onSaveScore={handleSaveScore} currentUserId={session.data?.user?.id} />
  );
}

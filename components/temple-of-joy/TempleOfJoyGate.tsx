'use client';
import './temple-of-joy.css';
import { useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { loadFromServer } from '@/lib/temple-of-joy/persistence';
import type { SaveData } from '@/lib/temple-of-joy/types';
import { TempleOfJoyGame } from './TempleOfJoyGame';

// ─── Shared theme tokens ──────────────────────────────────────────────────────
const BG = '#1a120b';
const TEXT = '#e8d5b0';
const GOLD = '#d4a847';

// ─── Loading Screen ───────────────────────────────────────────────────────────
function TempleLoadingScreen() {
  return (
    <div
      className="h-screen flex flex-col items-center justify-center gap-6"
      style={{ background: BG, color: TEXT }}
    >
      <h1
        className="text-4xl font-bold tracking-widest animate-pulse"
        style={{ fontFamily: 'var(--font-cormorant, Georgia, serif)', color: GOLD }}
      >
        Temple of Joy
      </h1>
      <p className="text-sm opacity-50 tracking-[0.3em] uppercase animate-pulse">
        Entering the temple…
      </p>
    </div>
  );
}

// ─── Gate ─────────────────────────────────────────────────────────────────────
export function TempleOfJoyGate() {
  const session = authClient.useSession();
  // undefined = fetching, null = no save, SaveData = loaded
  const [saveData, setSaveData] = useState<SaveData | null | undefined>(undefined);

  const userId = session.data?.user?.id;

  useEffect(() => {
    if (!userId) return;
    setSaveData(undefined); // show loading while fetching
    loadFromServer()
      .then((data) => setSaveData(data ?? null))
      .catch(() => setSaveData(null)); // no save on error → fresh game
  }, [userId]);

  // Session still resolving, or logged in but save not yet fetched
  if (session.isPending || (userId && saveData === undefined)) {
    return <TempleLoadingScreen />;
  }

  // Not logged in — redirect to unified login
  if (!session.data?.user) {
    window.location.href = '/login?callbackURL=/temple-of-joy';
    return <TempleLoadingScreen />;
  }

  // Logged in + save resolved
  return <TempleOfJoyGame initialSaveData={saveData} />;
}

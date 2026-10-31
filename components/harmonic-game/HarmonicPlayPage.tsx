/**
 * /harmonic — the title screen and the game. "New game" mounts the shared GameCanvas with the
 * Harmonic client (lib/harmonic-game/client); its pause menu's Disconnect, or a failed load,
 * returns here. Only the development level exists so far (H0.4).
 */
'use client';

import { useCallback, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play } from 'lucide-react';
import AppShell from '@/components/shared/AppShell';
import GameCanvas from '@/components/tf2-game/GameCanvas';
import { createHarmonicClient } from '@/lib/harmonic-game/client/harmonic-client';
import { HARMONIC_LEVELS } from '@/lib/harmonic-game/levels';
import './harmonic.css';

export default function HarmonicPlayPage() {
  const { t } = useTranslation('harmonic');
  // Bumped per run so a second "New game" mounts a fresh canvas and client.
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const level = HARMONIC_LEVELS[0];

  const start = useCallback(() => {
    setRun((r) => r + 1);
    setPlaying(true);
  }, []);
  const leave = useCallback(() => setPlaying(false), []);

  return (
    <AppShell appClassName="harmonic-root">
      <main className="harmonic-title-screen">
        <h1 className="harmonic-title">{t('harmonic:title', { defaultValue: 'Harmonic' })}</h1>
        <p className="harmonic-tagline">
          {t('harmonic:tagline', { defaultValue: 'A ship stretched across fifty-nine years.' })}
        </p>
        <button type="button" className="harmonic-primary" onClick={start} disabled={!level}>
          <Play className="size-4" aria-hidden />
          {t('harmonic:new_game', { defaultValue: 'New game' })}
        </button>
        <p className="harmonic-note">
          {t('harmonic:in_development', { defaultValue: 'In development' })}
        </p>
        <Link to="/games" className="harmonic-back">
          <ArrowLeft className="size-4 rtl-flip" aria-hidden />
          {t('harmonic:back_to_games', { defaultValue: 'Back to games' })}
        </Link>
      </main>
      {playing && level ? (
        <div className="tf2g-play-layer" key={run}>
          <GameCanvas
            // The simulation and HUD are the 'hl2' ones (plan D9); Harmonic's content rides in the client.
            game="hl2"
            sessionId="harmonic"
            title={t('harmonic:level_dev_box', { defaultValue: 'Dev box' })}
            create={(mount) => createHarmonicClient({ ...mount, level: level.id })}
            onExit={leave}
            remoteAssets={false}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

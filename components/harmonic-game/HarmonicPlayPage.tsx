/**
 * /harmonic — the title screen and the game. "New game" mounts the shared GameCanvas with the
 * Harmonic client (lib/harmonic-game/client); its pause menu's Quit to title, or a failed load,
 * returns here. Only the development level exists so far (H0.4).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import AppShell from '@/components/shared/AppShell';
import GameCanvas from '@/components/tf2-game/GameCanvas';
import { createHarmonicClient } from '@/lib/harmonic-game/client/harmonic-client';
import { HARMONIC_LEVELS } from '@/lib/harmonic-game/levels';
import { clearHarmonicSave, readHarmonicSave } from '@/lib/harmonic-game/client/save';
import HarmonicGameUi from './HarmonicGameUi';
import './harmonic.css';

export default function HarmonicPlayPage() {
  const { t } = useTranslation('harmonic');
  // Bumped per run so a second "New game" mounts a fresh canvas and client.
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  // The saved level (Continue); read after mount so server and client markup agree.
  const [save, setSave] = useState<ReturnType<typeof readHarmonicSave>>(null);
  const [confirming, setConfirming] = useState(false);
  const [levelId, setLevelId] = useState(HARMONIC_LEVELS[0].id);
  const level = HARMONIC_LEVELS.find((l) => l.id === levelId) ?? HARMONIC_LEVELS[0];

  useEffect(() => {
    setSave(
      readHarmonicSave(
        undefined,
        HARMONIC_LEVELS.map((l) => l.id),
      ),
    );
  }, []);

  const begin = useCallback((id: string) => {
    setLevelId(id);
    setConfirming(false);
    setRun((r) => r + 1);
    setPlaying(true);
  }, []);
  // New game replaces the slot (asking first when there is one); Continue resumes the saved level.
  const newGame = useCallback(() => {
    if (save && !confirming) {
      setConfirming(true);
      return;
    }
    clearHarmonicSave();
    begin(HARMONIC_LEVELS[0].id);
  }, [save, confirming, begin]);
  const leave = useCallback(() => {
    setPlaying(false);
    setSave(
      readHarmonicSave(
        undefined,
        HARMONIC_LEVELS.map((l) => l.id),
      ),
    );
  }, []);

  return (
    <AppShell appClassName="harmonic-root">
      <main className="harmonic-title-screen">
        <h1 className="harmonic-title">{t('harmonic:title', { defaultValue: 'Harmonic' })}</h1>
        <p className="harmonic-tagline">
          {t('harmonic:tagline', { defaultValue: 'A ship stretched across fifty-nine years.' })}
        </p>
        {save ? (
          <button type="button" className="harmonic-primary" onClick={() => begin(save.level)}>
            <Play className="size-4" aria-hidden />
            {t('harmonic:continue', { defaultValue: 'Continue' })}
          </button>
        ) : null}
        {confirming ? (
          <div
            className="harmonic-confirm"
            role="alertdialog"
            aria-label={t('harmonic:confirm_title', { defaultValue: 'Start a new game?' })}
          >
            <p>
              {t('harmonic:confirm_body', { defaultValue: 'This replaces your saved progress.' })}
            </p>
            <button type="button" className="harmonic-secondary" onClick={newGame}>
              {t('harmonic:confirm_yes', { defaultValue: 'Replace save' })}
            </button>
            <button
              type="button"
              className="harmonic-secondary"
              onClick={() => setConfirming(false)}
            >
              {t('harmonic:confirm_no', { defaultValue: 'Keep it' })}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={save ? 'harmonic-secondary' : 'harmonic-primary'}
            onClick={newGame}
            disabled={!level}
          >
            {save ? (
              <RotateCcw className="size-4" aria-hidden />
            ) : (
              <Play className="size-4" aria-hidden />
            )}
            {t('harmonic:new_game', { defaultValue: 'New game' })}
          </button>
        )}
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
            hudComponent={HarmonicGameUi}
            remoteAssets={false}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

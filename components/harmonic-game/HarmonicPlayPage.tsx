/**
 * /harmonic — the title screen and the game. "New game" mounts the shared GameCanvas with the
 * Harmonic client (lib/harmonic-game/client); its pause menu's Quit to title, or a failed load,
 * returns here. Only the development level exists so far (H0.4).
 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowLeft, Play, RotateCcw } from 'lucide-react';
import AppShell from '@/components/shared/AppShell';
import GameCanvas from '@/components/tf2-game/GameCanvas';
import { createHarmonicClient } from '@/lib/harmonic-game/client/harmonic-client';
import { HARMONIC_LEVELS } from '@/lib/harmonic-game/levels';
import { clearHarmonicSave, readHarmonicSave } from '@/lib/harmonic-game/client/save';
import { HARMONIC_CHAPTERS } from '@/lib/harmonic-game/narrative/chapters';
import { furthestChapter } from '@/lib/harmonic-game/narrative/flags';
import HarmonicGameUi from './HarmonicGameUi';
import './harmonic.css';

/** Chapter names: literal t() calls so extraction sees every key (HarmonicHud has the same table). */
function chapterName(t: TFunction, key: string, fallback: string): string {
  switch (key) {
    case 'chapter_h1_whiteout':
      return t('harmonic:chapter_h1_whiteout', { defaultValue: 'Whiteout' });
    case 'chapter_h2_listening':
      return t('harmonic:chapter_h2_listening', { defaultValue: 'Listening Post' });
    case 'chapter_h3_still_point':
      return t('harmonic:chapter_h3_still_point', { defaultValue: 'Still Point' });
    case 'chapter_h4_below_decks':
      return t('harmonic:chapter_h4_below_decks', { defaultValue: 'Below Decks' });
    case 'chapter_h5_long_corridor':
      return t('harmonic:chapter_h5_long_corridor', { defaultValue: 'Long Corridor' });
    case 'chapter_h6_drive_room':
      return t('harmonic:chapter_h6_drive_room', { defaultValue: 'Drive Room' });
    case 'chapter_h7_harmonic':
      return t('harmonic:chapter_h7_harmonic', { defaultValue: 'Harmonic' });
    default:
      return fallback;
  }
}

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
  // Chapters reached so far (the save's furthest), each playable once its level exists.
  const reached = furthestChapter(save?.flags);
  const chapters = HARMONIC_CHAPTERS.filter((c) => c.number <= reached);

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
    // `?level=<id>` starts any listed level (development: dev_models, chapters under test).
    const id = new URLSearchParams(window.location.search).get('level');
    begin(HARMONIC_LEVELS.some((l) => l.id === id) && id ? id : HARMONIC_LEVELS[0].id);
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
        {chapters.length > 0 ? (
          <nav aria-labelledby="harmonic-chapters-label">
            <h2 id="harmonic-chapters-label" className="harmonic-chapters-label">
              {t('harmonic:chapters', { defaultValue: 'Chapters' })}
            </h2>
            <ul className="harmonic-chapters">
              {chapters.map((c) => {
                const available = HARMONIC_LEVELS.some((l) => l.id === c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className="harmonic-chapter-link"
                      disabled={!available}
                      onClick={() => begin(c.id)}
                    >
                      {t('harmonic:chapter_line', {
                        defaultValue: '{{number}}. {{title}}',
                        number: c.number,
                        title: chapterName(t, c.titleKey, c.titleDefault),
                      })}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
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
            endScreen={
              <section className="tf2g-play-screen" aria-labelledby="harmonic-end-title">
                <h2 id="harmonic-end-title" className="tf2hud-title text-3xl">
                  {t('harmonic:end_of_build_title', { defaultValue: 'End of the current build' })}
                </h2>
                <p className="max-w-sm text-center text-sm text-(--app-text-muted)">
                  {t('harmonic:end_of_build_body', {
                    defaultValue:
                      'That is all of Harmonic that exists so far. Your progress is saved.',
                  })}
                </p>
                <button type="button" className="harmonic-primary" onClick={leave}>
                  {t('harmonic:end_of_build_back', { defaultValue: 'Back to title' })}
                </button>
              </section>
            }
            remoteAssets={false}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

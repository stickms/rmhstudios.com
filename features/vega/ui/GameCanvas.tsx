/**
 * Project Vega's app: switches between the case files (menu), the board and the case report, owns the running
 * `VegaGame`, the run save, music and sound, the tutorial flag and the score submission.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import { asset } from '@/lib/storage/asset';
import { readJson, readString, removeKey, writeJson, writeString } from '@/lib/core/persist';
import { motionStill } from '@/lib/appearance/prefs';
import { useSession } from '@/components/session/session-context';
import { useGameSession } from '@/hooks/useGameSession';
import { submitVegaScoreApi } from '@features/vega/engine/vega.contract';
import { getVegaLeaderboardApi } from '@/lib/game/leaderboard.contract';
import { VegaGame } from '@features/vega/engine/VegaGame';
import { useGameStore, type EndResult } from '@features/vega/engine/GameState';
import { initialTutorial, TUTORIAL_KEY } from '@features/vega/engine/tutorial';
import type { MapId } from '@features/vega/engine/data';
import type { RunSave } from '@features/vega/engine/Simulation';
import { GameCtx, SidePanel, TopBar } from './Hud';
import { CaseLog, DossierCard, ManualDialog, PauseDialog, TutorialCard, VictoryDialog } from './Overlays';
import { Menu, type BoardRow } from './Menu';
import { EndScreen, type SubmitState } from './EndScreen';
import { playSfx, setSfxVolume, unlockSfx } from './sfx';

const RUN_KEY = 'rmh:vega:run';
const AUDIO_KEY = 'rmh:vega:audio';
const TRACKS = 4;

function readSave(): RunSave | null {
  return readJson<RunSave | null>(RUN_KEY, null, {
    validate: (v) => {
      const s = v as RunSave | null;
      return s && s.v === 1 && typeof s.wave === 'number' && Array.isArray(s.towers) ? s : undefined;
    },
  });
}

export default function GameCanvas() {
  const { t } = useTranslation('c-vega');
  const session = useSession();
  const screen = useGameStore((s) => s.screen);
  const paused = useGameStore((s) => s.paused);
  const manualOpen = useGameStore((s) => s.manualOpen);
  const victoryOpen = useGameStore((s) => s.victoryOpen);
  const tutorialStep = useGameStore((s) => s.tutorial.step);
  const result = useGameStore((s) => s.result);

  const gameRef = useRef<VegaGame | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [save, setSave] = useState<RunSave | null>(null);
  const [run, setRun] = useState<{ key: number; map: MapId; seed: number; save: RunSave | null } | null>(null);
  const [submit, setSubmit] = useState<SubmitState>('idle');
  const [muted, setMuted] = useState(false);
  const [track, setTrack] = useState(1);
  const [bench, setBench] = useState<{ cx: number; cy: number } | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [boardKey, setBoardKey] = useState(0);

  // The best runs, for the menu and the case report; read again once a report is filed.
  useEffect(() => {
    let live = true;
    api(getVegaLeaderboardApi)
      .then((rows) => live && setBoard(Array.isArray(rows) ? rows : []))
      .catch(() => live && setBoard([]));
    return () => {
      live = false;
    };
  }, [boardKey]);

  // Keep the screen awake during a run and pause when the tab hides (hooks/useGameSession.ts).
  useGameSession({
    id: 'vega',
    active: screen === 'play' && !paused && !manualOpen,
    onPause: () => useGameStore.getState().setPaused(true),
  });

  useEffect(() => {
    setSave(readSave());
    const audio = readJson<{ muted: boolean }>(AUDIO_KEY, { muted: false });
    setMuted(!!audio.muted);
    useGameStore.getState().setScreen('menu');
  }, []);

  useEffect(() => {
    setSfxVolume(muted ? 0 : 0.6);
    if (audioRef.current) audioRef.current.volume = muted ? 0 : 0.18;
    writeJson(AUDIO_KEY, { muted });
  }, [muted]);

  const startMusic = useCallback(() => {
    unlockSfx();
    const a = audioRef.current;
    if (a && a.paused && !muted) a.play().catch(() => {});
  }, [muted]);

  const begin = useCallback(
    (map: MapId, from: RunSave | null, tutorial: boolean) => {
      const store = useGameStore.getState();
      store.resetRun();
      store.setMap(from?.map ?? map);
      const done = readString(TUTORIAL_KEY) === '1';
      store.setTutorial(tutorial ? initialTutorial(false) : initialTutorial(done || !!from));
      setSubmit('idle');
      setRun({ key: Date.now(), map: from?.map ?? map, seed: from?.seed ?? (Math.random() * 2 ** 31) | 0, save: from });
      store.setScreen('play');
      startMusic();
    },
    [startMusic],
  );

  const finishTutorial = useCallback(() => {
    writeString(TUTORIAL_KEY, '1');
  }, []);

  const submitRun = useCallback(
    async (r: EndResult) => {
      if (!session.data) {
        setSubmit('signed-out');
        return;
      }
      if (r.cleared === 0) {
        setSubmit('idle');
        return;
      }
      setSubmit('sending');
      try {
        const res = await api(submitVegaScoreApi, {
          body: {
            score: r.score,
            cleared: r.cleared,
            map: r.map,
            durationMs: r.durationMs,
            facts: {
              integrityLost: r.stats.integrityLost,
              typesBuilt: r.stats.typesBuilt,
              maxTier: r.stats.maxTier,
              earlyCalls: r.stats.earlyCalls,
              bossesKilled: r.stats.bossesKilled,
              biobankIncome: r.stats.biobankIncome,
            },
          },
        });
        setSubmit(res.isRecord ? 'record' : 'saved');
        setBoardKey((k) => k + 1);
      } catch (e) {
        setSubmit(e instanceof HttpError ? 'refused' : 'offline');
      }
    },
    [session.data],
  );

  // Mount the game for each run.
  useEffect(() => {
    if (!run || !canvasRef.current) return;
    const game = new VegaGame(canvasRef.current, {
      map: run.map,
      seed: run.seed,
      save: run.save,
      container: boardRef.current,
      still: () => motionStill(),
      sfx: playSfx,
      onSave: (s) => {
        if (s) writeJson(RUN_KEY, s);
        else removeKey(RUN_KEY);
        setSave(s);
      },
      onEnd: (r) => {
        // The board is gone with the play screen: stop its frame loop now.
        game.destroy();
        const store = useGameStore.getState();
        store.setResult(r);
        store.setVictoryOpen(false);
        store.setPaused(false);
        store.setScreen('end');
        void submitRun(r);
      },
    });
    gameRef.current = game;
    setBench(game.suggestedBench());
    game.start();
    return () => {
      game.destroy();
      if (gameRef.current === game) gameRef.current = null;
    };
  }, [run, submitRun]);

  const quitToMenu = () => {
    gameRef.current?.destroy();
    gameRef.current = null;
    setRun(null);
    setSave(readSave());
    useGameStore.getState().resetRun();
    useGameStore.getState().setScreen('menu');
  };

  return (
    <GameCtx.Provider value={gameRef}>
      <div className="vega-root" onPointerDown={startMusic}>
        <audio ref={audioRef} src={asset(`/music/vega/${track}.mp3`)} onEnded={() => setTrack((n) => (n % TRACKS) + 1)} preload="none" />

        {screen !== 'play' && (
          <a
            href="/games"
            className="vg-btn vg-btn-sm"
            style={{ position: 'absolute', zIndex: 2, top: 'calc(14px + var(--safe-top, 0px))', left: 16 }}
          >
            <ArrowLeft aria-hidden size={16} /> {t('back-to-games', { defaultValue: 'Back to games' })}
          </a>
        )}

        {screen === 'menu' && (
          <Menu
            save={save}
            board={board}
            onStart={(m) => begin(m, null, false)}
            onResume={() => save && begin(save.map, save, false)}
            onTutorial={() => begin('intake', null, true)}
          />
        )}

        {screen === 'play' && run && (
          <>
            <TopBar muted={muted} onToggleMute={() => setMuted((m) => !m)} />
            <div className="vg-main">
              <div className="vg-board-wrap">
                <div className="vg-board" ref={boardRef}>
                  <div style={{ position: 'relative', lineHeight: 0 }}>
                    <canvas
                      ref={canvasRef}
                      key={run.key}
                      data-jelly-zone="playfield"
                      tabIndex={0}
                      aria-label={t('board-aria', {
                        defaultValue: 'The specimen board. Arrow keys move the cursor, Enter places or selects, Space starts the wave.',
                      })}
                      onFocus={() => gameRef.current?.focusCursor()}
                    />
                    {tutorialStep !== 'done' && <TutorialCard bench={bench} onFinish={finishTutorial} />}
                  </div>
                  <DossierCard />
                  <CaseLog />
                </div>
                {paused && !manualOpen && (
                  <PauseDialog
                    onQuit={quitToMenu}
                    onAbandon={() => {
                      useGameStore.getState().setPaused(false);
                      gameRef.current?.abandon();
                    }}
                  />
                )}
                {victoryOpen && !manualOpen && (
                  <VictoryDialog onContinue={() => gameRef.current?.continueOvertime()} onClose={() => gameRef.current?.abandon()} />
                )}
              </div>
              <SidePanel />
            </div>
          </>
        )}

        {screen === 'end' && result && (
          <EndScreen result={result} submit={submit} board={board} onAgain={() => begin(result.map, null, false)} onMenu={quitToMenu} />
        )}

        {manualOpen && (
          <ManualDialog
            onReplayTutorial={
              screen === 'play'
                ? () => {
                    useGameStore.getState().tutorialEvent({ type: 'restart' });
                    useGameStore.getState().setManualOpen(false);
                    useGameStore.getState().setPaused(false);
                  }
                : null
            }
          />
        )}
      </div>
    </GameCtx.Provider>
  );
}

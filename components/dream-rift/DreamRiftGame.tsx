'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useDreamRiftStore } from '@/lib/dream-rift/store';
import { DreamRiftEngine } from '@/lib/dream-rift/engine';
import { CANVAS_WIDTH, CANVAS_HEIGHT, DISPLAY_SCALE } from '@/lib/dream-rift/constants';
import { DreamRiftTitle } from './DreamRiftTitle';
import { DreamRiftCharSelect } from './DreamRiftCharSelect';
import { DreamRiftDifficultySelect } from './DreamRiftDifficultySelect';
import { DreamRiftHUD } from './DreamRiftHUD';
import { DreamRiftPause } from './DreamRiftPause';
import { DreamRiftGameOver } from './DreamRiftGameOver';
import { DreamRiftStageResult } from './DreamRiftStageResult';
import { DreamRiftLeaderboard } from './DreamRiftLeaderboard';

export function DreamRiftGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<DreamRiftEngine | null>(null);
  const initReady = useRef(false);

  const screen = useDreamRiftStore((s) => s.screen);
  const setScreen = useDreamRiftStore((s) => s.setScreen);
  const startGame = useDreamRiftStore((s) => s.startGame);

  // Initialise / destroy engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new DreamRiftEngine();
    engineRef.current = engine;
    initReady.current = false;

    let mounted = true;
    engine.init(canvas).then(() => {
      if (!mounted) {
        engine.destroy();
        return;
      }
      initReady.current = true;
      // If the screen is already 'playing' by the time init finishes, start now
      if (useDreamRiftStore.getState().screen === 'playing') {
        engine.start();
      }
    });

    return () => {
      mounted = false;
      initReady.current = false;
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Start/stop engine when screen transitions to/from playing
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !initReady.current) return;

    if (screen === 'playing') {
      engine.start();
    } else {
      engine.stop();
    }
  }, [screen]);

  // Pause on window blur
  useEffect(() => {
    const onBlur = () => {
      if (useDreamRiftStore.getState().screen === 'playing') {
        setScreen('paused');
      }
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, [setScreen]);

  // Escape key toggles pause
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      const currentScreen = useDreamRiftStore.getState().screen;
      if (currentScreen === 'playing') {
        setScreen('paused');
      } else if (currentScreen === 'paused') {
        setScreen('playing');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setScreen]);

  const handleResume = useCallback(() => {
    setScreen('playing');
  }, [setScreen]);

  const handleRestart = useCallback(() => {
    startGame();
  }, [startGame]);

  const handleQuitToTitle = useCallback(() => {
    engineRef.current?.stop();
    setScreen('title');
  }, [setScreen]);

  return (
    <div
      className="relative bg-black mx-auto"
      style={{
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        width: `${CANVAS_WIDTH * DISPLAY_SCALE}px`,
        height: `${CANVAS_HEIGHT * DISPLAY_SCALE}px`,
      }}
    >
      <div
        className="relative origin-top-left"
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          transform: `scale(${DISPLAY_SCALE})`,
        }}
      >
      <canvas
        ref={canvasRef}
        className="block"
        style={{
          width: `${CANVAS_WIDTH}px`,
          height: `${CANVAS_HEIGHT}px`,
          imageRendering: 'pixelated',
        }}
      />

      {/* Screen overlays */}
      {screen === 'title' && <DreamRiftTitle />}
      {screen === 'charSelect' && <DreamRiftCharSelect />}
      {screen === 'difficultySelect' && <DreamRiftDifficultySelect />}
      {screen === 'playing' && <DreamRiftHUD />}
      {screen === 'paused' && (
        <DreamRiftPause
          onResume={handleResume}
          onRestart={handleRestart}
          onQuit={handleQuitToTitle}
        />
      )}
      {screen === 'gameOver' && <DreamRiftGameOver onQuit={handleQuitToTitle} />}
      {screen === 'stageResult' && <DreamRiftStageResult onQuit={handleQuitToTitle} />}
      {screen === 'leaderboard' && <DreamRiftLeaderboard />}
      </div>
    </div>
  );
}

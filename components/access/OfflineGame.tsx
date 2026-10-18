'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useReducedMotion } from '@/hooks/useReducedMotion';

const COLS = 7;
const ROWS = 10;
const CELL = 32;
const HS_KEY = 'rmh-offline-best';

interface Game {
  px: number;
  blocks: { x: number; y: number }[];
  score: number;
  over: boolean;
}

function readBest(): number {
  try {
    return Number(localStorage.getItem(HS_KEY)) || 0;
  } catch {
    return 0;
  }
}

/**
 * Offline mini-game: dodge the falling blocks. Grid-stepped (one row per tick, no
 * per-frame loop), so it costs almost nothing and "reduce motion" simply means a
 * slower, constant tick with no speed-up. High score is local to this device.
 */
export function OfflineGame() {
  const { t } = useTranslation('f-access');
  const reduced = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game>({ px: 3, blocks: [], score: 0, over: true });
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [lastOver, setLastOver] = useState(false);

  useEffect(() => setBest(readBest()), []);

  const draw = useCallback(() => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const cs = getComputedStyle(c);
    const accent = cs.getPropertyValue('--site-accent').trim() || 'currentColor';
    const danger = cs.getPropertyValue('--site-danger').trim() || 'currentColor';
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = danger;
    for (const b of game.current.blocks)
      ctx.fillRect(b.x * CELL + 3, b.y * CELL + 3, CELL - 6, CELL - 6);
    ctx.fillStyle = accent;
    ctx.fillRect(game.current.px * CELL + 3, (ROWS - 1) * CELL + 8, CELL - 6, CELL - 12);
  }, []);

  const move = useCallback(
    (d: -1 | 1) => {
      const g = game.current;
      if (g.over) return;
      g.px = Math.min(COLS - 1, Math.max(0, g.px + d));
      draw();
    },
    [draw],
  );

  const start = useCallback(() => {
    game.current = { px: Math.floor(COLS / 2), blocks: [], score: 0, over: false };
    setScore(0);
    setLastOver(false);
    setRunning(true);
    draw();
  }, [draw]);

  useEffect(() => {
    if (!running) return;
    let tick = 0;
    let timer = 0;
    // Normal motion speeds up gradually; reduced motion keeps one slow, steady pace.
    const delay = () => (reduced ? 700 : Math.max(160, 420 - game.current.score * 2));
    const step = () => {
      const g = game.current;
      tick++;
      g.blocks = g.blocks.map((b) => ({ x: b.x, y: b.y + 1 })).filter((b) => b.y < ROWS);
      if (tick % 2 === 0) g.blocks.push({ x: Math.floor(Math.random() * COLS), y: 0 });
      if (g.blocks.some((b) => b.y === ROWS - 1 && b.x === g.px)) {
        g.over = true;
        setRunning(false);
        setLastOver(true);
        if (g.score > readBest()) {
          try {
            localStorage.setItem(HS_KEY, String(g.score));
          } catch {
            /* storage unavailable */
          }
        }
        setBest(Math.max(readBest(), g.score));
      } else {
        g.score++;
        setScore(g.score);
        timer = window.setTimeout(step, delay());
      }
      draw();
    };
    timer = window.setTimeout(step, delay());
    return () => window.clearTimeout(timer);
  }, [running, reduced, draw]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') move(-1);
      else if (e.key === 'ArrowRight' || e.key === 'd') move(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  return (
    <div className="mt-2 flex w-full flex-col items-center gap-3 border-t border-site-border pt-4">
      <p className="text-sm font-semibold text-site-text">
        {t('game-title', { defaultValue: 'While you wait' })}
      </p>
      <canvas
        ref={canvasRef}
        width={COLS * CELL}
        height={ROWS * CELL}
        className="glass-inset w-full max-w-[224px] rounded-site-sm"
        role="img"
        aria-label={t('game-canvas', {
          defaultValue: 'Dodge game: move left and right to avoid falling blocks',
        })}
      />
      <p className="text-xs text-site-text-muted" aria-live="polite">
        {lastOver
          ? t('game-over', {
              defaultValue: 'Game over. Score {{score}}, best {{best}}.',
              score,
              best,
            })
          : t('game-score', { defaultValue: 'Score {{score}} · Best {{best}}', score, best })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => move(-1)}
          aria-label={t('game-left', { defaultValue: 'Move left' })}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Button>
        <Button onClick={start} disabled={running}>
          <Play className="me-2 h-4 w-4" aria-hidden />
          {lastOver
            ? t('game-again', { defaultValue: 'Play again' })
            : t('game-start', { defaultValue: 'Play' })}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => move(1)}
          aria-label={t('game-right', { defaultValue: 'Move right' })}
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

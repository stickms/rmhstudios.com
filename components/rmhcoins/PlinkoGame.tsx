'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoinIcon } from './CoinIcon';
import {
  physicsTick,
  PEGS,
  CANVAS_W,
  CANVAS_H,
  NUM_BINS,
  BALL_RADIUS,
  PEG_RADIUS,
  GROUND_Y,
  INITIAL_VY,
  FIXED_DT,
  START_Y,
  type BallState,
  type PegPosition,
} from '@/lib/plinko-physics';

interface Props {
  coins: number;
  setCoins: (coins: number) => void;
}

type GameState = 'idle' | 'dropping' | 'result';

const TRAIL_LENGTH = 6;

// ---- Drawing ----
const BIN_COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7'];
const BIN_COLORS_DIM = ['#7f1d1d', '#78350f', '#14532d', '#1e3a5f', '#581c87'];

function drawBoard(
  ctx: CanvasRenderingContext2D,
  selectedBin: number | null,
  landedBin: number | null,
  glowPeg: PegPosition | null = null
) {
  const w = CANVAS_W;
  const h = CANVAS_H;

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1b2e');
  grad.addColorStop(1, '#0d0d1a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Pegs
  for (const peg of PEGS) {
    const isGlowing =
      glowPeg && peg.px === glowPeg.px && peg.py === glowPeg.py;

    if (isGlowing) {
      ctx.beginPath();
      ctx.arc(peg.px, peg.py, PEG_RADIUS * 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(peg.px, peg.py, PEG_RADIUS + 1, 0, Math.PI * 2);
      ctx.fillStyle = '#FFD700';
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(peg.px, peg.py, PEG_RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = '#4a4b54';
      ctx.fill();
    }
  }

  // Bins
  const binH = 40;
  const binY = h - binH;
  const binW = w / NUM_BINS;

  for (let i = 0; i < NUM_BINS; i++) {
    const isSelected = selectedBin === i;
    const isLanded = landedBin === i;

    ctx.fillStyle = isLanded
      ? BIN_COLORS[i]
      : isSelected
        ? BIN_COLORS[i]
        : BIN_COLORS_DIM[i];
    ctx.fillRect(i * binW + 1, binY, binW - 2, binH);

    ctx.fillStyle = isSelected || isLanded ? '#ffffff' : '#9a9ba4';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), i * binW + binW / 2, binY + 25);

    if (isSelected && !isLanded) {
      ctx.strokeStyle = '#F5A623';
      ctx.lineWidth = 2;
      ctx.strokeRect(i * binW + 1, binY, binW - 2, binH);
    }
  }
}

function drawBallTrail(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  alpha: number,
  scale: number
) {
  ctx.beginPath();
  ctx.arc(x, y, BALL_RADIUS * scale, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255, 215, 0, ${alpha})`;
  ctx.fill();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Shadow
  ctx.beginPath();
  ctx.arc(x + 2, y + 2, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();

  // Ball with gradient
  const ballGrad = ctx.createRadialGradient(x - 2, y - 2, 1, x, y, BALL_RADIUS);
  ballGrad.addColorStop(0, '#FFD700');
  ballGrad.addColorStop(1, '#D4920B');
  ctx.beginPath();
  ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = ballGrad;
  ctx.fill();
}

// ---- Component ----
export function PlinkoGame({ coins, setCoins }: Props) {
  const { t } = useTranslation('c-rmhcoins');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  const [selectedBin, setSelectedBin] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState(1);
  const [betInput, setBetInput] = useState('1');
  const [gameState, setGameState] = useState<GameState>('idle');
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [resultWon, setResultWon] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const ballPos = useRef<{ x: number; y: number } | null>(null);
  const landedBinRef = useRef<number | null>(null);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawBoard(ctx, selectedBin, landedBinRef.current);
    if (ballPos.current) {
      drawBall(ctx, ballPos.current.x, ballPos.current.y);
    }
  }, [selectedBin]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const animateBall = useCallback(
    (
      startX: number,
      landedBin: number,
      won: boolean,
      payout: number,
      newBalance: number
    ) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const maybeCtx = canvas.getContext('2d');
      if (!maybeCtx) return;
      const ctx: CanvasRenderingContext2D = maybeCtx;

      setGameState('dropping');
      landedBinRef.current = null;

      // Initialize ball at server-provided starting position
      const ball: BallState = {
        x: startX,
        y: START_Y,
        vx: 0,
        vy: INITIAL_VY,
      };

      const trail: { x: number; y: number }[] = [];
      let lastHitPeg: PegPosition | null = null;
      let lastHitTime = 0;
      let lastTimestamp: number | null = null;
      let animStartTime = 0;
      let accumulator = 0;

      function frame(timestamp: number) {
        if (!lastTimestamp) {
          lastTimestamp = timestamp;
          animStartTime = timestamp;
        }

        // Real wall-clock dt, capped to prevent spiral of death
        const rawDt = Math.min((timestamp - lastTimestamp) / 1000, 0.1);
        lastTimestamp = timestamp;
        accumulator += rawDt;

        // Safety: force end after 8 seconds
        if (timestamp - animStartTime > 8000) {
          finish();
          return;
        }

        // Step physics in fixed increments (deterministic)
        while (accumulator >= FIXED_DT) {
          physicsTick(ball, (peg) => {
            lastHitPeg = peg;
            lastHitTime = timestamp;
          });
          accumulator -= FIXED_DT;

          // Check if ball reached the bins
          if (ball.y >= GROUND_Y) {
            finish();
            return;
          }
        }

        // Update trail
        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > TRAIL_LENGTH) trail.shift();

        ballPos.current = { x: ball.x, y: ball.y };

        // Peg glow (fades over 200ms)
        const glowPeg =
          lastHitPeg && timestamp - lastHitTime < 200 ? lastHitPeg : null;

        // Draw everything
        drawBoard(ctx, selectedBin, null, glowPeg);
        for (let i = 0; i < trail.length - 1; i++) {
          const alpha = ((i + 1) / trail.length) * 0.25;
          const scale = 0.4 + ((i + 1) / trail.length) * 0.4;
          drawBallTrail(ctx, trail[i].x, trail[i].y, alpha, scale);
        }
        drawBall(ctx, ball.x, ball.y);

        animRef.current = requestAnimationFrame(frame);
      }

      function finish() {
        // Server's landedBin is authoritative — don't re-derive from client physics
        landedBinRef.current = landedBin;
        ballPos.current = null;
        drawBoard(ctx, selectedBin, landedBin);

        if (won) {
          import('canvas-confetti').then((mod) => {
            const confetti = mod.default;
            confetti({
              particleCount: 80,
              spread: 60,
              origin: { x: (landedBin + 0.5) / NUM_BINS, y: 0.8 },
              colors: ['#FFD700', '#F5A623', '#22c55e'],
            });
          });
        }

        setCoins(newBalance);
        setResultWon(won);
        setResultMessage(
          won
            ? t('result-won', { defaultValue: 'You won {{payout}} coins!', payout })
            : t('result-lost', { defaultValue: 'Ball landed in bin {{bin}}. You lost {{amount}} coins.', bin: landedBin + 1, amount: betAmount })
        );
        setGameState('result');

        setTimeout(() => {
          setGameState('idle');
          setResultMessage(null);
          landedBinRef.current = null;
          redraw();
        }, 3000);
      }

      animRef.current = requestAnimationFrame(frame);
    },
    [selectedBin, betAmount, setCoins, redraw]
  );

  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  const handleBetBlur = () => {
    const parsed = parseInt(betInput, 10);
    if (isNaN(parsed) || parsed < 1) {
      setBetAmount(1);
      setBetInput('1');
    } else {
      const clamped = Math.min(parsed, coins);
      setBetAmount(clamped);
      setBetInput(String(clamped));
    }
  };

  const setQuickBet = (amount: number) => {
    const val = Math.min(amount, coins);
    setBetAmount(val);
    setBetInput(String(val));
  };

  const handleSubmit = async () => {
    const parsed = parseInt(betInput, 10);
    const amount = isNaN(parsed)
      ? betAmount
      : Math.max(1, Math.min(parsed, coins));
    setBetAmount(amount);
    setBetInput(String(amount));

    if (selectedBin === null || amount < 1 || amount > coins || submitting)
      return;

    setSubmitting(true);
    setResultMessage(null);

    try {
      const res = await fetch('/api/coins/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bin: selectedBin, amount }),
      });

      if (!res.ok) {
        const data = await res.json();
        setResultMessage(data.error || t('error-generic', { defaultValue: 'Something went wrong' }));
        setResultWon(false);
        setGameState('result');
        setTimeout(() => {
          setGameState('idle');
          setResultMessage(null);
        }, 2000);
        return;
      }

      const data = await res.json();
      animateBall(
        data.startX,
        data.landedBin,
        data.won,
        data.payout,
        data.newBalance
      );
    } catch {
      setResultMessage(t('error-network', { defaultValue: 'Network error' }));
      setGameState('result');
      setTimeout(() => {
        setGameState('idle');
        setResultMessage(null);
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  const isIdle = gameState === 'idle';

  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4 px-3 sm:px-4 py-4 sm:py-6">
      <div className="w-full max-w-[390px] aspect-[390/420] relative">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="w-full h-full rounded-lg"
          style={{ imageRendering: 'auto' }}
        />
        {resultMessage && (
          <div
            className={`absolute inset-0 flex items-center justify-center rounded-lg ${
              resultWon ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}
          >
            <div
              className={`px-3 py-2 rounded-lg font-bold text-sm sm:text-lg ${
                resultWon
                  ? 'bg-emerald-500/90 text-white'
                  : 'bg-red-500/90 text-white'
              }`}
            >
              {resultMessage}
            </div>
          </div>
        )}
      </div>

      <div className="w-full max-w-[390px]">
        <p className="text-sm text-site-text-dim mb-2">{t('select-a-bin', { defaultValue: 'Select a bin:' })}</p>
        <div className="flex gap-1.5 sm:gap-2">
          {Array.from({ length: NUM_BINS }, (_, i) => (
            <button
              key={i}
              onClick={() => isIdle && setSelectedBin(i)}
              disabled={!isIdle}
              className={`flex-1 min-h-10 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 ${
                selectedBin === i
                  ? 'ring-2 ring-yellow-500 text-white'
                  : 'text-site-text-dim hover:text-site-text'
              } disabled:opacity-50`}
              style={{
                backgroundColor:
                  selectedBin === i ? BIN_COLORS[i] : BIN_COLORS_DIM[i],
              }}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full max-w-[390px]">
        <p className="text-sm text-site-text-dim mb-2">{t('bet-amount', { defaultValue: 'Bet amount:' })}</p>
        <div className="flex flex-col gap-2">
          <div className="relative">
            <input
              type="number"
              min={1}
              max={coins}
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              onBlur={handleBetBlur}
              disabled={!isIdle}
              className="w-full bg-site-surface border border-site-border rounded-xl px-3 py-2.5 text-site-text text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500/50 disabled:opacity-50"
            />
            <CoinIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" />
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {[1, 5, 10].map((amt) => (
              <button
                key={amt}
                onClick={() => isIdle && setQuickBet(amt)}
                disabled={!isIdle}
                className="min-h-10 text-xs font-bold bg-site-surface border border-site-border rounded-xl text-site-text-dim hover:text-site-text hover:bg-site-surface-hover disabled:opacity-50 active:scale-95 transition-all"
              >
                {amt}
              </button>
            ))}
            <button
              onClick={() => isIdle && setQuickBet(coins)}
              disabled={!isIdle}
              className="min-h-10 text-xs font-bold bg-site-surface border border-site-border rounded-xl text-yellow-500 hover:bg-site-surface-hover disabled:opacity-50 active:scale-95 transition-all"
            >
              {t('bet-all', { defaultValue: 'All' })}
            </button>
          </div>
        </div>
      </div>

      <Button
        onClick={handleSubmit}
        disabled={!isIdle || selectedBin === null || submitting}
        className="w-full max-w-[390px] min-h-11 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-xl"
      >
        {submitting ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : gameState === 'dropping' ? (
          t('dropping', { defaultValue: 'Dropping...' })
        ) : (
          t('drop-ball', { defaultValue: 'Drop Ball' })
        )}
      </Button>

      {coins === 0 && isIdle && (
        <p className="text-sm text-site-text-dim text-center">
          {t('out-of-coins', { defaultValue: "You're out of coins! Visit the" })}{' '}
          <span className="text-yellow-500">{t('shop-tab', { defaultValue: 'Shop' })}</span> {t('out-of-coins-suffix', { defaultValue: 'tab to get more.' })}
        </p>
      )}
    </div>
  );
}

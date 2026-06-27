'use client';

import type React from 'react';
import { useRef, useState, useEffect, useCallback, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import { Play, Trophy, Users, RotateCcw, Crown, Flame, ArrowLeft, Copy, LogOut, Check } from 'lucide-react';
import { authClient } from '@/lib/auth-client';
import { Button } from '@/components/ui/button';
import { LaundryEngine } from '@/lib/laundry-sort/engine';
import { LaundryRenderer } from '@/lib/laundry-sort/renderer';
import { MODE_CONFIG, MODE_META, COLOR_CSS } from '@/lib/laundry-sort/constants';
import { randomSeed, seedFromDateKey, todayDateKey } from '@/lib/laundry-sort/rng';
import type { GameMode, HudSnapshot, RunResult } from '@/lib/laundry-sort/types';
import {
  getLaundryMultiplayerClient,
  getStoredUserId,
  getStoredDisplayName,
  setStoredDisplayName,
  type LSLobbyState,
  type LSLeaderboardEntry,
  type LSMatchState,
  type LSConnectionStatus,
} from '@/lib/laundry-sort/multiplayerClient';
import type { LeaderboardPeriod } from '@/lib/laundry-sort/period';
import './laundry-sort.css';

type Screen = 'menu' | 'playing' | 'results';
interface Popup { id: number; x: number; y: number; text: string; good: boolean }
interface BoardRow { username: string; score: number; bestStreak?: number }

const EMPTY_SNAP: HudSnapshot = {
  status: 'idle', score: 0, combo: 0, multiplier: 1, streak: 0, bestStreak: 0, heat: 0,
  timeLeft: 60, sorted: 0, missed: 0, accuracy: 1, overflow: 0, mode: 'time-attack',
};

export function LaundryGame() {
  const { t } = useTranslation('c-laundry-sort');
  const navigate = useNavigate();
  const session = authClient.useSession();

  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<LaundryEngine | null>(null);
  const rendererRef = useRef<LaundryRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const hudAccRef = useRef<number>(0);
  const popupIdRef = useRef<number>(0);
  const isMpRunRef = useRef<boolean>(false);
  const onEndRef = useRef<(r: RunResult) => void>(() => {});
  const activePointers = useRef<Set<number>>(new Set());

  const [screen, setScreen] = useState<Screen>('menu');
  const [snapshot, setSnapshot] = useState<HudSnapshot>(EMPTY_SNAP);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [streakBanner, setStreakBanner] = useState<string | null>(null);
  const [flash, setFlash] = useState(0);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // ── Leaderboards ──
  const [board, setBoard] = useState<BoardRow[]>([]);
  const [boardPeriod, setBoardPeriod] = useState<LeaderboardPeriod>('all');
  const [boardMode, setBoardMode] = useState<GameMode>('time-attack');
  const [boardLoading, setBoardLoading] = useState(false);

  // ── Multiplayer ──
  const [mpOpen, setMpOpen] = useState(false);
  const [conn, setConn] = useState<LSConnectionStatus>('disconnected');
  const [lobby, setLobby] = useState<LSLobbyState | null>(null);
  const [liveBoard, setLiveBoard] = useState<LSLeaderboardEntry[]>([]);
  const [mpResults, setMpResults] = useState<LSLeaderboardEntry[] | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [mpError, setMpError] = useState<string | null>(null);
  const mpMatchRef = useRef<LSMatchState | null>(null);

  const displayName =
    session.data?.user?.name || (session.data?.user as { username?: string })?.username || getStoredDisplayName() || 'Player';
  const userId = session.data?.user?.id || getStoredUserId();

  // ── Renderer + game loop (mounted once) ──────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const renderer = new LaundryRenderer(canvas);
    rendererRef.current = renderer;
    renderer.resize(wrap.clientWidth, wrap.clientHeight);

    // Idle engine so the cozy laundromat (hampers, bubbles, warm light) renders
    // behind the menus/results instead of a blank canvas. Never started.
    if (!engineRef.current) {
      engineRef.current = new LaundryEngine({ ...MODE_CONFIG['time-attack'], seed: randomSeed() });
    }

    const ro = new ResizeObserver(() => renderer.resize(wrap.clientWidth, wrap.clientHeight));
    ro.observe(wrap);

    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const dt = lastTimeRef.current ? Math.min(0.05, (now - lastTimeRef.current) / 1000) : 0;
      lastTimeRef.current = now;
      const engine = engineRef.current;
      if (engine) {
        const events = engine.update(dt);
        for (const ev of events) handleEvent(ev, engine);
        renderer.render(engine, dt);

        hudAccRef.current += dt;
        if (hudAccRef.current >= 0.066) {
          hudAccRef.current = 0;
          setSnapshot(engine.snapshot());
        }
      }
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause the visible flash quickly.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(0), 380);
    return () => clearTimeout(id);
  }, [flash]);

  useEffect(() => {
    if (!streakBanner) return;
    const id = setTimeout(() => setStreakBanner(null), 1050);
    return () => clearTimeout(id);
  }, [streakBanner]);

  const pushPopup = useCallback((wx: number, wy: number, text: string, good: boolean) => {
    const r = rendererRef.current;
    if (!r) return;
    const { x, y } = r.worldToScreen(wx, wy);
    const id = popupIdRef.current++;
    setPopups((prev) => [...prev.slice(-12), { id, x, y, text, good }]);
    setTimeout(() => setPopups((prev) => prev.filter((p) => p.id !== id)), 850);
  }, []);

  const handleEvent = useCallback(
    (ev: ReturnType<LaundryEngine['update']>[number], engine: LaundryEngine) => {
      const r = rendererRef.current;
      switch (ev.kind) {
        case 'sort':
          if (ev.correct) {
            r?.punch(Math.min(1.4, 0.5 + engine.multiplier * 0.12));
            r?.igniteAt(ev.x, ev.y, engine.heat);
            pushPopup(ev.x, ev.y, `+${ev.points}`, true);
            if (ev.points >= 400) setFlash((f) => f + 1);
          } else {
            r?.punch(0.25);
            pushPopup(ev.x, ev.y, `${ev.points}`, false);
          }
          break;
        case 'streak':
          setStreakBanner(`${ev.streak}× STREAK!`);
          break;
        case 'end':
          onEndRef.current(engine.result());
          break;
        default:
          break;
      }
    },
    [pushPopup],
  );

  // ── Run lifecycle ────────────────────────────────────────────────────────────
  const beginRun = useCallback((mode: GameMode, seed: number, durationOverride?: number) => {
    const base = MODE_CONFIG[mode];
    const cfg = { ...base, seed, durationSec: durationOverride ?? base.durationSec };
    const engine = new LaundryEngine(cfg);
    engine.start();
    engineRef.current = engine;
    setSnapshot(engine.snapshot());
    setScreen('playing');
  }, []);

  const startSinglePlayer = useCallback(
    (mode: GameMode) => {
      isMpRunRef.current = false;
      setSubmitted(false);
      setLastResult(null);
      const seed = mode === 'daily' ? seedFromDateKey(todayDateKey()) : randomSeed();
      onEndRef.current = (result) => {
        setLastResult(result);
        setScreen('results');
        void submitScore(result);
      };
      beginRun(mode, seed);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [beginRun],
  );

  const submitScore = useCallback(
    async (result: RunResult) => {
      if (!session.data) return;
      try {
        const res = await fetch('/api/laundry-sort/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: displayName,
            score: result.score,
            mode: result.mode,
            bestStreak: result.bestStreak,
            sorted: result.sorted,
            missed: result.missed,
            accuracy: result.accuracy,
          }),
        });
        if (res.ok) setSubmitted(true);
      } catch (e) {
        console.error('score submit failed', e);
      }
    },
    [session.data, displayName],
  );

  // ── Pointer input (multi-touch) ──────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const engine = engineRef.current;
    const r = rendererRef.current;
    if (!engine || !r) return;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    activePointers.current.add(e.pointerId);
    const w = r.screenToWorld(e.clientX, e.clientY);
    engine.pointerDown(e.pointerId, w.x, w.y);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!activePointers.current.has(e.pointerId)) return;
    const engine = engineRef.current;
    const r = rendererRef.current;
    if (!engine || !r) return;
    const w = r.screenToWorld(e.clientX, e.clientY);
    engine.pointerMove(e.pointerId, w.x, w.y);
  }, []);
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    activePointers.current.delete(e.pointerId);
    engineRef.current?.pointerUp(e.pointerId);
  }, []);

  // ── Leaderboard fetch ─────────────────────────────────────────────────────────
  const fetchBoard = useCallback(async (period: LeaderboardPeriod, mode: GameMode) => {
    setBoardLoading(true);
    try {
      const res = await fetch(`/api/laundry-sort/leaderboard?period=${period}&mode=${mode}`);
      const data = res.ok ? await res.json() : [];
      setBoard(Array.isArray(data) ? data : []);
    } catch {
      setBoard([]);
    } finally {
      setBoardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (screen === 'menu') fetchBoard(boardPeriod, boardMode);
  }, [screen, boardPeriod, boardMode, fetchBoard]);

  // ── Multiplayer wiring ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mpOpen) return;
    const client = getLaundryMultiplayerClient();
    setStoredDisplayName(displayName);
    client.setHandlers({
      onConnectionChange: setConn,
      onLobbyUpdate: (l) => {
        setLobby(l);
        setMpError(null);
      },
      onCountdown: (endsAt) => {
        const tick = () => {
          const left = Math.ceil((endsAt - client.getServerTime()) / 1000);
          setCountdown(left > 0 ? left : null);
          if (left > 0) setTimeout(tick, 200);
        };
        tick();
      },
      onMatchStart: (m) => {
        mpMatchRef.current = m;
        setMpResults(null);
        isMpRunRef.current = true;
        onEndRef.current = (result) => {
          const match = mpMatchRef.current;
          if (match) {
            client.finishMatch({
              matchId: match.matchId,
              score: result.score,
              bestStreak: result.bestStreak,
              sorted: result.sorted,
              missed: result.missed,
              accuracy: result.accuracy,
            });
          }
        };
        const startEngine = () => {
          const wait = m.startAt - client.getServerTime();
          if (wait > 30) {
            setCountdown(Math.ceil(wait / 1000));
            setTimeout(startEngine, 100);
            return;
          }
          setCountdown(null);
          beginRun('ranked', m.seed, m.durationSec);
        };
        startEngine();
      },
      onLeaderboardUpdate: setLiveBoard,
      onMatchFinished: (lb) => {
        setMpResults(lb);
        setLiveBoard(lb);
        isMpRunRef.current = false;
        setScreen('menu');
      },
      onReturnToLobby: () => {
        setMpResults(null);
        setScreen('menu');
      },
      onError: (msg) => setMpError(msg),
    });
    client.connect(userId, displayName);
    return () => {
      client.disconnect();
      setLobby(null);
      setConn('disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mpOpen]);

  // Periodically report score to the server during a multiplayer round.
  useEffect(() => {
    if (screen !== 'playing' || !isMpRunRef.current) return;
    const client = getLaundryMultiplayerClient();
    const id = setInterval(() => {
      const engine = engineRef.current;
      const match = mpMatchRef.current;
      if (!engine || !match) return;
      const s = engine.snapshot();
      client.sendScore({
        matchId: match.matchId,
        score: s.score,
        bestStreak: s.bestStreak,
        sorted: s.sorted,
        missed: s.missed,
        accuracy: s.accuracy,
      });
    }, 900);
    return () => clearInterval(id);
  }, [screen]);

  const mpClient = getLaundryMultiplayerClient();
  const isHost = !!lobby && lobby.hostUserId === userId;
  const tFn = t as unknown as TFn;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="ls-root w-full h-full relative bg-[#141026] overflow-hidden select-none" style={{ touchAction: 'none' }}>
      <div ref={wrapRef} className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ cursor: screen === 'playing' ? 'grab' : 'default', imageRendering: 'pixelated' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
      </div>

      {/* Warm beat-flash overlay */}
      <div className={`ls-flash ${flash ? 'on' : ''}`} key={flash} />

      {/* Score popups */}
      <div className="absolute inset-0 pointer-events-none z-30">
        {popups.map((p) => (
          <div key={p.id} className={`ls-popup ${p.good ? 'ls-popup-good' : 'ls-popup-bad'}`} style={{ left: p.x, top: p.y, fontSize: p.good ? 22 : 18 }}>
            {p.text}
          </div>
        ))}
        {streakBanner && (
          <div className="absolute left-1/2 top-[22%] -translate-x-1/2 text-3xl sm:text-5xl ls-streak-banner">{streakBanner}</div>
        )}
      </div>

      {/* Countdown */}
      {countdown !== null && (
        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="text-7xl sm:text-9xl font-black text-[#ffb877] ls-punch" key={countdown} style={{ textShadow: '0 0 40px rgba(255,150,60,0.8)' }}>
            {countdown}
          </div>
        </div>
      )}

      {screen === 'playing' && (
        <Hud snap={snapshot} liveBoard={isMpRunRef.current ? liveBoard : null} selfId={userId} />
      )}

      {screen === 'menu' && !mpOpen && (
        <MenuScreen
          t={tFn}
          loggedIn={!!session.data}
          board={board}
          boardPeriod={boardPeriod}
          boardMode={boardMode}
          boardLoading={boardLoading}
          onPeriod={setBoardPeriod}
          onBoardMode={setBoardMode}
          onPlay={startSinglePlayer}
          onMultiplayer={() => setMpOpen(true)}
          onSignIn={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
        />
      )}

      {screen === 'results' && lastResult && (
        <ResultsScreen
          t={tFn}
          result={lastResult}
          loggedIn={!!session.data}
          submitted={submitted}
          onPlayAgain={() => startSinglePlayer(lastResult.mode)}
          onMenu={() => setScreen('menu')}
          onSignIn={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
        />
      )}

      {mpOpen && screen !== 'playing' && (
        <MultiplayerScreen
          t={tFn}
          conn={conn}
          lobby={lobby}
          isHost={isHost}
          selfId={userId}
          error={mpError}
          joinCode={joinCode}
          results={mpResults}
          onJoinCode={setJoinCode}
          onCreate={() => mpClient.createLobby()}
          onJoin={() => joinCode.trim() && mpClient.joinLobby(joinCode.trim())}
          onReady={() => mpClient.toggleReady()}
          onStart={() => mpClient.startMatch()}
          onSetDuration={(d) => mpClient.setDuration(d)}
          onReturnToLobby={() => mpClient.returnToLobby()}
          onLeave={() => {
            mpClient.leaveLobby();
            setMpOpen(false);
            setMpResults(null);
          }}
        />
      )}
    </div>
  );
}

// ── HUD ────────────────────────────────────────────────────────────────────────
const Hud = memo(function Hud({
  snap,
  liveBoard,
  selfId,
}: {
  snap: HudSnapshot;
  liveBoard: LSLeaderboardEntry[] | null;
  selfId: string;
}) {
  const mins = Math.floor(snap.timeLeft / 60);
  const secs = Math.floor(snap.timeLeft % 60);
  const lowTime = snap.timeLeft <= 10;
  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 flex justify-between items-start gap-3">
        <div className="ls-card px-3 py-2 sm:px-4">
          <div className="text-[10px] sm:text-xs font-bold text-[#ffd9a8] tracking-widest">SCORE</div>
          <div className="text-white text-2xl sm:text-3xl font-black tabular-nums ls-punch" key={snap.score}>
            {snap.score.toString().padStart(6, '0')}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          {snap.combo > 1 && (
            <div className="ls-combo text-amber-300 text-3xl sm:text-4xl" style={{ '--ls-heat': snap.heat } as React.CSSProperties} key={snap.combo}>
              {snap.combo}× <span className="text-base align-middle">({snap.multiplier}×)</span>
            </div>
          )}
          <div className="ls-heatbar w-28 sm:w-40" style={{ '--ls-fill': `${Math.round(snap.heat * 100)}%` } as React.CSSProperties}>
            <span />
          </div>
        </div>

        {snap.mode !== 'endless' && Number.isFinite(snap.timeLeft) ? (
          <div className={`ls-card px-3 py-2 sm:px-4 ${lowTime ? 'ls-pulse-ring' : ''}`}>
            <div className={`text-[10px] sm:text-xs font-bold tracking-widest ${lowTime ? 'text-red-300' : 'text-[#a8ffd9]'}`}>TIME</div>
            <div className={`text-2xl sm:text-3xl font-black tabular-nums ${lowTime ? 'text-red-400' : 'text-white'}`}>
              {mins}:{secs.toString().padStart(2, '0')}
            </div>
          </div>
        ) : (
          <div className="ls-card px-3 py-2 sm:px-4 w-24">
            <div className="text-[10px] sm:text-xs font-bold tracking-widest text-[#ffb0b0]">MESS</div>
            <div className="ls-heatbar mt-1" style={{ '--ls-fill': `${Math.round(snap.overflow * 100)}%` } as React.CSSProperties}>
              <span />
            </div>
          </div>
        )}
      </div>

      {liveBoard && liveBoard.length > 0 && (
        <div className="absolute top-24 right-3 sm:top-28 sm:right-4 ls-card px-3 py-2 w-44">
          <div className="text-[10px] font-bold text-[#ffd9a8] tracking-widest mb-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> LIVE
          </div>
          {liveBoard.slice(0, 6).map((p, i) => (
            <div key={p.userId} className={`flex justify-between text-xs ${p.userId === selfId ? 'text-amber-300 font-bold' : 'text-zinc-200'}`}>
              <span className="truncate">{i + 1}. {p.displayName}</span>
              <span className="tabular-nums">{p.score}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

// ── Menu / mode select + leaderboards ────────────────────────────────────────────
type TFn = (k: string, o?: Record<string, unknown>) => string;

function MenuScreen(props: {
  t: TFn;
  loggedIn: boolean;
  board: BoardRow[];
  boardPeriod: LeaderboardPeriod;
  boardMode: GameMode;
  boardLoading: boolean;
  onPeriod: (p: LeaderboardPeriod) => void;
  onBoardMode: (m: GameMode) => void;
  onPlay: (m: GameMode) => void;
  onMultiplayer: () => void;
  onSignIn: () => void;
}) {
  const { t, board, boardPeriod, boardMode, boardLoading } = props;
  const modes: GameMode[] = ['time-attack', 'endless', 'daily', 'ranked'];
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        {/* Modes */}
        <div className="ls-card p-5 ls-bounce">
          <h2 className="text-2xl font-black text-[#ffd9a8] mb-1 ls-float inline-block">🧺 {t('sort-the-laundry', { defaultValue: 'SORT THE LAUNDRY!' })}</h2>
          <p className="text-zinc-300 text-sm mb-4">{t('pick-a-mode', { defaultValue: 'Pick a mode — drag the tumbling clothes into matching hampers. Chain sorts to ignite your streak!' })}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {modes.map((m) => (
              <button
                key={m}
                className="ls-btn text-left p-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10"
                onClick={() => (m === 'ranked' ? props.onMultiplayer() : props.onPlay(m))}
              >
                <div className="text-2xl mb-1">{MODE_META[m].icon}</div>
                <div className="font-black text-white">{t(MODE_META[m].titleKey, { defaultValue: m })}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{t(MODE_META[m].descKey, { defaultValue: '' })}</div>
              </button>
            ))}
          </div>
          <button className="ls-btn ls-btn-primary w-full mt-4 py-3 flex items-center justify-center gap-2" onClick={props.onMultiplayer}>
            <Users className="w-5 h-5" /> {t('play-multiplayer', { defaultValue: 'Play Multiplayer' })}
          </button>
          {!props.loggedIn && (
            <p className="text-xs text-amber-300/80 mt-3 text-center">
              {t('sign-in-hint', { defaultValue: 'Sign in to save scores and climb the leaderboards.' })}{' '}
              <button className="underline font-bold" onClick={props.onSignIn}>{t('sign-in', { defaultValue: 'Sign in' })}</button>
            </p>
          )}
        </div>

        {/* Leaderboards */}
        <div className="ls-card p-5 ls-bounce">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-amber-300" />
            <h3 className="font-black text-white tracking-wide">{t('leaderboard', { defaultValue: 'LEADERBOARD' })}</h3>
          </div>
          <div className="flex gap-1.5 mb-2 flex-wrap">
            {(['all', 'daily', 'weekly'] as LeaderboardPeriod[]).map((p) => (
              <button key={p} className="ls-tab" data-active={boardPeriod === p} onClick={() => props.onPeriod(p)}>
                {t(`period-${p}`, { defaultValue: p })}
              </button>
            ))}
          </div>
          {boardPeriod !== 'all' && (
            <div className="flex gap-1.5 mb-3 flex-wrap">
              {(['time-attack', 'endless', 'daily', 'ranked'] as GameMode[]).map((m) => (
                <button key={m} className="ls-tab" data-active={boardMode === m} onClick={() => props.onBoardMode(m)}>
                  {MODE_META[m].icon}
                </button>
              ))}
            </div>
          )}
          <div className="space-y-1.5 min-h-[180px]">
            {boardLoading && <div className="text-xs text-zinc-400">{t('loading', { defaultValue: 'Loading…' })}</div>}
            {!boardLoading && board.length === 0 && <div className="text-xs text-zinc-400">{t('no-scores-yet', { defaultValue: 'No scores yet. Be the first!' })}</div>}
            {!boardLoading &&
              board.map((r, i) => (
                <div key={`${r.username}-${i}`} className="flex items-center justify-between text-sm">
                  <span className="w-6 text-zinc-400 font-bold">{i === 0 ? '👑' : `#${i + 1}`}</span>
                  <span className="flex-1 truncate text-zinc-100">{r.username}</span>
                  {r.bestStreak ? <span className="text-orange-300 text-xs flex items-center gap-0.5 mr-2"><Flame className="w-3 h-3" />{r.bestStreak}</span> : null}
                  <span className="text-amber-300 font-black tabular-nums">{r.score.toLocaleString()}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Results (single-player) ───────────────────────────────────────────────────────
function ResultsScreen(props: {
  t: TFn;
  result: RunResult;
  loggedIn: boolean;
  submitted: boolean;
  onPlayAgain: () => void;
  onMenu: () => void;
  onSignIn: () => void;
}) {
  const { t, result } = props;
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
      <div className="ls-card p-6 w-full max-w-md text-center ls-bounce">
        <h2 className="text-xl font-black text-[#ffd9a8] tracking-widest mb-1">{t('round-complete', { defaultValue: 'ROUND COMPLETE' })}</h2>
        <div className="text-6xl font-black text-white my-3 ls-punch">{result.score.toLocaleString()}</div>
        <div className="grid grid-cols-3 gap-2 my-4 text-center">
          <Stat label={t('best-streak', { defaultValue: 'Best Streak' })} value={`${result.bestStreak}×`} accent="text-orange-300" />
          <Stat label={t('sorted', { defaultValue: 'Sorted' })} value={`${result.sorted}`} accent="text-emerald-300" />
          <Stat label={t('accuracy', { defaultValue: 'Accuracy' })} value={`${Math.round(result.accuracy * 100)}%`} accent="text-cyan-300" />
        </div>
        {props.loggedIn ? (
          <p className="text-xs text-emerald-300 mb-3 h-4">{props.submitted ? t('score-submitted', { defaultValue: '✓ Score saved!' }) : t('submitting-score', { defaultValue: 'Saving…' })}</p>
        ) : (
          <button onClick={props.onSignIn} className="ls-btn ls-btn-primary w-full py-2.5 mb-3">{t('sign-in-to-save', { defaultValue: 'Sign in to save your score' })}</button>
        )}
        <div className="flex gap-2">
          <button onClick={props.onPlayAgain} className="ls-btn ls-btn-primary flex-1 py-3 flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" /> {t('play-again', { defaultValue: 'Play Again' })}
          </button>
          <button onClick={props.onMenu} className="ls-btn flex-1 py-3 border border-white/15 bg-white/5 text-white">{t('menu', { defaultValue: 'Menu' })}</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-2">
      <div className={`text-xl font-black ${accent}`}>{value}</div>
      <div className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</div>
    </div>
  );
}

// ── Multiplayer lobby / results ────────────────────────────────────────────────────
function MultiplayerScreen(props: {
  t: TFn;
  conn: LSConnectionStatus;
  lobby: LSLobbyState | null;
  isHost: boolean;
  selfId: string;
  error: string | null;
  joinCode: string;
  results: LSLeaderboardEntry[] | null;
  onJoinCode: (s: string) => void;
  onCreate: () => void;
  onJoin: () => void;
  onReady: () => void;
  onStart: () => void;
  onSetDuration: (d: number) => void;
  onReturnToLobby: () => void;
  onLeave: () => void;
}) {
  const { t, lobby, results, conn } = props;
  const [copied, setCopied] = useState(false);
  const durations = [45, 60, 75, 90, 120];

  return (
    <div className="absolute inset-0 z-40 overflow-y-auto flex items-center justify-center p-4">
      <div className="ls-card p-6 w-full max-w-lg ls-bounce">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-[#ffd9a8] flex items-center gap-2"><Users className="w-5 h-5" /> {t('multiplayer', { defaultValue: 'MULTIPLAYER' })}</h2>
          <button onClick={props.onLeave} className="ls-btn text-zinc-300 text-sm flex items-center gap-1 px-2 py-1"><LogOut className="w-4 h-4" /> {t('exit', { defaultValue: 'Exit' })}</button>
        </div>

        <div className="text-xs mb-3 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${conn === 'connected' ? 'bg-emerald-400' : conn === 'connecting' || conn === 'reconnecting' ? 'bg-amber-400' : 'bg-red-400'}`} />
          <span className="text-zinc-400">{t(`conn-${conn}`, { defaultValue: conn })}</span>
        </div>

        {props.error && <div className="text-xs text-red-300 mb-3 bg-red-500/10 border border-red-500/30 rounded-lg p-2">{props.error}</div>}

        {/* Results overlay (after a round) */}
        {results && (
          <div className="mb-4">
            <h3 className="font-black text-white mb-2 flex items-center gap-2"><Crown className="w-4 h-4 text-amber-300" /> {t('final-standings', { defaultValue: 'Final Standings' })}</h3>
            <div className="space-y-1.5">
              {results.map((p, i) => (
                <div key={p.userId} className={`flex items-center justify-between rounded-lg px-3 py-2 ${i === 0 ? 'bg-amber-400/15 border border-amber-400/40' : 'bg-white/5'} ${p.userId === props.selfId ? 'ring-1 ring-cyan-400/50' : ''}`}>
                  <span className="font-bold text-white">{i === 0 ? '👑' : `#${i + 1}`} {p.displayName}</span>
                  <span className="flex items-center gap-3 text-sm">
                    <span className="text-orange-300 flex items-center gap-0.5"><Flame className="w-3 h-3" />{p.bestStreak}</span>
                    <span className="text-amber-300 font-black tabular-nums">{p.score.toLocaleString()}</span>
                  </span>
                </div>
              ))}
            </div>
            {props.isHost && (
              <button onClick={props.onReturnToLobby} className="ls-btn ls-btn-primary w-full mt-3 py-2.5">{t('back-to-lobby', { defaultValue: 'Back to Lobby' })}</button>
            )}
          </div>
        )}

        {!lobby && !results && (
          <div className="space-y-3">
            <button onClick={props.onCreate} disabled={conn !== 'connected'} className="ls-btn ls-btn-primary w-full py-3 disabled:opacity-50">{t('create-lobby', { defaultValue: 'Create Lobby' })}</button>
            <div className="flex gap-2">
              <input
                value={props.joinCode}
                onChange={(e) => props.onJoinCode(e.target.value.toUpperCase())}
                placeholder={t('enter-code', { defaultValue: 'ENTER CODE' })}
                maxLength={5}
                className="flex-1 bg-black/40 border border-white/15 rounded-xl px-3 py-3 text-white font-black tracking-[0.3em] text-center uppercase"
              />
              <button onClick={props.onJoin} disabled={conn !== 'connected'} className="ls-btn px-5 border border-white/15 bg-white/5 text-white disabled:opacity-50">{t('join', { defaultValue: 'Join' })}</button>
            </div>
          </div>
        )}

        {lobby && !results && (
          <div>
            <div className="flex items-center justify-between bg-black/40 rounded-xl px-4 py-3 mb-3">
              <div>
                <div className="text-[10px] text-zinc-400 tracking-widest">{t('room-code', { defaultValue: 'ROOM CODE' })}</div>
                <div className="text-3xl font-black tracking-[0.3em] text-[#ffd9a8]">{lobby.code}</div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(lobby.code);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="ls-btn px-3 py-2 bg-white/5 border border-white/15 text-white flex items-center gap-1 text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />} {copied ? t('copied', { defaultValue: 'Copied' }) : t('copy', { defaultValue: 'Copy' })}
              </button>
            </div>

            <div className="space-y-1.5 mb-3 max-h-48 overflow-y-auto">
              {lobby.players.map((p) => (
                <div key={p.userId} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
                  <span className="font-bold text-white flex items-center gap-2">
                    {p.isHost && <Crown className="w-4 h-4 text-amber-300" />}
                    {p.displayName}
                    {p.userId === props.selfId && <span className="text-[10px] text-cyan-300">({t('you', { defaultValue: 'you' })})</span>}
                  </span>
                  <span className={`text-xs font-bold ${p.isReady ? 'text-emerald-400' : 'text-zinc-500'}`}>{p.isReady ? t('ready', { defaultValue: 'Ready' }) : t('not-ready', { defaultValue: 'Waiting' })}</span>
                </div>
              ))}
            </div>

            {props.isHost && (
              <div className="mb-3">
                <div className="text-[10px] text-zinc-400 tracking-widest mb-1">{t('round-length', { defaultValue: 'ROUND LENGTH' })}</div>
                <div className="flex gap-1.5 flex-wrap">
                  {durations.map((d) => (
                    <button key={d} className="ls-tab" data-active={lobby.durationSec === d} onClick={() => props.onSetDuration(d)}>{d}s</button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={props.onReady} className="ls-btn flex-1 py-3 border border-white/15 bg-white/5 text-white">{t('toggle-ready', { defaultValue: 'Ready Up' })}</button>
              {props.isHost && (
                <button onClick={props.onStart} className="ls-btn ls-btn-primary flex-1 py-3">{t('start-match', { defaultValue: 'Start Match' })}</button>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-2 text-center">{t('same-clothes-hint', { defaultValue: 'Everyone sorts the exact same clothes — highest score after the round wins.' })}</p>
          </div>
        )}
      </div>
    </div>
  );
}

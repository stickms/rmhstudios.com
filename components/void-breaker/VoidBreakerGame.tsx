'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { VoidBreakerEngine } from '@/lib/void-breaker/game';
import { VoidBreakerRenderer } from '@/lib/void-breaker/renderer';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MAX_SHARDS, DET_MIN_SHARDS, DASH_COOLDOWN, FOCUS_COOLDOWN } from '@/lib/void-breaker/constants';
import type { InputState, RunStats, GameState, HUDState } from '@/lib/void-breaker/types';
import { VoidBreakerUI } from './VoidBreakerUI';
import { VoidBreakerTouchControls } from './VoidBreakerTouchControls';
import { saveGame, loadGame, deleteSave, getSaveInfo } from '@/lib/void-breaker/saveSystem';
import { ABILITY_COOLDOWNS } from '@/lib/void-breaker/abilityProgression';

/** Background music track path */
const MUSIC_SRC = '/music/VoidBreaker/cold coffee - lofi rap beat (FREE FOR PROFIT USE).mp3';

/** Master volume (0–1). Adjust here globally. */
const MASTER_VOLUME = 0.75;

const EMPTY_HUD: HUDState = {
  score: 0, multiplier: 1, wave: 0, hp: 3, maxHp: 3,
  shards: 0, combo: 0, bossHp: 0, bossMaxHp: 0,
  bossActive: false, bossPhase: 1, dashReady: true, dashCooldownFraction: 0,
  waveBreak: false, paused: false, countdown: 3, wingLevel: 0,
  focusReady: true, focusActive: false, focusCooldownFraction: 0,
  detonateReady: false, dialogue: null,
  allyActive: false, allyHp: 0, allyMaxHp: 6, allyDowned: false,
  mapName: 'Kowloon Void Zone', mapTransition: false,
  controlsInverted: false, arenaShrinkFraction: 0,
  voidPulseReady: false, phaseShiftReady: false, phaseShiftActive: false,
  reflectShieldReady: false, reflectShieldActive: false,
  allySynergyReady: false, allySynergyActive: false,
  voidPulseCooldownFraction: 0, phaseShiftCooldownFraction: 0,
  reflectShieldCooldownFraction: 0, allySynergyCooldownFraction: 0,
  pendingUnlock: null,
};

export function VoidBreakerGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<VoidBreakerEngine | null>(null);
  const rendererRef = useRef<VoidBreakerRenderer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const inputRef = useRef<InputState>({
    up: false, down: false, left: false, right: false,
    mouseX: 800, mouseY: 500,
    detonate: false, dash: false, focus: false, pause: false,
    voidPulse: false, phaseShift: false, reflectShield: false, allySynergy: false,
  });

  const [uiState, setUiState] = useState<'menu' | 'playing' | 'gameOver'>('menu');
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [hud, setHud] = useState<HUDState>(EMPTY_HUD);
  const [muted, setMuted] = useState(false);
  const [musicVolume, setMusicVolume] = useState(70);
  const [saveInfo, setSaveInfo] = useState<{ wave: number; savedAt: Date } | null>(null);
  // Pause menu: 'ingame' pause vs menu
  const [showPauseMenu, setShowPauseMenu] = useState(false);

  // Load persisted settings + check for existing save
  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const storedMuted = localStorage.getItem('vb-muted');
    if (storedMuted === 'true') setMuted(true);
    const storedVol = localStorage.getItem('vb-music-volume');
    if (storedVol !== null) {
      const v = parseInt(storedVol, 10);
      if (!isNaN(v) && v >= 0 && v <= 100) setMusicVolume(v);
    }
    setSaveInfo(getSaveInfo());
  }, []);

  // Music volume sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const vol = muted ? 0 : (musicVolume / 100) * MASTER_VOLUME;
    audio.volume = vol;
    audio.muted = muted;
  }, [muted, musicVolume]);

  // ── AudioManager: fade in/out helpers ─────────────────────────────────────
  const fadeMusic = useCallback((fadeIn: boolean) => {
    const audio = audioRef.current;
    if (!audio || muted) return;
    const targetVol = (musicVolume / 100) * MASTER_VOLUME;
    if (fadeIn) {
      audio.volume = 0;
      audio.play().catch(() => { });
      let v = 0;
      const id = setInterval(() => {
        v = Math.min(v + 0.02, targetVol);
        audio.volume = v;
        if (v >= targetVol) clearInterval(id);
      }, 50);
    } else {
      let v = audio.volume;
      const id = setInterval(() => {
        v = Math.max(v - 0.03, 0);
        audio.volume = v;
        if (v <= 0) { clearInterval(id); audio.pause(); }
      }, 40);
    }
  }, [muted, musicVolume]);

  /** Start/resume background track immediately (no fade). */
  const playMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || muted) return;
    audio.volume = (musicVolume / 100) * MASTER_VOLUME;
    audio.play().catch(() => { });
  }, [muted, musicVolume]);

  /** Pause background track (e.g. when game paused). */
  const pauseMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const inp = inputRef.current;
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': inp.up = down; break;
        case 'KeyS': case 'ArrowDown': inp.down = down; break;
        case 'KeyA': case 'ArrowLeft': inp.left = down; break;
        case 'KeyD': case 'ArrowRight': inp.right = down; break;
        case 'Space': inp.detonate = down; break;
        case 'ShiftLeft': case 'ShiftRight': inp.dash = down; break;
        case 'KeyF': inp.focus = down; break;
        case 'Escape': inp.pause = down; break;
        case 'KeyQ': inp.voidPulse = down; break;
        case 'KeyE': inp.phaseShift = down; break;
        case 'KeyR': inp.reflectShield = down; break;
        case 'KeyT': inp.allySynergy = down; break;
      }
      if (down && (e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'Space')) {
        e.preventDefault();
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    const blur = () => {
      const inp = inputRef.current;
      inp.up = inp.down = inp.left = inp.right = inp.detonate = inp.dash = inp.focus = inp.pause = false;
      const g = gameRef.current;
      if (g && (g.state === 'playing' || g.state === 'waveBreak')) {
        g.state = 'paused' as GameState;
        setShowPauseMenu(true);
        pauseMusic();
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, [pauseMusic]);

  // Mouse aim
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const canvasX = (e.clientX - rect.left) * scaleX;
      const canvasY = (e.clientY - rect.top) * scaleY;
      const renderer = rendererRef.current;
      const game = gameRef.current;
      if (renderer && game?.player) {
        const aim = renderer.getAimPoint(canvasX, canvasY, game);
        inputRef.current.mouseX = aim.x;
        inputRef.current.mouseY = aim.y;
      }
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const inp = inputRef.current;
      inp.up = false;
      inp.down = false;
      inp.left = false;
      inp.right = false;
    };
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('contextmenu', onContextMenu);
    return () => {
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, []);

  // Auto-aim on mobile
  useEffect(() => {
    if (!isTouchDevice) return;
    const id = setInterval(() => {
      const game = gameRef.current;
      if (!game || game.state !== 'playing') return;
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (const e of game.enemies) {
        if (!e.active) continue;
        const d = (e.x - game.player.x) ** 2 + (e.y - game.player.y) ** 2;
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        inputRef.current.mouseX = best.x;
        inputRef.current.mouseY = best.y;
      }
    }, 50);
    return () => clearInterval(id);
  }, [isTouchDevice]);

  // ── Game loop ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!gameRef.current) gameRef.current = new VoidBreakerEngine();
    if (!rendererRef.current) rendererRef.current = new VoidBreakerRenderer(canvas);

    let lastT = 0;
    let raf: number;
    let hudTick = 0;

    const loop = (ts: number) => {
      const dt = lastT ? (ts - lastT) / 1000 : 0;
      lastT = ts;
      const game = gameRef.current!;
      const renderer = rendererRef.current!;
      const s = game.state;

      if (s === 'playing' || s === 'paused' || s === 'countdown' || s === 'waveBreak') {
        game.update(dt, inputRef.current);
        renderer.draw(game, dt);

        // Watch for pause state change via ESC key to open pause menu
        if (game.state === 'paused' && !showPauseMenuRef.current) {
          showPauseMenuRef.current = true;
          setShowPauseMenu(true);
          pauseMusic();
        }

        if ((game.state as string) === 'gameOver') {
          setRunStats(game.getRunStats());
          setUiState('gameOver');
          fadeMusic(false);
          setShowPauseMenu(false);
          showPauseMenuRef.current = false;
        }

        hudTick++;
        if (hudTick % 6 === 0) {
          const boss = game.enemies.find(e => e.active && e.isBoss);
          const dlg = game.dialogue.active;
          const ab = game.abilityProg.abilities;
          const ally = game.allyCtrl.ally;
          const pendingUnlock = game.abilityProg.pendingNotifications.shift() ?? null;
          setHud({
            score: Math.round(game.score),
            multiplier: Math.round(game.totalMultiplier * 10) / 10,
            wave: game.wave,
            hp: game.player.hp,
            maxHp: game.player.maxHp,
            shards: game.player.shards,
            combo: game.comboCount,
            bossHp: boss ? boss.hp : 0,
            bossMaxHp: boss ? boss.maxHp : 0,
            bossActive: !!boss,
            bossPhase: boss ? boss.bossPhase : 1,
            dashReady: game.player.dashCooldown <= 0 && !game.player.dashActive,
            dashCooldownFraction: Math.max(0, game.player.dashCooldown / DASH_COOLDOWN),
            waveBreak: game.state === 'waveBreak',
            paused: game.state === 'paused',
            countdown: game.countdownTimer,
            wingLevel: game.wingLevel,
            focusReady: game.player.focusCooldown <= 0 && !game.player.focusActive,
            focusActive: game.player.focusActive,
            focusCooldownFraction: Math.max(0, game.player.focusCooldown / FOCUS_COOLDOWN),
            detonateReady: game.player.shards >= DET_MIN_SHARDS && game.player.detonateCooldown <= 0,
            dialogue: dlg ? {
              speaker: dlg.line.speaker,
              text: game.dialogue.getDisplayText(),
              timerFraction: dlg.timer / dlg.line.duration,
            } : null,
            allyActive: ally.active,
            allyHp: ally.hp,
            allyMaxHp: ally.maxHp,
            allyDowned: ally.state === 'downed',
            mapName: game.currentMapConfig.name,
            mapTransition: (game.state as string) === 'mapTransition',
            controlsInverted: game.controlsInverted,
            arenaShrinkFraction: game.arenaShrinkFraction,
            voidPulseReady: ab.unlockedIds.has('void_pulse') && ab.voidPulseCooldown <= 0,
            phaseShiftReady: ab.unlockedIds.has('phase_shift') && ab.phaseShiftCooldown <= 0 && !ab.phaseShiftActive,
            phaseShiftActive: ab.phaseShiftActive,
            reflectShieldReady: ab.unlockedIds.has('reflect_shield') && ab.reflectShieldCooldown <= 0 && !ab.reflectShieldActive,
            reflectShieldActive: ab.reflectShieldActive,
            allySynergyReady: ab.unlockedIds.has('ally_synergy') && ab.allySynergyCooldown <= 0 && !ab.allySynergyActive,
            allySynergyActive: ab.allySynergyActive,
            voidPulseCooldownFraction: ab.unlockedIds.has('void_pulse') ? Math.max(0, ab.voidPulseCooldown / ABILITY_COOLDOWNS.void_pulse) : 0,
            phaseShiftCooldownFraction: ab.unlockedIds.has('phase_shift') ? Math.max(0, ab.phaseShiftCooldown / ABILITY_COOLDOWNS.phase_shift) : 0,
            reflectShieldCooldownFraction: ab.unlockedIds.has('reflect_shield') ? Math.max(0, ab.reflectShieldCooldown / ABILITY_COOLDOWNS.reflect_shield) : 0,
            allySynergyCooldownFraction: ab.unlockedIds.has('ally_synergy') ? Math.max(0, ab.allySynergyCooldown / ABILITY_COOLDOWNS.ally_synergy) : 0,
            pendingUnlock,
          });
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      rendererRef.current?.dispose();
      rendererRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fadeMusic, pauseMusic]);

  // We need a ref for showPauseMenu to avoid stale closure in loop
  const showPauseMenuRef = useRef(false);
  useEffect(() => {
    showPauseMenuRef.current = showPauseMenu;
    // When pause menu dismissed, sync back to playing
    if (!showPauseMenu && gameRef.current?.state === 'paused') {
      gameRef.current.resume();
      playMusic();
    }
  }, [showPauseMenu, playMusic]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    gameRef.current?.startGame();
    setRunStats(null);
    setUiState('playing');
    setShowPauseMenu(false);
    showPauseMenuRef.current = false;
    playMusic();
  }, [playMusic]);

  /** Save current game state and go to menu. */
  const handleSaveAndQuit = useCallback(() => {
    const game = gameRef.current;
    if (game) {
      const stateBlob = game.serializeGameState();
      saveGame(stateBlob as Record<string, unknown>);
    }
    setShowPauseMenu(false);
    showPauseMenuRef.current = false;
    setUiState('menu');
    fadeMusic(true);
    setSaveInfo(getSaveInfo());
  }, [fadeMusic]);

  const handleResume = useCallback(() => {
    setShowPauseMenu(false);
    showPauseMenuRef.current = false;
    // playMusic called via useEffect watching showPauseMenu
  }, []);

  const handleTouchPause = useCallback(() => {
    const game = gameRef.current;
    if (!game) return;
    if (game.state === 'playing' || game.state === 'waveBreak') {
      game.state = 'paused' as GameState;
      setShowPauseMenu(true);
      showPauseMenuRef.current = true;
      pauseMusic();
    } else if (game.state === 'paused') {
      setShowPauseMenu(false);
    }
  }, [pauseMusic]);

  const handleCanvasTouch = useCallback(() => {
    if (gameRef.current?.state === 'paused' && !showPauseMenu) gameRef.current.resume();
  }, [showPauseMenu]);

  const toggleMute = useCallback(() => {
    setMuted(prev => {
      const next = !prev;
      localStorage.setItem('vb-muted', String(next));
      return next;
    });
  }, []);

  const setVolume = useCallback((v: number) => {
    setMusicVolume(v);
    localStorage.setItem('vb-music-volume', String(v));
  }, []);

  /** Load saved game and resume play. */
  const handleContinue = useCallback(() => {
    const save = loadGame();
    if (!save || !save.stateJson) return;
    const game = gameRef.current;
    if (!game) return;
    const ok = game.hydrateGameState(save.stateJson as Record<string, unknown>);
    if (ok) {
      setRunStats(null);
      setUiState('playing');
      setShowPauseMenu(false);
      showPauseMenuRef.current = false;
      playMusic();
    }
  }, [playMusic]);

  const showGame = uiState === 'playing';

  return (
    <div
      className="w-full h-full relative bg-[#050508] flex flex-col items-center justify-center overflow-hidden"
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Background music — loops during gameplay */}
      <audio ref={audioRef} src={MUSIC_SRC} loop preload="auto" />

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border border-[#00f5ff]/20"
        onTouchEnd={handleCanvasTouch}
        style={{
          width: '100%',
          maxWidth: `${CANVAS_WIDTH}px`,
          maxHeight: '100%',
          aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
          touchAction: 'none',
        }}
      />

      {/* ── HUD Overlay ─────────────────────────────────────────────────── */}
      {showGame && (
        <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-2 sm:p-3">
          {/* Top bar */}
          <div className="flex justify-between items-start">
            {/* Score + multiplier */}
            <div className="bg-black/70 rounded px-2 py-1 sm:px-3 sm:py-1.5 border border-[#00f5ff]/20 backdrop-blur-sm">
              <div className="text-[#00f5ff] font-mono text-xs sm:text-sm font-bold tracking-wider drop-shadow-[0_0_8px_rgba(0,245,255,0.8)]">
                {hud.score.toLocaleString().padStart(7, '0')}
              </div>
              <div className={`font-mono text-[10px] sm:text-xs font-bold ${hud.multiplier > 4 ? 'text-[#ff00cc]' :
                hud.multiplier > 2 ? 'text-[#d4af37]' : 'text-zinc-400'
                }`}>
                {hud.multiplier.toFixed(1)}x
                {hud.combo > 1 && <span className="text-[#ff00cc] ml-1">COMBO {hud.combo}</span>}
              </div>
            </div>

            {/* Wave */}
            <div className="bg-black/70 rounded px-3 py-1 border border-[#00f5ff]/20 backdrop-blur-sm">
              <div className="text-[#00f5ff] font-mono text-xs sm:text-sm font-bold text-center tracking-widest">
                WAVE {hud.wave}
              </div>
            </div>

            {/* HP hearts */}
            <div className="bg-black/70 rounded px-2 py-1 text-right border border-[#00f5ff]/20 backdrop-blur-sm">
              <div className="text-[9px] font-mono text-zinc-500 mb-0.5">HP</div>
              <div className="text-sm sm:text-base flex items-center gap-0.5">
                {Array.from({ length: hud.maxHp }, (_, i) => (
                  <span key={i} className={i < hud.hp
                    ? 'text-[#ff00cc] drop-shadow-[0_0_6px_rgba(255,0,204,0.8)]'
                    : 'text-zinc-800'
                  }>
                    {'♥'}
                  </span>
                ))}
                <span className="text-[10px] font-mono text-zinc-500 ml-1">
                  {hud.hp}/{hud.maxHp}
                </span>
              </div>
            </div>
          </div>

          {/* Boss HP bar */}
          {hud.bossActive && (
            <div className="mx-auto w-52 sm:w-72">
              <div className="flex justify-between items-center mb-0.5">
                <div className="text-center text-[10px] text-[#ff2244] font-mono font-bold tracking-widest drop-shadow-[0_0_6px_rgba(255,34,68,0.8)]">
                  堕落天使 {hud.bossPhase > 1 ? `— PHASE ${hud.bossPhase}` : ''}
                </div>
              </div>
              <div className="h-2.5 bg-zinc-900/80 rounded-full overflow-hidden border border-red-900/50">
                <div
                  className={`h-full transition-all duration-150 rounded-full ${hud.bossPhase === 3 ? 'bg-linear-to-r from-[#ff0033] to-[#ff00cc]' :
                    hud.bossPhase === 2 ? 'bg-linear-to-r from-red-600 to-orange-400' :
                      'bg-linear-to-r from-red-700 to-red-500'
                    }`}
                  style={{ width: `${hud.bossMaxHp > 0 ? (hud.bossHp / hud.bossMaxHp) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Bottom bar — shard + ability slots */}
          <div className="flex justify-center items-end gap-3">
            {/* Shard bar */}
            <div className="bg-black/70 rounded px-3 py-1.5 text-center border border-[#00f5ff]/20 backdrop-blur-sm">
              <div className="text-[9px] sm:text-[10px] text-zinc-500 font-mono mb-0.5">
                {hud.detonateReady ? (
                  <span className="text-[#00f5ff] animate-pulse">⚡ SPACE → VOID BURST</span>
                ) : (
                  `SHARDS ${hud.shards}/${DET_MIN_SHARDS}`
                )}
              </div>
              <div className="w-28 sm:w-36 h-1.5 bg-zinc-800/80 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full transition-all duration-150 ${hud.detonateReady
                    ? 'bg-[#00f5ff] shadow-[0_0_8px_rgba(0,245,255,0.8)]'
                    : 'bg-zinc-600'
                    }`}
                  style={{ width: `${(hud.shards / MAX_SHARDS) * 100}%` }}
                />
              </div>
            </div>

            {/* Dash ability slot */}
            <div className={`relative w-10 h-10 rounded-lg flex flex-col items-center justify-center border text-[8px] font-mono font-bold
              ${hud.dashReady
                ? 'border-[#00f5ff]/60 text-[#00f5ff] bg-black/60'
                : 'border-zinc-700/40 text-zinc-600 bg-black/40'
              }`}>
              <span className="text-[7px]">SHIFT</span>
              <span>DASH</span>
              {!hud.dashReady && (
                <div
                  className="absolute inset-0 rounded-lg bg-zinc-800/40"
                  style={{ clipPath: `inset(${(1 - hud.dashCooldownFraction) * 100}% 0 0 0)` }}
                />
              )}
            </div>

            {/* Focus ability slot */}
            <div className={`relative w-10 h-10 rounded-lg flex flex-col items-center justify-center border text-[8px] font-mono font-bold
              ${hud.focusActive
                ? 'border-[#44ddff] text-[#44ddff] bg-[#00f5ff]/10 animate-pulse'
                : hud.focusReady
                  ? 'border-[#00f5ff]/60 text-[#00f5ff] bg-black/60'
                  : 'border-zinc-700/40 text-zinc-600 bg-black/40'
              }`}>
              <span className="text-[7px]">F KEY</span>
              <span>FOCUS</span>
              {!hud.focusReady && !hud.focusActive && (
                <div
                  className="absolute inset-0 rounded-lg bg-zinc-800/40"
                  style={{ clipPath: `inset(${(1 - hud.focusCooldownFraction) * 100}% 0 0 0)` }}
                />
              )}
            </div>

            {/* Void Pulse — Q (wave 8) */}
            {hud.voidPulseReady !== undefined && (
              <div className={`relative w-10 h-10 rounded-lg flex flex-col items-center justify-center border text-[8px] font-mono font-bold
                ${hud.voidPulseReady
                  ? 'border-[#00f5ff]/60 text-[#00f5ff] bg-black/60'
                  : 'border-zinc-700/40 text-zinc-600 bg-black/40'
                }`}>
                <span className="text-[7px]">Q</span>
                <span>PULSE</span>
                {!hud.voidPulseReady && hud.voidPulseCooldownFraction > 0 && (
                  <div
                    className="absolute inset-0 rounded-lg bg-zinc-800/40"
                    style={{ clipPath: `inset(${(1 - hud.voidPulseCooldownFraction) * 100}% 0 0 0)` }}
                  />
                )}
              </div>
            )}

            {/* Phase Shift — E (wave 15) */}
            {hud.phaseShiftReady !== undefined && (
              <div className={`relative w-10 h-10 rounded-lg flex flex-col items-center justify-center border text-[8px] font-mono font-bold
                ${hud.phaseShiftActive
                  ? 'border-white text-white bg-white/10 animate-pulse'
                  : hud.phaseShiftReady
                    ? 'border-[#00f5ff]/60 text-[#00f5ff] bg-black/60'
                    : 'border-zinc-700/40 text-zinc-600 bg-black/40'
                }`}>
                <span className="text-[7px]">E</span>
                <span>PHASE</span>
                {!hud.phaseShiftReady && !hud.phaseShiftActive && hud.phaseShiftCooldownFraction > 0 && (
                  <div
                    className="absolute inset-0 rounded-lg bg-zinc-800/40"
                    style={{ clipPath: `inset(${(1 - hud.phaseShiftCooldownFraction) * 100}% 0 0 0)` }}
                  />
                )}
              </div>
            )}

            {/* Reflect Shield — R (wave 30) */}
            {hud.reflectShieldReady !== undefined && (
              <div className={`relative w-10 h-10 rounded-lg flex flex-col items-center justify-center border text-[8px] font-mono font-bold
                ${hud.reflectShieldActive
                  ? 'border-[#00ffcc] text-[#00ffcc] bg-[#00ffcc]/10 animate-pulse'
                  : hud.reflectShieldReady
                    ? 'border-[#00f5ff]/60 text-[#00f5ff] bg-black/60'
                    : 'border-zinc-700/40 text-zinc-600 bg-black/40'
                }`}>
                <span className="text-[7px]">R</span>
                <span>SHIELD</span>
                {!hud.reflectShieldReady && !hud.reflectShieldActive && hud.reflectShieldCooldownFraction > 0 && (
                  <div
                    className="absolute inset-0 rounded-lg bg-zinc-800/40"
                    style={{ clipPath: `inset(${(1 - hud.reflectShieldCooldownFraction) * 100}% 0 0 0)` }}
                  />
                )}
              </div>
            )}

            {/* Ally Synergy — T (wave 35) */}
            {hud.allySynergyReady !== undefined && hud.allyActive && (
              <div className={`relative w-10 h-10 rounded-lg flex flex-col items-center justify-center border text-[8px] font-mono font-bold
                ${hud.allySynergyActive
                  ? 'border-[#00ff88] text-[#00ff88] bg-[#00ff88]/10 animate-pulse'
                  : hud.allySynergyReady
                    ? 'border-[#00ff88]/60 text-[#00ff88] bg-black/60'
                    : 'border-zinc-700/40 text-zinc-600 bg-black/40'
                }`}>
                <span className="text-[7px]">T</span>
                <span>ALLY</span>
                {!hud.allySynergyReady && !hud.allySynergyActive && hud.allySynergyCooldownFraction > 0 && (
                  <div
                    className="absolute inset-0 rounded-lg bg-zinc-800/40"
                    style={{ clipPath: `inset(${(1 - hud.allySynergyCooldownFraction) * 100}% 0 0 0)` }}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Ally HP bar ─────────────────────────────────────────────────── */}
      {showGame && hud.allyActive && (
        <div className="absolute top-14 right-2 sm:right-3 pointer-events-none">
          <div className="bg-black/70 border border-[#00ff88]/30 rounded px-2 py-1 backdrop-blur-sm min-w-[80px]">
            <div className="text-[9px] font-mono text-[#00ff88]/70 mb-0.5">
              LIN {hud.allyDowned ? '— DOWN' : ''}
            </div>
            <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${hud.allyDowned ? 'bg-zinc-600 animate-pulse' : 'bg-[#00ff88]'}`}
                style={{ width: `${(hud.allyHp / hud.allyMaxHp) * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Ability Unlock Toast ─────────────────────────────────────────── */}
      {showGame && hud.pendingUnlock && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          <div className="bg-black/90 border border-[#00f5ff]/50 rounded-lg px-4 py-2 text-center backdrop-blur-md"
            style={{ boxShadow: '0 0 30px rgba(0,245,255,0.3)' }}>
            <div className="text-[9px] text-zinc-400 font-mono uppercase tracking-widest">ABILITY UNLOCKED</div>
            <div className="text-[#00f5ff] font-bold font-mono text-sm mt-0.5">{hud.pendingUnlock.name}</div>
            <div className="text-zinc-400 text-[10px] mt-0.5">{hud.pendingUnlock.description}</div>
            <div className="text-[#d4af37] text-[9px] font-mono mt-1">[{hud.pendingUnlock.keybind}]</div>
          </div>
        </div>
      )}

      {/* ── Map Transition Overlay ───────────────────────────────────────── */}
      {showGame && hud.mapTransition && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <div className="text-center">
            <div className="text-3xl font-black text-[#00f5ff] tracking-widest animate-pulse drop-shadow-[0_0_40px_rgba(0,245,255,0.8)]">
              ZONE ADVANCE
            </div>
            <div className="text-sm text-zinc-400 font-mono mt-2">{hud.mapName}</div>
          </div>
        </div>
      )}

      {/* ── Controls Inverted Warning ────────────────────────────────────── */}
      {showGame && hud.controlsInverted && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20">
          <div className="text-[#0066ff] font-black text-lg font-mono tracking-widest animate-pulse opacity-70">
            ⚠ REALITY FRACTURED ⚠
          </div>
        </div>
      )}

      {/* Narrative Dialogue Overlay */}

      {showGame && hud.dialogue && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none max-w-sm w-full px-4">
          <div className="bg-black/85 border border-[#00f5ff]/30 rounded-lg px-4 py-3 backdrop-blur-md"
            style={{ boxShadow: '0 0 20px rgba(0,245,255,0.15)' }}>
            <div className="text-[#ff00cc] font-mono text-[10px] font-bold uppercase tracking-widest mb-1">
              {hud.dialogue.speaker}
            </div>
            <div className="text-zinc-200 text-sm leading-relaxed font-light">
              {hud.dialogue.text}
              <span className="animate-pulse text-[#00f5ff]">▮</span>
            </div>
            {/* Life bar */}
            <div className="mt-2 h-0.5 bg-zinc-800 rounded-full">
              <div
                className="h-full bg-[#00f5ff]/40 rounded-full transition-all"
                style={{ width: `${hud.dialogue.timerFraction * 100}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Countdown */}
      {showGame && hud.countdown > 0 && gameRef.current?.state === 'countdown' && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-7xl sm:text-8xl font-black text-[#00f5ff] drop-shadow-[0_0_40px_rgba(0,245,255,0.6)] animate-pulse">
            {Math.ceil(hud.countdown) > 0 ? Math.ceil(hud.countdown) : 'GO!'}
          </div>
        </div>
      )}

      {/* Wave break */}
      {showGame && hud.waveBreak && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-xl font-black text-[#d4af37] opacity-60 drop-shadow-[0_0_20px_rgba(212,175,55,0.5)] tracking-widest">
            WAVE CLEAR
          </div>
        </div>
      )}

      {/* ── ESC Pause Menu ──────────────────────────────────────────────── */}
      {showGame && showPauseMenu && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-md z-50 pointer-events-auto">
          <div className="text-center space-y-4 bg-black/40 border border-[#00f5ff]/20 rounded-xl p-8 max-w-xs w-full mx-4"
            style={{ boxShadow: '0 0 40px rgba(0,245,255,0.1)' }}>
            <div className="text-3xl font-black text-[#00f5ff] tracking-widest drop-shadow-[0_0_20px_rgba(0,245,255,0.5)]">
              PAUSED
            </div>
            <div className="text-xs text-zinc-500 font-mono">WAVE {hud.wave}</div>

            <div className="space-y-2 pt-2">
              <button
                onClick={handleResume}
                className="w-full py-3 px-6 rounded-lg bg-[#00f5ff]/10 hover:bg-[#00f5ff]/20 border border-[#00f5ff]/40 text-[#00f5ff] font-bold font-mono tracking-wider transition-all duration-200 hover:shadow-[0_0_20px_rgba(0,245,255,0.3)]"
              >
                ▶ RESUME
              </button>
              <button
                onClick={handleSaveAndQuit}
                className="w-full py-3 px-6 rounded-lg bg-[#ff00cc]/10 hover:bg-[#ff00cc]/20 border border-[#ff00cc]/40 text-[#ff00cc] font-bold font-mono tracking-wider transition-all duration-200 hover:shadow-[0_0_20px_rgba(255,0,204,0.3)]"
              >
                💾 SAVE & QUIT
              </button>
            </div>

            <div className="text-[10px] text-zinc-600 font-mono pt-1">
              ESC or tap to resume
            </div>
          </div>
        </div>
      )}

      {/* Focus active border glow */}
      {showGame && hud.focusActive && (
        <div className="absolute inset-0 pointer-events-none border-2 border-[#00f5ff]/30 rounded"
          style={{ boxShadow: 'inset 0 0 60px rgba(0,245,255,0.12)' }} />
      )}

      <VoidBreakerTouchControls
        inputRef={inputRef}
        onPause={handleTouchPause}
        visible={isTouchDevice && uiState === 'playing'}
      />

      <VoidBreakerUI
        uiState={uiState}
        runStats={runStats}
        onStartGame={handleStart}
        onGoToMenu={() => { setUiState('menu'); fadeMusic(true); }}
        muted={muted}
        onToggleMute={toggleMute}
        musicVolume={musicVolume}
        onMusicVolumeChange={setVolume}
        saveInfo={saveInfo}
        onClearSave={() => { deleteSave(); setSaveInfo(null); }}
        onContinueGame={saveInfo ? handleContinue : undefined}
      />
    </div>
  );
}

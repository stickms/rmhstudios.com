/**
 * MultiplayerGameScreen — a live co-op Altair match.
 *
 * The HOST's page runs the one simulation (HostDriver -> HostSim, 60 Hz, driven
 * by a worker metronome so a backgrounded host tab keeps feeding the guests) and
 * sends a snapshot every 3rd step through the hub. Every client — host included,
 * through a local loopback — draws what the snapshots say: they go into a jitter
 * buffer, are sampled ~100 ms behind, turned into the world the SINGLE-PLAYER
 * renderer already draws (SnapshotView), and rendered with `renderFrame`.
 * Guests send movement intent at 20 Hz; they never send positions.
 *
 * Design: docs/altair-multiplayer.md. There is no pause in co-op: Esc opens a
 * menu over a world that keeps running.
 */

'use client';

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { markGamePlaying } from '@/lib/game-capabilities';
import { useAltairMultiplayerStore } from '@/lib/altair/multiplayer/store';
import { getSocket } from '@/lib/altair/multiplayer/socket';
import { C2S, S2C } from '@/lib/altair/multiplayer/events';
import { decodeSnapshot } from '@/lib/altair/multiplayer/snapshot';
import {
  SnapshotBuffer,
  GUEST_RENDER_DELAY_MS,
  HOST_RENDER_DELAY_MS,
} from '@/lib/altair/multiplayer/snapshot-buffer';
import { SnapshotView, type RosterEntry } from '@/lib/altair/multiplayer/snapshot-view';
import { HostDriver, type HostEnd } from '@/lib/altair/multiplayer/host-driver';
import { PLAYER_DEAD, PLAYER_ALIVE, type GameEvent } from '@/lib/altair/multiplayer/types';
import { useAltairSettingsStore } from '@/lib/altair/stores/settings-store';
import { createTileGenerator } from '@/lib/altair/engine/game-loop';
import { createWebGLRenderer } from '@/lib/altair/engine/renderer-setup';
import { renderFrame } from '@/lib/altair/engine/renderer';
import { updateCamera } from '@/lib/altair/engine/camera';
import { createInputState, setupInputListeners, setMobileInput, getMovementVector } from '@/lib/altair/engine/input';
import type { PlayerEntity } from '@/lib/altair/engine/types';
import { getAllSpriteEntries } from '@/lib/altair/engine/sprites/sprite-defs';
import { preloadAllSprites } from '@/lib/altair/engine/sprites/sprite-loader';
import MobileDPad from '@/components/altair/mobile/MobileDPad';
import CoopHud, { type CoopHudPlayer, type CoopHudBoss } from '@/components/altair/multiplayer/CoopHud';
import { WebGLUnavailable, useWebGLSupport } from '@/components/shared/WebGLUnavailable';

interface MultiplayerGameScreenProps {
  lobbyId: string;
  /** Leave the lobby and return to the lobby browser. */
  onLeave: () => void;
}

/** Guests report intent this often (hub limit: 1500/min). */
const INPUT_INTERVAL_MS = 50;
/** The HUD re-renders from the newest snapshot this often. */
const HUD_INTERVAL_MS = 150;

export default function MultiplayerGameScreen(props: MultiplayerGameScreenProps) {
  const webglSupported = useWebGLSupport();
  if (!webglSupported) {
    return (
      <div className="fixed inset-0">
        <WebGLUnavailable gameName="Altair" />
      </div>
    );
  }
  return <Match {...props} />;
}

interface HudState {
  players: CoopHudPlayer[];
  sharedKills: number;
  time: number;
  boss: CoopHudBoss | null;
}

function Match({ lobbyId, onLeave }: MultiplayerGameScreenProps) {
  const { t } = useTranslation('c-altair');
  const lobby = useAltairMultiplayerStore((s) => s.lobby);
  const connectionStatus = useAltairMultiplayerStore((s) => s.connectionStatus);
  const keybinds = useAltairSettingsStore((s) => s.keybinds);
  const joystickSide = useAltairSettingsStore((s) => s.joystickSide);

  const isHost = !!lobby && lobby.hostUserId === lobby.myUserId;
  // The host page IS the simulation. If it mounts without having seen the match
  // start (a reload mid-run) there is nothing to resume: say so.
  const [hostLost] = useState(() => isHost && !useAltairMultiplayerStore.getState().gameStarted);

  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rosterRef = useRef<Map<string, RosterEntry>>(new Map());
  const roster = useMemo(() => {
    const m = new Map<string, RosterEntry>();
    for (const p of lobby?.players ?? []) m.set(p.userId, { name: p.userName, color: p.color });
    return m;
  }, [lobby?.players]);
  rosterRef.current = roster;

  const [spritesReady, setSpritesReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ loaded: 0, total: 0 });
  const [hud, setHud] = useState<HudState | null>(null);
  const [hostGone, setHostGone] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const mobileSetterRef = useRef<(dx: number, dy: number) => void>(() => {});

  useEffect(() => {
    setIsMobile(window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  }, []);

  useEffect(() => markGamePlaying(), []);

  // Preload sprite assets (same as the single-player screen).
  useEffect(() => {
    const entries = getAllSpriteEntries();
    setLoadProgress({ loaded: 0, total: entries.length });
    preloadAllSprites(entries, (loaded, total) => setLoadProgress({ loaded, total })).then(() => setSpritesReady(true));
  }, []);

  // The host going quiet (hub event) -> banner for guests.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const onEvent = (e: GameEvent) => {
      if (e.type === 'host_disconnected') setHostGone(true);
      else if (e.type === 'host_reconnected') setHostGone(false);
    };
    socket.on(S2C.GAME_EVENT, onEvent);
    return () => {
      socket.off(S2C.GAME_EVENT, onEvent);
    };
  }, []);

  const toggleMenu = useCallback(() => setMenuOpen((v) => !v), []);

  // The match: socket wiring, host driver, input and the render loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    const socket = getSocket();
    const me = useAltairMultiplayerStore.getState().lobby;
    if (!canvas || !root || !socket || !me || !spritesReady || hostLost) return;
    const myId = me.myUserId;
    const iAmHost = me.hostUserId === myId;
    const myClass = me.players.find((p) => p.userId === myId)?.classId ?? 'knight';

    // ---- canvas sizing (same zoom rule as the single-player screen) ----
    const resize = () => {
      const vw = window.innerWidth || document.documentElement.clientWidth || 1;
      const vh = window.innerHeight || document.documentElement.clientHeight || 1;
      const zoomTiles = useAltairSettingsStore.getState().zoomTiles;
      const minSpan = 64 * zoomTiles * 2;
      const scale = Math.max(1, minSpan / Math.min(vw, vh));
      canvas.width = Math.max(1, Math.round(vw * scale));
      canvas.height = Math.max(1, Math.round(vh * scale));
      view.world.camera.width = canvas.width;
      view.world.camera.height = canvas.height;
    };

    const handle = createWebGLRenderer(canvas);
    const tileGen = createTileGenerator();
    const buffer = new SnapshotBuffer();
    const view = new SnapshotView(canvas.width || 1280, canvas.height || 720, myClass);
    view.setLocal(myId, myClass);
    resize();
    window.addEventListener('resize', resize);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(root);

    // ---- input ----
    const inputState = createInputState();
    const cleanupInput = setupInputListeners(inputState, keybinds, () => setMenuOpen((v) => !v));
    mobileSetterRef.current = (dx, dy) => setMobileInput(inputState, dx, dy);
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        inputState.keys.clear();
        setMobileInput(inputState, 0, 0);
      }
    };
    document.addEventListener('visibilitychange', onHide);

    // ---- snapshots in (guests from the hub; the host loops its own back) ----
    const pushRaw = (raw: unknown) => {
      const decoded = decodeSnapshot(raw);
      if (decoded) buffer.push(decoded, performance.now());
    };

    let driver: HostDriver | undefined;
    let worker: Worker | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let inputTimer: ReturnType<typeof setInterval> | null = null;
    let onGuestInput: ((m: { userId: string; seq: number; dx: number; dy: number }) => void) | null = null;
    let onSnapshot: ((raw: unknown) => void) | null = null;

    if (iAmHost) {
      driver = new HostDriver({
        players: me.players.map((p) => ({ playerId: p.userId, classId: p.classId ?? 'knight', slot: p.slot })),
        doubleTime: me.settings.doubleTime,
        send: (snap) => {
          socket.emit(C2S.GAME_STATE_SNAPSHOT, snap);
          pushRaw(snap);
        },
        onEnd: (end: HostEnd) => {
          socket.emit(C2S.GAME_END, {
            victory: end.victory,
            time: end.time,
            sharedKills: end.sharedKills,
            bossesDefeated: end.bossesDefeated,
            players: end.stats.map((s) => ({
              userId: s.playerId,
              level: s.level,
              kills: s.kills,
              timeSurvived: s.timeSurvived,
              revivesGiven: s.revivesGiven,
              revivesReceived: s.revivesReceived,
              wasDowned: s.wasDowned,
              wasAliveAtEnd: s.wasAliveAtEnd,
            })),
          });
        },
      });
      const d = driver;
      onGuestInput = (m) => {
        if (m && typeof m.userId === 'string') d.input(m.userId, m.dx, m.dy, performance.now());
      };
      socket.on(C2S.GAME_INPUT, onGuestInput);

      const tick = () => {
        const v = getMovementVector(inputState);
        d.localInput(myId, v.dx, v.dy);
        d.advance(performance.now());
      };
      try {
        worker = new Worker(new URL('../../../lib/altair/multiplayer/tick-worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = tick;
        worker.onerror = () => {
          // No worker: fall back to a main-thread timer (throttled when the tab is hidden).
          worker?.terminate();
          worker = null;
          fallbackTimer ??= setInterval(tick, 1000 / 60);
        };
      } catch {
        fallbackTimer = setInterval(tick, 1000 / 60);
      }
    } else {
      onSnapshot = pushRaw;
      socket.on(S2C.GAME_STATE_SNAPSHOT, onSnapshot);
      let seq = 0;
      inputTimer = setInterval(() => {
        const v = getMovementVector(inputState);
        socket.emit(C2S.GAME_INPUT, { seq: seq++, dx: v.dx, dy: v.dy });
      }, INPUT_INTERVAL_MS);
    }

    // ---- render loop ----
    let raf = 0;
    let last = performance.now();
    let lastHud = 0;
    const scratch = { x: 0, y: 0 } as PlayerEntity;
    const delay = iAmHost ? HOST_RENDER_DELAY_MS : GUEST_RENDER_DELAY_MS;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
      last = now;
      handle.syncOverlay();

      const snap = buffer.sample(now - delay);
      if (snap) {
        view.apply(snap, rosterRef.current, dt);
        // Spectate: a dead player's camera follows a living teammate.
        const mine = view.markers.find((m) => m.isLocal);
        if (mine && mine.state === PLAYER_DEAD) {
          const mate = view.markers.find((m) => !m.isLocal && m.state === PLAYER_ALIVE);
          if (mate) view.setFollow(mate.playerId);
        } else {
          view.setFollow(myId);
        }
        const target = view.followTarget();
        if (target) {
          scratch.x = target.x;
          scratch.y = target.y;
          updateCamera(view.world.camera, scratch, dt);
        }
        tileGen.update(view.world.camera);
        tileGen.drainPendingPickups(); // the host's sim owns structure pickups
        renderFrame(handle.renderer, view.world, tileGen, { players: view.markers });
      }

      if (now - lastHud >= HUD_INTERVAL_MS && snap) {
        lastHud = now;
        const r = rosterRef.current;
        setHud({
          sharedKills: view.sharedKills,
          time: view.time,
          boss: view.boss && { name: view.boss.name, title: view.boss.title, hpFrac: view.boss.hpFrac, color: view.boss.color },
          players: view.players.map((p) => ({
            playerId: p.playerId,
            name: r.get(p.playerId)?.name ?? p.playerId.slice(0, 6),
            color: r.get(p.playerId)?.color ?? '#ffffff',
            level: p.level,
            hp: p.hp,
            maxHp: p.maxHp,
            state: p.state,
            downTimer: p.downTimer,
            isLocal: p.playerId === myId,
          })),
        });
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      if (inputTimer) clearInterval(inputTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
      worker?.terminate();
      if (onGuestInput) socket.off(C2S.GAME_INPUT, onGuestInput);
      if (onSnapshot) socket.off(S2C.GAME_STATE_SNAPSHOT, onSnapshot);
      cleanupInput();
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('resize', resize);
      resizeObserver?.disconnect();
      handle.destroy();
      mobileSetterRef.current = () => {};
    };
    // keybinds are read once per match; changing them mid-run needs a remount.
  }, [spritesReady, hostLost]); // eslint-disable-line react-hooks/exhaustive-deps

  if (hostLost) {
    return (
      <div className="app-safe-pad fixed inset-0 flex items-center-safe justify-center-safe overflow-y-auto bg-(--altair-bg) px-6">
        <div role="alert" className="flex max-w-md flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-bold text-(--altair-text)">
            {t('coop-match-lost-title', { defaultValue: 'This match was lost' })}
          </h1>
          <p className="text-(--altair-text-muted)">
            {t('coop-match-lost-body', {
              defaultValue:
                'The host page was reloaded, and the match lives in the host page, so it cannot continue. Leave the lobby to start a new one.',
            })}
          </p>
          <p className="font-mono text-xs text-(--altair-text-muted)">
            {t('lobby-label', { defaultValue: 'Lobby' })} {lobbyId}
          </p>
          <button
            type="button"
            onClick={onLeave}
            className="min-h-11 rounded-(--altair-radius) bg-(--altair-accent) px-6 py-2 font-semibold text-(--altair-accent-fg) transition-colors hover:bg-(--altair-accent-hover)"
          >
            {t('leave-lobby', { defaultValue: 'Leave Lobby' })}
          </button>
        </div>
      </div>
    );
  }

  if (!spritesReady) {
    const pct = loadProgress.total > 0 ? Math.round((loadProgress.loaded / loadProgress.total) * 100) : 0;
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-(--altair-hud-scrim)">
        <h1 className="text-3xl font-bold tracking-wider text-(--altair-accent)" style={{ fontFamily: 'var(--altair-font-display)' }}>
          ALTAIR
        </h1>
        <p className="text-sm text-(--altair-text-muted)">
          {t('loading-assets', { defaultValue: 'Loading assets... {{loaded}}/{{total}}', loaded: loadProgress.loaded, total: loadProgress.total })}
        </p>
        <div className="h-2 w-48 overflow-hidden rounded-full bg-(--altair-surface)">
          <div className="h-full w-full origin-left bg-(--altair-accent) transition-transform duration-150" style={{ transform: `scaleX(${pct / 100})` }} />
        </div>
      </div>
    );
  }

  const reconnecting = connectionStatus !== 'connected';

  return (
    <div
      ref={rootRef}
      data-testid="coop-match"
      data-role={isHost ? 'host' : 'guest'}
      className="fixed inset-0 overflow-hidden bg-(--altair-hud-scrim)"
      style={{ width: '100vw', height: '100dvh', touchAction: 'none', overscrollBehavior: 'none' }}
    >
      <canvas
        data-jelly-zone="playfield"
        ref={canvasRef}
        className="block"
        style={{ width: '100vw', height: '100dvh', imageRendering: 'pixelated' }}
      />

      {hud && <CoopHud {...hud} />}

      {!hud && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p role="status" className="font-mono text-sm tracking-widest text-(--altair-text-muted)">
            {t('coop-waiting-snapshot', { defaultValue: 'Waiting for the host...' })}
          </p>
        </div>
      )}

      {(reconnecting || (hostGone && !isHost)) && (
        <div
          role="status"
          data-testid="coop-banner"
          className="absolute inset-x-0 z-40 mx-auto w-fit max-w-[90vw] rounded-(--altair-radius) border border-(--altair-warning) bg-(--altair-hud-scrim) px-4 py-2 text-center text-sm text-(--altair-warning)"
          style={{ top: 'max(4.5rem, calc(env(safe-area-inset-top) + 3.5rem))' }}
        >
          {reconnecting
            ? t('coop-reconnecting', { defaultValue: 'Connection lost. Reconnecting...' })
            : t('coop-host-lost-connection', { defaultValue: 'The host lost connection. Waiting for them to come back...' })}
        </div>
      )}

      {isMobile && <MobileDPad onChange={(dx, dy) => mobileSetterRef.current(dx, dy)} side={joystickSide} />}

      <button
        type="button"
        onClick={toggleMenu}
        aria-label={t('coop-menu', { defaultValue: 'Menu' })}
        className="absolute z-40 min-h-11 min-w-11 rounded-(--altair-radius) border border-(--altair-border) bg-(--altair-hud-scrim) px-3 text-xs font-semibold text-(--altair-text-muted)"
        style={{ right: 'max(0.75rem, env(safe-area-inset-right))', bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {t('coop-menu', { defaultValue: 'Menu' })}
      </button>

      {menuOpen && (
        <div className="absolute inset-0 z-50 flex items-center-safe justify-center-safe overflow-y-auto bg-black/50 px-6">
          <div role="dialog" aria-modal="true" aria-label={t('coop-menu', { defaultValue: 'Menu' })} className="flex w-full max-w-sm flex-col gap-4 rounded-(--altair-radius-lg) border border-(--altair-border) bg-(--altair-surface) p-6 text-center">
            <p className="text-sm text-(--altair-text-muted)">
              {t('coop-menu-note', { defaultValue: 'The run keeps going while this is open.' })}
            </p>
            <button
              type="button"
              autoFocus
              onClick={toggleMenu}
              className="min-h-11 rounded-(--altair-radius) bg-(--altair-accent) px-6 py-2 font-semibold text-(--altair-accent-fg) hover:bg-(--altair-accent-hover)"
            >
              {t('coop-resume', { defaultValue: 'Back to the match' })}
            </button>
            <button
              type="button"
              onClick={onLeave}
              className="min-h-11 rounded-(--altair-radius) border border-(--altair-border) px-6 py-2 font-semibold text-(--altair-text-muted) hover:bg-(--altair-surface-hover)"
            >
              {isHost
                ? t('coop-leave-host', { defaultValue: 'Leave and end the run for everyone' })
                : t('leave-lobby', { defaultValue: 'Leave Lobby' })}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

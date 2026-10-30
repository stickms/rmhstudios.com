/**
 * The game surface the three play pages share: it mounts a game client (TF2,
 * Half-Life 2 or Portal) on a canvas, the in-game HUD over it, and the screens
 * around a running game — loading (progress per stage: connecting, map,
 * textures, models, sounds, world), errors (with retry where retrying can
 * help), "click to play" (pointer lock), fullscreen, the end of a demo, and the
 * phone's "turn your device" hint (the games play in landscape).
 *
 * The client owns the one frame loop; this component only mounts it, passes it
 * the settings, and reacts to its callbacks. `markGamePlaying` quiets the site
 * material for the whole run, and the play-field opts out of it entirely.
 *
 *   <GameCanvas game="tf2" create={(mount) => createTf2Client({ ...mount, session })} onExit={leave} />
 *
 * The parent positions it (a full-viewport layer); it fills its parent.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Expand, Link2, LogOut, MousePointer2, RotateCcw, Shrink, Smartphone } from 'lucide-react';
import { useLobbyLink } from '@/hooks/useLobbyLink';
import { useGameSession } from '@/hooks/useGameSession';
import { isFullscreen, toggleFullscreen } from '@/lib/shared/platform';
import type { HudGame } from '@/lib/tf2-game/client/hud-state';
import { createHudStore } from '@/lib/tf2-game/client/hud-store';
import { loadSettings, saveSettings, type GameSettings } from '@/lib/tf2-game/client/settings';
import { createInputState, detectTouchFirst } from '@/lib/tf2-game/client/input';
import {
  LOAD_STAGES,
  type ClientError,
  type ClientMount,
  type ClientPhase,
  type GameClient,
  type LoadProgress,
  type LoadStage,
} from '@/lib/tf2-game/client/game-client';
import { cn } from '@/lib/utils';
import GameHud from './GameHud';
import P2pHostPlayers from './P2pHostPlayers';
import type { TouchAction } from './touch/TouchOverlay';
import { useCloseGuard } from './use-close-guard';
import CloseGuardHint from './CloseGuardHint';
import './play.css';

export interface GameCanvasProps {
  game: HudGame;
  /** Builds the client for one mount (called again on retry). */
  create: (mount: ClientMount) => GameClient;
  onExit: () => void;
  /** Shown on the loading screen until the map's own title is known. */
  title?: string;
  /** Catalog id for the session contract (shortcut scope). */
  sessionId: string;
  /** What "the end" screen offers (Half-Life 2 / Portal demos end at the last published map). */
  onEnded?: () => void;
}

const subscribeNoop = () => () => {};

/** A phone held upright (a tablet in portrait is wide enough to play: no rotate hint there). */
const PHONE_PORTRAIT = '(orientation: portrait) and (max-width: 600px)';

function usePhonePortrait(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(PHONE_PORTRAIT);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(PHONE_PORTRAIT).matches,
    () => false,
  );
}

function useStageLabels(): Record<LoadStage, string> {
  const { t } = useTranslation('c-tf2-game');
  return {
    connect: t('play_stage_connect', { defaultValue: 'Connecting' }),
    map: t('play_stage_map', { defaultValue: 'Map' }),
    textures: t('play_stage_textures', { defaultValue: 'Textures' }),
    models: t('play_stage_models', { defaultValue: 'Models' }),
    sounds: t('play_stage_sounds', { defaultValue: 'Sounds' }),
    world: t('play_stage_world', { defaultValue: 'World' }),
  };
}

function useErrorText(): (e: ClientError) => string {
  const { t } = useTranslation('c-tf2-game');
  return (e) => {
    switch (e.code) {
      case 'webgl':
        return t('play_error_webgl', { defaultValue: 'This browser or device cannot run the game: WebGL 2 is not available.' });
      case 'map-missing':
        return t('play_error_map_missing', { defaultValue: 'This map has not been published yet.' });
      case 'map-failed':
        return t('play_error_map_failed', { defaultValue: 'The map could not be loaded.' });
      case 'network':
        return t('play_error_network', { defaultValue: 'The connection failed while loading. Check your network and try again.' });
      case 'kicked':
        return t('play_error_kicked', { defaultValue: 'You were removed from the server: the room closed or its match stopped.' });
      case 'room':
        return t('play_error_room', { defaultValue: 'The server refused the room. It may be full, closed or unavailable.' });
      case 'host-left':
        return t('play_error_host_left_migration', {
          defaultValue: 'The host left and nobody could take the match over, so it ended.',
        });
      case 'auth-required':
        return t('play_error_auth', { defaultValue: 'Online play needs an account. Sign in, then join again — offline practice works without one.' });
      case 'p2p-connect':
        return t('play_error_p2p_connect', {
          defaultValue: 'Could not reach the host, directly or through our relay. Their network may block it, or the relay is full.',
        });
      case 'context-lost':
        return t('play_error_context', { defaultValue: 'The graphics device was reset. Reload the game to continue.' });
      default:
        return t('play_error_unknown', { defaultValue: 'Something went wrong while running the game.' });
    }
  };
}

export default function GameCanvas({ game, create, onExit, title, onEnded, sessionId }: GameCanvasProps) {
  const { t } = useTranslation('c-tf2-game');
  const stageLabels = useStageLabels();
  const errorText = useErrorText();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<GameClient | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<ClientPhase>('loading');
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<ClientError | null>(null);
  const [locked, setLocked] = useState(false);
  const [connection, setConnection] = useState<'connected' | 'connecting' | 'reconnecting' | 'disconnected'>('connecting');
  const [fullscreen, setFullscreen] = useState(false);
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings(game));
  const [hintDismissed, setHintDismissed] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const invite = useLobbyLink({ code: roomCode, path: '/tf2/play' });
  const touchFirst = useSyncExternalStore(subscribeNoop, detectTouchFirst, () => false);
  const portrait = usePhonePortrait();
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;

  // One store and input state per attempt (a retry starts clean).
  const store = useMemo(() => createHudStore({ game }), [game, attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const input = useMemo(() => createInputState(), [attempt]); // eslint-disable-line react-hooks/exhaustive-deps
  const createRef = useRef(create);
  createRef.current = create;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPhase('loading');
    setError(null);
    setProgress(null);
    const client = createRef.current({
      canvas,
      inputTarget: canvas,
      store,
      input,
      settings: settingsRef.current,
      callbacks: {
        onProgress: setProgress,
        onPhase: setPhase,
        onError: setError,
        onLockChange: setLocked,
        onConnection: setConnection,
        onRoom: setRoomCode,
        onExit: () => onExitRef.current(),
      },
    });
    clientRef.current = client;
    if (import.meta.env.DEV) (window as unknown as { __rmhGame?: GameClient }).__rmhGame = client;
    void client.start();
    return () => {
      client.dispose();
      clientRef.current = null;
      if (import.meta.env.DEV) delete (window as unknown as { __rmhGame?: GameClient }).__rmhGame;
    };
  }, [store, input]);

  // The session contract (hooks/useGameSession): the site material stands still and the
  // screen stays on while a game runs; a single-player game opens its pause menu when the
  // player looks away (multiplayer cannot pause).
  const running = phase === 'running';
  useGameSession({
    id: sessionId,
    active: running,
    onPause: game === 'tf2' ? undefined : () => store.dispatchImpulse('menu'),
  });

  // Ctrl (TF2's crouch) + W would close the tab mid-match.
  useCloseGuard(running);

  useEffect(() => {
    const onFs = () => setFullscreen(isFullscreen());
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const onSettingsChange = useCallback(
    (next: GameSettings) => {
      setSettings(next);
      saveSettings(game, next);
      clientRef.current?.setSettings(next);
    },
    [game],
  );

  const play = useCallback(async () => {
    await clientRef.current?.lockPointer();
  }, []);

  const fullscreenToggle = useCallback(async () => {
    const el = rootRef.current;
    if (el) setFullscreen(await toggleFullscreen(el));
  }, []);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // The join menus (team, class) are clicked with the cursor: no capture prompt while one is up.
  const local = useSyncExternalStore(store.subscribe, () => store.getSnapshot().local, () => null);
  const choosing = game === 'tf2' && !!local && (local.team === 0 || (local.team >= 2 && local.cls === 0));
  // The HUD tells the input layer when a menu has the keys (input.menuOpen / suspended); it is a
  // plain field, so it is sampled here rather than subscribed to.
  const [menuBusy, setMenuBusy] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setMenuBusy(input.menuOpen || input.suspended), 200);
    return () => window.clearInterval(id);
  }, [input, running]);
  const showPlayPrompt = running && !touchFirst && !locked && !choosing && !menuBusy;
  const showRotate = running && touchFirst && portrait && !hintDismissed;

  // A touch device has no spare corner (the HUD's panels own them all): full screen — where the
  // browser has it (not iPhone Safari) — and the invite link ride in the touch controls' row.
  const canFullscreen = useSyncExternalStore(subscribeNoop, () => !!document.fullscreenEnabled, () => false);
  const touchActions = useMemo<TouchAction[]>(() => {
    if (!touchFirst) return [];
    const out: TouchAction[] = [];
    if (roomCode) {
      out.push({
        id: 'invite',
        label: t('play_invite', { defaultValue: 'Copy the invite link' }),
        icon: invite.copied ? <Check aria-hidden="true" /> : <Link2 aria-hidden="true" />,
        onTap: () => void invite.copyLink(),
      });
    }
    if (canFullscreen) {
      out.push({
        id: 'fullscreen',
        label: fullscreen
          ? t('play_exit_fullscreen', { defaultValue: 'Exit full screen' })
          : t('play_fullscreen', { defaultValue: 'Full screen' }),
        icon: fullscreen ? <Shrink aria-hidden="true" /> : <Expand aria-hidden="true" />,
        onTap: () => void fullscreenToggle(),
      });
    }
    return out;
  }, [touchFirst, roomCode, canFullscreen, fullscreen, invite, fullscreenToggle, t]);
  const stagesShown = LOAD_STAGES.filter((s) => progress?.stages[s].state !== 'skipped');

  return (
    <div
      ref={rootRef}
      className="tf2g-stage relative h-full w-full overflow-hidden bg-black text-(--app-text)"
      data-jelly-zone="playfield"
      data-jelly="off"
      data-globe-cursor="off"
      data-touch={touchFirst ? 'true' : undefined}
      data-game={game}
      data-phase={phase}
      style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full"
        aria-label={t('play_canvas_label', { defaultValue: 'Game view' })}
        role="img"
      />

      {running ? (
        <GameHud
          game={game}
          store={store}
          input={input}
          settings={settings}
          onSettingsChange={onSettingsChange}
          onDisconnect={onExit}
          touchActions={touchActions}
        />
      ) : null}

      {/* Over the HUD (and its fades), never while one of its menus has the keys or the cursor. */}
      {showPlayPrompt ? (
        <button type="button" className="tf2g-play-prompt" onClick={() => void play()}>
          <MousePointer2 className="size-6" aria-hidden />
          <span className="tf2hud-title text-2xl">{t('play_click_to_play', { defaultValue: 'Click to play' })}</span>
          <span className="tf2g-play-prompt-hint text-xs">
            {t('play_click_hint', { defaultValue: 'The mouse aims while captured. Press Esc for the menu.' })}
          </span>
        </button>
      ) : null}
      {running && !touchFirst ? <CloseGuardHint settings={settings} onSettingsChange={onSettingsChange} /> : null}
      {running && connection === 'reconnecting' ? (
        <div className="tf2g-play-banner" role="status">
          {t('play_reconnecting', { defaultValue: 'Connection lost — reconnecting…' })}
        </div>
      ) : null}


      {/* Desktop: with the click-to-play scrim only (never over the kill feed mid-game); touch: in the touch controls' row. */}
      {running && showPlayPrompt ? (
        <div className="tf2g-play-corner">
          {roomCode ? (
            <button
              type="button"
              className="tf2g-play-chip tf2g-play-chip-wide"
              onClick={() => void invite.copyLink()}
              aria-label={t('play_invite', { defaultValue: 'Copy the invite link' })}
              title={t('play_invite', { defaultValue: 'Copy the invite link' })}
            >
              {invite.copied ? <Check className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
              <span className="font-mono text-xs">{roomCode}</span>
            </button>
          ) : null}
          {roomCode ? <P2pHostPlayers client={clientRef} /> : null}
          <button
            type="button"
            className="tf2g-play-chip"
            onClick={() => void fullscreenToggle()}
            aria-label={
              fullscreen
                ? t('play_exit_fullscreen', { defaultValue: 'Exit full screen' })
                : t('play_fullscreen', { defaultValue: 'Full screen' })
            }
            title={
              fullscreen
                ? t('play_exit_fullscreen', { defaultValue: 'Exit full screen' })
                : t('play_fullscreen', { defaultValue: 'Full screen' })
            }
          >
            {fullscreen ? <Shrink className="size-4" aria-hidden /> : <Expand className="size-4" aria-hidden />}
          </button>
        </div>
      ) : null}

      {showRotate ? (
        <section className="tf2g-play-screen" aria-labelledby="tf2g-rotate-title">
          <Smartphone className="size-10 rotate-90 text-(--app-accent-text)" aria-hidden />
          <h2 id="tf2g-rotate-title" className="tf2hud-title text-2xl">
            {t('play_rotate_title', { defaultValue: 'Turn your device' })}
          </h2>
          <p className="max-w-xs text-center text-sm text-(--app-text-muted)">
            {t('play_rotate_body', { defaultValue: 'The game is laid out for landscape. Hold your phone sideways to play.' })}
          </p>
          <button type="button" className="tf2g-play-button" onClick={() => setHintDismissed(true)}>
            {t('play_rotate_dismiss', { defaultValue: 'Play in portrait anyway' })}
          </button>
        </section>
      ) : null}

      {phase === 'loading' ? (
        <div className="tf2g-play-screen" role="status" aria-live="polite">
          <p className="text-xs font-semibold uppercase tracking-widest text-(--app-text-dim)">
            {t('play_loading', { defaultValue: 'Loading' })}
          </p>
          <h2 className="tf2hud-title text-center text-3xl sm:text-4xl">{progress?.title || title || ''}</h2>
          <div className="tf2g-play-bar w-72 max-w-full" aria-hidden>
            <span style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }} />
          </div>
          <ul className="grid w-72 max-w-full gap-1.5 text-xs">
            {stagesShown.map((s) => {
              const st = progress?.stages[s];
              const pct = st ? Math.round((st.state === 'done' ? 1 : st.done / Math.max(1, st.total)) * 100) : 0;
              return (
                <li key={s} className="flex items-center gap-2" data-state={st?.state ?? 'pending'}>
                  <span className={cn('w-20 shrink-0', st?.state === 'done' ? 'text-(--app-text)' : 'text-(--app-text-muted)')}>
                    {stageLabels[s]}
                  </span>
                  <span className="tf2g-play-bar tf2g-play-bar-thin min-w-0 flex-1" aria-hidden>
                    <span style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-9 text-end tabular-nums text-(--app-text-dim)">
                    {t('play_percent', { defaultValue: '{{n}}%', n: pct })}
                  </span>
                </li>
              );
            })}
          </ul>
          <button type="button" className="tf2g-play-button tf2g-play-button-quiet" onClick={onExit}>
            <LogOut className="size-4" aria-hidden />
            {t('play_cancel', { defaultValue: 'Cancel' })}
          </button>
        </div>
      ) : null}

      {phase === 'error' && error ? (
        <div className="tf2g-play-screen" role="alertdialog" aria-labelledby="tf2g-error-title" aria-describedby="tf2g-error-body">
          <AlertTriangle className="size-10 text-(--app-accent-text)" aria-hidden />
          <h2 id="tf2g-error-title" className="tf2hud-title text-3xl">
            {t('play_error_title', { defaultValue: 'The game stopped' })}
          </h2>
          <p id="tf2g-error-body" className="max-w-sm text-center text-sm text-(--app-text-muted)">
            {errorText(error)}
          </p>
          <p className="max-w-sm break-all text-center font-mono text-[11px] text-(--app-text-dim)">{error.detail}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {error.retryable ? (
              <button type="button" className="tf2g-play-button" onClick={retry}>
                <RotateCcw className="size-4" aria-hidden />
                {t('play_retry', { defaultValue: 'Try again' })}
              </button>
            ) : null}
            <button type="button" className="tf2g-play-button tf2g-play-button-quiet" onClick={onExit}>
              <LogOut className="size-4" aria-hidden />
              {t('play_leave', { defaultValue: 'Leave' })}
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'ended' ? (
        <section className="tf2g-play-screen" aria-labelledby="tf2g-end-title">
          <h2 id="tf2g-end-title" className="tf2hud-title text-3xl">
            {t('play_end_title', { defaultValue: 'End of the demo' })}
          </h2>
          <p className="max-w-sm text-center text-sm text-(--app-text-muted)">
            {t('play_end_body', { defaultValue: 'That is everything this demo includes. Thanks for playing.' })}
          </p>
          <button type="button" className="tf2g-play-button" onClick={onEnded ?? onExit}>
            {t('play_end_back', { defaultValue: 'Back to the menu' })}
          </button>
        </section>
      ) : null}
    </div>
  );
}

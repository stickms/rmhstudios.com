'use client';

/**
 * Bum's Rush — the game shell.
 *
 * Three jobs, in order of how expensive they are to get wrong:
 *
 * ## 1. The viewport-mode switch
 *
 * A live level is a surface that never scrolls, so it is `.app-viewport`.
 * Everything else in this game — title, world map, lobby, wardrobe, results —
 * is a DOCUMENT, a column you read top to bottom, and gets `.app-page`. That is
 * design-language.md §12.1 rule 6, and it is the one decision here that is
 * expensive to retrofit: mobile Safari collapses its address and tab bars only
 * for document scroll, so reaching for a fixed viewport on the world map costs
 * a phone about 110px of screen for the whole visit. The switch also resets
 * `window.scrollY`, because a fixed viewport cannot undo a scroll offset it
 * inherits — it would simply render 300px of itself off the top of the screen.
 *
 * ## 2. The stage
 *
 * The playfield is `.app-stage-fit` + `.app-stage` at 16:9 (§12.1 rule 2). The
 * canvas fills the stage and the renderer's own `fitStage()` letterboxes inside
 * it, so a 21:9 ultrawide, a 4:3 tablet and a phone in portrait all get the
 * whole playfield, centred, never skewed and never cropped. The HUD sits
 * OUTSIDE the stage — in the letterbox where there is one — except the edge
 * arrows, which track world positions and therefore live inside it.
 *
 * ## 3. The loop's lifetime
 *
 * `useLevelSession` owns the single rAF loop, the engine, the renderer and
 * every input device; this component owns when that session exists. Leaving a
 * level unmounts it, which cancels the frame, disposes the simulation and the
 * renderer, and drops every listener — the whole teardown in one place a
 * reviewer can check.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { ConnectionBanner } from '@/components/shared/ConnectionStatus';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/utils';
import { applyAudioSettings } from '@/lib/bums-rush/audio';
import { createTouchArmState, type DeviceProfileKind, type TouchArmState } from '@/lib/bums-rush/input';
import { loadManifest, nextLevel } from '@/lib/bums-rush/levels';
import { reconnectBumsRushNow } from '@/lib/bums-rush/net';
import type { LevelResult, RoomMode, SeatIndex } from '@/lib/bums-rush/types';
import { PaperCard } from './paper/PaperSurface';
import { InkButton } from './paper/InkControls';
import { Hud } from './hud/Hud';
import { EdgeIndicators } from './hud/EdgeIndicators';
import { TouchControls } from './hud/TouchControls';
import { DeviceJoinPrompt } from './hud/DeviceJoinPrompt';
import { OrientationCard } from './hud/OrientationCard';
import type { SeatBarEntry } from './hud/SeatBar';
import type { LiveHandle } from './hud/types';
import { BindingsScreen } from './screens/BindingsScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { LevelCard, bestTimeFor } from './screens/LevelCard';
import { Lobby } from './screens/Lobby';
import { ModeSelect } from './screens/ModeSelect';
import { PauseMenu } from './screens/PauseMenu';
import { ResultsCard } from './screens/ResultsCard';
import { SettingsScreen } from './screens/SettingsScreen';
import { TitleScreen } from './screens/TitleScreen';
import { Wardrobe } from './screens/Wardrobe';
import { WorldMap } from './screens/WorldMap';
import { useBumsRushConnection, useCoarsePointerOnly, usePortrait } from './hooks';
import { useLobby } from './useLobby';
import { useLevelSession, type SessionNet } from './useLevelSession';
import {
  bindingKeyFor,
  bindingSetFor,
  useBumsRushStore,
  viewportModeFor,
  type Screen,
} from './store';

interface Props {
  /** From `?room=ABC123` — the invite link path (design doc §9.7). */
  initialRoomCode: string | null;
}

const WORLD_FROM_ID = /^w(\d)-/;

export function BumsRushGame({ initialRoomCode }: Props) {
  const { t } = useTranslation('c-bums-rush');
  const reducedMotion = useReducedMotion();
  const connection = useBumsRushConnection();
  const lobby = useLobby();

  const screen = useBumsRushStore((s) => s.screen);
  const profile = useBumsRushStore((s) => s.profile);
  const bindings = useBumsRushStore((s) => s.bindings);
  const padBrand = useBumsRushStore((s) => s.padBrand);
  const padSeen = useBumsRushStore((s) => s.padSeen);
  const padId = useBumsRushStore((s) => s.padId);
  const hydrate = useBumsRushStore((s) => s.hydrate);
  const go = useBumsRushStore((s) => s.go);
  const back = useBumsRushStore((s) => s.back);
  const goRoot = useBumsRushStore((s) => s.goRoot);
  const patchSettings = useBumsRushStore((s) => s.patchSettings);
  const patchAssists = useBumsRushStore((s) => s.patchAssists);
  const equip = useBumsRushStore((s) => s.equip);
  const setBindingSet = useBumsRushStore((s) => s.setBindingSet);
  const resetBindingSet = useBumsRushStore((s) => s.resetBindingSet);
  const notePad = useBumsRushStore((s) => s.notePad);
  const recordResult = useBumsRushStore((s) => s.recordResult);

  const [bindingProfile, setBindingProfile] = useState<DeviceProfileKind>('keyboard-p1');
  const [netStart, setNetStart] = useState<SessionNet | null>(null);
  const [nextLevelId, setNextLevelId] = useState<string | null>(null);

  useEffect(() => hydrate(), [hydrate]);

  // Audio settings are global to the bus, not per-component, so they are
  // pushed once here whenever they change rather than by every screen.
  useEffect(() => {
    applyAudioSettings(profile.settings);
  }, [profile.settings]);

  const mode = viewportModeFor(screen);

  useEffect(() => {
    if (mode !== 'viewport') return;
    // §12.1 rule 6: a fixed viewport cannot undo a scroll offset it inherits.
    window.scrollTo(0, 0);
  }, [mode]);

  // A room that starts pulls everyone into the level, host and guests alike.
  const start = lobby.state.start;
  useEffect(() => {
    if (!start) return;
    setNetStart({
      amHost: lobby.state.amHost,
      roomCode: lobby.state.room?.code ?? '',
      hostClientId: start.hostClientId,
      mySeats: lobby.state.mySeats,
      seatViews: start.seats,
      startedAt: start.startedAt,
      reportResult: (envelope) => {
        void lobby.lobby?.reportResult(envelope);
      },
    });
    go({ kind: 'playing', levelId: start.levelId, mode: start.mode });
    // `lobby` is a stable bridge object; re-running on every room tick would
    // restart the level on every ping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  const connectLobby = useCallback(async () => {
    return lobby.connect({
      name: t('player.default', { defaultValue: 'Player' }),
      cosmetics: profile.cosmetics,
    });
  }, [lobby, profile.cosmetics, t]);

  const onFinish = useCallback(
    (result: LevelResult) => {
      recordResult(result);
      loadManifest()
        .then((manifest) => setNextLevelId(nextLevel(manifest, result.levelId)?.id ?? null))
        .catch(() => setNextLevelId(null));
      go({ kind: 'results', levelId: result.levelId, result });
    },
    [go, recordResult],
  );

  const world = worldOf(screen);

  return (
    <div
      className={cn('bums-theme', mode === 'viewport' ? 'app-viewport' : 'app-page')}
      data-world={world ?? undefined}
    >
      {screen.kind === 'playing' ? (
        <LevelStage
          key={`${screen.levelId}:${screen.mode}`}
          levelId={screen.levelId}
          roomMode={screen.mode}
          net={netStart}
          reducedMotion={reducedMotion}
          bindings={bindings}
          onFinish={onFinish}
          onQuit={() => {
            setNetStart(null);
            go({ kind: 'world-map' });
          }}
          onSettings={() => go({ kind: 'settings' })}
        />
      ) : (
        <DocumentScreens
          screen={screen}
          initialRoomCode={initialRoomCode}
          connection={connection}
          lobbyBridge={lobby}
          connectLobby={connectLobby}
          padBrand={padBrand}
          padSeen={padSeen}
          padId={padId}
          bindingProfile={bindingProfile}
          setBindingProfile={setBindingProfile}
          bindings={bindings}
          setBindingSet={setBindingSet}
          resetBindingSet={resetBindingSet}
          notePad={notePad}
          nextLevelId={nextLevelId}
          go={go}
          back={back}
          goRoot={goRoot}
          patchSettings={patchSettings}
          patchAssists={patchAssists}
          equip={equip}
        />
      )}
    </div>
  );
}

function worldOf(screen: Screen): string | null {
  const id =
    screen.kind === 'playing' || screen.kind === 'level-card' || screen.kind === 'results'
      ? screen.levelId
      : null;
  const match = id ? WORLD_FROM_ID.exec(id) : null;
  return match ? match[1] : null;
}

// ─── The document screens ───────────────────────────────────────────────────

type LobbyBridge = ReturnType<typeof useLobby>;

interface DocumentScreensProps {
  screen: Screen;
  initialRoomCode: string | null;
  connection: ReturnType<typeof useBumsRushConnection>;
  lobbyBridge: LobbyBridge;
  connectLobby: () => Promise<unknown>;
  padBrand: ReturnType<typeof useBumsRushStore.getState>['padBrand'];
  padSeen: boolean;
  padId: string | null;
  bindingProfile: DeviceProfileKind;
  setBindingProfile: (profile: DeviceProfileKind) => void;
  bindings: ReturnType<typeof useBumsRushStore.getState>['bindings'];
  setBindingSet: ReturnType<typeof useBumsRushStore.getState>['setBindingSet'];
  resetBindingSet: ReturnType<typeof useBumsRushStore.getState>['resetBindingSet'];
  notePad: ReturnType<typeof useBumsRushStore.getState>['notePad'];
  nextLevelId: string | null;
  go: (screen: Screen) => void;
  back: () => void;
  goRoot: () => void;
  patchSettings: ReturnType<typeof useBumsRushStore.getState>['patchSettings'];
  patchAssists: ReturnType<typeof useBumsRushStore.getState>['patchAssists'];
  equip: ReturnType<typeof useBumsRushStore.getState>['equip'];
}

function DocumentScreens({
  screen,
  initialRoomCode,
  connection,
  lobbyBridge,
  connectLobby,
  padBrand,
  padSeen,
  padId,
  bindingProfile,
  setBindingProfile,
  bindings,
  setBindingSet,
  resetBindingSet,
  notePad,
  nextLevelId,
  go,
  back,
  goRoot,
  patchSettings,
  patchAssists,
  equip,
}: DocumentScreensProps) {
  const profile = useBumsRushStore((s) => s.profile);
  const online = connection !== 'error';

  const openLobby = useCallback(
    (then?: (bridge: LobbyBridge) => void) => {
      go({ kind: 'lobby' });
      void connectLobby().then(() => then?.(lobbyBridge));
    },
    [connectLobby, go, lobbyBridge],
  );

  switch (screen.kind) {
    case 'title':
      return (
        <TitleScreen
          initialRoomCode={initialRoomCode}
          padBrand={padBrand}
          padSeen={padSeen}
          padBrandOverride={profile.settings.padBrand}
          onPadDetected={notePad}
          onPlay={() => go({ kind: 'mode' })}
          onWardrobe={() => go({ kind: 'wardrobe' })}
          onSettings={() => go({ kind: 'settings' })}
          onCredits={() => go({ kind: 'credits' })}
          onJoinInvite={() => openLobby()}
        />
      );

    case 'mode':
      return (
        <ModeSelect
          onlineAvailable={online}
          onCampaign={() => go({ kind: 'world-map' })}
          onQuickPlay={() =>
            void connectLobby().then(() =>
              lobbyBridge.lobby?.quickPlay({ mode: 'campaign', minPlayers: 1 }),
            )
          }
          onShowdown={() =>
            void connectLobby().then(() => lobbyBridge.lobby?.quickPlay({ mode: 'showdown', minPlayers: 2 }))
          }
          onLobby={() => openLobby()}
          onBack={back}
        />
      );

    case 'world-map':
      return (
        <WorldMap
          profile={profile}
          onSelectLevel={(levelId) => go({ kind: 'level-card', levelId })}
          onBack={back}
        />
      );

    case 'level-card':
      return (
        <LevelCard
          levelId={screen.levelId}
          profile={profile}
          onPlay={(levelId) => go({ kind: 'playing', levelId, mode: 'campaign' })}
          onBack={back}
        />
      );

    case 'lobby':
      return (
        <Lobby
          state={lobbyBridge.state}
          status={connection}
          initialCode={initialRoomCode}
          onCreate={() =>
            void connectLobby().then(() =>
              lobbyBridge.lobby?.createRoom({ mode: 'campaign', private: true }),
            )
          }
          onJoin={(code) => void connectLobby().then(() => lobbyBridge.lobby?.joinRoom(code))}
          onReady={(seat: SeatIndex, ready) => lobbyBridge.lobby?.setReady(seat, ready)}
          onStart={() => lobbyBridge.lobby?.start()}
          onLeave={() => {
            lobbyBridge.leave();
            goRoot();
          }}
          onRetryConnection={reconnectBumsRushNow}
          onBack={back}
        />
      );

    case 'wardrobe':
      return <Wardrobe profile={profile} onEquip={equip} onBack={back} />;

    case 'settings':
      return (
        <SettingsScreen
          settings={profile.settings}
          onPatch={patchSettings}
          onPatchAssists={patchAssists}
          onBindings={() => go({ kind: 'bindings' })}
          onBack={back}
        />
      );

    case 'bindings': {
      const key = bindingKeyFor(bindingProfile, padId);
      return (
        <BindingsScreen
          profile={bindingProfile}
          onProfileChange={setBindingProfile}
          bindingSet={bindingSetFor({ bindings }, bindingProfile, padId)}
          onChange={(set) => setBindingSet(key, set)}
          onReset={() => resetBindingSet(key)}
          padBrand={padBrand}
          onBack={back}
        />
      );
    }

    case 'credits':
      return <CreditsScreen onBack={back} />;

    case 'results':
      return (
        <ResultsCardContainer
          result={screen.result}
          levelId={screen.levelId}
          nextLevelId={nextLevelId}
          onRetry={() => go({ kind: 'playing', levelId: screen.levelId, mode: 'campaign' })}
          onNext={(levelId) => go({ kind: 'playing', levelId, mode: 'campaign' })}
          onMap={() => go({ kind: 'world-map' })}
        />
      );

    default:
      return null;
  }
}

/**
 * The results card needs the LEVEL (for its objective list), which is already
 * in the loader's cache by the time anyone finishes it — so this is a cheap
 * lookup rather than a fetch, and it renders without the objectives rather than
 * blocking on one.
 */
function ResultsCardContainer({
  result,
  levelId,
  nextLevelId,
  onRetry,
  onNext,
  onMap,
}: {
  result: LevelResult;
  levelId: string;
  nextLevelId: string | null;
  onRetry: () => void;
  onNext: (levelId: string) => void;
  onMap: () => void;
}) {
  const profile = useBumsRushStore((s) => s.profile);
  const [level, setLevel] = useState<Parameters<typeof ResultsCard>[0]['level']>(null);

  useEffect(() => {
    let cancelled = false;
    import('@/lib/bums-rush/levels')
      .then((mod) => (/^w[1-8]-\d{2}$/.test(levelId) ? mod.loadLevel(levelId) : mod.loadShowdownArena(levelId)))
      .then((loaded) => {
        if (!cancelled) setLevel(loaded);
      })
      .catch(() => {
        if (!cancelled) setLevel(null);
      });
    return () => {
      cancelled = true;
    };
  }, [levelId]);

  // The clear has already been folded into the profile, so "previous best" is
  // only meaningful if it is strictly better than this run.
  const best = bestTimeFor(profile, levelId);
  const previousBest = best !== null && best < result.durationMs ? best : null;

  return (
    <ResultsCard
      result={result}
      level={level}
      nextLevelId={nextLevelId}
      previousBestMs={previousBest}
      onRetry={onRetry}
      onNext={onNext}
      onMap={onMap}
    />
  );
}

// ─── The live level ─────────────────────────────────────────────────────────

interface LevelStageProps {
  levelId: string;
  roomMode: RoomMode;
  net: SessionNet | null;
  reducedMotion: boolean;
  bindings: ReturnType<typeof useBumsRushStore.getState>['bindings'];
  onFinish: (result: LevelResult) => void;
  onQuit: () => void;
  onSettings: () => void;
}

function LevelStage({
  levelId,
  roomMode,
  net,
  reducedMotion,
  bindings,
  onFinish,
  onQuit,
  onSettings,
}: LevelStageProps) {
  const { t } = useTranslation('c-bums-rush');
  const profile = useBumsRushStore((s) => s.profile);
  const padSeen = useBumsRushStore((s) => s.padSeen);
  const connection = useBumsRushConnection();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hudRef = useRef<LiveHandle | null>(null);
  const edgeRef = useRef<LiveHandle | null>(null);
  const touchStateRef = useRef<TouchArmState>(createTouchArmState());
  const touchButtonsRef = useRef<Set<string>>(new Set());

  const coarseOnly = useCoarsePointerOnly();
  const anyCoarse = useMediaQuery('(any-pointer: coarse)');
  const portrait = usePortrait();
  const [orientationDismissed, setOrientationDismissed] = useState(false);

  const translate = useCallback(
    // Level sticky notes are authored as i18n KEYS (§15). A missing key
    // renders as nothing rather than as `bums.level.w1-01.note-aim`, because a
    // raw key drawn into the world is worse than a blank note.
    (key: string) => t(key, { defaultValue: '' }),
    [t],
  );

  const session = useLevelSession({
    levelId,
    mode: roomMode,
    settings: profile.settings,
    bindings,
    cosmetics: profile.cosmetics,
    reducedMotion,
    touchPrimary: coarseOnly,
    canvasRef,
    hudRef,
    edgeRef,
    touchStateRef,
    touchButtonsRef,
    translate,
    onFinish,
    net,
  });

  const seatEntries: SeatBarEntry[] = useMemo(() => {
    if (net && net.seatViews.length > 0) {
      return net.seatViews.map((view) => ({
        seat: view.seat,
        name: view.name,
        local: net.mySeats.includes(view.seat),
      }));
    }
    return session.localSeats.map((seat) => ({
      seat,
      name: t('player.you', { defaultValue: 'You' }),
      local: true,
    }));
  }, [net, session.localSeats, t]);

  const levelName = session.level
    ? t(session.level.name, { defaultValue: levelId })
    : levelId;

  const announcement = useMemo(() => {
    const parts: string[] = [];
    if (session.completedObjectives.length > 0) {
      parts.push(
        t('hud.announce-objectives', {
          defaultValue: 'Objectives complete: {{count}}',
          count: session.completedObjectives.length,
        }),
      );
    }
    if (session.deaths > 0) {
      parts.push(t('hud.announce-deaths', { defaultValue: 'Splats: {{count}}', count: session.deaths }));
    }
    return parts.join('. ');
  }, [session.completedObjectives.length, session.deaths, t]);

  /*
    Honest degradation (§8 of the brief). A level that will not load, or a
    canvas with no 2D context, gets a paper card that says so and a way out —
    never a black rectangle the player is left to interpret.
  */
  if (session.status === 'error') {
    return (
      <div className="app-screen">
        <PaperCard tilt={-1} taped className="w-full max-w-md p-[clamp(1rem,4vmin,2rem)]">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-bum-ink">
            <AlertTriangle className="size-5" aria-hidden="true" />
            {t('level.crashed-title', { defaultValue: 'This page came out blank' })}
          </h2>
          <p className="mt-2 text-sm text-bum-graphite">
            {t('level.crashed-body', {
              defaultValue:
                'The level could not be drawn on this device. Your progress is safe. Try another level, or try again.',
            })}
          </p>
          {session.error ? (
            <p className="mt-2 font-mono text-xs break-words text-bum-graphite">{session.error}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <InkButton variant="primary" onClick={session.retry}>
              {t('level.crashed-retry', { defaultValue: 'Try again' })}
            </InkButton>
            <InkButton onClick={onQuit}>{t('nav.back-map', { defaultValue: 'World map' })}</InkButton>
          </div>
        </PaperCard>
      </div>
    );
  }

  const showTouch = anyCoarse && !session.paused;
  /*
    The join card is hidden where local co-op would be a lie (§12.1): two people
    cannot share one phone's touchscreen, and offering it is a promise the
    hardware cannot keep. The exception is a device that has actually seen a
    gamepad — a pad paired to a phone or tablet IS a second physical device, and
    then the offer is true again. `padSeen` is the same signal the title screen
    uses to decide whether to mention couch play at all, so the two agree.
  */
  const allowJoin = !coarseOnly || padSeen;

  return (
    <>
      <ConnectionBanner status={connection} onRetry={reconnectBumsRushNow} />

      <div className="relative min-h-0 flex-1">
        <div className="app-stage-fit absolute inset-0">
          <div className="app-stage" style={{ '--app-stage-ar': '16 / 9' } as React.CSSProperties}>
            <canvas
              ref={canvasRef}
              className="absolute inset-0 block h-full w-full"
              style={{ touchAction: 'none' }}
              // Honest: the drawing is not screen-reader playable and we do not
              // pretend otherwise (§13). The label describes what is on screen;
              // the menus, map and scrapbook are the navigable parts.
              role="img"
              aria-label={t('hud.canvas-label', {
                defaultValue:
                  '{{level}} — a hand-drawn physics level, players: {{count}}. The drawing itself is not screen-reader playable; the menus, world map and scrapbook are.',
                level: levelName,
                count: seatEntries.length,
              })}
            />
            {/* Inside the stage: these track world positions. */}
            <EdgeIndicators ref={edgeRef} />
          </div>
        </div>

        {session.level ? (
          <Hud
            ref={hudRef}
            level={session.level}
            seats={seatEntries}
            localSeats={session.localSeats}
            assists={profile.settings.assists}
            completedObjectives={session.completedObjectives}
            objectivesOpen={session.objectivesOpen}
            onToggleObjectives={() => session.setObjectivesOpen(!session.objectivesOpen)}
            onPause={() => session.setPaused(true)}
            announcement={announcement}
          />
        ) : null}

        {showTouch ? (
          <TouchControls
            scheme={profile.settings.touchScheme}
            seat={session.localSeats[0] ?? 0}
            stateRef={touchStateRef}
            buttonsRef={touchButtonsRef}
            active={showTouch}
          />
        ) : null}

        {session.pendingJoin && allowJoin ? (
          <DeviceJoinPrompt
            brand={session.pendingJoin.brand}
            seat={Math.min(3, session.localSeats.length) as SeatIndex}
            onAccept={session.acceptJoin}
            onDismiss={session.dismissJoin}
          />
        ) : null}

        {portrait && anyCoarse && !orientationDismissed && !session.paused ? (
          <OrientationCard onDismiss={() => setOrientationDismissed(true)} />
        ) : null}
      </div>

      {session.paused ? (
        <PauseMenu
          levelName={levelName}
          roomWide={net?.amHost ?? true}
          onResume={() => session.setPaused(false)}
          onRestart={() => {
            session.setPaused(false);
            session.retry();
          }}
          onSettings={onSettings}
          onQuit={onQuit}
        />
      ) : null}
    </>
  );
}

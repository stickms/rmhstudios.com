'use client';
import * as React from 'react';
// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
// is the component that honours it — `motion` bundles its own full feature
// implementation, which lands in the SHARED ENTRY CHUNK when the module is
// reachable from a route's top level.
import { AnimatePresence, m as motion } from 'framer-motion';
import { APPLE_SPRING, DURATION, EASE, scaleIn } from '@/lib/motion';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { OptimizedImage } from '@/components/ui/OptimizedImage';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuLabel } from '@/components/ui/menu';
import { LogOut, Menu as MenuIcon, Settings } from 'lucide-react';
import { musicGain, useSliceItStore } from '@/lib/slice-it/store';
import { GameEngine } from '@/lib/slice-it/engine';
import { hitSoundPath, hitSoundPreloadList } from '@/lib/slice-it/hit-sound-pool';
import { asset } from '@/lib/storage/asset';
import { AudioManager } from '@/lib/audio/AudioManager';
import { addMatchListener, spectatingLobbyCode } from '@/lib/slice-it/net/client';
import { useStartRun } from '@/lib/slice-it/useStartRun';
import type { SliceSong } from '@/lib/slice-it/types';
import { useStableSession } from '@/hooks/useStableSession';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useQuitGame } from '@/hooks/useQuitGame';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { SongLibrary } from '@/components/slice-it/SongLibrary';
import { CalibrationScreen } from '@/components/slice-it/CalibrationScreen';
import { MultiplayerLobby } from '@/components/slice-it/MultiplayerLobby';
import { SongDetailsPanel } from '@/components/slice-it/SongDetailsPanel';
import { PhoneRecord } from '@/components/slice-it/PhoneRecord';
import { DailyPanel } from '@/components/slice-it/modes/DailyPanel';
import { SettingsPanel } from '@/components/slice-it/SettingsPanel';
import { SetlistPanel } from '@/components/slice-it/modes/SetlistPanel';
import './slice-menu.css';

/**
 * Which solo surface the menu is showing.
 *
 * The library is the default and always has been; `daily` (S1) and `setlists`
 * (S8, which also hosts S2's courses) are the two modes that need an entry
 * point here. A mode nothing links to is a mode nobody plays — `R2` and `R10`
 * shipped without one and sat dormant, which is the mistake this exists to
 * avoid repeating.
 */
type SoloMode = 'library' | 'daily' | 'setlists';

interface MainMenuProps {
  engine: GameEngine | null;
}

export function MainMenu({ engine: propEngine }: MainMenuProps) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const volume = useSliceItStore((state) => state.volume);
  const musicVolume = useSliceItStore((state) => state.musicVolume);
  const hitSound = useSliceItStore((state) => state.hitSound);
  const setSongId = useSliceItStore((state) => state.setSongId);
  const setIsMultiplayer = useSliceItStore((state) => state.setIsMultiplayer);
  const engine = propEngine;
  // Not `authClient.useSession()` directly: its focus revalidation reports a
  // momentary `{ data: null, isPending: false }` when you come back to the tab,
  // which threw the sign-in takeover over a live session. See the hook.
  const session = useStableSession();
  const navigate = useNavigate();
  const quit = useQuitGame();
  // The details panel is a column beside the library on a wide screen and a sheet
  // over it on a narrow one; the primary nav is in the bar on a tablet and up and
  // at the foot of the screen (where a thumb is) on a phone.
  const isWide = useMediaQuery('(min-width: 1024px)');
  const isPhone = useMediaQuery('(max-width: 639px)');
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const { startRun, isLoading } = useStartRun(engine);
  const [showSettings, setShowSettings] = React.useState(false);
  // A phone's bar is the logo and one menu button; account, settings and quit live in it.
  const [barMenuOpen, setBarMenuOpen] = React.useState(false);
  const barMenuRef = React.useRef<HTMLButtonElement>(null);
  const [showCalibration, setShowCalibration] = React.useState(false);
  const [showMultiplayer, setShowMultiplayer] = React.useState(false);
  const [soloMode, setSoloMode] = React.useState<SoloMode>('library');
  // Auto-show multiplayer lobby when returning from a multiplayer match
  const { isMultiplayer } = useSliceItStore();
  React.useEffect(() => {
    if (isMultiplayer) {
      setShowMultiplayer(true);
    }
  }, [isMultiplayer]);

  // Auto-open multiplayer lobby when joining via invite link
  React.useEffect(() => {
    if (search.lobby) {
      setShowMultiplayer(true);
    }
  }, [search]);

  // Apply volume on mount
  React.useEffect(() => {
    AudioManager.getInstance().setVolume(musicGain(volume, musicVolume));
  }, [volume, musicVolume]);

  // Preload persisted hit sound on mount — the whole pool if it is Shuffle.
  React.useEffect(() => {
    const files = hitSoundPreloadList(hitSound);
    if (files.length === 0) return;
    const am = AudioManager.getInstance();
    am.initialize();
    for (const file of files) am.preloadHitSound(asset(hitSoundPath(file))).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The track whose details panel is open.
  const [selectedSong, setSelectedSong] = React.useState<SliceSong | null>(null);
  // Whether the record's full sheet is open. A tablet opens it on pick; a phone
  // shows the compact record strip instead and opens the sheet on request.
  const [sheetOpen, setSheetOpen] = React.useState(false);
  React.useEffect(() => {
    if (selectedSong?.id) setSongId(selectedSong.id);
  }, [selectedSong, setSongId]);

  // Ref to stop SongLibrary preview audio from outside
  const stopPreviewRef = React.useRef<(() => void) | null>(null);

  const avatarUrl = (session.data?.user as { image?: string | null } | undefined)?.image ?? null;
  // The operator is whoever is signed in — there is nothing to type. (A name field
  // in Settings used to shadow it, which only ever let the two disagree.)
  const sessionUser = session.data?.user as
    | { name?: string | null; username?: string | null }
    | undefined;
  const userName = sessionUser ? sessionUser.name || sessionUser.username || 'OPERATOR' : '';

  /**
   * Open a track's details panel.
   *
   * Used to fetch and *fully decode* the audio just to show a sidebar —
   * several megabytes and a synchronous decode to render a title, a cover and
   * a leaderboard. The panel fetches what it needs itself.
   */
  const handleSelectSong = React.useCallback((song: SliceSong) => {
    stopPreviewRef.current?.();
    // `startTransition`, because this update is what was eating the opening
    // animation. Measured: the click ran a ~250ms task on the main thread —
    // React rendering the whole panel subtree synchronously — and the panel's
    // entrance spring is integrated on that same thread. A spring that misses
    // 120ms does not slow down, it jumps: the slide covered 636px→106px in one
    // frame gap, which is the "the fade plays and then restarts" this looked
    // like. Nothing remounts; the animation loses its middle.
    //
    // Marking the open as a transition lets React render that subtree in
    // interruptible slices and yield between them, so the frames the animation
    // needs keep landing.
    React.startTransition(() => {
      setSelectedSong(song);
      setSheetOpen(!isPhone);
    });
  }, [isPhone]);

  // Closing the sheet: a phone keeps the compact record (the pick stays); a tablet
  // has no strip, so closing also clears the pick.
  const closeSheet = React.useCallback(() => {
    setSheetOpen(false);
    if (!isPhone) setSelectedSong(null);
  }, [isPhone]);

  const handleStartGame = React.useCallback(
    async (song: SliceSong) => {
      stopPreviewRef.current?.();
      setSelectedSong(song);
      // The whole load-decode-chart-countdown sequence lives in one place
      // now; it used to be duplicated between here and the multiplayer
      // path, which is how a host ended up incrementing the play count
      // twice for the same match.
      await startRun(song.id).catch(() => {});
    },
    [startRun],
  );

  /**
   * The server said the match is loading: load the chart and report back.
   *
   * The server runs the countdown once everybody has reported, so no client
   * decides when play begins — which is what stops a fast machine starting
   * three seconds before a slow one.
   *
   * The trigger is `slice:loading`, and it has to be: the server's order is
   * loading → countdown → start, and it will not count down until every seat
   * has answered `slice:loaded`. Hanging the load off `onStart` therefore made
   * each client wait for an event that could not be sent until that client had
   * already loaded, and the deadlock was silent — pressing START left the lobby
   * exactly as it was, and pressing it again answered "a match is in progress".
   * `onStart` keeps a call of its own for the rejoin path (`N12`), where the
   * server sends START straight to a returning socket with no loading phase.
   */
  const matchLoadStartedRef = React.useRef(false);
  const lobbyState = useSliceItStore((s) => s.lobby?.state ?? null);
  // One load per match. `loading` repeats — the server re-emits it as each seat
  // reports in — so the guard is cleared by the lobby going back to `waiting`
  // (or the player leaving it), which is the only thing that means "next match".
  React.useEffect(() => {
    if (lobbyState === null || lobbyState === 'waiting') matchLoadStartedRef.current = false;
  }, [lobbyState]);

  React.useEffect(() => {
    if (!engine) return;
    const beginMatch = (songId: string) => {
      // A watcher has no seat and no chart to load — `N1` is a view of someone
      // else's match, and the loading events reach the spectator room too.
      if (spectatingLobbyCode()) return;
      if (matchLoadStartedRef.current) return;
      matchLoadStartedRef.current = true;
      setIsMultiplayer(true);
      setShowMultiplayer(false);
      void startRun(songId, { countPlay: false, multiplayer: true }).catch(() => {
        // Let the next `loading` retry rather than stranding this client as the
        // one seat the room is waiting on.
        matchLoadStartedRef.current = false;
      });
    };

    return addMatchListener({
      onLoading: () => {
        // The song has been in the snapshot since the host picked it; the
        // loading payload only carries who has reported in so far.
        const songId = useSliceItStore.getState().lobby?.song?.id;
        if (songId) beginMatch(songId);
      },
      onStart: (payload) => beginMatch(payload.song.id),
    });
  }, [engine, startRun, setIsMultiplayer]);

  // The four places the menu goes. Three swap the stage; Versus opens the lobby.
  // On a wide screen they are the sleeve's printed track box; below that they sit
  // in the bar (a tablet) or at the foot of the screen (a phone).
  const renderNav = (box: boolean) => (
    <nav className={box ? 'slice-nav slice-nav--box' : 'slice-nav'} aria-label={t('menu-nav', { defaultValue: 'Slice It! menu' })}>
      <button
        type="button"
        className="slice-nav__item"
        aria-pressed={soloMode === 'library'}
        onClick={() => setSoloMode('library')}
      >
        <span className="slice-nav__idx">A1</span>
        <span>{t('menu-nav-library', { defaultValue: 'Library' })}</span>
      </button>
      <button
        type="button"
        className="slice-nav__item"
        aria-pressed={soloMode === 'daily'}
        aria-label={ts('daily-challenge', { defaultValue: 'Daily Challenge' })}
        onClick={() => setSoloMode(soloMode === 'daily' ? 'library' : 'daily')}
      >
        <span className="slice-nav__idx">A2</span>
        <span>{t('menu-nav-daily', { defaultValue: 'Daily' })}</span>
      </button>
      <button
        type="button"
        className="slice-nav__item"
        aria-pressed={soloMode === 'setlists'}
        aria-label={ts('setlists', { defaultValue: 'Setlists' })}
        onClick={() => setSoloMode(soloMode === 'setlists' ? 'library' : 'setlists')}
      >
        <span className="slice-nav__idx">B1</span>
        <span>{t('menu-nav-setlists', { defaultValue: 'Setlists' })}</span>
      </button>
      <button
        type="button"
        className="slice-nav__item slice-nav__item--versus"
        aria-label={t('multiplayer', { defaultValue: 'MULTIPLAYER' })}
        onClick={() => setShowMultiplayer(true)}
      >
        <span className="slice-nav__idx">B2</span>
        <span>{t('menu-nav-versus', { defaultValue: 'Versus' })}</span>
      </button>
    </nav>
  );

  // Unified Main Menu View
  return (
    <div className="slice-menu absolute inset-0 z-50 flex flex-col overflow-hidden bg-slice-bg text-slice-text">
      {showCalibration && <CalibrationScreen onBack={() => setShowCalibration(false)} />}

      {showMultiplayer && !showCalibration && (
        <MultiplayerLobby
          onBack={() => {
            setShowMultiplayer(false);
            setIsMultiplayer(false);
          }}
          onOpenSettings={() => setShowSettings(true)}
        />
      )}

      {!showMultiplayer && !showCalibration && (
        <>
          {/* Only the track load takes the screen. `session.isPending` used to
              take it too, so the entire menu sat behind a dimmed "VALIDATING
              SESSION" spinner until the auth round trip came back — blocking
              the library, the search box and both mode buttons on a request
              none of them need. `/api/slice-it/songs` is `auth: 'optional'`,
              the library loads its own rows behind its own skeleton, and the
              two things that genuinely need a session (the upload control and
              the sign-in wall) resolve themselves when it arrives. Loading a
              track is different: it replaces the stage, so it is allowed to
              cover it. */}
          {isLoading && (
            <div className="absolute inset-0 z-70 bg-slice-bg/85 flex items-center justify-center flex-col gap-4">
              <div className="w-9 h-9 border-[3px] border-slice-primary border-t-transparent rounded-full animate-spin" />
              <div className="slice-label text-slice-primary animate-pulse">
                {t('initializing-track', { defaultValue: 'Initializing Track' })}
              </div>
            </div>
          )}

          {/* One slim bar: back, wordmark, the four places you can go, and the
              player. It replaces a 60px route header stacked over a 125px
              masthead — the game's art lives in the details column now, and
              the slash under the bar is the key art's one motif. */}
          {isWide ? (
            <header className="slice-line">
              <div className="slice-line__l">
                <span className="slice-chip">RMH-050</span>
              </div>
              <div className="slice-line__r">
                <span className="slice-label">
                  {t('operator', { defaultValue: 'Operator' })}{' '}
                  <b className="slice-figure">{userName || 'GUEST'}</b>
                </span>
                <button
                  type="button"
                  className="slice-bar__icon"
                  onClick={() => setShowSettings(true)}
                  aria-label={t('settings', { defaultValue: 'Settings' })}
                >
                  <Settings className="size-[18px]" aria-hidden />
                </button>
                <button
                  type="button"
                  className="slice-bar__icon"
                  onClick={quit}
                  aria-label={t('quit', { defaultValue: 'QUIT' })}
                  title={t('quit', { defaultValue: 'QUIT' })}
                >
                  <LogOut className="size-[18px]" aria-hidden />
                </button>
              </div>
            </header>
          ) : (
            <header className="slice-bar">
            <h1 className="slice-bar__title">
              <img
                className="slice-bar__logo"
                src="/images/games/logos/slice-it-line.svg"
                alt={t('game-title', { defaultValue: 'Slice It!' })}
                width={1395}
                height={282}
                decoding="async"
                fetchPriority="high"
              />
            </h1>
            {!isPhone && renderNav(false)}
            {isPhone ? (
              <>
                <button
                  ref={barMenuRef}
                  type="button"
                  className="slice-bar__icon ml-auto"
                  aria-haspopup="menu"
                  aria-expanded={barMenuOpen}
                  aria-label={t('menu', { defaultValue: 'Menu' })}
                  onClick={() => setBarMenuOpen((open) => !open)}
                >
                  <MenuIcon className="size-5" aria-hidden />
                </button>
                <AnchoredMenu
                  open={barMenuOpen}
                  onClose={() => setBarMenuOpen(false)}
                  anchorRef={barMenuRef}
                  label={t('menu', { defaultValue: 'Menu' })}
                  className="slice-tokens slice-menu-panel w-56"
                >
                  <MenuLabel className="flex items-center gap-2.5">
                    <UserAvatar
                      src={avatarUrl}
                      alt=""
                      size={24}
                      fallbackName={userName || undefined}
                      className="shrink-0"
                    />
                    <span className="min-w-0 truncate">{userName || 'GUEST'}</span>
                  </MenuLabel>
                  <MenuItem
                    icon={Settings}
                    onSelect={() => {
                      setBarMenuOpen(false);
                      // After the menu has closed and given focus back, not in the
                      // same tick: the settings panel's own focus handling would
                      // otherwise lose the race with it.
                      window.setTimeout(() => setShowSettings(true), 80);
                    }}
                  >
                    {t('settings', { defaultValue: 'Settings' })}
                  </MenuItem>
                  <MenuItem
                    icon={LogOut}
                    onSelect={() => {
                      setBarMenuOpen(false);
                      quit();
                    }}
                  >
                    {t('quit', { defaultValue: 'QUIT' })}
                  </MenuItem>
                </AnchoredMenu>
              </>
            ) : (
            <div className="slice-bar__who">
              <UserAvatar
                src={avatarUrl}
                alt={userName || 'Player'}
                size={30}
                fallbackName={userName || undefined}
                className="slice-bar__avatar shrink-0"
              />
              <span className="slice-bar__name slice-figure">{userName || 'GUEST'}</span>
              <button
                type="button"
                className="slice-bar__icon"
                onClick={() => setShowSettings(true)}
                aria-label={t('settings', { defaultValue: 'Settings' })}
              >
                <Settings className="size-[18px]" aria-hidden />
              </button>
              <button
                type="button"
                className="slice-bar__icon"
                onClick={quit}
                aria-label={t('quit', { defaultValue: 'QUIT' })}
                title={t('quit', { defaultValue: 'QUIT' })}
              >
                <LogOut className="size-[18px]" aria-hidden />
              </button>
            </div>
            )}
          </header>
          )}

          <div className="flex-1 min-h-0 flex relative">
            {/* Auth overlay. `items-center-safe` + `overflow-y-auto`: plain
                `items-center` clips the card at both ends once it is taller than
                the box (a landscape phone), putting the Log In button out of
                reach. */}
            {session.signedOut && (
              <div className="absolute inset-0 z-60 bg-slice-bg/92 flex items-center-safe justify-center-safe overflow-y-auto overscroll-contain p-6">
                <motion.div
                  className="slice-panel w-full max-w-sm space-y-5 p-7 text-center"
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                >
                  <img
                    className="mx-auto h-auto w-full max-w-[17rem]"
                    src="/images/games/logos/slice-it-line.svg"
                    alt=""
                    width={1395}
                    height={282}
                    decoding="async"
                  />
                  <hr className="slice-slash" />
                  <h3 className="slice-display text-xl uppercase text-slice-text">
                    {t('connect-to-start', { defaultValue: 'Connect to Start' })}
                  </h3>
                  <p className="slice-label normal-case tracking-normal text-[13px] leading-snug">
                    {t('auth-required', {
                      defaultValue: 'Authentication is required for leaderboard ranking',
                    })}
                  </p>
                  <Button
                    className="slice-btn-primary w-full"
                    onClick={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
                  >
                    {t('log-in', { defaultValue: 'Log In' })}
                  </Button>
                </motion.div>
              </div>
            )}

            {/* The stage: library, daily challenge (S1), or setlists/courses
                (S8/S2). One at a time — each is a different mode, not a filter
                over the same list. Cross-faded, and `mode="wait"` so the
                outgoing mode is gone before the next one measures itself. */}
            {/* Wide: the sleeve. The wordmark, the printed track box that is the
                navigation, and the record you have picked — its cover, its
                pressings, START. It is on every mode, because the nav lives in
                it; the record only shows in the library. */}
            {isWide && (
              <aside className="slice-sleeve" aria-label={t('song-details', { defaultValue: 'Song Details' })}>
                <div className="slice-sleeve__top">
                  <h1 className="slice-sleeve__title">
                    <img
                      className="slice-sleeve__logo"
                      src="/images/games/logos/slice-it-line.svg"
                      alt={t('game-title', { defaultValue: 'Slice It!' })}
                      width={1395}
                      height={282}
                      decoding="async"
                      fetchPriority="high"
                    />
                  </h1>
                  {renderNav(true)}
                </div>
                <div className="slice-sleeve__body">
                  {soloMode === 'library' && selectedSong ? (
                    <SongDetailsPanel
                      song={selectedSong}
                      onPlay={handleStartGame}
                      onSongUpdated={(updates) =>
                        setSelectedSong((current) => (current ? { ...current, ...updates } : current))
                      }
                    />
                  ) : (
                    <div className="slice-side__empty">
                      <div className="slice-side__art">
                        <OptimizedImage
                          src="/images/games/banners/slice-it.webp"
                          alt=""
                          width={840}
                          height={280}
                          priority
                          className="size-full object-cover"
                        />
                      </div>
                      <p className="slice-display text-lg text-slice-text">
                        {t('menu-tagline', { defaultValue: 'Slice through every beat.' })}
                      </p>
                      <hr className="slice-slash" />
                      <p className="slice-label normal-case tracking-normal text-[13px] leading-relaxed">
                        {t('side-empty', {
                          defaultValue: 'Pick a track to see its charts, your scores and the modifiers.',
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </aside>
            )}

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {/* A phone: the picked record, compact, above the list. */}
              {isPhone && soloMode === 'library' && selectedSong && (
                <PhoneRecord
                  song={selectedSong}
                  onStart={handleStartGame}
                  onDetails={() => setSheetOpen(true)}
                />
              )}
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={soloMode}
                  className="flex min-h-0 flex-1 flex-col"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.fast, ease: EASE.standard }}
                >
                  {soloMode === 'daily' && (
                    <DailyPanel
                      engine={engine}
                      onPlay={(songId) => startRun(songId)}
                      onBack={() => setSoloMode('library')}
                    />
                  )}
                  {soloMode === 'setlists' && (
                    <SetlistPanel
                      engine={engine}
                      onPlay={(songId) => startRun(songId)}
                      onBack={() => setSoloMode('library')}
                    />
                  )}
                  {soloMode === 'library' && (
                    <SongLibrary
                      /* PLAY opens the details panel; it does not start the run.
                         Starting straight from the row dropped the player into a
                         chart at whatever difficulty and modifiers were left over
                         from the last song, with nothing in between to look at —
                         and those controls, plus the score multiplier they add up
                         to, all live in the panel. `START GAME` there is the
                         control that commits. */
                      onSelect={handleSelectSong}
                      onHighlight={handleSelectSong}
                      selectedSongId={selectedSong?.id ?? null}
                      onStopPreviewRef={stopPreviewRef}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Narrow: the details slide over the library. The sheet slides; it
                used to appear and vanish. A spring, not a duration: this is a
                surface that travels. Two KEYED siblings, not a fragment —
                `AnimatePresence` tracks its direct children by key. */}
            <AnimatePresence>
              {!isWide && selectedSong && sheetOpen && [
                <motion.button
                  key="song-details-backdrop"
                  type="button"
                  className="absolute inset-0 bg-black/50 z-65"
                  onClick={closeSheet}
                  aria-label={t('close-song-details', { defaultValue: 'Close song details' })}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.base, ease: EASE.standard }}
                />,
                <motion.div
                  key="song-details-panel"
                  className="slice-sheet"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={APPLE_SPRING.smooth}
                >
                  <div className="slice-sheet__head">
                    <span className="slice-label">
                      {t('song-details', { defaultValue: 'Song Details' })}
                    </span>
                    <button
                      type="button"
                      className="slice-bar__icon"
                      onClick={closeSheet}
                      aria-label={t('close-song-details', { defaultValue: 'Close song details' })}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <SongDetailsPanel
                      song={selectedSong}
                      onPlay={handleStartGame}
                      onSongUpdated={(updates) =>
                        setSelectedSong((current) => (current ? { ...current, ...updates } : current))
                      }
                    />
                  </div>
                </motion.div>,
              ]}
            </AnimatePresence>
          </div>

          {isPhone && renderNav(false)}
        </>
      )}

      {/* Settings — extracted to its own file once it grew past a drawer.
          See `SettingsPanel.tsx` for why. */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onCalibrate={() => {
            setShowSettings(false);
            setShowCalibration(true);
          }}
        />
      )}
    </div>
  );
}

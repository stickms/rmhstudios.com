'use client';
import * as React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { APPLE_SPRING, DURATION, EASE, scaleIn } from '@/lib/motion';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { CalendarDays, ListMusic, Moon, Sun } from 'lucide-react';
import { useSliceItStore } from '@/lib/slice-it/store';
import { GameEngine } from '@/lib/slice-it/engine';
import { asset } from '@/lib/storage/asset';
import { AudioManager } from '@/lib/audio/AudioManager';
import { addMatchListener } from '@/lib/slice-it/net/client';
import { useStartRun } from '@/lib/slice-it/useStartRun';
import type { SliceSong } from '@/lib/slice-it/types';
import { useStableSession } from '@/hooks/useStableSession';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { SongLibrary } from '@/components/slice-it/SongLibrary';
import { CalibrationScreen } from '@/components/slice-it/CalibrationScreen';
import { MultiplayerLobby } from '@/components/slice-it/MultiplayerLobby';
import { SongDetailsPanel } from '@/components/slice-it/SongDetailsPanel';
import { DailyPanel } from '@/components/slice-it/modes/DailyPanel';
import { SettingsPanel } from '@/components/slice-it/SettingsPanel';
import { SetlistPanel } from '@/components/slice-it/modes/SetlistPanel';

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
  const setUserName = useSliceItStore((state) => state.setUserName);
  const userName = useSliceItStore((state) => state.userName);
  const volume = useSliceItStore((state) => state.volume);
  const hitSound = useSliceItStore((state) => state.hitSound);
  const setSongId = useSliceItStore((state) => state.setSongId);
  const setIsMultiplayer = useSliceItStore((state) => state.setIsMultiplayer);
  const isDarkMode = useSliceItStore((state) => state.isDarkMode);
  const setIsDarkMode = useSliceItStore((state) => state.setIsDarkMode);
  const engine = propEngine;
  // Not `authClient.useSession()` directly: its focus revalidation reports a
  // momentary `{ data: null, isPending: false }` when you come back to the tab,
  // which threw the sign-in takeover over a live session. See the hook.
  const session = useStableSession();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const { startRun, isLoading } = useStartRun(engine);
  const [showSettings, setShowSettings] = React.useState(false);
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
    AudioManager.getInstance().setVolume(volume / 100);
  }, [volume]);

  // Preload persisted hit sound on mount
  React.useEffect(() => {
    if (hitSound && hitSound !== 'default') {
      const am = AudioManager.getInstance();
      am.initialize();
      am.preloadHitSound(asset(`/music/slice-it/sounds/${hitSound}`)).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The track whose details panel is open.
  const [selectedSong, setSelectedSong] = React.useState<SliceSong | null>(null);
  React.useEffect(() => {
    if (selectedSong?.id) setSongId(selectedSong.id);
  }, [selectedSong, setSongId]);

  // Ref to stop SongLibrary preview audio from outside
  const stopPreviewRef = React.useRef<(() => void) | null>(null);

  // Side effect to set username
  React.useEffect(() => {
    if (session.data?.user && !userName) {
      const user = session.data.user as { name?: string | null; username?: string | null };
      const name = user.name || user.username || 'OPERATOR';
      setUserName(name);
    }
  }, [session.data, userName, setUserName]);

  const avatarUrl = (session.data?.user as { image?: string | null } | undefined)?.image ?? null;

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
    React.startTransition(() => setSelectedSong(song));
  }, []);

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
   * The server said the match is live: load the chart and report back.
   *
   * The server runs the countdown once everybody has reported, so no client
   * decides when play begins — which is what stops a fast machine starting
   * three seconds before a slow one.
   */
  React.useEffect(() => {
    if (!engine) return;
    return addMatchListener({
      onStart: (payload) => {
        setIsMultiplayer(true);
        setShowMultiplayer(false);
        void startRun(payload.song.id, { countPlay: false, multiplayer: true }).catch(() => {});
      },
    });
  }, [engine, startRun, setIsMultiplayer]);

  // Unified Main Menu View
  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-slice-bg text-slice-text">
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
            <div className="absolute inset-0 z-70 bg-slice-bg/80 flex items-center justify-center flex-col gap-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-blue-500 font-extrabold animate-pulse uppercase tracking-widest">
                {t('initializing-track', { defaultValue: 'Initializing Track' })}
              </div>
            </div>
          )}

          {/* Header Bar */}
          <div className="flex items-center justify-between gap-2 min-w-0 shrink-0 bg-slice-bg px-4 py-3 border-b border-slice-shadow-dark/50">
            <div className="flex items-center gap-3 min-w-0">
              {/* The player's actual avatar. This was a `<div>` printing the
                  first letter of their name and nothing else — the session
                  carries `user.image` and it was never read, so everyone was a
                  grey initial. `UserAvatar` is the shared primitive: it proxies
                  a remote avatar through the image optimizer and falls back to
                  the default asset if that fetch fails, which a hand-rolled
                  `<img>` here would not. The neumorphic ring keeps it in the
                  game's material rather than sitting on the surface as a flat
                  circle. */}
              <UserAvatar
                src={avatarUrl}
                alt={userName || 'Player'}
                size={40}
                fallbackName={userName || undefined}
                className="shrink-0 shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]"
              />
              {/* Hidden below `sm`, not truncated. Truncating kept the name in
                  the layout while the five buttons opposite squeezed it to 24px
                  — one letter and an ellipsis, directly beside an avatar
                  already showing that same letter. The name is not a control
                  and repeating one glyph is not information, so on a phone the
                  avatar carries identity alone and the row's width goes to the
                  buttons that need it. `min-w-0` + truncate still hold from
                  `sm` up, where a long display name would otherwise push those
                  buttons off the right edge. */}
              <div className="hidden [@media(min-width:640px)_and_(min-height:620px)]:flex min-w-0 items-center">
                <div className="font-black text-slice-text text-base uppercase tracking-tight truncate">
                  {userName || 'GUEST'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
              {/* S1 / S8 entry points. Plain buttons rather than a tab strip:
                  each one swaps the whole stage for a different mode, and only
                  one of the three is ever the current view. */}
              <Button
                variant="ghost"
                className={`h-10 shrink-0 rounded-lg font-black px-2.5 sm:px-4 uppercase tracking-wide text-xs transition-colors ${
                  soloMode === 'daily'
                    ? 'neumorphic-inset text-slice-text'
                    : 'text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark/20'
                }`}
                onClick={() => setSoloMode(soloMode === 'daily' ? 'library' : 'daily')}
              >
                <CalendarDays className="w-4 h-4 [@media(min-width:640px)_and_(min-height:620px)]:mr-1.5" />
                <span className="hidden [@media(min-width:640px)_and_(min-height:620px)]:inline">
                  {ts('daily-challenge', { defaultValue: 'Daily Challenge' })}
                </span>
              </Button>
              <Button
                variant="ghost"
                className={`h-10 shrink-0 rounded-lg font-black px-2.5 sm:px-4 uppercase tracking-wide text-xs transition-colors ${
                  soloMode === 'setlists'
                    ? 'neumorphic-inset text-slice-text'
                    : 'text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark/20'
                }`}
                onClick={() => setSoloMode(soloMode === 'setlists' ? 'library' : 'setlists')}
              >
                <ListMusic className="w-4 h-4 [@media(min-width:640px)_and_(min-height:620px)]:mr-1.5" />
                <span className="hidden [@media(min-width:640px)_and_(min-height:620px)]:inline">
                  {ts('setlists', { defaultValue: 'Setlists' })}
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-10 shrink-0 bg-linear-to-r from-violet-500 to-blue-500 text-white border-none hover:from-violet-400 hover:to-blue-400 font-black px-3 sm:px-5 rounded-lg transition-colors uppercase tracking-wide text-xs shadow-[0_0_12px_rgba(139,92,246,0.5)] hover:shadow-[0_0_20px_rgba(139,92,246,0.7)] animate-pulse hover:animate-none"
                onClick={() => setShowMultiplayer(true)}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="[@media(min-width:640px)_and_(min-height:620px)]:mr-1.5"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="hidden [@media(min-width:640px)_and_(min-height:620px)]:inline">
                  {t('multiplayer', { defaultValue: 'MULTIPLAYER' })}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark dark:text-slice-text-muted dark:hover:text-slice-text dark:hover:bg-slice-shadow-light rounded-lg transition-colors"
                onClick={() => setIsDarkMode(!isDarkMode)}
                title={
                  isDarkMode
                    ? t('switch-to-light-mode', { defaultValue: 'Switch to Light Mode' })
                    : t('switch-to-dark-mode', { defaultValue: 'Switch to Dark Mode' })
                }
              >
                {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark dark:text-slice-text-muted dark:hover:text-slice-text dark:hover:bg-slice-shadow-light rounded-lg transition-colors"
                onClick={() => setShowSettings(true)}
              >
                <span className="sr-only">{t('settings', { defaultValue: 'Settings' })}</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </Button>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex relative">
            {/* Auth overlay.
                `items-center-safe`/`justify-center-safe` + `overflow-y-auto`:
                plain `items-center` centres the panel and then clips it at BOTH
                ends once it is taller than the box, putting the heading and the
                Log In button out of reach with no way to scroll to them. On a
                landscape phone (844×390 leaves ~320px of stage) this card was
                ~420px tall, so that was every landscape session.

                The splash sizes are gated on width AND height rather than on
                `sm:` alone. `sm:` is a width test, and a landscape phone passes
                it with 320px of stage — which is how the Log In button ended up
                below the fold of the screen whose only purpose is that button.
                Scrolling now reaches it; sizing it means you don't have to. */}
            {session.signedOut && (
              <div className="absolute inset-0 z-60 bg-slice-bg/90 flex items-center-safe justify-center-safe overflow-y-auto overscroll-contain p-6 sm:p-8 backdrop-blur-xl rounded-[4rem] shadow-[inset_15px_15px_40px_var(--slice-shadow-dark),inset_-15px_-15px_40px_var(--slice-shadow-light)]">
                <motion.div
                  className="w-full max-w-md space-y-4 [@media(min-width:640px)_and_(min-height:620px)]:space-y-10 text-center"
                  variants={scaleIn}
                  initial="initial"
                  animate="animate"
                >
                  <h3 className="text-2xl [@media(min-width:640px)_and_(min-height:620px)]:text-5xl font-black tracking-tighter uppercase italic text-slice-text">
                    {t('connect-to-start', { defaultValue: 'Connect to Start' })}
                  </h3>
                  <p className="text-slice-text-muted font-bold uppercase text-[10px] sm:text-xs tracking-[0.35em] sm:tracking-[0.5em] opacity-60">
                    {t('auth-required', {
                      defaultValue: 'Authentication is required for leaderboard ranking',
                    })}
                  </p>
                  <div className="space-y-6">
                    <Button
                      className="w-full py-4 [@media(min-width:640px)_and_(min-height:620px)]:py-12 text-lg [@media(min-width:640px)_and_(min-height:620px)]:text-3xl font-black tracking-widest bg-blue-500 hover:bg-blue-400 text-white shadow-[15px_15px_30px_rgba(59,130,246,0.4),-15px_-15px_30px_var(--slice-shadow-light)] rounded-[2.5rem] transition-colors transform hover:scale-[1.03] active:scale-95 uppercase"
                      onClick={() => navigate({ to: '/login', search: { callbackURL: undefined } })}
                    >
                      {t('log-in', { defaultValue: 'Log In' })}
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}

            {/* The stage: library, daily challenge (S1), or setlists/courses
                (S8/S2). One at a time — each is a different mode, not a filter
                over the same list. */}
            {/* Cross-faded, and `mode="wait"` so the outgoing mode is gone
                before the next one measures itself — overlapping two full-height
                stages in the same box makes the incoming one lay out against a
                container that is still twice as tall, which lands as a jump on
                the frame the old one unmounts. A fade rather than a slide: these
                three are peers, not a stack with a direction. */}
            <div className="w-full flex flex-col overflow-hidden">
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
                         control that commits. The lobby keeps its own meaning for
                         `onSelect` (nominate this song), which is why this is
                         decided here and not inside `SongLibrary`. */
                      onSelect={handleSelectSong}
                      onHighlight={handleSelectSong}
                      selectedSongId={selectedSong?.id ?? null}
                      onStopPreviewRef={stopPreviewRef}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Sidebar - Song Details */}
            {/* The details sidebar slides; it used to appear and vanish.
                `duration-300` was on the panel with no `transition-*` property
                to drive and no exit path at all — `{selectedSong && …}` unmounts
                synchronously, so a close is a hard cut however the panel is
                styled. `AnimatePresence` is what gives the exit somewhere to
                happen, and it keeps rendering the OUTGOING element, so the panel
                still has its song on the way out even though state is already
                null. A spring, not a duration: this is a surface that travels.
                The global `MotionConfig reducedMotion="user"` already collapses
                both to an instant swap for anyone who asks. */}
            {/* Two KEYED siblings, not a fragment.
                `AnimatePresence` tracks its direct children by key; a bare `<>`
                is one untracked child, so the backdrop and the panel were not
                individually presence-managed and the pair flashed on open —
                the fade would start, then snap as the group re-rendered. An
                array of keyed motion elements is the shape it actually
                supports. */}
            <AnimatePresence>
              {selectedSong && [
                <motion.button
                  key="song-details-backdrop"
                  type="button"
                  className="absolute inset-0 bg-black/20 z-65"
                  onClick={() => setSelectedSong(null)}
                  aria-label={t('close-song-details', { defaultValue: 'Close song details' })}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: DURATION.base, ease: EASE.standard }}
                />,
                <motion.div
                  key="song-details-panel"
                  className="absolute top-0 right-0 bottom-0 w-full sm:max-w-2xl bg-slice-bg shadow-2xl z-70 flex flex-col overflow-hidden"
                  initial={{ x: '100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '100%' }}
                  transition={APPLE_SPRING.smooth}
                >
                  {/* Sidebar Header */}
                  <div className="flex items-center justify-between p-4 border-b border-slice-shadow-dark/50 bg-slice-shadow-dark/20">
                    <h2 className="text-lg font-black text-slice-text">
                      {t('song-details', { defaultValue: 'Song Details' })}
                    </h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slice-text-muted hover:text-slice-text hover:bg-slice-shadow-dark rounded-lg"
                      onClick={() => setSelectedSong(null)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </Button>
                  </div>

                  {/* Sidebar Content */}
                  <div className="flex-1 overflow-y-auto">
                    <SongDetailsPanel
                      song={selectedSong}
                      onPlay={handleStartGame}
                      onSongUpdated={(updates) =>
                        setSelectedSong((current) =>
                          current ? { ...current, ...updates } : current,
                        )
                      }
                    />
                  </div>
                </motion.div>,
              ]}
            </AnimatePresence>
          </div>
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

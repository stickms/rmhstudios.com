'use client';
import * as React from 'react';
import { motion } from 'framer-motion';
import { scaleIn } from '@/lib/motion';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { CalendarDays, ListMusic, Moon, Sun } from 'lucide-react';
import { useSliceItStore } from '@/lib/slice-it/store';
import { GameEngine } from '@/lib/slice-it/engine';
import { asset } from '@/lib/storage/asset';
import { Slider } from '@/components/ui/slider';
import {
  HIT_WINDOWS,
  JUDGEMENT_COLORS,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
} from '@/lib/slice-it/constants';
import { timingScale } from '@/lib/slice-it/scoring';
import { AudioManager } from '@/lib/audio/AudioManager';
import { addMatchListener } from '@/lib/slice-it/net/client';
import { useStartRun } from '@/lib/slice-it/useStartRun';
import type { SliceSong } from '@/lib/slice-it/types';
import { authClient } from '@/lib/auth-client';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { SongLibrary } from '@/components/slice-it/SongLibrary';
import { CalibrationScreen } from '@/components/slice-it/CalibrationScreen';
import { MultiplayerLobby } from '@/components/slice-it/MultiplayerLobby';
import { SongDetailsPanel } from '@/components/slice-it/SongDetailsPanel';
import { DailyPanel } from '@/components/slice-it/modes/DailyPanel';
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

const formatBind = (bind: string) =>
  bind
    .replace('Mouse0', 'LMB')
    .replace('Mouse1', 'MMB')
    .replace('Mouse2', 'RMB')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('Key', '')
    .replace('Arrow', '');

const KeybindInput = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) => {
  const { t } = useTranslation('c-game');
  const [listening, setListening] = React.useState(false);
  const justAssigned = React.useRef(false);

  React.useEffect(() => {
    if (!listening) return;

    const handleKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== 'Escape') onChange(e.code);
      setListening(false);
      justAssigned.current = true;
      setTimeout(() => (justAssigned.current = false), 100);
    };

    const handleMouseDown = (e: MouseEvent) => {
      e.preventDefault();
      onChange(`Mouse${e.button}`);
      setListening(false);
      justAssigned.current = true;
      setTimeout(() => (justAssigned.current = false), 100);
    };

    const suppressContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('contextmenu', suppressContextMenu);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('contextmenu', suppressContextMenu);
    };
  }, [listening, onChange]);

  return (
    <div className="flex justify-between items-center bg-slice-bg p-3 rounded-xl shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]">
      <span className="text-xs text-slice-text-muted uppercase font-bold">{label}</span>
      <Button
        variant="ghost"
        size="sm"
        className={`font-mono text-xs w-32 rounded-lg ${listening ? 'bg-blue-500/20 text-blue-400' : 'bg-slice-bg shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] text-slice-text-darker'}`}
        onClick={() => {
          if (justAssigned.current) return;
          setListening(true);
        }}
      >
        {listening ? t('press-key-btn', { defaultValue: 'PRESS KEY/BTN...' }) : formatBind(value)}
      </Button>
    </div>
  );
};

/**
 * A settings row that is a single on/off decision.
 *
 * Neumorphic depth rule (chart-editor doc §12.1): the container is inset, the
 * thing you can press is raised — and pressed-in when it is on, so the state is
 * legible from the shadow rather than from a colour alone.
 */
const ToggleRow = ({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) => (
  <button
    type="button"
    aria-pressed={value}
    onClick={() => onChange(!value)}
    className={`w-full flex items-center justify-between gap-4 text-left p-4 rounded-2xl bg-slice-bg transition-shadow ${
      value
        ? 'shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)]'
        : 'shadow-[4px_4px_10px_var(--slice-shadow-dark),-4px_-4px_10px_var(--slice-shadow-light)]'
    }`}
  >
    <span className="min-w-0">
      <span className="block text-sm font-black text-slice-text-darker">{label}</span>
      <span className="block text-[10px] text-slice-text-light font-bold leading-snug mt-0.5">
        {description}
      </span>
    </span>
    <span
      className={`shrink-0 text-[10px] font-black uppercase tracking-[0.2em] ${
        value ? 'text-blue-500' : 'text-slice-text-light'
      }`}
    >
      {value ? 'ON' : 'OFF'}
    </span>
  </button>
);

/**
 * A settings row that picks one of several options — the segmented-choice
 * sibling of `ToggleRow` above. Independent `aria-pressed` buttons, not a tab
 * strip: no tablist role, no selected-state ARIA attribute, because there is
 * no shared panel being switched, only N buttons where turning one on means
 * the others are understood to be off.
 */
const ChoiceRow = <T extends string>({
  label,
  description,
  value,
  options,
  onChange,
}: {
  label: string;
  description: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
}) => (
  <div className="space-y-2">
    <span className="block text-sm font-black text-slice-text-darker">{label}</span>
    <span className="block text-[10px] text-slice-text-light font-bold leading-snug">
      {description}
    </span>
    <div className="flex flex-wrap gap-2" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-shadow ${
            value === opt.id
              ? 'bg-blue-500 text-white shadow-[inset_3px_3px_6px_rgba(0,0,0,0.25)]'
              : 'bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)]'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

export function MainMenu({ engine: propEngine }: MainMenuProps) {
  const { t } = useTranslation('c-game');
  const { t: ts } = useTranslation('r-slice-it');
  const { setUserName, userName, keybinds, setKeybinds, volume, setVolume, hitSound, setHitSound } =
    useSliceItStore();
  const modifiers = useSliceItStore((state) => state.modifiers);
  const setModifiers = useSliceItStore((state) => state.setModifiers);
  const quantColors = useSliceItStore((state) => state.quantColors);
  const setQuantColors = useSliceItStore((state) => state.setQuantColors);
  const mirror = useSliceItStore((state) => state.mirror);
  const setMirror = useSliceItStore((state) => state.setMirror);
  const scrollSpeed = useSliceItStore((state) => state.scrollSpeed);
  const setScrollSpeed = useSliceItStore((state) => state.setScrollSpeed);
  const scrollMode = useSliceItStore((state) => state.scrollMode);
  const setScrollMode = useSliceItStore((state) => state.setScrollMode);
  const visibilityMode = useSliceItStore((state) => state.visibilityMode);
  const setVisibilityMode = useSliceItStore((state) => state.setVisibilityMode);
  const setSongId = useSliceItStore((state) => state.setSongId);
  const setIsMultiplayer = useSliceItStore((state) => state.setIsMultiplayer);
  const isDarkMode = useSliceItStore((state) => state.isDarkMode);
  const setIsDarkMode = useSliceItStore((state) => state.setIsDarkMode);
  const engine = propEngine;
  const session = authClient.useSession();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as Record<string, string | undefined>;
  const { startRun, isLoading } = useStartRun(engine);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showCalibration, setShowCalibration] = React.useState(false);
  const [showMultiplayer, setShowMultiplayer] = React.useState(false);
  const [soloMode, setSoloMode] = React.useState<SoloMode>('library');
  const [previewingSound, setPreviewingSound] = React.useState<string | null>(null);
  const [loadingSound, setLoadingSound] = React.useState<string | null>(null);

  // Available hit sounds
  const hitSoundOptions = React.useMemo(
    () => [
      { id: 'default', label: 'Default (Synth)', category: 'System' },
      { id: 'drum-hitclap.wav', label: 'Hit Clap', category: 'Drums' },
      { id: 'drum-hitfinish.wav', label: 'Hit Finish', category: 'Drums' },
      { id: 'drum-hitwhistle.wav', label: 'Hit Whistle', category: 'Drums' },
      { id: 'soft-hitfinish.wav', label: 'Soft Finish', category: 'Drums' },
      { id: 'soft-hitwhistle.wav', label: 'Soft Whistle', category: 'Drums' },
      { id: 'all purpose clap.wav', label: 'All Purpose Clap', category: 'Drums' },
      { id: 'snare_a.wav', label: 'Snare A', category: 'Snares' },
      { id: 'snare_b.wav', label: 'Snare B', category: 'Snares' },
      { id: 'snare_c.wav', label: 'Snare C', category: 'Snares' },
      { id: 'snare_electronic_a.wav', label: 'E-Snare A', category: 'Snares' },
      { id: 'snare_electronic_b.wav', label: 'E-Snare B', category: 'Snares' },
      { id: 'snare_electronic_c.wav', label: 'E-Snare C', category: 'Snares' },
      { id: 'kick_a.wav', label: 'Kick A', category: 'Kicks' },
      { id: 'kick_b.wav', label: 'Kick B', category: 'Kicks' },
      { id: 'kick_c.wav', label: 'Kick C', category: 'Kicks' },
      { id: 'kick_electronic_a.wav', label: 'E-Kick A', category: 'Kicks' },
      { id: 'kick_electronic_b.wav', label: 'E-Kick B', category: 'Kicks' },
      { id: 'kick_electronic_c.wav', label: 'E-Kick C', category: 'Kicks' },
      { id: 'cymbal_a.wav', label: 'Cymbal A', category: 'Cymbals' },
      { id: 'cymbal_b.wav', label: 'Cymbal B', category: 'Cymbals' },
      { id: 'cymbal_c.wav', label: 'Cymbal C', category: 'Cymbals' },
      { id: 'tick.wav', label: 'Tick', category: 'Clock' },
      { id: 'tock.wav', label: 'Tock', category: 'Clock' },
    ],
    [],
  );

  const previewHitSound = React.useCallback(async (soundId: string) => {
    const am = AudioManager.getInstance();
    am.initialize();
    const sfxVol = useSliceItStore.getState().sfxVolume / 100;
    if (soundId === 'default') {
      setPreviewingSound(soundId);
      am.playSfX(880, 'triangle', 0.1, sfxVol);
      setTimeout(() => setPreviewingSound(null), 300);
    } else {
      const url = asset(`/music/slice-it/sounds/${soundId}`);
      if (!am.isHitSoundCached(url)) {
        setLoadingSound(soundId);
        try {
          await am.preloadHitSound(url);
        } catch {
          setLoadingSound(null);
          return;
        }
        setLoadingSound(null);
      }
      setPreviewingSound(soundId);
      am.playHitSoundFile(url, sfxVol);
      setTimeout(() => setPreviewingSound(null), 300);
    }
  }, []);

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

  /**
   * Open a track's details panel.
   *
   * Used to fetch and *fully decode* the audio just to show a sidebar —
   * several megabytes and a synchronous decode to render a title, a cover and
   * a leaderboard. The panel fetches what it needs itself.
   */
  const handleSelectSong = React.useCallback((song: SliceSong) => {
    stopPreviewRef.current?.();
    setSelectedSong(song);
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

  const handleVolumeChange = (vals: number[]) => {
    const v = vals[0];
    setVolume(v);
    // useEffect will update AudioManager
  };

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
          {(isLoading || session.isPending) && (
            <div className="absolute inset-0 z-70 bg-slice-bg/80 flex items-center justify-center flex-col gap-4">
              <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div className="text-blue-500 font-extrabold animate-pulse uppercase tracking-widest">
                {session.isPending
                  ? t('validating-session', { defaultValue: 'Validating Session' })
                  : t('initializing-track', { defaultValue: 'Initializing Track' })}
              </div>
            </div>
          )}

          {/* Header Bar */}
          <div className="flex items-center justify-between shrink-0 bg-slice-bg px-4 py-3 border-b border-slice-shadow-dark/50">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 rounded-full bg-slice-shadow-dark shadow-inner flex items-center justify-center text-slice-text-muted font-black text-xl">
                {userName ? userName.charAt(0).toUpperCase() : '?'}
              </div>
              {/* Hidden below `sm`, not truncated. Truncating kept the name in
                  the layout while the five buttons opposite squeezed it to 24px
                  — one letter and an ellipsis, directly beside an avatar
                  already showing that same letter. The name is not a control
                  and repeating one glyph is not information, so on a phone the
                  avatar carries identity alone and the row's width goes to the
                  buttons that need it. `min-w-0` + truncate still hold from
                  `sm` up, where a long display name would otherwise push those
                  buttons off the right edge. */}
              <div className="hidden sm:flex flex-col min-w-0">
                <span className="text-[10px] font-black text-slice-text-light uppercase tracking-wider">
                  {t('system-operator', { defaultValue: 'System Operator' })}
                </span>
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
                <CalendarDays className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">
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
                <ListMusic className="w-4 h-4 sm:mr-1.5" />
                <span className="hidden sm:inline">
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
                  className="mr-1.5"
                >
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <span className="hidden sm:inline">
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
            {!session.data && !session.isPending && (
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
            <div className="w-full flex flex-col overflow-hidden">
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
                  onSelect={handleStartGame}
                  onHighlight={handleSelectSong}
                  selectedSongId={selectedSong?.id ?? null}
                  onStopPreviewRef={stopPreviewRef}
                />
              )}
            </div>

            {/* Sidebar - Song Details */}
            {selectedSong && (
              <>
                {/* Backdrop */}
                <button
                  type="button"
                  className="absolute inset-0 bg-black/20 z-65"
                  onClick={() => setSelectedSong(null)}
                  aria-label={t('close-song-details', { defaultValue: 'Close song details' })}
                />

                {/* Sidebar Panel */}
                <div className="absolute top-0 right-0 bottom-0 w-full sm:max-w-2xl bg-slice-bg shadow-2xl z-70 duration-300 flex flex-col overflow-hidden">
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
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Settings Overlay remains as a full-screen drawer */}
      {showSettings && (
        <div className="absolute inset-0 z-80 bg-slice-bg p-5 sm:p-12 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between mb-5 sm:mb-12">
            <h2 className="text-2xl sm:text-5xl font-black text-slice-text tracking-tighter uppercase italic">
              {t('system-configuration', { defaultValue: 'System Configuration' })}
            </h2>
            <Button
              variant="ghost"
              className="bg-slice-bg shadow-[5px_5px_12px_var(--slice-shadow-dark),-5px_-5px_12px_var(--slice-shadow-light)] active:shadow-inner text-slice-text-muted hover:text-slice-text font-black uppercase tracking-[0.2em] px-5 sm:px-10 h-10 sm:h-16 rounded-2xl text-sm"
              onClick={() => setShowSettings(false)}
            >
              {t('close', { defaultValue: 'CLOSE' })}
            </Button>
          </div>

          <div className="max-w-3xl mx-auto w-full space-y-8 sm:space-y-12">
            {/* Settings content ... */}
            <div className="space-y-4">
              <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                {t('authorized-operator', { defaultValue: 'Authorized Operator' })}
              </label>
              <input
                type="text"
                className="w-full bg-slice-bg shadow-[inset_4px_4px_8px_var(--slice-shadow-dark),inset_-4px_-4px_8px_var(--slice-shadow-light)] rounded-2xl p-6 text-xl font-bold text-slice-text focus:outline-none transition-shadow"
                placeholder={t('enter-name', { defaultValue: 'Enter name' })}
                maxLength={32}
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
              <div className="space-y-4">
                <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                  {t('audio-output-level', { defaultValue: 'Audio Output Level' })}
                </label>
                <div className="bg-slice-bg p-8 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] space-y-6">
                  <div className="flex justify-between text-sm font-black text-slice-text-darker">
                    <span>{t('master', { defaultValue: 'Master' })}</span>
                    <span className="text-blue-500 font-mono">{volume}%</span>
                  </div>
                  <Slider value={[volume]} max={100} step={1} onValueChange={handleVolumeChange} />

                  <div className="flex justify-between text-sm font-black text-slice-text-darker pt-4">
                    <span>{t('effects', { defaultValue: 'Effects' })}</span>
                    <span className="text-blue-500 font-mono">
                      {useSliceItStore.getState().sfxVolume}%
                    </span>
                  </div>
                  <Slider
                    value={[useSliceItStore.getState().sfxVolume]}
                    max={100}
                    step={1}
                    onValueChange={(vals) => useSliceItStore.getState().setSfxVolume(vals[0])}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                  {t('input-mapping', { defaultValue: 'Input Mapping' })}
                </label>
                <div className="space-y-4">
                  <KeybindInput
                    label={t('lane-a', { defaultValue: 'Lane A' })}
                    value={keybinds.lane1}
                    onChange={(k) => setKeybinds({ ...keybinds, lane1: k })}
                  />
                  <KeybindInput
                    label={t('lane-b', { defaultValue: 'Lane B' })}
                    value={keybinds.lane2}
                    onChange={(k) => setKeybinds({ ...keybinds, lane2: k })}
                  />
                </div>

                <div className="pt-4">
                  <Button
                    className="w-full h-16 bg-slice-bg text-slice-text-darker shadow-[8px_8px_16px_var(--slice-shadow-dark),-8px_-8px_16px_var(--slice-shadow-light)] active:shadow-inner rounded-2xl font-black text-sm tracking-widest uppercase transition"
                    onClick={() => setShowCalibration(true)}
                  >
                    {t('calibrate-synchronization', { defaultValue: 'Calibrate Synchronization' })}
                  </Button>
                  <div className="text-center text-[10px] text-slice-text-light font-mono mt-3 uppercase tracking-[0.2em]">
                    Offset: {useSliceItStore.getState().audioOffset}ms
                  </div>
                </div>
              </div>
            </div>

            {/* Gameplay toggles */}
            <div className="space-y-4">
              <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                {ts('gameplay', { defaultValue: 'Gameplay' })}
              </label>
              <div className="space-y-3">
                <ToggleRow
                  label={ts('health-gauge', { defaultValue: 'Health Gauge' })}
                  description={ts('health-gauge-hint', {
                    defaultValue:
                      'Misses drain a gauge. Solo, emptying it ends the run; in a match it only costs the bonus. Worth a score multiplier.',
                  })}
                  value={modifiers.healthGauge}
                  onChange={(next) => setModifiers({ ...modifiers, healthGauge: next })}
                />
                <ToggleRow
                  label={ts('quant-colors', { defaultValue: 'Rhythm Colours' })}
                  description={ts('quant-colors-hint', {
                    defaultValue:
                      'Colour notes by where they land in the beat — red on the beat, blue on eighths, purple on triplets, yellow on sixteenths.',
                  })}
                  value={quantColors}
                  onChange={setQuantColors}
                />
                <ToggleRow
                  label={ts('mod-mirror', { defaultValue: 'Mirror' })}
                  description={ts('mod-mirror-hint', {
                    defaultValue:
                      'Swap every lane. Not harder, so it earns no score bonus — it just turns every chart into a second chart to practise on.',
                  })}
                  value={mirror}
                  onChange={setMirror}
                />
                {/* M6 — same family as Health Gauge above: a fail condition the
                    player opts into, not a thing that happens to them. */}
                <ToggleRow
                  label={ts('mod-perfectionist', { defaultValue: 'Perfectionist' })}
                  description={ts('mod-perfectionist-hint', {
                    defaultValue:
                      'Anything short of PERFECT ends the run — not just a MISS. Same family as Sudden Death, and mutually exclusive with it: turning this on turns that off. The biggest score bonus in the game.',
                  })}
                  value={!!modifiers.perfectionist}
                  onChange={(next) => setModifiers({ ...modifiers, perfectionist: next })}
                />
              </div>
            </div>

            {/* A9 — Lenient Timing and the windows it produces. Kept as its own
                section rather than folded into Gameplay: the whole point is to
                make the abstraction visible, and a toggle sitting right above
                the numbers it changes is what makes that legible. */}
            <div className="space-y-4">
              <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                {ts('timing-windows', { defaultValue: 'Judgement Windows' })}
              </label>
              <div className="space-y-3">
                <ToggleRow
                  label={ts('mod-lenient-timing', { defaultValue: 'Lenient Timing' })}
                  description={ts('mod-lenient-timing-hint', {
                    defaultValue:
                      'Widens every window instead of shrinking it — the mirror of Strict Timing. Unranked: a run played on wider windows is not comparable to one played on the stock ones, not because it is any less real.',
                  })}
                  value={!!modifiers.lenientTiming}
                  onChange={(next) => setModifiers({ ...modifiers, lenientTiming: next })}
                />
                <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]">
                  <div className="text-[10px] text-slice-text-light font-bold leading-snug mb-3">
                    {ts('timing-windows-hint', {
                      defaultValue:
                        'The actual size of each window right now, at this speed and these modifiers.',
                    })}
                  </div>
                  <dl className="space-y-1.5">
                    {Object.entries(HIT_WINDOWS).map(([name, seconds]) => (
                      <div key={name} className="flex items-center justify-between gap-3">
                        <dt
                          className="text-[10px] font-black uppercase tracking-wider"
                          style={{ color: JUDGEMENT_COLORS[name as keyof typeof JUDGEMENT_COLORS] }}
                        >
                          {name}
                        </dt>
                        <dd className="font-mono text-xs font-bold text-slice-text-darker tabular-nums">
                          ±{Math.round(seconds * timingScale(modifiers) * 1000)} ms
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            </div>

            {/* Scroll Speed (G9) */}
            <div className="space-y-4">
              <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                {ts('scroll-speed', { defaultValue: 'Scroll Speed' })}
              </label>
              <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)] space-y-5">
                <ChoiceRow
                  label={ts('scroll-speed-mode', { defaultValue: 'Mode' })}
                  description={ts('scroll-speed-mode-hint', {
                    defaultValue:
                      "Constant keeps the same pace on every song. BPM-locked scales the pace with each song's tempo, so beat spacing looks the same everywhere.",
                  })}
                  value={scrollMode}
                  options={[
                    {
                      id: 'constant' as const,
                      label: ts('scroll-speed-mode-constant', { defaultValue: 'Constant' }),
                    },
                    {
                      id: 'bpm' as const,
                      label: ts('scroll-speed-mode-bpm', { defaultValue: 'BPM-Locked' }),
                    },
                  ]}
                  onChange={setScrollMode}
                />
                <div>
                  <div className="flex justify-between text-sm font-black text-slice-text-darker">
                    <span>{ts('scroll-speed-value', { defaultValue: 'Speed' })}</span>
                    <span className="text-blue-500 font-mono">x{scrollSpeed.toFixed(1)}</span>
                  </div>
                  <Slider
                    value={[scrollSpeed]}
                    min={MIN_SCROLL_SPEED}
                    max={MAX_SCROLL_SPEED}
                    step={0.1}
                    onValueChange={(vals) => setScrollSpeed(vals[0])}
                    className="mt-3"
                  />
                </div>
              </div>
            </div>

            {/* Visibility (M3) — only meaningful while Invisible is on; the
                toggle itself lives in the per-song modifier picker. */}
            {modifiers.invisible && (
              <div className="space-y-4">
                <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                  {ts('visibility-mode', { defaultValue: 'Visibility' })}
                </label>
                <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]">
                  <ChoiceRow
                    label={ts('visibility-mode-label', { defaultValue: 'Effect' })}
                    description={ts('visibility-mode-hint', {
                      defaultValue:
                        'Which way the Invisible modifier hides notes. Lane Cover is tuned live from the in-run pause menu, where the reaction window is shown in milliseconds.',
                    })}
                    value={visibilityMode}
                    options={[
                      {
                        id: 'fadeOut' as const,
                        label: ts('visibility-mode-fadeout', { defaultValue: 'Fade Out' }),
                      },
                      {
                        id: 'fadeIn' as const,
                        label: ts('visibility-mode-fadein', { defaultValue: 'Fade In' }),
                      },
                      {
                        id: 'flashlight' as const,
                        label: ts('visibility-mode-flashlight', { defaultValue: 'Flashlight' }),
                      },
                      {
                        id: 'laneCover' as const,
                        label: ts('visibility-mode-lanecover', { defaultValue: 'Lane Cover' }),
                      },
                    ]}
                    onChange={setVisibilityMode}
                  />
                </div>
              </div>
            )}

            {/* Hit Sound Selector */}
            <div className="space-y-4">
              <label className="text-[10px] text-slice-text-light uppercase tracking-[0.4em] font-black ml-4">
                {t('hit-sound-effect', { defaultValue: 'Hit Sound Effect' })}
              </label>
              <div className="bg-slice-bg p-6 rounded-3xl shadow-[inset_5px_5px_10px_var(--slice-shadow-dark),inset_-5px_-5px_10px_var(--slice-shadow-light)]">
                {(() => {
                  const categories = [...new Set(hitSoundOptions.map((s) => s.category))];
                  return categories.map((category) => (
                    <div key={category} className="mb-4 last:mb-0">
                      <div className="text-[9px] text-slice-text-light uppercase tracking-[0.3em] font-black mb-2 ml-1">
                        {category}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {hitSoundOptions
                          .filter((s) => s.category === category)
                          .map((sound) => (
                            <button
                              key={sound.id}
                              className={`group relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                                hitSound === sound.id
                                  ? 'bg-blue-500 text-white shadow-[3px_3px_8px_rgba(59,130,246,0.4),-3px_-3px_8px_var(--slice-shadow-light)]'
                                  : 'bg-slice-bg text-slice-text-darker shadow-[3px_3px_6px_var(--slice-shadow-dark),-3px_-3px_6px_var(--slice-shadow-light)] hover:shadow-[1px_1px_3px_var(--slice-shadow-dark),-1px_-1px_3px_var(--slice-shadow-light)] active:shadow-[inset_3px_3px_6px_var(--slice-shadow-dark),inset_-3px_-3px_6px_var(--slice-shadow-light)]'
                              }`}
                              onClick={() => {
                                setHitSound(sound.id);
                                previewHitSound(sound.id);
                              }}
                            >
                              <span className="truncate flex-1 text-left">{sound.label}</span>
                              <span
                                className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-lg transition-transform ${
                                  previewingSound === sound.id ? 'scale-110' : ''
                                } ${
                                  hitSound === sound.id
                                    ? 'bg-blue-400/40 text-white'
                                    : 'bg-slice-shadow-dark/60 text-slice-text-light group-hover:text-slice-text-darker'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  previewHitSound(sound.id);
                                }}
                              >
                                {loadingSound === sound.id ? (
                                  <svg
                                    className="animate-spin"
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                  >
                                    <circle cx="12" cy="12" r="10" opacity="0.25" />
                                    <path d="M12 2a10 10 0 0 1 10 10" opacity="0.75" />
                                  </svg>
                                ) : (
                                  <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                  >
                                    <polygon points="5 3 19 12 5 21 5 3" />
                                  </svg>
                                )}
                              </span>
                            </button>
                          ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

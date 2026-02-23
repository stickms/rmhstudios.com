/**
 * RMHboxHeader — Shared header across all RMHbox pages.
 *
 * Adapts its content based on the current context:
 * - Landing page: "← Games" back link (left), "RMHbox" title (center), connection status (right)
 * - Lobby: Settings + Host Controls circles (left), "RMHbox" title (center), connection status (right)
 * - In-game: Settings + Host Controls circles (left), minigame title (center), timer + status icon (right)
 *
 * The timer ring reads its state from the centralized `timerInfo` store field,
 * so it works across all timed phases (instructions, countdown, playing, results).
 * A TIMER_START action sets the total duration for the full circle animation;
 * TIMER_TICK actions decrement the remaining time each second.
 *
 * The title is absolutely centered to the screen width regardless of side content.
 */
'use client';

import { useCallback } from 'react';
import { Circle } from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import SettingsMenu from './SettingsMenu';
import HostControlModal from './HostControlModal';

/** SVG ring for the countdown timer (compact for header). Depletes clockwise. */
function TimerRing({ seconds, total, paused }: { seconds: number; total: number; paused: boolean }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, seconds) / (total || 1);
  const offset = circumference * (1 - ratio);

  return (
    <div className="relative flex items-center justify-center">
      <svg
        width="40"
        height="40"
        style={{ transform: 'rotate(-90deg) scaleX(-1)' }}
      >
        <circle
          cx="20" cy="20" r={radius}
          fill="none"
          stroke="var(--rmhbox-border)"
          strokeWidth="2.5"
        />
        <circle
          cx="20" cy="20" r={radius}
          fill="none"
          stroke={paused ? 'var(--rmhbox-warning)' : seconds <= 10 ? 'var(--rmhbox-danger)' : 'var(--rmhbox-accent)'}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={paused ? '' : 'transition-[stroke-dashoffset] duration-1000 ease-linear'}
        />
      </svg>
      <span className={`absolute text-xs font-bold text-(--rmhbox-text) ${paused ? 'animate-pulse' : ''}`}>
        {Math.ceil(seconds)}
      </span>
    </div>
  );
}

interface RMHboxHeaderProps {
  /** 'landing' | 'lobby' | 'game' — controls layout behavior */
  context?: 'landing' | 'lobby' | 'game';
  /** Override the center title (e.g. minigame name) */
  title?: string;
}

export default function RMHboxHeader({
  context = 'landing',
  title,
}: RMHboxHeaderProps) {
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const theme = useRMHboxStore((s) => s.settings.theme) ?? 'dark';
  const updateSettings = useRMHboxStore((s) => s.updateSettings);
  const timerInfo = useRMHboxStore((s) => s.timerInfo);

  const handleToggleTheme = useCallback(() => {
    updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, updateSettings]);

  const isGame = context === 'game';
  const isLanding = context === 'landing';
  const showTimer = timerInfo !== null;

  const displayTitle = title ?? 'RMHbox';

  const statusIcon =
    connectionStatus === 'connected' ? <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500 inline-block" /> :
    connectionStatus === 'connecting' ? <Circle className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500 inline-block" /> :
    <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500 inline-block" />;

  const statusText =
    connectionStatus === 'connected' ? 'Connected' :
    connectionStatus === 'connecting' ? 'Connecting...' :
    connectionStatus === 'disconnected' ? 'Disconnected' :
    'Error';

  return (
    <header className="relative flex shrink-0 items-center border-b border-(--rmhbox-border) bg-(--rmhbox-bg)/90 px-3 py-3 h-16 backdrop-blur-sm">
      {/* Left side */}
      <div className="flex items-center gap-2 z-10">
        {isLanding ? (
          <a
            href="/games"
            className="text-sm font-medium text-(--rmhbox-text-muted) hover:text-(--rmhbox-accent) transition-colors"
          >
            ← Games
          </a>
        ) : (
          <>
            <SettingsMenu theme={theme} onToggleTheme={handleToggleTheme} />
            <HostControlModal />
          </>
        )}
      </div>

      {/* Center title — absolutely positioned for true centering */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-visible">
        <h1
          className="text-4xl font-bold leading-tight text-(--rmhbox-accent) truncate px-24"
          style={{ fontFamily: 'var(--rmhbox-font-display)' }}
        >
          {displayTitle}
        </h1>
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2 z-10">
        <span className="flex items-center gap-1.5 text-sm text-(--rmhbox-text-muted)" title={statusText}>
          {statusIcon}
          {!isGame && !showTimer && <span className="hidden sm:inline">{statusText}</span>}
        </span>
        {showTimer && (
          <TimerRing seconds={timerInfo.remaining} total={timerInfo.total} paused={timerInfo.paused} />
        )}
      </div>
    </header>
  );
}

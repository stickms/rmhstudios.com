/**
 * RMHboxHeader — Shared header across all RMHbox pages.
 *
 * Adapts its content based on the current context:
 * - Landing page: "← Games" back link (left), "RMHbox" title (center), connection status (right)
 * - Lobby: Settings + Host Controls circles (left), "RMHbox" title (center), connection status (right)
 * - In-game: Settings + Host Controls circles (left), minigame title (center), timer + status icon (right)
 *
 * The title is absolutely centered to the screen width regardless of side content.
 */
'use client';

import { useRef, useCallback } from 'react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import SettingsMenu from './SettingsMenu';
import HostControlModal from './HostControlModal';

/** SVG ring for the countdown timer (compact for header). Depletes clockwise. */
function TimerRing({ seconds, total }: { seconds: number; total: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, seconds) / (total || 60);
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
          stroke={seconds <= 10 ? 'var(--rmhbox-danger)' : 'var(--rmhbox-accent)'}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <span className="absolute text-xs font-bold text-(--rmhbox-text)">
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
  /** Game timer info */
  timeRemaining?: number | null;
  totalDuration?: number;
}

export default function RMHboxHeader({
  context = 'landing',
  title,
  timeRemaining,
  totalDuration = 60,
}: RMHboxHeaderProps) {
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const theme = useRMHboxStore((s) => s.settings.theme) ?? 'dark';
  const updateSettings = useRMHboxStore((s) => s.updateSettings);

  const handleToggleTheme = useCallback(() => {
    updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, updateSettings]);

  const isGame = context === 'game';
  const isLanding = context === 'landing';

  // Cache last valid timer values to prevent flickering
  const lastTimeRef = useRef<number>(totalDuration);
  const lastTotalRef = useRef<number>(totalDuration);
  if (typeof timeRemaining === 'number' && timeRemaining >= 0) {
    lastTimeRef.current = timeRemaining;
  }
  if (totalDuration > 0) {
    lastTotalRef.current = totalDuration;
  }

  const displayTitle = title ?? 'RMHbox';

  const statusIcon =
    connectionStatus === 'connected' ? '🟢' :
    connectionStatus === 'connecting' ? '🟡' :
    '🔴';

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
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <h1
          className="text-4xl font-bold text-(--rmhbox-accent) truncate px-24"
          style={{ fontFamily: 'var(--rmhbox-font-display)' }}
        >
          {displayTitle}
        </h1>
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-2 z-10">
        <span className="text-sm text-(--rmhbox-text-muted)" title={statusText}>
          {isGame ? statusIcon : `${statusIcon} ${statusText}`}
        </span>
        {isGame && (
          <TimerRing seconds={lastTimeRef.current} total={lastTotalRef.current} />
        )}
      </div>
    </header>
  );
}

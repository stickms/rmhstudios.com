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
 * Infinite timers (totalDuration === -1) show a full ring with an ∞ icon.
 * The host can click the timer to pause/unpause; on hover a pause/play icon appears.
 *
 * The title is absolutely centered to the screen width regardless of side content.
 */
'use client';

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Circle, Infinity as InfinityIcon, Pause, Play } from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';
import SettingsMenu from './SettingsMenu';
import HostControlModal from './HostControlModal';

/** SVG ring for the countdown timer (compact for header). Depletes clockwise. */
function TimerRing({
  seconds,
  total,
  paused,
  infinite,
  isHost,
  lobbyId,
}: {
  seconds: number;
  total: number;
  paused: boolean;
  infinite: boolean;
  isHost: boolean;
  lobbyId: string | null;
}) {
  const [hovered, setHovered] = useState(false);

  const totalRadius = 20; // SVG viewBox is 40x40, so radius is half minus stroke width
  const strokeWidth = 4;

  const radius = totalRadius - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;

  // Infinite → full ring; otherwise deplete as normal
  const ratio = infinite ? 1 : Math.max(0, seconds) / (total || 1);
  const offset = circumference * (1 - ratio);

  // Color: paused → warning (yellow), ≤10s → danger, infinite → accent, else → accent
  const strokeColor = paused
    ? 'var(--rmhbox-warning)'
    : !infinite && seconds <= 10
      ? 'var(--rmhbox-danger)'
      : 'var(--rmhbox-accent)';

  const handleClick = useCallback(() => {
    if (!isHost || !lobbyId || infinite) return;
    emit(C2S.GAME_PAUSE_TIMER, { lobbyId });
  }, [isHost, lobbyId, infinite]);

  const interactive = isHost && !infinite;

  return (
    <div
      className={`relative flex items-center justify-center ${interactive ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
      onMouseEnter={() => interactive && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg
        width="40"
        height="40"
        style={{ transform: 'rotate(-90deg) scaleX(-1)' }}
      >
        <circle
          cx="20" cy="20" r={radius}
          fill="none"
          stroke="var(--rmhbox-border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx="20" cy="20" r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={paused || infinite ? '' : 'transition-[stroke-dashoffset] duration-1000 ease-linear'}
        />
      </svg>
      {/* Center content: number or ∞, with pause/play overlay for host on hover */}
      <span className={`absolute flex items-center justify-center text-xs font-bold ${paused ? 'text-(--rmhbox-warning)' : 'text-(--rmhbox-text)'}`}>
        {/* Host hover: show pause/play icon replacing the number */}
        {interactive && hovered ? (
          paused
            ? <Play className="h-3.5 w-3.5 text-(--rmhbox-warning)" />
            : <Pause className="h-3.5 w-3.5 text-(--rmhbox-text-muted)" />
        ) : paused ? (
          /* Paused (not hovering): show Play icon instead of a stale number */
          interactive
            ? <Play className="h-3.5 w-3.5 text-(--rmhbox-warning)" />
            : <Pause className="h-3.5 w-3.5 text-(--rmhbox-warning)" />
        ) : infinite ? (
          <InfinityIcon className="h-4 w-4" />
        ) : (
          Math.max(0, Math.ceil(seconds))
        )}
      </span>
    </div>
  );
}

interface RMHboxHeaderProps {
  /** Controls layout behavior */
  context?: 'landing' | 'lobby' | 'game' | 'minigames' | 'history';
  /** Override the center title (e.g. minigame name) */
  title?: string;
  /** Override back link href (for minigames/history contexts) */
  backHref?: string;
  /** Override back link label */
  backLabel?: string;
}

export default function RMHboxHeader({
  context = 'landing',
  title,
  backHref,
  backLabel,
}: RMHboxHeaderProps) {
  const { t } = useTranslation("c-rmhbox");
  const connectionStatus = useRMHboxStore((s) => s.connectionStatus);
  const theme = useRMHboxStore((s) => s.settings.theme) ?? 'dark';
  const updateSettings = useRMHboxStore((s) => s.updateSettings);
  const timerInfo = useRMHboxStore((s) => s.timerInfo);
  const lobby = useRMHboxStore((s) => s.lobby);
  const navigate = useNavigate();

  const handleToggleTheme = useCallback(() => {
    updateSettings({ theme: theme === 'dark' ? 'light' : 'dark' });
  }, [theme, updateSettings]);

  const isGame = context === 'game';
  const isLanding = context === 'landing';
  const hasBackLink = isLanding || context === 'minigames' || context === 'history' || context === 'lobby';
  const showConnection = context !== 'minigames' && context !== 'history';
  const showTimer = timerInfo !== null;
  const isHost = !!(lobby && lobby.hostUserId === lobby.myUserId);

  const displayTitle = title ?? 'RMHbox';

  const statusIcon =
    connectionStatus === 'connected' ? <Circle className="h-2.5 w-2.5 fill-green-500 text-green-500 inline-block" /> :
    connectionStatus === 'connecting' ? <Circle className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500 inline-block" /> :
    <Circle className="h-2.5 w-2.5 fill-red-500 text-red-500 inline-block" />;

  const statusText =
    connectionStatus === 'connected' ? t("connected", { defaultValue: "Connected" }) :
    connectionStatus === 'connecting' ? t("connecting", { defaultValue: "Connecting..." }) :
    connectionStatus === 'disconnected' ? t("disconnected", { defaultValue: "Disconnected" }) :
    t("connection-error", { defaultValue: "Error" });

  return (
    <header className="relative flex shrink-0 items-center border-b border-(--rmhbox-border) bg-(--rmhbox-bg)/90 px-3 py-3 h-16 backdrop-blur-sm">
      {/* Left side */}
      <div className="flex items-center gap-2 z-10">
        {hasBackLink && (
          <Link
            to={backHref ?? '/rmhbox'}
            className="text-sm font-medium text-(--rmhbox-text-muted) hover:text-(--rmhbox-accent) transition-colors text-nowrap"
            // when in a lobby, the back link becomes a "Leave" action that also disconnects from the lobby
            onClick={(e) => {
              if (context === 'lobby') {
                e.preventDefault();
                if (!lobby) return;
                emit(C2S.LOBBY_LEAVE, { lobbyId: lobby.lobbyId });
                useRMHboxStore.getState().leaveLobby();
                navigate({ to: '/rmhbox' });
              }
            }}
          >
            <span className="flex items-center gap-1">
              <ArrowLeft size={16} />
              {backLabel ?? t("back", { defaultValue: "Back" })}
            </span>
          </Link>
        )}
        {showTimer && (
          <TimerRing
            seconds={timerInfo.remaining}
            total={timerInfo.total}
            paused={timerInfo.paused}
            infinite={timerInfo.infinite}
            isHost={isHost}
            lobbyId={lobby?.lobbyId ?? null}
          />
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
        {showConnection && (
          <span className="flex items-center gap-1.5 text-sm text-(--rmhbox-text-muted)" title={statusText}>
            {statusIcon}
            {!isGame && !showTimer && !hasBackLink && <span className="hidden sm:inline">{statusText}</span>}
          </span>
        )}
        <>
          <HostControlModal />
          <SettingsMenu theme={theme} onToggleTheme={handleToggleTheme} />
        </>
      </div>
    </header>
  );
}

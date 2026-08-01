/**
 * GameShell — Wrapper layout for all minigames.
 *
 * Flexible center area for game content (children).
 * Footer with score, round counter (centered), and player count.
 * Header is handled by RMHboxHeader in the parent page.
 *
 * The round counter displays:
 *   - Minigame sub-round info from `minigameRound` store field when set
 *     (e.g. "Round 2/3" for Rhyme Time's internal rounds)
 *   - Otherwise, the session-level `roundNumber` from the lobby
 *
 * When the timer has `showSkip` enabled and the user is the host, the centered
 * round counter is replaced with a pulsing "Next" button that emits
 * GAME_FORCE_SKIP to advance the phase.
 *
 * Props:
 *   roundNumber: number — Session-level round number (lobby.roundNumber)
 *   score: number — Player's current score
 *   playerCount: number — Number of players in the game
 *   children: React.ReactNode — Game content
 */
'use client';

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, ChevronRight } from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';
import { emit } from '@/lib/rmhbox/socket';
import { C2S } from '@/lib/rmhbox/events';

interface GameShellProps {
  roundNumber: number;
  score: number;
  playerCount: number;
  children: React.ReactNode;
}

export default function GameShell({
  roundNumber: _roundNumber,
  score,
  playerCount,
  children,
}: GameShellProps) {
  const { t } = useTranslation("c-rmhbox");
  void _roundNumber; // retained in the prop interface; round info now comes from minigameRound store field
  const minigameRound = useRMHboxStore((s) => s.minigameRound);
  const timerInfo = useRMHboxStore((s) => s.timerInfo);
  const lobby = useRMHboxStore((s) => s.lobby);
  const liveMinigameScore = useRMHboxStore((s) => s.liveMinigameScore);

  /** Show live in-game score when set (e.g. Fact or Friction pot scoring),
   *  otherwise fall back to the lobby-level cumulative score prop. */
  const displayScore = liveMinigameScore ?? score;

  const isHost = !!(lobby && lobby.hostUserId === lobby.myUserId);
  const showNextButton = isHost && timerInfo?.showSkip;

  const handleNext = useCallback(() => {
    if (!lobby) return;
    emit(C2S.GAME_FORCE_SKIP, { lobbyId: lobby.lobbyId });
  }, [lobby]);

  const roundLabel = minigameRound
    ? minigameRound.total > 0
      ? t("round-current-of-total", { current: minigameRound.current, total: minigameRound.total, defaultValue: "Round {{current}}/{{total}}" })
      : t("turn-current", { current: minigameRound.current, defaultValue: "Turn {{current}}" })
    : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-(--app-bg) text-(--app-text)">
      {/* Game content */}
      <main className="flex-1 overflow-y-auto p-4" style={{ scrollbarGutter: 'stable both-edges' }}>
        <div className="flex min-h-full items-start justify-center">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative flex shrink-0 items-center border-t border-(--app-border) px-4 py-1.5 pb-[calc(0.375rem+var(--safe-bottom))] pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))] text-sm">
        <span className="font-mono font-semibold">
          {t("score-label", { defaultValue: "Score:" })} <span className="text-(--app-accent)">{displayScore}</span>
        </span>
        {/* Center — round counter or host "Next" button for infinite phases */}
        <div className="absolute inset-0 flex items-center justify-center">
          {showNextButton ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-1 rounded-full px-4 py-1 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95 animate-pulse"
              style={{ backgroundColor: 'var(--app-accent)' }}
            >
              {t("next", { defaultValue: "Next" })}
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : roundLabel ? (
            <span className="rounded-full bg-(--app-surface) px-2 py-0.5 text-xs font-medium text-(--app-text-muted) pointer-events-none">
              {roundLabel}
            </span>
          ) : null}
        </div>
        <span className="ml-auto flex items-center gap-1 text-(--app-text-muted)">
          <Users className="h-4 w-4" /> {playerCount}
        </span>
      </footer>
    </div>
  );
}

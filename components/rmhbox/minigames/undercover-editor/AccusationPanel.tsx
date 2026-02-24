/**
 * AccusationPanel — Vote interface for Undercover Editor.
 *
 * Displays a grid of players (excluding self) for voting on who
 * the Editor is. Tapping selects a player; votes can be changed.
 * Shows "Voted" indicators and a countdown timer.
 *
 * Props:
 *   players: Array<{ userId, userName }> — All players in the game
 *   myPlayerId: string — The current player's user ID
 *   myVote: string | null — The player the current user voted for
 *   votedPlayers: string[] — User IDs of players who have voted
 *   timeRemaining: number — Seconds left for voting
 *   onVote: (targetUserId: string) => void — Callback when a vote is cast
 */
'use client';

import { motion } from 'framer-motion';
import { Clock, UserCheck, Search } from 'lucide-react';

interface Player {
  userId: string;
  userName: string;
}

interface AccusationPanelProps {
  players: Player[];
  myPlayerId: string;
  myVote: string | null;
  votedPlayers: string[];
  timeRemaining: number;
  onVote: (targetUserId: string) => void;
}

export default function AccusationPanel({
  players,
  myPlayerId,
  myVote,
  votedPlayers,
  timeRemaining,
  onVote,
}: AccusationPanelProps) {
  const otherPlayers = players.filter((p) => p.userId !== myPlayerId);
  const totalVoters = players.length;
  const votedCount = votedPlayers.length;

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-4 text-(--rmhbox-text)">
      {/* Header */}
      <div className="flex flex-col items-center gap-2">
        <Search className="h-6 w-6 text-(--rmhbox-accent)" />
        <h2 className="text-lg font-bold">Who is the Editor?</h2>
        <p className="text-xs text-(--rmhbox-text-muted)">
          Vote for the player you think secretly edited the story
        </p>
      </div>

      {/* Timer */}
      <div className="flex items-center gap-1.5 text-sm text-(--rmhbox-text-muted)">
        <Clock className="h-3.5 w-3.5" />
        <span className="font-mono font-semibold">{timeRemaining}s</span>
      </div>

      {/* Vote progress */}
      <div className="flex items-center gap-2 text-xs text-(--rmhbox-text-muted)">
        <UserCheck className="h-3.5 w-3.5" />
        <span>
          {votedCount}/{totalVoters} voted
        </span>
      </div>

      {/* Player grid */}
      <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
        {otherPlayers.map((p) => {
          const isSelected = myVote === p.userId;
          const hasVoted = votedPlayers.includes(p.userId);

          return (
            <motion.button
              key={p.userId}
              whileTap={{ scale: 0.96 }}
              onClick={() => onVote(p.userId)}
              className={`relative flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-medium transition-colors ${
                isSelected
                  ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/15 text-(--rmhbox-accent)'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-surface) text-(--rmhbox-text) hover:bg-(--rmhbox-surface-hover)'
              }`}
            >
              <span className="truncate max-w-full">{p.userName}</span>
              {hasVoted && (
                <span className="text-[10px] text-green-400 flex items-center gap-0.5">
                  <UserCheck className="h-3 w-3" /> Voted
                </span>
              )}
              {isSelected && (
                <motion.div
                  layoutId="vote-indicator"
                  className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-(--rmhbox-accent)"
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Current vote */}
      {myVote && (
        <p className="text-xs text-(--rmhbox-text-muted)">
          You voted for{' '}
          <span className="font-semibold text-(--rmhbox-accent)">
            {otherPlayers.find((p) => p.userId === myVote)?.userName ?? myVote}
          </span>
          . Tap another player to change your vote.
        </p>
      )}
    </div>
  );
}

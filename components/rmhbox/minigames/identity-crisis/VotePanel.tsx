/**
 * VotePanel — Voting interface for answering a player's yes/no question.
 *
 * Displays the question, asker info, three vote buttons (Yes/No/Maybe),
 * vote progress, and time remaining. Buttons disable after voting.
 *
 * Props:
 *   question: string — The question being voted on
 *   askerName: string — Name of the player who asked
 *   askerIdentity: string — The hidden identity of the asker
 *   myVote: string | null — Current player's vote (null if not yet voted)
 *   onVote: (vote: string) => void — Callback when a vote is cast
 *   votesReceived: number — Number of votes received so far
 *   totalVoters: number — Total number of voters
 *   timeRemaining: number — Seconds left to vote
 */
'use client';

import { Clock, ThumbsUp, ThumbsDown, Minus } from 'lucide-react';

interface VotePanelProps {
  question: string;
  askerName: string;
  askerIdentity: string;
  myVote: string | null;
  onVote: (vote: string) => void;
  votesReceived: number;
  totalVoters: number;
  timeRemaining: number;
}

const VOTE_OPTIONS = [
  { value: 'yes', label: 'Yes', icon: ThumbsUp, color: 'bg-(--rmhbox-success)' },
  { value: 'no', label: 'No', icon: ThumbsDown, color: 'bg-(--rmhbox-danger)' },
  { value: 'maybe', label: 'Maybe', icon: Minus, color: 'bg-(--rmhbox-warning)' },
] as const;

export default function VotePanel({
  question,
  askerName,
  askerIdentity,
  myVote,
  onVote,
  votesReceived,
  totalVoters,
  timeRemaining,
}: VotePanelProps) {
  const hasVoted = myVote !== null;

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4 text-(--rmhbox-text)">
      <div className="flex items-center gap-2 text-sm text-(--rmhbox-text-muted)">
        <Clock className="h-4 w-4" />
        <span className="font-mono font-semibold">{timeRemaining}s</span>
      </div>

      {/* Asker info */}
      <div className="text-center">
        <p className="text-xs text-(--rmhbox-text-muted)">
          <span className="font-semibold text-(--rmhbox-accent)">{askerName}</span>
          {' '}(secretly: <span className="font-semibold">{askerIdentity}</span>) asks:
        </p>
      </div>

      {/* Question */}
      <div className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-3 text-center">
        <p className="text-lg font-semibold">&ldquo;{question}&rdquo;</p>
      </div>

      {/* Vote buttons */}
      <div className="flex gap-3">
        {VOTE_OPTIONS.map(({ value, label, icon: Icon, color }) => {
          const isSelected = myVote === value;
          return (
            <button
              key={value}
              onClick={() => onVote(value)}
              disabled={hasVoted}
              className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-all ${color} ${
                hasVoted
                  ? isSelected
                    ? 'opacity-100 ring-2 ring-white/50'
                    : 'opacity-30'
                  : 'hover:opacity-90'
              } disabled:cursor-default`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          );
        })}
      </div>

      {/* Vote progress */}
      <p className="text-xs text-(--rmhbox-text-muted)">
        {votesReceived} / {totalVoters} voted
      </p>
    </div>
  );
}

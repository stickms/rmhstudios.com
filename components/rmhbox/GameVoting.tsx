/**
 * GameVoting — Game voting screen with candidate cards, timer, and vote tallies.
 *
 * Shows 5 candidate minigames as clickable cards with icon, name, description,
 * and category badge. Displays a countdown timer and vote tally bars.
 *
 * Props:
 *   candidates: VoteCandidate[] — Minigame candidates to vote on
 *   durationSeconds: number — Total voting duration
 *   endsAt: number — Timestamp (ms) when voting ends
 *   onVote: (minigameId: string) => void — Callback when user votes
 */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Timer } from 'lucide-react';
import { getSocket } from '@/lib/rmhbox/socket';
import { S2C } from '@/lib/rmhbox/events';
import type { VoteCandidate } from '@/lib/rmhbox/types';

interface GameVotingProps {
  candidates: VoteCandidate[];
  durationSeconds: number;
  endsAt: number;
  onVote: (minigameId: string) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  word: 'bg-blue-500/20 text-blue-400',
  trivia: 'bg-emerald-500/20 text-emerald-400',
  action: 'bg-red-500/20 text-red-400',
  creative: 'bg-purple-500/20 text-purple-400',
};

export default function GameVoting({ candidates, durationSeconds, endsAt, onVote }: GameVotingProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(durationSeconds);
  const [tallies, setTallies] = useState<Record<string, number>>({});

  // Countdown timer
  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  // Listen for vote updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (data: { tallies: Record<string, number> }) => {
      setTallies(data.tallies);
    };
    socket.on(S2C.GAME_VOTE_UPDATE, handler);
    return () => { socket.off(S2C.GAME_VOTE_UPDATE, handler); };
  }, []);

  const handleVote = useCallback(
    (id: string) => {
      setSelectedId(id);
      onVote(id);
    },
    [onVote],
  );

  const maxTally = Math.max(1, ...Object.values(tallies));

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-4">
      {/* Timer */}
      <div className="flex items-center justify-center gap-2 text-lg font-bold text-[var(--rmhbox-text)]">
        <Timer className="h-5 w-5 text-[var(--rmhbox-accent)]" />
        <span className={remaining <= 10 ? 'text-[var(--rmhbox-danger)]' : ''}>
          {remaining}s
        </span>
      </div>

      {/* Candidate cards */}
      <div className="grid gap-3">
        {candidates.map((c) => {
          const isSelected = selectedId === c.minigameId;
          const tally = tallies[c.minigameId] ?? 0;

          return (
            <button
              key={c.minigameId}
              onClick={() => handleVote(c.minigameId)}
              className={`relative overflow-hidden rounded-xl border p-4 text-left transition-all ${
                isSelected
                  ? 'border-[var(--rmhbox-accent)] bg-[var(--rmhbox-accent)]/10 ring-2 ring-[var(--rmhbox-accent)]'
                  : 'border-[var(--rmhbox-border)] bg-[var(--rmhbox-surface)] hover:bg-[var(--rmhbox-surface-hover)]'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <span className="text-2xl">{c.icon}</span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[var(--rmhbox-text)]">{c.displayName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CATEGORY_COLORS[c.category] ?? 'bg-gray-500/20 text-gray-400'}`}>
                      {c.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--rmhbox-text-muted)]">{c.description}</p>
                </div>

                {/* Vote count */}
                {tally > 0 && (
                  <span className="shrink-0 rounded-full bg-[var(--rmhbox-accent)]/20 px-2 py-0.5 text-xs font-bold text-[var(--rmhbox-accent)]">
                    {tally}
                  </span>
                )}
              </div>

              {/* Tally bar */}
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--rmhbox-border)]">
                <div
                  className="h-full rounded-full bg-[var(--rmhbox-accent)] transition-all duration-300"
                  style={{ width: `${(tally / maxTally) * 100}%` }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

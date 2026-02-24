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
import { Timer, Gamepad2, icons } from 'lucide-react';
import { getSocket } from '@/lib/rmhbox/socket';
import { S2C } from '@/lib/rmhbox/events';
import type { VoteCandidate } from '@/lib/rmhbox/types';

/** Convert kebab-case icon name to PascalCase for lucide-react lookup */
function kebabToPascal(name: string): string {
  return name.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

/** Resolve a minigame icon string to a Lucide component, falling back to emoji or Gamepad2 */
function GameIcon({ icon, className }: { icon: string; className?: string }) {
  const pascalName = kebabToPascal(icon);
  const LucideIcon = icons[pascalName as keyof typeof icons];
  if (LucideIcon) return <LucideIcon className={className} />;
  if (/^\p{Emoji}/u.test(icon)) return <span className={className}>{icon}</span>;
  return <Gamepad2 className={className} />;
}

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
  const [currentEndsAt, setCurrentEndsAt] = useState(endsAt);
  const [remaining, setRemaining] = useState(durationSeconds);
  const [tallies, setTallies] = useState<Record<string, number>>({});

  // Sync endsAt prop changes
  useEffect(() => {
    setCurrentEndsAt(endsAt);
  }, [endsAt]);

  // Countdown timer
  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((currentEndsAt - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [currentEndsAt]);

  // Listen for vote updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (data: { tallies: Record<string, number>; endsAt?: number }) => {
      setTallies(data.tallies);
      if (data.endsAt != null) {
        setCurrentEndsAt(data.endsAt);
      }
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
      <div className="flex items-center justify-center gap-2 text-lg font-bold text-(--rmhbox-text)">
        <Timer className="h-5 w-5 text-(--rmhbox-accent)" />
        <span className={remaining <= 10 ? 'text-(--rmhbox-danger)' : ''}>
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
                  ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent)/10 ring-2 ring-(--rmhbox-accent)'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-surface) hover:bg-(--rmhbox-surface-hover)'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Icon */}
                <GameIcon icon={c.icon} className="h-6 w-6 shrink-0 text-(--rmhbox-accent)" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-(--rmhbox-text)">{c.displayName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${CATEGORY_COLORS[c.category] ?? 'bg-gray-500/20 text-gray-400'}`}>
                      {c.category}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-(--rmhbox-text-muted)">{c.description}</p>
                </div>

                {/* Vote count */}
                {tally > 0 && (
                  <span className="shrink-0 rounded-full bg-(--rmhbox-accent)/20 px-2 py-0.5 text-xs font-bold text-(--rmhbox-accent)">
                    {tally}
                  </span>
                )}
              </div>

              {/* Tally bar */}
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-(--rmhbox-border)">
                <div
                  className="h-full rounded-full bg-(--rmhbox-accent) transition-all duration-300"
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

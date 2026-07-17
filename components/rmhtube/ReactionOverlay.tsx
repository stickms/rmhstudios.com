/**
 * ReactionOverlay — Floating emoji reactions on the video player.
 */
'use client';

import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { emit, getSocket } from '@/lib/rmhtube/socket';
import { C2S, S2C } from '@/lib/rmhtube/events';
import { AVAILABLE_REACTIONS } from '@/lib/rmhtube/constants';

interface FloatingReaction {
  id: number;
  emoji: string;
  x: number;
}

let reactionCounter = 0;

// Module-scope so the mount effect below can call it with a stable reference
// (no per-render component-local callback to memoize). setReactions is a stable
// state setter, passed in.
function spawnReaction(setReactions: Dispatch<SetStateAction<FloatingReaction[]>>, emoji: string) {
  const id = ++reactionCounter;
  const x = 10 + Math.random() * 80; // Random horizontal position (10-90%)
  setReactions((prev) => [...prev.slice(-20), { id, emoji, x }]);
  // Remove after animation completes
  setTimeout(() => {
    setReactions((prev) => prev.filter((r) => r.id !== id));
  }, 2000);
}

export default function ReactionOverlay() {
  const [reactions, setReactions] = useState<FloatingReaction[]>([]);

  // Listen for reactions from other users
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = (data: { emoji: string }) => {
      spawnReaction(setReactions, data.emoji);
    };

    socket.on(S2C.REACTION_BROADCAST, handler);
    return () => {
      socket.off(S2C.REACTION_BROADCAST, handler);
    };
  }, []);

  const handleSendReaction = (emoji: string) => {
    emit(C2S.REACTION_SEND, { emoji });
    spawnReaction(setReactions, emoji);
  };

  return (
    <>
      {/* Floating reactions overlay */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {reactions.map((r) => (
          <span
            key={r.id}
            className="absolute bottom-4 text-2xl rmhtube-reaction-float"
            style={{ left: `${r.x}%` }}
          >
            {r.emoji}
          </span>
        ))}
      </div>

      {/* Reaction bar */}
      <div className="flex items-center gap-1 px-2">
        {AVAILABLE_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => handleSendReaction(emoji)}
            className="rounded-md p-1.5 text-lg transition-transform hover:scale-125 active:scale-90"
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

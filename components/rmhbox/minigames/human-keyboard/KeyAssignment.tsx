/**
 * KeyAssignment — Player's assigned keys display.
 *
 * Shows the letters assigned to this player, highlights the one
 * matching the expected next letter, and displays an "It's YOUR turn!"
 * indicator. Captures desktop keyboard events for key presses.
 */
'use client';

import { useEffect } from 'react';

interface KeyAssignmentProps {
  /** Letters assigned to this player (uppercase) */
  myKeys: string[];
  /** The next expected letter in the sentence (uppercase), or null */
  nextExpectedLetter: string | null;
  /** Whether the expected letter belongs to this player */
  isMyTurn: boolean;
  /** Callback when the player presses one of their keys */
  onKeyPress: (key: string) => void;
}

export default function KeyAssignment({
  myKeys,
  nextExpectedLetter,
  isMyTurn,
  onKeyPress,
}: KeyAssignmentProps) {
  // Desktop keyboard capture
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key.toUpperCase();
      if (myKeys.includes(key)) {
        e.preventDefault();
        onKeyPress(key);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [myKeys, onKeyPress]);

  return (
    <div className="flex flex-col items-center gap-3">
      {isMyTurn && (
        <div className="animate-pulse rounded-full bg-(--rmhbox-accent)/20 px-4 py-1 text-sm font-bold text-(--rmhbox-accent)">
          It&apos;s YOUR turn!
        </div>
      )}

      <div className="text-xs font-medium text-(--rmhbox-text-muted) uppercase tracking-wide">
        Your letters
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {myKeys.map((key) => {
          const isActive = nextExpectedLetter === key && isMyTurn;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onKeyPress(key)}
              className={`flex h-10 w-10 items-center justify-center rounded-lg border text-sm font-bold transition-all ${
                isActive
                  ? 'border-(--rmhbox-accent) bg-(--rmhbox-accent) text-(--rmhbox-bg) scale-110 shadow-lg'
                  : 'border-(--rmhbox-border) bg-(--rmhbox-surface-hover) text-(--rmhbox-text)'
              }`}
            >
              {key}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * MatchingPanel — Review-phase UI for Undercover Editor.
 *
 * Players page through all N stories and try to match each to its secret
 * undercover editor. Each potential editor can only be assigned to one story
 * (1-to-1 bijection). Players cannot guess on stories they edited.
 *
 * Props:
 *   stories          — The set of stories to review
 *   players          — Every player in the game
 *   myPlayerId       — Current user's player ID
 *   myEditedStoryId  — The storyId the current player edited (excluded)
 *   currentGuesses   — Map of storyId → guessedEditorUserId
 *   lockedIn         — Whether the current player has locked in
 *   lockedInPlayers  — User IDs of players who have already locked in
 *   onGuessChange    — Fires when a guess dropdown changes
 *   onLockIn         — Fires when the "Lock In" button is pressed
 */
'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Story {
  storyId: string;
  ownerName: string;
  prompt: string;
  sentences: Array<{
    authorName: string;
    text: string;
    roundNumber: number;
  }>;
}

interface Player {
  userId: string;
  userName: string;
}

export interface MatchingPanelProps {
  stories: Story[];
  players: Player[];
  myPlayerId: string;
  myEditedStoryId: string | null;
  currentGuesses: Record<string, string>;
  lockedIn: boolean;
  lockedInPlayers: string[];
  onGuessChange: (storyId: string, guessedEditorId: string) => void;
  onLockIn: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MatchingPanel({
  stories,
  players,
  myPlayerId,
  myEditedStoryId,
  currentGuesses,
  lockedIn,
  lockedInPlayers,
  onGuessChange,
  onLockIn,
}: MatchingPanelProps) {
  // Stories the player can guess on (exclude the one they edited)
  const guessableStories = useMemo(
    () => stories.filter((s) => s.storyId !== myEditedStoryId),
    [stories, myEditedStoryId],
  );

  // Set of editor IDs already assigned to other stories in guesses
  const usedEditorIds = useMemo(() => {
    const used = new Set<string>();
    for (const [, editorId] of Object.entries(currentGuesses)) {
      if (editorId) used.add(editorId);
    }
    return used;
  }, [currentGuesses]);

  // True once every guessable story has a guess
  const allGuessed = useMemo(
    () => guessableStories.every((s) => !!currentGuesses[s.storyId]),
    [guessableStories, currentGuesses],
  );

  const totalPlayers = players.length;
  const lockedCount = lockedInPlayers.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex w-full max-w-2xl flex-col items-center gap-6 text-(--rmhbox-text)"
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-lg font-bold">Match the Editors</h2>
        <p className="text-xs text-(--rmhbox-text-muted)">
          For each story, guess which player was its undercover editor
        </p>
      </div>

      {/* Lock-in progress */}
      <div className="flex items-center gap-2 text-xs text-(--rmhbox-text-muted)">
        <span>
          {lockedCount}/{totalPlayers} players locked in
        </span>
      </div>

      {/* Story cards */}
      <div className="flex w-full flex-col gap-4">
        {guessableStories.map((story, idx) => {
          // Candidates: every player except the story owner and current player
          // (you can't edit your own story, so you can't be that story's editor)
          // Enforce 1-to-1: exclude editors already used for other stories
          const selectedGuess = currentGuesses[story.storyId] ?? '';
          const candidates = players.filter((p) => {
            // Can't be the story owner (storyId = ownerUserId)
            if (p.userId === story.storyId) return false;
            // Current player knows they edit myEditedStoryId, so they
            // shouldn't appear as candidate for other stories
            if (p.userId === myPlayerId && story.storyId !== myEditedStoryId) return false;
            // 1-to-1: can't be already used for a different story
            if (usedEditorIds.has(p.userId) && p.userId !== selectedGuess) return false;
            return true;
          });

          return (
            <motion.div
              key={story.storyId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.35 }}
              className="flex flex-col gap-3 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
            >
              {/* Story header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {story.ownerName}&apos;s Story
                </span>
                <span className="rounded-md bg-(--rmhbox-accent)/10 px-2 py-0.5 text-[10px] font-medium text-(--rmhbox-accent)">
                  #{idx + 1}
                </span>
              </div>

              {/* Prompt */}
              <p className="text-xs italic text-(--rmhbox-text-muted)">
                &ldquo;{story.prompt}&rdquo;
              </p>

              {/* Full story text */}
              <div className="flex flex-col gap-1 rounded-lg bg-(--rmhbox-surface)/60 p-3 text-sm leading-relaxed">
                {story.sentences
                  .slice()
                  .sort((a, b) => a.roundNumber - b.roundNumber)
                  .map((s, i) => (
                    <span key={i}>{s.text} </span>
                  ))}
              </div>

              {/* Editor guess dropdown */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-(--rmhbox-text-muted)">
                  Who was the editor?
                </span>
                <select
                  disabled={lockedIn}
                  value={selectedGuess}
                  onChange={(e) =>
                    onGuessChange(story.storyId, e.target.value)
                  }
                  className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-3 py-2 text-sm text-(--rmhbox-text) outline-none transition-colors focus:border-(--rmhbox-accent) disabled:opacity-50"
                >
                  <option value="">— select a player —</option>
                  {candidates.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.userName}
                    </option>
                  ))}
                </select>
              </label>
            </motion.div>
          );
        })}
      </div>

      {/* Lock-in area */}
      <div className="flex flex-col items-center gap-2 pb-4">
        {lockedIn ? (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="flex items-center gap-1.5 rounded-full bg-(--rmhbox-success-dim) px-4 py-1.5 text-sm font-semibold text-(--rmhbox-success)"
          >
            ✓ Locked In
          </motion.div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={!allGuessed}
            onClick={onLockIn}
            className="rounded-xl border border-(--rmhbox-accent) bg-(--rmhbox-accent)/15 px-6 py-2 text-sm font-semibold text-(--rmhbox-accent) transition-opacity disabled:opacity-40"
          >
            Lock In Guesses
          </motion.button>
        )}

        {!lockedIn && !allGuessed && (
          <p className="text-[11px] text-(--rmhbox-text-muted)">
            Assign an editor for every story to lock in
          </p>
        )}
      </div>
    </motion.div>
  );
}

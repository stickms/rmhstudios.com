/**
 * MatchingPanel — Review-phase UI for Undercover Editor.
 *
 * Players page through all N stories and try to match each to its secret
 * undercover editor. Only the guessing player themselves is excluded from
 * the dropdown. When a player is assigned to a new story, their previous
 * assignment is automatically removed (reassignment, not 1-to-1 filtering).
 *
 * Props:
 *   stories          — The set of stories to review
 *   players          — Every player in the game
 *   myPlayerId       — Current user's player ID
 *   myEditedStoryId  — The storyId the current player edited (excluded from guessing)
 *   currentGuesses   — Map of storyId → guessedEditorUserId
 *   lockedIn         — Whether the current player has locked in
 *   lockedInPlayers  — User IDs of players who have already locked in
 *   onGuessChange    — Fires when a guess dropdown changes
 *   onLockIn         — Fires when the "Lock In" button is pressed
 */
'use client';

import { useMemo } from 'react';
import { m as motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

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

  // Candidate editors: everyone except the guessing player themselves
  const candidates = useMemo(
    () => players.filter((p) => p.userId !== myPlayerId),
    [players, myPlayerId],
  );

  // True once every guessable story has a guess
  const allGuessed = useMemo(
    () => guessableStories.every((s) => !!currentGuesses[s.storyId]),
    [guessableStories, currentGuesses],
  );

  const { t } = useTranslation("c-rmhbox");

  const totalPlayers = players.length;
  const lockedCount = lockedInPlayers.length;

  // Get player name by userId for lock-in display
  const getPlayerName = (userId: string): string =>
    players.find((p) => p.userId === userId)?.userName ?? userId;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mx-auto flex w-full max-w-2xl flex-col items-center gap-6 text-(--rmhbox-text)"
    >
      {/* Header */}
      <div className="flex flex-col items-center gap-1">
        <h2 className="text-lg font-bold">{t("match-the-editors", { defaultValue: "Match the Editors" })}</h2>
        <p className="text-xs text-(--rmhbox-text-muted)">
          {t("match-the-editors-subtitle", { defaultValue: "For each story, guess which player was its undercover editor" })}
        </p>
      </div>

      {/* Lock-in progress */}
      <div className="flex flex-col items-center gap-1 text-xs text-(--rmhbox-text-muted)">
        <span>
          {t("players-locked-in", { lockedCount, totalPlayers, defaultValue: "{{lockedCount}}/{{totalPlayers}} players locked in" })}
        </span>
        {lockedInPlayers.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5 mt-1">
            {lockedInPlayers.map((uid) => (
              <span
                key={uid}
                className="rounded-full bg-(--rmhbox-success-dim) px-2 py-0.5 text-[10px] text-(--rmhbox-success)"
              >
                ✓ {getPlayerName(uid)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Story cards */}
      <div className="flex w-full flex-col gap-4">
        {guessableStories.map((story, idx) => {
          const selectedGuess = currentGuesses[story.storyId] ?? '';

          return (
            <motion.div
              key={story.storyId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.08, duration: 0.35 }}
              className="flex flex-col gap-3 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
            >
              {/* Story header — numbered */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {t("story-number", { number: idx + 1, defaultValue: "Story {{number}}" })}
                </span>
              </div>

              {/* Full story text with prompt as first sentence */}
              <div className="flex flex-col gap-1 rounded-lg bg-(--rmhbox-surface)/60 p-3 text-sm leading-relaxed">
                <span className="text-(--rmhbox-text)">
                  <span className="opacity-50 text-xs">{t("prompt-label", { defaultValue: "(prompt)" })}</span> {story.prompt}
                </span>
                {story.sentences
                  .slice()
                  .sort((a, b) => a.roundNumber - b.roundNumber)
                  .map((s, i) => (
                    <span key={i}>{s.text} </span>
                  ))}
              </div>

              {/* Editor guess dropdown — only excludes the guessing player */}
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-(--rmhbox-text-muted)">
                  {t("who-was-the-editor", { defaultValue: "Who was the editor?" })}
                </span>
                <select
                  disabled={lockedIn}
                  value={selectedGuess}
                  onChange={(e) =>
                    onGuessChange(story.storyId, e.target.value)
                  }
                  className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-3 py-2 text-sm text-(--rmhbox-text) outline-none transition-colors focus:border-(--rmhbox-accent) disabled:opacity-50"
                >
                  <option value="">{t("select-a-player", { defaultValue: "— select a player —" })}</option>
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
            ✓ {t("locked-in", { defaultValue: "Locked In" })}
          </motion.div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.96 }}
            disabled={!allGuessed}
            onClick={onLockIn}
            className="rounded-xl border border-(--rmhbox-accent) bg-(--rmhbox-accent)/15 px-6 py-2 text-sm font-semibold text-(--rmhbox-accent) transition-opacity disabled:opacity-40"
          >
            {t("lock-in-guesses", { defaultValue: "Lock In Guesses" })}
          </motion.button>
        )}

        {!lockedIn && !allGuessed && (
          <p className="text-[11px] text-(--rmhbox-text-muted)">
            {t("assign-editor-hint", { defaultValue: "Assign an editor for every story to lock in" })}
          </p>
        )}
      </div>
    </motion.div>
  );
}

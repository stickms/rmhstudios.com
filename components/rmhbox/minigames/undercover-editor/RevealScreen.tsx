/**
 * RevealScreen — Dramatic reveal for Undercover Editor.
 *
 * Shows a staggered reveal sequence per story:
 *   1. "The Editor was… [name]!"
 *   2. Edits highlighted (original → replacement)
 *   3. Score breakdown
 *
 * Props:
 *   storyReveals: Array of per-story reveal info
 *   scores: Array of score entries
 *   myPlayerId: string — to highlight current player
 *   matchResults: Record of match results per player
 */
'use client';

import { motion } from 'framer-motion';
import { Eye, PenLine, Star } from 'lucide-react';

interface WordEditView {
  storyId: string;
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
  editedOnRound: number;
}

interface StoryRevealInfo {
  storyId: string;
  ownerName: string;
  editorUserId: string;
  editorName: string;
  edits: WordEditView[];
}

interface ScoreEntry {
  userId: string;
  userName: string;
  score: number;
}

interface MatchResult {
  storyId: string;
  guessedEditorId: string;
  actualEditorId: string;
  correct: boolean;
}

interface RevealScreenProps {
  storyReveals: StoryRevealInfo[];
  scores: ScoreEntry[];
  myPlayerId: string;
  matchResults: Record<string, MatchResult[]>;
}

const SECTION_DELAY = 0.6;

export default function RevealScreen({
  storyReveals,
  scores,
  myPlayerId,
  matchResults,
}: RevealScreenProps) {
  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-6 text-(--rmhbox-text)">
      <h2 className="text-xl font-bold">The Truth Revealed</h2>

      {/* Per-story reveals */}
      {storyReveals.map((reveal, ri) => {
        const myGuess = matchResults[myPlayerId]?.find((r) => r.storyId === reveal.storyId);
        return (
          <motion.div
            key={reveal.storyId}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: ri * SECTION_DELAY, duration: 0.5 }}
            className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
          >
            {/* Story header */}
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">{reveal.ownerName}&apos;s Story</span>
              {myGuess && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  myGuess.correct
                    ? 'bg-(--rmhbox-success-dim) text-(--rmhbox-success)'
                    : 'bg-(--rmhbox-danger-dim) text-(--rmhbox-danger)'
                }`}>
                  {myGuess.correct ? '✓ Correct' : '✗ Wrong'}
                </span>
              )}
            </div>

            {/* Editor reveal */}
            <div className="flex items-center gap-2 mb-2">
              <Eye className="h-4 w-4 text-(--rmhbox-rare)" />
              <span className="text-sm text-(--rmhbox-text-muted)">Editor:</span>
              <span className="font-bold text-(--rmhbox-rare)">{reveal.editorName}</span>
            </div>

            {/* Edits */}
            {reveal.edits.length > 0 && (
              <div className="mt-2">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase text-(--rmhbox-text-muted) mb-1">
                  <PenLine className="h-3.5 w-3.5" /> Edits
                </h4>
                <div className="space-y-1">
                  {reveal.edits.map((edit, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-(--rmhbox-text-muted) text-xs">
                        ({edit.sentenceAuthor})
                      </span>
                      <span className="line-through text-(--rmhbox-danger)">{edit.originalWord}</span>
                      <span className="text-(--rmhbox-text-muted)">→</span>
                      <span className="font-semibold text-(--rmhbox-success)">{edit.newWord}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        );
      })}

      {/* Score breakdown */}
      {scores.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: storyReveals.length * SECTION_DELAY, duration: 0.4 }}
          className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
        >
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-(--rmhbox-text-muted)">
            <Star className="h-3.5 w-3.5" /> Scores
          </h3>
          <div className="space-y-1.5">
            {scores
              .sort((a, b) => b.score - a.score)
              .map((s, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className={`${
                    s.userId === myPlayerId
                      ? 'font-bold text-(--rmhbox-accent)'
                      : 'text-(--rmhbox-text)'
                  }`}>
                    {s.userName}
                  </span>
                  <span className="font-mono font-semibold text-(--rmhbox-accent)">
                    {s.score > 0 ? '+' : ''}{s.score}
                  </span>
                </div>
              ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * RevealScreen — Dramatic reveal for Undercover Editor.
 *
 * Shows a staggered reveal sequence:
 *   1. "The Editor was… [name]!"
 *   2. "The keyword was… [word]"
 *   3. Edits highlighted (original → replacement)
 *   4. Vote tally visualization
 *   5. Winner announcement
 *   6. Score breakdown
 *
 * Props:
 *   editorUserId: string — The editor's user ID
 *   editorName: string — The editor's display name
 *   keyword: string — The secret keyword
 *   keywordInStory: boolean — Whether keyword was in the final story
 *   editorCaught: boolean — Whether the editor was correctly identified
 *   edits: Array<{ sentenceIndex, sentenceAuthor, originalWord, newWord }>
 *   votes: Array<{ voterName, accusedName }>
 *   winner: string — Winner announcement text
 *   scores: Array<{ userName, role, score }>
 */
'use client';

import { motion } from 'framer-motion';
import { Eye, Key, PenLine, Vote, Trophy, Star } from 'lucide-react';

interface EditEntry {
  sentenceIndex: number;
  sentenceAuthor: string;
  originalWord: string;
  newWord: string;
}

interface VoteEntry {
  voterName: string;
  accusedName: string;
}

interface ScoreEntry {
  userName: string;
  role: string;
  score: number;
}

interface RevealScreenProps {
  editorUserId: string;
  editorName: string;
  keyword: string;
  keywordInStory: boolean;
  editorCaught: boolean;
  edits: EditEntry[];
  votes: VoteEntry[];
  winner: string;
  scores: ScoreEntry[];
}

/** Stagger delay for each reveal section. */
const SECTION_DELAY = 0.6;

export default function RevealScreen({
  editorUserId: _editorUserId,
  editorName,
  keyword,
  keywordInStory,
  editorCaught,
  edits,
  votes,
  winner,
  scores,
}: RevealScreenProps) {
  void _editorUserId; // Available for future use; not rendered

  return (
    <div className="flex w-full max-w-lg flex-col items-center gap-6 text-(--rmhbox-text)">
      {/* 1. Editor reveal */}
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: SECTION_DELAY * 0, duration: 0.5 }}
        className="flex flex-col items-center gap-2"
      >
        <Eye className="h-6 w-6 text-purple-400" />
        <p className="text-sm text-(--rmhbox-text-muted)">The Editor was…</p>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: SECTION_DELAY * 0 + 0.3, duration: 0.4 }}
          className="text-2xl font-extrabold text-purple-400"
        >
          {editorName}!
        </motion.h2>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          editorCaught
            ? 'bg-green-500/20 text-green-400'
            : 'bg-red-500/20 text-red-400'
        }`}>
          {editorCaught ? '🔎 Caught!' : '🕵️ Got away!'}
        </span>
      </motion.div>

      {/* 2. Keyword reveal */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: SECTION_DELAY * 1, duration: 0.4 }}
        className="flex flex-col items-center gap-1"
      >
        <Key className="h-5 w-5 text-yellow-400" />
        <p className="text-sm text-(--rmhbox-text-muted)">The keyword was…</p>
        <span className="rounded-lg bg-yellow-500/20 px-3 py-1 text-lg font-bold text-yellow-300">
          {keyword}
        </span>
        <p className="text-[10px] text-(--rmhbox-text-muted)">
          {keywordInStory ? '✅ Found in the story' : '❌ Not in the story'}
        </p>
      </motion.div>

      {/* 3. Edits */}
      {edits.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: SECTION_DELAY * 2, duration: 0.4 }}
          className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
        >
          <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-(--rmhbox-text-muted)">
            <PenLine className="h-3.5 w-3.5" /> Edits Made
          </h3>
          <div className="space-y-2">
            {edits.map((edit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: SECTION_DELAY * 2 + i * 0.15, duration: 0.3 }}
                className="flex items-center gap-2 text-sm"
              >
                <span className="text-(--rmhbox-text-muted) text-xs">
                  ({edit.sentenceAuthor})
                </span>
                <span className="line-through text-red-400">{edit.originalWord}</span>
                <span className="text-(--rmhbox-text-muted)">→</span>
                <span className="font-semibold text-green-400">{edit.newWord}</span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* 4. Vote tally */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: SECTION_DELAY * 3, duration: 0.4 }}
        className="w-full rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
      >
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase text-(--rmhbox-text-muted)">
          <Vote className="h-3.5 w-3.5" /> Votes
        </h3>
        <div className="space-y-1">
          {votes.map((v, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span className="text-(--rmhbox-text)">{v.voterName}</span>
              <span className="text-(--rmhbox-text-muted)">accused</span>
              <span className="font-semibold text-(--rmhbox-accent)">{v.accusedName}</span>
            </div>
          ))}
        </div>
      </motion.div>

      {/* 5. Winner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: SECTION_DELAY * 4, duration: 0.5, type: 'spring' }}
        className="flex items-center gap-2 rounded-xl bg-(--rmhbox-accent)/15 px-5 py-3"
      >
        <Trophy className="h-5 w-5 text-(--rmhbox-accent)" />
        <span className="text-sm font-bold text-(--rmhbox-accent)">{winner}</span>
      </motion.div>

      {/* 6. Score breakdown */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: SECTION_DELAY * 5, duration: 0.4 }}
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
                <div className="flex items-center gap-2">
                  <span className="text-(--rmhbox-text)">{s.userName}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    s.role === 'editor'
                      ? 'bg-purple-500/20 text-purple-300'
                      : 'bg-blue-500/20 text-blue-300'
                  }`}>
                    {s.role === 'editor' ? '✏️ Editor' : '🔎 Writer'}
                  </span>
                </div>
                <span className="font-mono font-semibold text-(--rmhbox-accent)">
                  {s.score > 0 ? '+' : ''}{s.score}
                </span>
              </div>
            ))}
        </div>
      </motion.div>
    </div>
  );
}

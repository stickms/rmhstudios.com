/**
 * StoryDisplay — Read-only story viewer for Undercover Editor.
 *
 * Renders the story prompt as a styled header, followed by each
 * sentence as a distinct block with author attribution. Auto-scrolls
 * to the latest sentence.
 *
 * When `showEdits` is true (REVEAL phase), highlights edited words
 * with original → replacement styling.
 *
 * Props:
 *   sentences: Array<{ authorName, text, turnNumber }> — Story sentences
 *   storyPrompt: string — The story prompt/theme
 *   edits?: Array<{ sentenceIndex, originalWord, newWord }> — Editor's changes
 *   showEdits?: boolean — Whether to highlight edits (reveal phase)
 */
'use client';

import { useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BookOpen } from 'lucide-react';

interface Sentence {
  authorName: string;
  text: string;
  turnNumber: number;
}

interface Edit {
  sentenceIndex: number;
  originalWord: string;
  newWord: string;
}

interface StoryDisplayProps {
  sentences: Sentence[];
  storyPrompt: string;
  edits?: Edit[];
  showEdits?: boolean;
}

/** Highlight edited words in a sentence by wrapping them in styled spans. */
function renderSentenceText(
  text: string,
  sentenceIndex: number,
  edits: Edit[],
  showEdits: boolean,
) {
  if (!showEdits) return <span>{text}</span>;

  const sentenceEdits = edits.filter((e) => e.sentenceIndex === sentenceIndex);
  if (sentenceEdits.length === 0) return <span>{text}</span>;

  // Replace edited words in text with highlighted versions
  let result = text;
  const elements: React.ReactNode[] = [];
  let keyIdx = 0;

  for (const edit of sentenceEdits) {
    const editIdx = result.indexOf(edit.newWord);
    if (editIdx === -1) continue;

    const before = result.slice(0, editIdx);
    if (before) elements.push(<span key={keyIdx++}>{before}</span>);

    elements.push(
      <span
        key={keyIdx++}
        className="inline-flex items-center gap-1"
      >
        <span className="line-through text-(--rmhbox-danger)/70 text-sm">{edit.originalWord}</span>
        <span className="font-semibold text-(--rmhbox-success)">→</span>
        <span className="font-semibold text-(--rmhbox-success) underline decoration-(--rmhbox-success)/50">
          {edit.newWord}
        </span>
      </span>,
    );

    result = result.slice(editIdx + edit.newWord.length);
  }

  if (result) elements.push(<span key={keyIdx++}>{result}</span>);
  return elements.length > 0 ? <>{elements}</> : <span>{text}</span>;
}

export default function StoryDisplay({
  sentences,
  storyPrompt,
  edits = [],
  showEdits = false,
}: StoryDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest sentence
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sentences.length]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
      {/* Story prompt header */}
      <div className="flex items-center gap-2 border-b border-(--rmhbox-border) pb-3">
        <BookOpen className="h-4 w-4 text-(--rmhbox-accent)" />
        <h3 className="text-sm font-semibold text-(--rmhbox-accent)">
          {storyPrompt}
        </h3>
      </div>

      {/* Sentences */}
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {sentences.length === 0 && (
          <p className="text-center text-xs text-(--rmhbox-text-muted) italic py-4">
            The story hasn&apos;t started yet…
          </p>
        )}
        {sentences.map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05, duration: 0.25 }}
            className="rounded-lg bg-(--rmhbox-bg) p-3"
          >
            <p className="text-sm leading-relaxed text-(--rmhbox-text)">
              {renderSentenceText(s.text, i, edits, showEdits)}
            </p>
            <p className="mt-1 text-[10px] text-(--rmhbox-text-muted)">
              — {s.authorName} · Turn {s.turnNumber}
            </p>
          </motion.div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

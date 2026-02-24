/**
 * StoryEditor — Editor's secret edit UI for Undercover Editor.
 *
 * Displays the story with each word as a tappable token. Editable words
 * are underlined; non-editable words are grayed out. Tapping an editable
 * word opens an inline replacement input. Shows the keyword prominently
 * as a reminder. Includes skip and confirm/cancel controls.
 *
 * Props:
 *   editableStory: EditableStory — Story with word tokens and editability flags
 *   keyword: string — The secret keyword the editor must weave in
 *   timeRemaining: number — Seconds left for the edit phase
 *   onEdit: (sentenceIndex, wordIndex, newWord) => void — Callback for edits
 *   onSkip: () => void — Callback to skip editing
 */
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Check, X, SkipForward } from 'lucide-react';

interface WordToken {
  word: string;
  isEditable: boolean;
}

interface EditableSentence {
  authorName: string;
  words: WordToken[];
}

export interface EditableStory {
  sentences: EditableSentence[];
}

interface StoryEditorProps {
  editableStory: EditableStory;
  keyword: string;
  timeRemaining: number;
  onEdit: (sentenceIndex: number, wordIndex: number, newWord: string) => void;
  onSkip: () => void;
}

const MAX_WORD_LENGTH = 30;

export default function StoryEditor({
  editableStory,
  keyword,
  timeRemaining,
  onEdit,
  onSkip,
}: StoryEditorProps) {
  const [editingTarget, setEditingTarget] = useState<{
    sentenceIndex: number;
    wordIndex: number;
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  const handleWordClick = (sentenceIndex: number, wordIndex: number, currentWord: string) => {
    setEditingTarget({ sentenceIndex, wordIndex });
    setEditValue(currentWord);
  };

  const handleConfirm = () => {
    if (!editingTarget) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed.includes(' ')) return;
    onEdit(editingTarget.sentenceIndex, editingTarget.wordIndex, trimmed);
    setEditingTarget(null);
    setEditValue('');
  };

  const handleCancel = () => {
    setEditingTarget(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-(--rmhbox-text)">
      {/* Header with keyword reminder and timer */}
      <div className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-purple-300">
            Your keyword:
          </span>
          <span className="rounded-md bg-purple-500/30 px-2 py-0.5 text-sm font-bold text-purple-200">
            {keyword}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-(--rmhbox-text-muted)">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono font-semibold">{timeRemaining}s</span>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-xs text-(--rmhbox-text-muted)">
        Tap an <span className="underline text-purple-300">underlined word</span> to replace it.
        Try to subtly weave in your keyword!
      </p>

      {/* Editable story */}
      <div className="space-y-3 rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4">
        {editableStory.sentences.map((sentence, si) => (
          <div key={si} className="rounded-lg bg-(--rmhbox-bg) p-3">
            <p className="mb-1 text-[10px] text-(--rmhbox-text-muted)">
              — {sentence.authorName}
            </p>
            <div className="flex flex-wrap gap-1 leading-relaxed">
              {sentence.words.map((token, wi) => {
                const isBeingEdited =
                  editingTarget?.sentenceIndex === si &&
                  editingTarget?.wordIndex === wi;

                if (isBeingEdited) {
                  return (
                    <span key={wi} className="inline-flex items-center gap-1">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) =>
                          setEditValue(e.target.value.slice(0, MAX_WORD_LENGTH))
                        }
                        onKeyDown={handleKeyDown}
                        autoFocus
                        className="w-24 rounded border border-purple-500/50 bg-(--rmhbox-surface) px-1.5 py-0.5 text-sm text-(--rmhbox-text) focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                      <button
                        onClick={handleConfirm}
                        disabled={!editValue.trim() || editValue.trim().includes(' ')}
                        className="rounded p-0.5 text-green-400 hover:bg-green-400/20 disabled:opacity-30"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={handleCancel}
                        className="rounded p-0.5 text-red-400 hover:bg-red-400/20"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  );
                }

                return (
                  <span
                    key={wi}
                    onClick={
                      token.isEditable
                        ? () => handleWordClick(si, wi, token.word)
                        : undefined
                    }
                    className={`text-sm ${
                      token.isEditable
                        ? 'cursor-pointer underline decoration-purple-400/50 text-(--rmhbox-text) hover:bg-purple-500/20 rounded px-0.5 transition-colors'
                        : 'text-(--rmhbox-text-muted) opacity-60'
                    }`}
                  >
                    {token.word}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Skip button */}
      <button
        onClick={onSkip}
        className="flex items-center justify-center gap-2 self-center rounded-lg border border-(--rmhbox-border) px-4 py-2 text-sm text-(--rmhbox-text-muted) transition-colors hover:bg-(--rmhbox-surface-hover)"
      >
        <SkipForward className="h-4 w-4" />
        Skip (make no edits)
      </button>
    </div>
  );
}

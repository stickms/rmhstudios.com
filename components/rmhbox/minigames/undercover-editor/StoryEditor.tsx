/**
 * StoryEditor — Editor's secret 2-word edit UI for Undercover Editor.
 *
 * The editor must select and change exactly 2 different words in the most
 * recent sentence. Displays the story for context with the editable sentence
 * highlighted. Each word is a tappable token; clicking a word opens an inline
 * replacement input. After selecting 2 edits, the editor submits them together.
 *
 * Props:
 *   editableStory: EditableStory — Story with word tokens for the last sentence
 *   timeRemaining: number — Seconds left for the edit phase
 *   onEdit: (storyId, edits) => void — Submit the 2-word edit
 *   onSkip: () => void — Skip editing this round
 */
'use client';

import { useState, useCallback } from 'react';
import { Clock, Check, X, SkipForward, Send } from 'lucide-react';

interface EditableWord {
  word: string;
  index: number;
}

interface EditableSentence {
  authorName: string;
  sentenceIndex: number;
  words: EditableWord[];
}

interface StorySentenceView {
  authorName: string;
  text: string;
  roundNumber: number;
}

export interface EditableStory {
  storyId: string;
  ownerName: string;
  prompt: string;
  editableSentence: EditableSentence;
  sentences: StorySentenceView[];
}

interface PendingEdit {
  wordIndex: number;
  originalWord: string;
  newWord: string;
}

interface StoryEditorProps {
  editableStory: EditableStory;
  timeRemaining: number;
  onEdit: (storyId: string, edits: Array<{ wordIndex: number; newWord: string }>) => void;
  onSkip: () => void;
}

const MAX_WORD_LENGTH = 30;
const REQUIRED_EDITS = 2;

export default function StoryEditor({
  editableStory,
  timeRemaining,
  onEdit,
  onSkip,
}: StoryEditorProps) {
  // Track the 2 pending edits (submitted together)
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [editingWordIndex, setEditingWordIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { editableSentence } = editableStory;

  const handleWordClick = useCallback((wordIndex: number, currentWord: string) => {
    // Don't allow editing a word that already has a pending edit
    if (pendingEdits.some((e) => e.wordIndex === wordIndex)) return;
    if (pendingEdits.length >= REQUIRED_EDITS) return;
    setEditingWordIndex(wordIndex);
    setEditValue(currentWord);
  }, [pendingEdits]);

  const handleConfirmWord = useCallback(() => {
    if (editingWordIndex === null) return;
    const trimmed = editValue.trim();
    if (!trimmed || trimmed.includes(' ')) return;

    const originalWord = editableSentence.words.find((w) => w.index === editingWordIndex)?.word ?? '';

    setPendingEdits((prev) => [
      ...prev,
      { wordIndex: editingWordIndex, originalWord, newWord: trimmed },
    ]);
    setEditingWordIndex(null);
    setEditValue('');
  }, [editingWordIndex, editValue, editableSentence.words]);

  const handleCancelWord = useCallback(() => {
    setEditingWordIndex(null);
    setEditValue('');
  }, []);

  const handleRemovePendingEdit = useCallback((wordIndex: number) => {
    setPendingEdits((prev) => prev.filter((e) => e.wordIndex !== wordIndex));
  }, []);

  const handleSubmitEdits = useCallback(() => {
    if (pendingEdits.length !== REQUIRED_EDITS || submitted) return;
    setSubmitted(true);
    onEdit(
      editableStory.storyId,
      pendingEdits.map((e) => ({ wordIndex: e.wordIndex, newWord: e.newWord })),
    );
  }, [pendingEdits, submitted, editableStory.storyId, onEdit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleConfirmWord();
    } else if (e.key === 'Escape') {
      handleCancelWord();
    }
  };

  const canSelectMore = pendingEdits.length < REQUIRED_EDITS;

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4 text-(--rmhbox-text)">
      {/* Header with timer */}
      <div className="flex items-center justify-between rounded-xl border border-purple-500/30 bg-purple-500/10 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-purple-300">
            ✏️ Secret Editor
          </span>
          <span className="rounded-md bg-purple-500/30 px-2 py-0.5 text-xs text-purple-200">
            {pendingEdits.length}/{REQUIRED_EDITS} edits selected
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-(--rmhbox-text-muted)">
          <Clock className="h-3.5 w-3.5" />
          <span className="font-mono font-semibold">{timeRemaining}s</span>
        </div>
      </div>

      {/* Instructions */}
      <p className="text-center text-xs text-(--rmhbox-text-muted)">
        Select exactly <span className="font-bold text-purple-300">2 words</span> in the latest sentence to replace.
        {canSelectMore
          ? ` Tap an underlined word to edit it.`
          : ' Ready to submit!'}
      </p>

      {/* Story context (previous sentences — read only) */}
      {editableStory.sentences.length > 1 && (
        <div className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3 opacity-60">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-(--rmhbox-text-muted)">
            Previous sentences
          </p>
          {editableStory.sentences.slice(0, -1).map((s, i) => (
            <p key={i} className="text-sm text-(--rmhbox-text-muted) leading-relaxed">
              <span className="text-xs opacity-50">({s.authorName})</span> {s.text}
            </p>
          ))}
        </div>
      )}

      {/* Editable sentence — word-level tokens */}
      <div className="rounded-xl border border-purple-500/30 bg-(--rmhbox-surface) p-4">
        <p className="mb-2 text-[10px] text-(--rmhbox-text-muted)">
          Latest sentence — by {editableSentence.authorName}
        </p>
        <div className="flex flex-wrap gap-1 leading-relaxed">
          {editableSentence.words.map((token) => {
            const isBeingEdited = editingWordIndex === token.index;
            const pendingEdit = pendingEdits.find((e) => e.wordIndex === token.index);
            const isPendingEdit = !!pendingEdit;

            if (isBeingEdited) {
              return (
                <span key={token.index} className="inline-flex items-center gap-1">
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
                    onClick={handleConfirmWord}
                    disabled={!editValue.trim() || editValue.trim().includes(' ')}
                    className="rounded p-0.5 text-green-400 hover:bg-green-400/20 disabled:opacity-30"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={handleCancelWord}
                    className="rounded p-0.5 text-red-400 hover:bg-red-400/20"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              );
            }

            if (isPendingEdit) {
              return (
                <span
                  key={token.index}
                  className="inline-flex items-center gap-1 rounded bg-purple-500/20 px-1 py-0.5 cursor-pointer"
                  onClick={() => handleRemovePendingEdit(token.index)}
                  title="Click to undo this edit"
                >
                  <span className="line-through text-red-400/70 text-sm">{pendingEdit!.originalWord}</span>
                  <span className="text-green-400 font-semibold text-sm">{pendingEdit!.newWord}</span>
                  <X className="h-3 w-3 text-(--rmhbox-text-muted)" />
                </span>
              );
            }

            return (
              <span
                key={token.index}
                onClick={
                  canSelectMore
                    ? () => handleWordClick(token.index, token.word)
                    : undefined
                }
                className={`text-sm ${
                  canSelectMore
                    ? 'cursor-pointer underline decoration-purple-400/50 text-(--rmhbox-text) hover:bg-purple-500/20 rounded px-0.5 transition-colors'
                    : 'text-(--rmhbox-text) opacity-60'
                }`}
              >
                {token.word}
              </span>
            );
          })}
        </div>
      </div>

      {/* Pending edits summary */}
      {pendingEdits.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center">
          {pendingEdits.map((edit) => (
            <span
              key={edit.wordIndex}
              className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-xs"
            >
              <span className="line-through text-red-400">{edit.originalWord}</span>
              <span className="text-(--rmhbox-text-muted)">→</span>
              <span className="text-green-400 font-medium">{edit.newWord}</span>
            </span>
          ))}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={handleSubmitEdits}
          disabled={pendingEdits.length !== REQUIRED_EDITS || submitted}
          className="flex items-center justify-center gap-2 rounded-lg bg-(--rmhbox-accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          {submitted ? 'Submitted!' : 'Submit Edits'}
        </button>

        <button
          onClick={onSkip}
          disabled={submitted}
          className="flex items-center justify-center gap-2 rounded-lg border border-(--rmhbox-border) px-4 py-2 text-sm text-(--rmhbox-text-muted) transition-colors hover:bg-(--rmhbox-surface-hover) disabled:opacity-40"
        >
          <SkipForward className="h-4 w-4" />
          Skip
        </button>
      </div>
    </div>
  );
}

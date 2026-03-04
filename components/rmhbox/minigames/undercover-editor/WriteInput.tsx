/**
 * WriteInput — Sentence composition for Undercover Editor.
 *
 * Displays a "Story so far" panel with the prompt shown as the first sentence
 * (styled like player sentences), followed by all previous sentences, then
 * a text input area with character counter (10–200 chars) and submit button.
 *
 * Props:
 *   storyContext: Array<{ authorName, text }> — Previous sentences
 *   storyPrompt: string — The story prompt/theme
 *   storyNumber: number — The numbered story label (1-indexed)
 *   timeRemaining: number — Seconds left for this turn
 *   onSubmit: (text: string) => void — Callback when sentence is submitted
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Clock } from 'lucide-react';

interface StoryContextEntry {
  authorName: string;
  text: string;
}

interface WriteInputProps {
  storyContext: StoryContextEntry[];
  storyPrompt: string;
  storyNumber: number;
  timeRemaining: number;
  onSubmit: (text: string) => void;
}

const MIN_LENGTH = 10;
const MAX_LENGTH = 200;

export default function WriteInput({
  storyContext,
  storyPrompt,
  storyNumber,
  timeRemaining,
  onSubmit,
}: WriteInputProps) {
  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const trimmed = value.trim();
  const charCount = trimmed.length;
  const isValid = charCount >= MIN_LENGTH && charCount <= MAX_LENGTH;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!isValid || submitted) return;
    setSubmitted(true);
    onSubmit(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex w-full max-w-xl flex-col gap-4 text-(--rmhbox-text)">
      {/* Timer */}
      <div className="flex items-center justify-center gap-2 text-sm text-(--rmhbox-text-muted)">
        <Clock className="h-4 w-4" />
        <span className="font-mono font-semibold">{timeRemaining}s</span>
      </div>

      {/* Story so far — prompt shown as first sentence, full height */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wider text-(--rmhbox-text-muted)">
          Story {storyNumber} so far
        </p>
        <div className="space-y-1.5">
          {/* Prompt displayed as a sentence */}
          <p className="text-sm leading-relaxed text-(--rmhbox-text)">
            <span className="opacity-50 text-xs">(prompt)</span> {storyPrompt}
          </p>
          {storyContext.map((s, i) => (
            <p key={i} className="text-sm leading-relaxed text-(--rmhbox-text)">
              <span className="opacity-50 text-xs">({s.authorName})</span> {s.text}
            </p>
          ))}
        </div>
      </div>

      {/* Text input */}
      <div className="relative">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, MAX_LENGTH))}
          onKeyDown={handleKeyDown}
          disabled={submitted}
          placeholder="Continue the story with a sentence…"
          rows={3}
          className="w-full resize-none rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-3 text-sm text-(--rmhbox-text) placeholder:text-(--rmhbox-text-muted) focus:outline-none focus:ring-2 focus:ring-(--rmhbox-accent) disabled:opacity-50"
        />
        {/* Character counter */}
        <span
          className={`absolute bottom-2 right-3 text-[10px] font-mono ${
            charCount < MIN_LENGTH
              ? 'text-(--rmhbox-text-muted)'
              : charCount >= MAX_LENGTH
                ? 'text-(--rmhbox-danger)'
                : 'text-(--rmhbox-success)'
          }`}
        >
          {charCount}/{MAX_LENGTH}
        </span>
      </div>

      {/* Hint */}
      {charCount > 0 && charCount < MIN_LENGTH && (
        <p className="text-center text-[10px] text-(--rmhbox-text-muted)">
          {MIN_LENGTH - charCount} more character{MIN_LENGTH - charCount !== 1 ? 's' : ''} needed
        </p>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!isValid || submitted}
        className="flex items-center justify-center gap-2 rounded-lg bg-(--rmhbox-accent) px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
      >
        <Send className="h-4 w-4" />
        {submitted ? 'Submitted!' : 'Submit Sentence'}
      </button>
    </div>
  );
}

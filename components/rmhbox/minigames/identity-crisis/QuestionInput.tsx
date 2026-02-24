/**
 * QuestionInput — Text input for typing a yes/no question.
 *
 * Provides a text field with character counter, time remaining display,
 * and submit via Enter key or button. Disabled until ≥3 characters typed.
 *
 * Props:
 *   onSubmit: (question: string) => void — Callback when question is submitted
 *   timeRemaining: number — Seconds left to ask a question
 *   maxLength: number — Maximum character length for the question
 */
'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Clock } from 'lucide-react';

interface QuestionInputProps {
  onSubmit: (question: string) => void;
  timeRemaining: number;
  maxLength: number;
}

export default function QuestionInput({ onSubmit, timeRemaining, maxLength }: QuestionInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const trimmed = value.trim();
  const canSubmit = trimmed.length >= 3;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-(--rmhbox-text-muted)">
        <Clock className="h-4 w-4" />
        <span className="font-mono font-semibold">{timeRemaining}s</span>
      </div>

      <p className="text-xs uppercase tracking-wider text-(--rmhbox-text-muted)">
        Ask a yes/no question about your identity
      </p>

      <div className="flex w-full gap-2">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          placeholder="Am I a real person?"
          className="flex-1 rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-4 py-2 text-sm text-(--rmhbox-text) placeholder:text-(--rmhbox-text-muted) focus:outline-none focus:ring-2 focus:ring-(--rmhbox-accent)"
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center gap-2 rounded-lg bg-(--rmhbox-accent) px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-4 w-4" /> Ask
        </button>
      </div>

      <p className="text-xs text-(--rmhbox-text-muted)">
        {value.length} / {maxLength}
      </p>
    </div>
  );
}

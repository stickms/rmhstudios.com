/**
 * WritingPhase — Text inputs for writing answers to assigned prompts.
 *
 * Shows each prompt with a textarea, character counter, and a submit
 * button. Answers are submitted individually; the player can lock in
 * all answers when done.
 */
'use client';

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Send, Check, Pencil } from 'lucide-react';
import { WW_MAX_ANSWER_LENGTH } from '@/lib/rmhbox/constants';
import type { PromptAssignment } from './WitWarGame';

interface WritingPhaseProps {
  prompts: PromptAssignment[];
  onSubmitAnswer: (promptIndex: number, answer: string) => void;
  onSubmitAll: () => void;
  hasSubmitted: boolean;
  submittedCount: number;
  totalPlayers: number;
}

export default function WritingPhase({
  prompts,
  onSubmitAnswer,
  onSubmitAll,
  hasSubmitted,
  submittedCount,
  totalPlayers,
}: WritingPhaseProps) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [sentPrompts, setSentPrompts] = useState<Set<number>>(new Set());

  const handleChange = useCallback((promptIndex: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [promptIndex]: value }));
  }, []);

  const handleSubmitOne = useCallback(
    (promptIndex: number) => {
      const answer = answers[promptIndex]?.trim();
      if (!answer) return;
      onSubmitAnswer(promptIndex, answer);
      setSentPrompts((prev) => new Set(prev).add(promptIndex));
    },
    [answers, onSubmitAnswer],
  );

  const handleSubmitAll = useCallback(() => {
    for (const prompt of prompts) {
      const answer = answers[prompt.promptIndex]?.trim();
      if (answer && !sentPrompts.has(prompt.promptIndex)) {
        onSubmitAnswer(prompt.promptIndex, answer);
      }
    }
    onSubmitAll();
  }, [prompts, answers, sentPrompts, onSubmitAnswer, onSubmitAll]);

  const allFilled = prompts.every((p) => (answers[p.promptIndex]?.trim().length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-(--rmhbox-text) flex items-center gap-2">
          <Pencil className="h-5 w-5" />
          Write Your Answers
        </h2>
        <span className="text-sm text-(--rmhbox-text-muted)">
          {submittedCount}/{totalPlayers} done
        </span>
      </div>

      <div className="flex flex-col gap-5">
        {prompts.map((prompt, idx) => {
          const value = answers[prompt.promptIndex] ?? '';
          const isSent = sentPrompts.has(prompt.promptIndex);

          return (
            <motion.div
              key={prompt.promptIndex}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="rounded-xl border border-(--rmhbox-border) bg-(--rmhbox-surface) p-4"
            >
              <div className="text-sm font-medium text-(--rmhbox-text-muted) mb-2">
                Prompt {idx + 1}
              </div>
              <div className="text-base font-medium text-(--rmhbox-text) mb-3">
                {prompt.promptText}
              </div>

              <div className="relative">
                <textarea
                  value={value}
                  onChange={(e) => handleChange(prompt.promptIndex, e.target.value)}
                  maxLength={WW_MAX_ANSWER_LENGTH}
                  disabled={hasSubmitted || isSent}
                  placeholder="Type your answer..."
                  rows={2}
                  className="w-full rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) px-3 py-2 text-(--rmhbox-text) placeholder:text-(--rmhbox-text-muted)/50 focus:outline-none focus:ring-2 focus:ring-(--rmhbox-accent) disabled:opacity-50 resize-none"
                />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-(--rmhbox-text-muted)">
                    {value.length}/{WW_MAX_ANSWER_LENGTH}
                  </span>
                  {isSent ? (
                    <span className="flex items-center gap-1 text-xs text-green-500">
                      <Check className="h-3 w-3" /> Sent
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSubmitOne(prompt.promptIndex)}
                      disabled={!value.trim() || hasSubmitted}
                      className="flex items-center gap-1 rounded-md bg-(--rmhbox-accent) px-3 py-1 text-xs font-medium text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
                    >
                      <Send className="h-3 w-3" /> Submit
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {!hasSubmitted && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          onClick={handleSubmitAll}
          disabled={!allFilled}
          className="w-full rounded-xl bg-(--rmhbox-accent) py-3 text-base font-bold text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          {allFilled ? 'Lock In All Answers' : 'Fill in all prompts to submit'}
        </motion.button>
      )}

      {hasSubmitted && (
        <div className="text-center text-sm text-(--rmhbox-text-muted) py-2">
          Answers locked in! Waiting for other players...
        </div>
      )}
    </div>
  );
}

/**
 * QuestionHistory — Scrollable list of past questions and their vote results.
 *
 * Displays a chronological list of previously asked questions with
 * the asker's name, the question text, and a mini vote distribution bar.
 *
 * Props:
 *   questions: Array of question entries with vote tallies and majority answer
 */
'use client';

import { MessageCircle } from 'lucide-react';

interface QuestionEntry {
  question: string;
  askerName: string;
  votes: { yes: number; no: number; maybe: number };
  majorityAnswer: string;
}

interface QuestionHistoryProps {
  questions: QuestionEntry[];
}

export default function QuestionHistory({ questions }: QuestionHistoryProps) {
  if (questions.length === 0) {
    return (
      <p className="text-center text-xs text-(--rmhbox-text-muted)">No questions asked yet.</p>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2">
      <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
        <MessageCircle className="h-3.5 w-3.5" /> Question History
      </h3>

      <div className="max-h-48 space-y-2 overflow-y-auto">
        {questions.map((q, i) => {
          const total = q.votes.yes + q.votes.no + q.votes.maybe;
          return (
            <div
              key={i}
              className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-surface) px-3 py-2"
            >
              <p className="text-xs text-(--rmhbox-text-muted)">
                <span className="font-semibold text-(--rmhbox-accent)">{q.askerName}</span> asked:
              </p>
              <p className="mt-0.5 text-sm font-medium text-(--rmhbox-text)">{q.question}</p>

              {/* Mini vote bar */}
              {total > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex h-2 flex-1 overflow-hidden rounded-full">
                    {q.votes.yes > 0 && (
                      <div
                        className="bg-(--rmhbox-success)"
                        style={{ width: `${(q.votes.yes / total) * 100}%` }}
                      />
                    )}
                    {q.votes.no > 0 && (
                      <div
                        className="bg-(--rmhbox-danger)"
                        style={{ width: `${(q.votes.no / total) * 100}%` }}
                      />
                    )}
                    {q.votes.maybe > 0 && (
                      <div
                        className="bg-(--rmhbox-warning)"
                        style={{ width: `${(q.votes.maybe / total) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] font-semibold text-(--rmhbox-text-muted)">
                    {q.majorityAnswer}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

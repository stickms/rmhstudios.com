/**
 * FactOrFrictionHistoryDetail — Expanded history view for FOF games.
 *
 * Renders each question with category, difficulty, correct answer,
 * and per-player results showing who answered correctly, their
 * score changes, and speed bonuses.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §1.5
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';
import { Check, X, Clock, SkipForward, Zap } from 'lucide-react';

interface QuestionResult {
  userId: string;
  selectedIndex: number | null;
  isCorrect: boolean;
  scoreChange: number;
  isFirst: boolean;
  passed: boolean;
  timedOut: boolean;
}

const LABELS = ['A', 'B', 'C', 'D'];

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: 'bg-green-500/20 text-green-400',
  medium: 'bg-yellow-500/20 text-yellow-400',
  hard: 'bg-red-500/20 text-red-400',
};

export default function FactOrFrictionHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const questionStarts = gameLog.actions.filter((a) => a.type === 'question_start');
  const answerReveals = gameLog.actions.filter((a) => a.type === 'answer_reveal');

  return (
    <div className="space-y-4" data-testid="fof-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="mb-1 text-xs font-semibold uppercase text-(--rmhbox-text-muted)">Game Settings</h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Questions: {(gameLog.initialState.totalQuestions as number) ?? questionStarts.length}</span>
            {gameLog.initialState.answerDuration != null && (
              <span>Answer Time: {String(gameLog.initialState.answerDuration)}s</span>
            )}
            {gameLog.initialState.potStartValue != null && (
              <span>Starting Pot: {String(gameLog.initialState.potStartValue)}</span>
            )}
          </div>
        </div>
      )}

      {/* Questions */}
      {questionStarts.map((qs, idx) => {
        const questionNum = idx + 1;
        const questionText = qs.payload.questionText as string;
        const category = qs.payload.category as string | undefined;
        const difficulty = qs.payload.difficulty as string | undefined;
        const options = (qs.payload.options as string[]) ?? [];
        const correctIndex = qs.payload.correctIndex as number | undefined;

        // Get the corresponding answer reveal
        const reveal = answerReveals[idx];
        const revealResults = (reveal?.payload.playerResults as QuestionResult[]) ?? [];

        return (
          <div
            key={questionNum}
            className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
          >
            {/* Question header */}
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-(--rmhbox-text-muted)">
                Question {questionNum}
              </h4>
              <div className="flex items-center gap-2">
                {category && (
                  <span className="rounded-full bg-(--rmhbox-surface-hover) px-2 py-0.5 text-xs text-(--rmhbox-text-muted)">
                    {category}
                  </span>
                )}
                {difficulty && (
                  <span className={`rounded-full px-1.5 py-0.5 text-xs ${DIFFICULTY_STYLES[difficulty] ?? ''}`}>
                    {difficulty}
                  </span>
                )}
              </div>
            </div>

            {/* Question text */}
            <p className="mb-3 text-sm font-medium text-(--rmhbox-text)">{questionText}</p>

            {/* Options */}
            {options.length > 0 && (
              <div className="mb-3 grid grid-cols-2 gap-1.5">
                {options.map((opt, i) => {
                  const isCorrect = i === correctIndex;
                  return (
                    <div
                      key={i}
                      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                        isCorrect
                          ? 'border-green-500/50 bg-green-500/10 text-green-400 font-semibold'
                          : 'border-(--rmhbox-border) text-(--rmhbox-text-muted)'
                      }`}
                    >
                      <span className="font-bold">{LABELS[i]}.</span>
                      <span className="truncate">{opt}</span>
                      {isCorrect && <Check className="ml-auto h-3 w-3 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Player results for this question */}
            {revealResults.length > 0 && (
              <div className="border-t border-(--rmhbox-border) pt-2">
                <span className="text-xs font-medium uppercase text-(--rmhbox-text-muted)">Responses</span>
                <div className="mt-1 space-y-1">
                  {revealResults.map((pr) => {
                    const name = players.find((p) => p.userId === pr.userId)?.userName ?? pr.userId;
                    const isMe = pr.userId === currentUserId;
                    return (
                      <div
                        key={pr.userId}
                        className={`flex items-center justify-between text-xs ${
                          isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text-muted)'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          {pr.isCorrect ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : pr.passed ? (
                            <SkipForward className="h-3 w-3 text-yellow-400" />
                          ) : pr.timedOut ? (
                            <Clock className="h-3 w-3" />
                          ) : (
                            <X className="h-3 w-3 text-red-400" />
                          )}
                          <span>{name}</span>
                          {pr.isFirst && (
                            <span className="flex items-center gap-0.5 text-[10px] text-yellow-400">
                              <Zap className="h-2.5 w-2.5" /> First
                            </span>
                          )}
                          {pr.selectedIndex != null && options[pr.selectedIndex] && (
                            <span className="opacity-50">({LABELS[pr.selectedIndex]})</span>
                          )}
                        </div>
                        <span className={pr.scoreChange > 0 ? 'text-green-400' : pr.scoreChange < 0 ? 'text-red-400' : ''}>
                          {pr.scoreChange > 0 ? '+' : ''}{pr.scoreChange}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Final scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="mb-2 text-sm font-semibold text-(--rmhbox-text-muted)">Final Scores</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <div
                key={p.userId}
                className={`flex justify-between text-sm ${
                  p.userId === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'
                }`}
              >
                <span>
                  #{p.rank} {p.userName}
                </span>
                <span className="font-mono">{p.score}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

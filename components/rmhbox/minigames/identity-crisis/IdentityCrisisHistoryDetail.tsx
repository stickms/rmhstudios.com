/**
 * Identity Crisis — History Detail Component
 *
 * Renders the expanded game log for Identity Crisis matches.
 * Shows identity assignments, question timeline with vote breakdowns,
 * early/final guess results, and voting accuracy scores.
 *
 * Reference: docs/rmhbox/design-spec/minigames-4.md §1.15
 */

'use client';

import { CheckCircle, XCircle, HelpCircle } from 'lucide-react';

interface GameLogAction {
  type: string;
  payload: Record<string, unknown>;
  timestamp?: number;
}

interface GameLog {
  initialState: Record<string, unknown>;
  actions: GameLogAction[];
  finalResults?: Record<string, unknown>;
  players: Array<{ userId: string; userName: string }>;
  gameSettings?: Record<string, unknown>;
}

interface IdentityCrisisHistoryDetailProps {
  log: GameLog;
}

export default function IdentityCrisisHistoryDetail({ log }: IdentityCrisisHistoryDetailProps) {
  const assignments = (log.initialState.identityAssignments as Array<{ userId: string; assignedIdentity: string }>) ?? [];
  const questions = log.actions.filter((a) => a.type === 'question_asked');
  const voteResults = log.actions.filter((a) => a.type === 'vote_result');
  const earlyGuesses = log.actions.filter((a) => a.type === 'early_guess');
  const finalGuesses = log.actions.filter((a) => a.type === 'final_guess');
  const reveals = log.actions.filter((a) => a.type === 'identity_reveal');

  const playerMap = new Map(log.players.map((p) => [p.userId, p.userName]));

  return (
    <div className="space-y-6 text-(--rmhbox-text)">
      {/* Identity Assignments */}
      <section>
        <h3 className="text-lg font-bold mb-2">🎭 Identity Assignments</h3>
        <div className="grid grid-cols-2 gap-2">
          {assignments.map((a) => (
            <div key={a.userId} className="rounded-lg bg-(--rmhbox-surface)/50 p-2 text-sm">
              <span className="font-semibold">{playerMap.get(a.userId) ?? a.userId}</span>
              <span className="text-(--rmhbox-text-muted)"> → </span>
              <span>{a.assignedIdentity}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Question Timeline */}
      <section>
        <h3 className="text-lg font-bold mb-2">❓ Question Timeline</h3>
        <div className="space-y-3">
          {questions.map((q, i) => {
            const voteResult = voteResults[i];
            const votes = voteResult?.payload as { yes?: number; no?: number; maybe?: number; majorityAnswer?: string } | undefined;
            return (
              <div key={i} className="rounded-lg bg-(--rmhbox-surface)/50 p-3">
                <div className="text-sm text-(--rmhbox-text-muted) mb-1">
                  Q{(q.payload.roundNumber as number) ?? i + 1} — {playerMap.get(q.payload.askerId as string) ?? 'Unknown'} asks:
                </div>
                <div className="font-medium mb-2">&ldquo;{q.payload.questionText as string}&rdquo;</div>
                {votes && (
                  <div className="flex gap-3 text-sm">
                    <span className="text-green-400">Yes: {votes.yes ?? 0}</span>
                    <span className="text-red-400">No: {votes.no ?? 0}</span>
                    <span className="text-amber-400">Maybe: {votes.maybe ?? 0}</span>
                    <span className="text-(--rmhbox-text-muted)">→ {votes.majorityAnswer}</span>
                  </div>
                )}
              </div>
            );
          })}
          {questions.length === 0 && (
            <p className="text-sm text-(--rmhbox-text-muted)">No questions recorded.</p>
          )}
        </div>
      </section>

      {/* Early Guesses */}
      {earlyGuesses.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-2">⚡ Early Guesses</h3>
          <div className="space-y-2">
            {earlyGuesses.map((g, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-(--rmhbox-surface)/50 p-2 text-sm">
                {(g.payload.correct as boolean) ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400" />
                )}
                <span className="font-semibold">{playerMap.get(g.payload.userId as string) ?? 'Unknown'}</span>
                <span>guessed &ldquo;{g.payload.guess as string}&rdquo;</span>
                <span className="text-(--rmhbox-text-muted)">
                  (Round {g.payload.roundNumber as number})
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Final Guesses */}
      <section>
        <h3 className="text-lg font-bold mb-2">🎯 Final Guesses</h3>
        <div className="space-y-2">
          {finalGuesses.map((g, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg bg-(--rmhbox-surface)/50 p-2 text-sm">
              {(g.payload.correct as boolean) ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : (
                <XCircle className="h-4 w-4 text-red-400" />
              )}
              <span className="font-semibold">{playerMap.get(g.payload.userId as string) ?? 'Unknown'}</span>
              <span>guessed &ldquo;{g.payload.guess as string}&rdquo;</span>
            </div>
          ))}
          {finalGuesses.length === 0 && (
            <p className="text-sm text-(--rmhbox-text-muted)">No final guesses recorded.</p>
          )}
        </div>
      </section>

      {/* Identity Reveals */}
      {reveals.length > 0 && (
        <section>
          <h3 className="text-lg font-bold mb-2">🎭 Final Reveals</h3>
          <div className="grid grid-cols-2 gap-2">
            {reveals.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-(--rmhbox-surface)/50 p-2 text-sm">
                {(r.payload.guessedCorrectly as boolean) ? (
                  <CheckCircle className="h-4 w-4 text-green-400" />
                ) : (
                  <HelpCircle className="h-4 w-4 text-(--rmhbox-text-muted)" />
                )}
                <div>
                  <span className="font-semibold">{playerMap.get(r.payload.userId as string) ?? 'Unknown'}</span>
                  <span className="text-(--rmhbox-text-muted)"> was </span>
                  <span>{r.payload.assignedIdentity as string}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

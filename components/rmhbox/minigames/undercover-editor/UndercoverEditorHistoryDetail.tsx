/**
 * UndercoverEditorHistoryDetail — History display for Undercover Editor games.
 *
 * Renders the story with highlighted edits, vote results, keyword reveal,
 * and final scores. Follows the existing HistoryDetailProps pattern.
 *
 * Reference: docs/rmhbox/design-spec/minigames-1.md
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface EditEntry {
  sentenceIndex: number;
  originalWord: string;
  newWord: string;
}

interface VoteEntry {
  voterUserId: string;
  accusedUserId: string;
}

interface SentenceEntry {
  authorUserId: string;
  text: string;
  turnNumber: number;
}

export default function UndercoverEditorHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  // Extract game data from log actions
  const roleAssignment = gameLog.actions.find((a) => a.type === 'role_assignment');
  const storyComplete = gameLog.actions.find((a) => a.type === 'story_complete');
  const editAction = gameLog.actions.find((a) => a.type === 'edit_complete');
  const revealAction = gameLog.actions.find((a) => a.type === 'reveal');
  const sentenceActions = gameLog.actions.filter((a) => a.type === 'sentence_added');

  const editorUserId = (roleAssignment?.payload.editorUserId ?? revealAction?.payload.editorUserId) as string | undefined;
  const keyword = (roleAssignment?.payload.keyword ?? revealAction?.payload.keyword) as string | undefined;
  const storyPrompt = (gameLog.initialState?.storyPrompt as string) ?? 'Unknown prompt';

  // Sentences from story_complete or individual actions
  const sentences: SentenceEntry[] = storyComplete?.payload.sentences as SentenceEntry[]
    ?? sentenceActions.map((a) => ({
      authorUserId: a.payload.authorUserId as string,
      text: a.payload.text as string,
      turnNumber: a.payload.turnNumber as number,
    }));

  const edits: EditEntry[] = (editAction?.payload.edits ?? revealAction?.payload.edits) as EditEntry[] ?? [];
  const votes: VoteEntry[] = (revealAction?.payload.votes) as VoteEntry[] ?? [];
  const editorCaught = revealAction?.payload.editorCaught as boolean | undefined;
  const winner = revealAction?.payload.winner as string | undefined;

  const getName = (userId: string) =>
    players.find((p) => p.userId === userId)?.userName ?? userId;

  return (
    <div className="space-y-4" data-testid="undercover-editor-history-detail">
      {/* Game Settings */}
      {gameLog.initialState && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-3">
          <h4 className="text-xs font-semibold text-(--rmhbox-text-muted) uppercase mb-1">
            Game Settings
          </h4>
          <div className="flex flex-wrap gap-3 text-xs text-(--rmhbox-text-muted)">
            <span>Prompt: &ldquo;{storyPrompt}&rdquo;</span>
            {keyword && <span>Keyword: {keyword}</span>}
            {gameLog.initialState.turnsPerPlayer != null && (
              <span>Turns/Player: {String(gameLog.initialState.turnsPerPlayer)}</span>
            )}
          </div>
        </div>
      )}

      {/* Story with edits highlighted */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">📖 The Story</h4>
        <div className="space-y-2">
          {sentences.map((s, i) => {
            const isMe = s.authorUserId === currentUserId;
            const sentenceEdits = edits.filter((e) => e.sentenceIndex === i);

            return (
              <div key={i} className="rounded-lg bg-(--rmhbox-surface) p-3">
                <p className="text-sm leading-relaxed text-(--rmhbox-text)">
                  {s.text}
                </p>
                {/* Show edits inline if any */}
                {sentenceEdits.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {sentenceEdits.map((edit, ei) => (
                      <span
                        key={ei}
                        className="inline-flex items-center gap-1 rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px]"
                      >
                        <span className="line-through text-red-400">{edit.originalWord}</span>
                        <span className="text-(--rmhbox-text-muted)">→</span>
                        <span className="text-green-400 font-medium">{edit.newWord}</span>
                      </span>
                    ))}
                  </div>
                )}
                <p className={`mt-1 text-[10px] ${
                  isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text-muted)'
                }`}>
                  — {getName(s.authorUserId)} · Turn {s.turnNumber}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Keyword & Editor reveal */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">🔍 Reveal</h4>
        <div className="space-y-1.5 text-sm">
          {editorUserId && (
            <p className="text-(--rmhbox-text)">
              The Editor was:{' '}
              <span className={`font-bold ${
                editorUserId === currentUserId ? 'text-(--rmhbox-accent)' : 'text-purple-400'
              }`}>
                {getName(editorUserId)}
              </span>
            </p>
          )}
          {keyword && (
            <p className="text-(--rmhbox-text)">
              Keyword:{' '}
              <span className="font-bold text-yellow-400">{keyword}</span>
            </p>
          )}
          {editorCaught != null && (
            <p className="text-(--rmhbox-text-muted)">
              {editorCaught ? '🔎 Writers caught the editor!' : '🕵️ The editor got away!'}
            </p>
          )}
          {winner && (
            <p className="text-(--rmhbox-text)">
              🏆 {winner}
            </p>
          )}
        </div>
      </div>

      {/* Votes */}
      {votes.length > 0 && (
        <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">🗳️ Votes</h4>
          <div className="space-y-1">
            {votes.map((v, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className={v.voterUserId === currentUserId ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text)'}>
                  {getName(v.voterUserId)}
                </span>
                <span className="text-(--rmhbox-text-muted)">→</span>
                <span className="font-medium text-(--rmhbox-text)">
                  {getName(v.accusedUserId)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Final Scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Final Scores</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => {
              const isEditor = p.userId === editorUserId;
              return (
                <div
                  key={p.userId}
                  className={`flex justify-between text-sm ${
                    p.userId === currentUserId
                      ? 'text-(--rmhbox-accent) font-semibold'
                      : 'text-(--rmhbox-text)'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    #{p.rank} {p.userName}
                    {isEditor && (
                      <span className="text-[10px] px-1 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                        ✏️ Editor
                      </span>
                    )}
                  </span>
                  <span className="font-mono">{p.score}</span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

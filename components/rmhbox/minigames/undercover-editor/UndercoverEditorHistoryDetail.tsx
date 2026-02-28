/**
 * UndercoverEditorHistoryDetail — History display for Undercover Editor games.
 *
 * Renders per-story views with highlighted edits, editor reveal,
 * and final scores. No keywords or votes in the redesigned game.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §2
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface EditEntry {
  sentenceIndex: number;
  originalWord: string;
  newWord: string;
}

interface SentenceEntry {
  authorUserId: string;
  text: string;
  roundNumber: number;
}

interface StoryReveal {
  storyId: string;
  ownerName: string;
  editorUserId: string;
  editorName: string;
  edits: EditEntry[];
  sentences: SentenceEntry[];
}

export default function UndercoverEditorHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  const revealAction = gameLog.actions.find((a) => a.type === 'reveal');
  const storyReveals = (revealAction?.payload.storyReveals ?? []) as StoryReveal[];

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
            {gameLog.initialState.totalSteps != null && (
              <span>Steps: {String(gameLog.initialState.totalSteps)}</span>
            )}
            {gameLog.initialState.numPlayers != null && (
              <span>Players: {String(gameLog.initialState.numPlayers)}</span>
            )}
          </div>
        </div>
      )}

      {/* Per-story display */}
      {storyReveals.map((reveal) => (
        <div
          key={reveal.storyId}
          className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
        >
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">
            📖 {reveal.ownerName}&apos;s Story
          </h4>

          {/* Sentences */}
          <div className="space-y-2 mb-3">
            {reveal.sentences.map((s, i) => {
              const isMe = s.authorUserId === currentUserId;
              const sentenceEdits = reveal.edits.filter((e) => e.sentenceIndex === i);

              return (
                <div key={i} className="rounded-lg bg-(--rmhbox-surface) p-3">
                  <p className="text-sm leading-relaxed text-(--rmhbox-text)">
                    {s.text}
                  </p>
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
                    — {getName(s.authorUserId)} · Round {s.roundNumber}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Editor reveal */}
          <div className="text-sm">
            <p className="text-(--rmhbox-text)">
              Editor:{' '}
              <span className={`font-bold ${
                reveal.editorUserId === currentUserId ? 'text-(--rmhbox-accent)' : 'text-purple-400'
              }`}>
                {reveal.editorName}
              </span>
            </p>
          </div>
        </div>
      ))}

      {/* Final Scores */}
      <div className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4">
        <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-2">Final Scores</h4>
        <div className="space-y-1">
          {players
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <div
                key={p.userId}
                className={`flex justify-between text-sm ${
                  p.userId === currentUserId
                    ? 'text-(--rmhbox-accent) font-semibold'
                    : 'text-(--rmhbox-text)'
                }`}
              >
                <span>#{p.rank} {p.userName}</span>
                <span className="font-mono">{p.score}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * UndercoverEditorHistoryDetail — History display for Undercover Editor games.
 *
 * Renders per-story views with in-situ edit highlighting: edited words are
 * shown inline with strikethrough original and colored replacement.
 * Stories are numbered, not player-named.
 *
 * Reference: docs/rmhbox/design-spec/minigames-2.md §2
 */
'use client';

import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface EditEntry {
  sentenceIndex: number;
  wordIndex: number;
  originalWord: string;
  newWord: string;
}

interface SentenceEntry {
  authorUserId: string;
  authorName?: string;
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

/**
 * Renders a sentence with edits shown in-situ: each edited word is displayed
 * as [strikethrough-original → new-word] inline within the sentence text.
 */
function SentenceWithEdits({
  sentence,
  edits,
}: {
  sentence: SentenceEntry;
  edits: EditEntry[];
}) {
  // If no edits apply to this sentence, render the text normally
  if (edits.length === 0) {
    return <span>{sentence.text}</span>;
  }

  // Build a map of wordIndex → edit for quick lookup
  const editByWordIndex = new Map<number, EditEntry>();
  for (const edit of edits) {
    editByWordIndex.set(edit.wordIndex, edit);
  }

  // Split current sentence text into words to reconstruct with inline edits.
  // The current text already contains the editor's replacements. We rebuild
  // the display by replacing each edited word position with original→new markup.
  const words = sentence.text.split(/\s+/);

  return (
    <span>
      {words.map((word, wi) => {
        const edit = editByWordIndex.get(wi);
        if (edit) {
          return (
            <span key={wi}>
              {wi > 0 && ' '}
              <span className="inline-flex items-center gap-0.5 rounded bg-(--rmhbox-rare-dim) px-1 py-0.5 text-[inherit]">
                <span className="line-through text-(--rmhbox-danger)">{edit.originalWord}</span>
                <span className="text-(--rmhbox-text-muted) text-[0.75em]">→</span>
                <span className="text-(--rmhbox-success) font-medium">{edit.newWord}</span>
              </span>
            </span>
          );
        }
        return (
          <span key={wi}>
            {wi > 0 && ' '}
            {word}
          </span>
        );
      })}
    </span>
  );
}

export default function UndercoverEditorHistoryDetail({
  gameLog,
  currentUserId,
  players,
}: HistoryDetailProps) {
  // Full storyReveals from the 'reveal' action in gameLog
  const revealAction = gameLog.actions.find((a) => a.type === 'reveal');
  const storyReveals = (revealAction?.payload?.storyReveals ?? []) as StoryReveal[];

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

      {/* Per-story display — numbered instead of player-named */}
      {storyReveals.map((reveal, idx) => (
        <div
          key={reveal.storyId}
          className="rounded-lg border border-(--rmhbox-border) bg-(--rmhbox-bg) p-4"
        >
          <h4 className="text-sm font-semibold text-(--rmhbox-text-muted) mb-3">
            📖 Story {idx + 1}
          </h4>

          {/* Sentences with in-situ edit highlighting */}
          <div className="space-y-2 mb-3">
            {reveal.sentences.map((s, i) => {
              const isMe = s.authorUserId === currentUserId;
              const sentenceEdits = reveal.edits.filter((e) => e.sentenceIndex === i);
              const authorLabel = s.authorName || getName(s.authorUserId);

              return (
                <div key={i} className="rounded-lg bg-(--rmhbox-surface) p-3">
                  <p className="text-sm leading-relaxed text-(--rmhbox-text)">
                    <SentenceWithEdits sentence={s} edits={sentenceEdits} />
                  </p>
                  <p className={`mt-1 text-[10px] ${
                    isMe ? 'text-(--rmhbox-accent) font-semibold' : 'text-(--rmhbox-text-muted)'
                  }`}>
                    — {authorLabel} · Round {s.roundNumber}
                    {sentenceEdits.length > 0 && (
                      <span className="text-(--rmhbox-rare)"> · {sentenceEdits.length} edit{sentenceEdits.length > 1 ? 's' : ''}</span>
                    )}
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
                reveal.editorUserId === currentUserId ? 'text-(--rmhbox-accent)' : 'text-(--rmhbox-rare)'
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

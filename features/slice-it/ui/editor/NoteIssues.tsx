/**
 * What the linter found on the selected note, and the way to the next flagged
 * note. The timeline draws a ring on the same notes; this is the same finding in
 * words, so the ring is never the only signal.
 */

import { AlertTriangle, ChevronLeft, ChevronRight, OctagonAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { issueOrder, nextIssue, prevIssue, type IssueRef } from '@features/slice-it/engine/editor/overview';
import { editorState, useEditorStore } from '@features/slice-it/engine/editor/store';
import type { EditorNote, LintIssue } from '@features/slice-it/engine/editor/types';
import { issuesByNote } from '@features/slice-it/engine/editor/lint';
import { useLintIssues } from '@features/slice-it/engine/editor/useLint';

/**
 * Select the next or previous flagged note of the open difficulty and put the
 * playhead on it. Not an edit: selection and playhead are view state, so nothing
 * lands on the undo stack. Returns the note it went to, or null when nothing is
 * flagged.
 */
export function stepIssue(direction: 'next' | 'prev'): IssueRef | null {
  const state = editorState();
  const notes = state.charts[state.active].notes;
  const order = issueOrder(notes, issuesByNote(state.lint, state.active));
  const selected = notes.filter((note) => note.selected);
  const current = selected.length === 1 ? selected[0].id : null;
  const target =
    direction === 'next' ? nextIssue(order, state.playhead, current) : prevIssue(order, state.playhead, current);
  if (!target) return null;
  state.setSelection([target.noteId], 'replace');
  state.setPlayhead(target.time);
  return target;
}

function IssueLine({ issue, onSeek }: { issue: LintIssue; onSeek: () => void }) {
  const { t } = useTranslation('chart-overview');
  let sentence: string;
  switch (issue.code) {
    case 'unhittable-jack':
      sentence = t('issue-unhittable-jack', {
        defaultValue: 'Unhittable jack',
      });
      break;
    case 'too-early':
      sentence = t('issue-too-early', {
        defaultValue: 'Too early in the song',
      });
      break;
    case 'hold-too-short':
      sentence = t('issue-hold-too-short', {
        defaultValue: 'Hold too short',
      });
      break;
    case 'density-spike':
      sentence = t('issue-density-spike', {
        defaultValue: 'Too many notes at once',
      });
      break;
    case 'empty-stretch':
      sentence = t('issue-empty-stretch', {
        defaultValue: 'Long empty stretch',
      });
      break;
    case 'off-grid':
      sentence = t('issue-off-grid', {
        defaultValue: 'Off the beat grid',
      });
      break;
    case 'nesting-violation':
      sentence = t('issue-nesting-violation', {
        defaultValue: 'Missing from a harder difficulty',
      });
      break;
    default:
      sentence = t('issue-unknown', {
        defaultValue: 'Issue',
      });
  }
  const isError = issue.severity === 'error';
  const Icon = isError ? OctagonAlert : AlertTriangle;
  return (
    <li>
      <button
        type="button"
        onClick={onSeek}
        className="flex min-h-9 w-full items-center gap-2 rounded-site px-1 text-left text-xs hover:bg-[var(--slice-surface-hover)] pointer-coarse:min-h-11"
      >
        <Icon
          className={
            isError
              ? 'h-3.5 w-3.5 shrink-0 text-[var(--slice-danger)]'
              : 'h-3.5 w-3.5 shrink-0 text-[var(--slice-warning)]'
          }
          aria-hidden
        />
        <span className="min-w-0 flex-1">{sentence}</span>
        <span className="shrink-0 opacity-70">
          {isError
            ? t('issue-severity-error', {
                defaultValue: 'Error',
              })
            : t('issue-severity-warning', {
                defaultValue: 'Warning',
              })}
        </span>
      </button>
    </li>
  );
}

export function NoteIssues({ note }: { note: EditorNote }) {
  const { t } = useTranslation('chart-overview');
  const active = useEditorStore((s) => s.active);
  const issues = useLintIssues(active);
  const mine = issues.get(note.id) ?? [];
  const flagged = issues.size > 0;
  const setPlayhead = useEditorStore((s) => s.setPlayhead);

  return (
    <div className="flex flex-col gap-2 border-t border-[var(--slice-border)] pt-3">
      <h3 className="text-xs font-semibold">
        {t('issues-title', {
          defaultValue: 'Issues',
        })}
      </h3>
      {mine.length === 0 ? (
        <p className="text-xs opacity-70">
          {t('issues-none', {
            defaultValue: 'No issues on this note.',
          })}
        </p>
      ) : (
        <ul className="flex flex-col">
          {mine.map((issue) => (
            <IssueLine key={`${issue.code}:${issue.message}`} issue={issue} onSeek={() => setPlayhead(note.time)} />
          ))}
        </ul>
      )}
      {flagged && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => stepIssue('prev')}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            {t('issues-previous', {
              defaultValue: 'Previous issue',
            })}
          </Button>
          <Button size="sm" onClick={() => stepIssue('next')}>
            {t('issues-next', {
              defaultValue: 'Next issue',
            })}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}

/** The issue keys, as rows for the shortcut sheet. */
export function IssueShortcuts() {
  const { t } = useTranslation('chart-overview');
  const rows: {
    keys: string;
    action: string;
  }[] = [
    {
      keys: 'E',
      action: t('key-next-issue', {
        defaultValue: 'Next issue',
      }),
    },
    {
      keys: 'Shift+E',
      action: t('key-previous-issue', {
        defaultValue: 'Previous issue',
      }),
    },
    {
      keys: 'Left / Right',
      action: t('key-minimap-seek', {
        defaultValue: 'On the song overview: move 5 seconds',
      }),
    },
  ];
  return (
    <>
      {rows.map((row) => (
        <div key={row.keys} className="contents">
          <dt className="font-mono text-xs opacity-80">{row.keys}</dt>
          <dd>{row.action}</dd>
        </div>
      ))}
    </>
  );
}

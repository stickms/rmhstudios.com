import {
  Redo2,
  Undo2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  historyAvailability,
  redoCommand,
  undoCommand,
} from '@/lib/studio/edit-commands';
import { useJamStore } from '@/lib/studio/jam/store';
import { useStudioStore } from '@/lib/studio/store';
import { stepName } from './history-labels';

const BUTTON =
  'rounded-app-sm p-1.5 text-app-text-muted hover:bg-app-surface-hover hover:text-app-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-app-text-muted';

/**
 * Undo and Redo for the Studio toolbar. Each button's name carries the step it would act on ("Undo Move clip"),
 * a disabled one says why, and a polite live region announces what was just undone or redone.
 */
export function UndoRedoButtons() {
  const {
    t,
  } =
    useTranslation(
      'studio-editing',
    );
  const history =
    useStudioStore(
      (
        s,
      ) =>
        s.history,
    );
  const move =
    useStudioStore(
      (
        s,
      ) =>
        s.lastHistoryMove,
    );
  // Re-render when a jam connects or ends: it switches both buttons off.
  useJamStore(
    (
      s,
    ) =>
      s.status,
  );
  const a =
    historyAvailability(
      {
        history,
      },
    );

  const undoName =
    a.blocked
      ? t(
          'undo-jam',
          {
            defaultValue:
              'Undo is off while a jam is connected',
          },
        )
      : a.undoLabel
        ? t(
            'undo-step',
            {
              defaultValue:
                'Undo {{step}}',
              step: stepName(
                t,
                a.undoLabel,
              ),
            },
          )
        : t(
            'undo-empty',
            {
              defaultValue:
                'Nothing to undo',
            },
          );
  const redoName =
    a.blocked
      ? t(
          'redo-jam',
          {
            defaultValue:
              'Redo is off while a jam is connected',
          },
        )
      : a.redoLabel
        ? t(
            'redo-step',
            {
              defaultValue:
                'Redo {{step}}',
              step: stepName(
                t,
                a.redoLabel,
              ),
            },
          )
        : t(
            'redo-empty',
            {
              defaultValue:
                'Nothing to redo',
            },
          );

  let announcement =
    '';
  if (
    move
  ) {
    const step =
      stepName(
        t,
        move.label,
      );
    announcement =
      move.kind ===
      'undo'
        ? t(
            'undid-step',
            {
              defaultValue:
                'Undid {{step}}',
              step,
            },
          )
        : t(
            'redid-step',
            {
              defaultValue:
                'Redid {{step}}',
              step,
            },
          );
  }

  return (
    <>
      <button
        type="button"
        onClick={() =>
          undoCommand()
        }
        disabled={
          !a.canUndo
        }
        className={
          BUTTON
        }
        title={
          undoName
        }
        aria-label={
          undoName
        }
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() =>
          redoCommand()
        }
        disabled={
          !a.canRedo
        }
        className={
          BUTTON
        }
        title={
          redoName
        }
        aria-label={
          redoName
        }
      >
        <Redo2 className="h-4 w-4" />
      </button>
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
      >
        {
          announcement
        }
      </span>
    </>
  );
}

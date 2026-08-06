'use client';

/**
 * The `?` overlay.
 *
 * Design doc: `docs/slice-it-chart-editor.md` §13 / §14. §14 is explicit that the
 * keyboard map is not a convenience layer — it is the accessible interface for a
 * surface that is otherwise a canvas — so it has to be discoverable from inside
 * the editor rather than from a docs page.
 *
 * Only the bindings the editor actually implements are listed — a sheet that
 * advertises a shortcut that does nothing is worse than no sheet. `Space` and
 * `Ctrl+Space` joined the list when playtest shipped (§10).
 */

import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutSheet({ open, onOpenChange }: ShortcutSheetProps) {
  const { t } = useTranslation('r-slice-it');

  const rows: { keys: string; action: string }[] = [
    { keys: '↑ ↓', action: t('editor-key-playhead', { defaultValue: 'Playhead ± one snap unit' }) },
    { keys: 'PgUp PgDn', action: t('editor-key-measure', { defaultValue: '± one measure' }) },
    { keys: 'Home End', action: t('editor-key-ends', { defaultValue: 'Start / end of chart' }) },
    { keys: 'Ctrl+↑ Ctrl+↓', action: t('editor-key-zoom', { defaultValue: 'Zoom' }) },
    {
      keys: '[ ]',
      action: t('editor-key-snap', { defaultValue: 'Snap division finer / coarser' }),
    },
    { keys: 'S', action: t('editor-key-snap-toggle', { defaultValue: 'Toggle snap' }) },
    { keys: '1 – 7', action: t('editor-key-type', { defaultValue: 'Note type' }) },
    { keys: 'Del', action: t('editor-key-delete', { defaultValue: 'Delete selection' }) },
    { keys: 'Ctrl+A', action: t('editor-key-select-all', { defaultValue: 'Select all' }) },
    { keys: 'Esc', action: t('editor-key-escape', { defaultValue: 'Deselect' }) },
    { keys: 'Ctrl+Z / Ctrl+Y', action: t('editor-key-undo', { defaultValue: 'Undo / redo' }) },
    { keys: 'Ctrl+S', action: t('editor-key-save', { defaultValue: 'Save revision' }) },
    { keys: 'Tab', action: t('editor-key-tab', { defaultValue: 'Next difficulty' }) },
    {
      keys: 'Space',
      action: t('editor-shortcut-playtest', { defaultValue: 'Playtest from the playhead' }),
    },
    {
      keys: 'Ctrl+Space',
      action: t('editor-shortcut-playtest-loop', { defaultValue: 'Loop the selection' }),
    },
    { keys: '?', action: t('editor-key-sheet', { defaultValue: 'This sheet' }) },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t('editor-shortcuts-title', { defaultValue: 'Keyboard shortcuts' })}
          </DialogTitle>
          <DialogDescription>
            {t('editor-shortcuts-description', {
              defaultValue: 'Every editing operation has a keyboard path.',
            })}
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.keys} className="contents">
              <dt className="font-mono text-xs opacity-80">{row.keys}</dt>
              <dd>{row.action}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

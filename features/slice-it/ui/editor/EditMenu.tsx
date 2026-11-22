/**
 * The toolbar's Edit menu: every clipboard and time operation, reachable without
 * a keyboard (spec FR-2). Rows are buttons with the binding in `aria-keyshortcuts`
 * and are disabled when the operation cannot run (nothing selected, nothing
 * copied).
 */

import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  ArrowLeftRight,
  Magnet,
  Maximize2,
  Scissors,
  TimerOff,
  TimerReset,
  type LucideIcon,
} from 'lucide-react';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { MenuItem, MenuSeparator } from '@/components/ui/menu';
import { useEditorStore } from '@features/slice-it/engine/editor/store';
import { cn } from '@/lib/utils';
import { canRunOp, type ClipboardOp } from './useClipboardActions';

interface EditMenuProps {
  onRun: (op: ClipboardOp) => void;
}

interface Row {
  op: ClipboardOp;
  label: string;
  icon: LucideIcon;
  /** Shown to the eye. */
  hint: string;
  /** Read by assistive tech: `Control+C Meta+C`, the same keys the handler takes. */
  shortcuts: string;
}

export function EditMenu({ onRun }: EditMenuProps) {
  const { t } = useTranslation('slice-it-clipboard');
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const hasSelection = useEditorStore((s) => s.charts[s.active].notes.some((n) => n.selected));
  const hasClipboard = useEditorStore((s) => s.clipboard !== null);

  const groups: Row[][] = [
    [
      {
        op: 'copy',
        label: t('menu-copy', { defaultValue: 'Copy' }),
        icon: Copy,
        hint: 'Ctrl+C',
        shortcuts: 'Control+C Meta+C',
      },
      {
        op: 'cut',
        label: t('menu-cut', { defaultValue: 'Cut' }),
        icon: Scissors,
        hint: 'Ctrl+X',
        shortcuts: 'Control+X Meta+X',
      },
      {
        op: 'paste',
        label: t('menu-paste', { defaultValue: 'Paste at playhead' }),
        icon: ClipboardPaste,
        hint: 'Ctrl+V',
        shortcuts: 'Control+V Meta+V',
      },
      {
        op: 'paste-mirrored',
        label: t('menu-paste-mirrored', { defaultValue: 'Paste mirrored' }),
        icon: ClipboardPaste,
        hint: 'Ctrl+Shift+V',
        shortcuts: 'Control+Shift+V Meta+Shift+V',
      },
      {
        op: 'duplicate',
        label: t('menu-duplicate', { defaultValue: 'Duplicate one measure on' }),
        icon: CopyPlus,
        hint: 'Ctrl+D',
        shortcuts: 'Control+D Meta+D',
      },
    ],
    [
      {
        op: 'mirror',
        label: t('menu-mirror', { defaultValue: 'Mirror selection' }),
        icon: ArrowLeftRight,
        hint: 'H',
        shortcuts: 'H',
      },
      {
        op: 'quantize',
        label: t('menu-quantize', { defaultValue: 'Quantize selection' }),
        icon: Magnet,
        hint: 'Q',
        shortcuts: 'Q',
      },
      {
        op: 'scale',
        label: t('menu-scale', { defaultValue: 'Scale timing…' }),
        icon: Maximize2,
        hint: 'Ctrl+Shift+S',
        shortcuts: 'Control+Shift+S Meta+Shift+S',
      },
    ],
    [
      {
        op: 'insert-time',
        label: t('menu-insert-time', { defaultValue: 'Insert time at playhead' }),
        icon: TimerReset,
        hint: 'Ctrl+I',
        shortcuts: 'Control+I Meta+I',
      },
      {
        op: 'remove-time',
        label: t('menu-remove-time', { defaultValue: 'Remove time at playhead' }),
        icon: TimerOff,
        hint: 'Ctrl+Shift+L',
        shortcuts: 'Control+Shift+L Meta+Shift+L',
      },
    ],
  ];

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex h-9 items-center gap-2 px-3 text-sm transition-colors',
          open ? 'neumorphic-active' : 'neumorphic-sm',
        )}
      >
        <Scissors className="h-4 w-4" aria-hidden />
        {t('menu-edit', { defaultValue: 'Edit' })}
      </button>
      <AnchoredMenu
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label={t('menu-edit-label', { defaultValue: 'Edit notes' })}
        className="slice-tokens slice-menu-panel w-80 max-w-[calc(100vw-2rem)]"
      >
        {groups.map((rows, index) => (
          <div key={rows[0].op}>
            {index > 0 && <MenuSeparator />}
            {rows.map((row) => (
              <MenuItem
                key={row.op}
                icon={row.icon}
                hint={row.hint}
                disabled={!canRunOp(row.op, { hasSelection, hasClipboard })}
                aria-keyshortcuts={row.shortcuts}
                onSelect={() => {
                  setOpen(false);
                  onRun(row.op);
                }}
              >
                {row.label}
              </MenuItem>
            ))}
          </div>
        ))}
      </AnchoredMenu>
    </>
  );
}

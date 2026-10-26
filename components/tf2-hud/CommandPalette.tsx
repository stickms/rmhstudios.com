/**
 * Command palette (Ctrl/Cmd+K): jump to a page or file, or run any editor action.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PAGES } from '@/lib/tf2-hud/pages';
import { useEditor } from '@/lib/tf2-hud/store';
import { cn } from '@/lib/utils';
import { Modal, TextField } from './ui';

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export default function CommandPalette({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  actions: PaletteAction[];
}) {
  const { t } = useTranslation('c-tf2-hud');
  const setPage = useEditor((s) => s.setPage);
  const openFile = useEditor((s) => s.openFile);
  const paths = useEditor((s) => s.paths);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setIndex(0);
    }
  }, [open]);

  const items = useMemo<PaletteAction[]>(() => {
    const q = query.trim().toLowerCase();
    const all: PaletteAction[] = [
      ...actions,
      ...PAGES.map((p) => ({
        id: `page:${p.id}`,
        label: t('go-page', { defaultValue: 'Preview: {{page}}', page: p.label }),
        hint: p.group,
        run: () => setPage(p.id),
      })),
    ];
    const matches = q
      ? all.filter((a) => a.label.toLowerCase().includes(q) || a.hint?.toLowerCase().includes(q))
      : all;
    const files =
      q.length >= 2
        ? paths()
            .filter((p) => p.toLowerCase().includes(q))
            .slice(0, 40)
            .map((p) => ({
              id: `file:${p}`,
              label: t('open-file', { defaultValue: 'Open: {{file}}', file: p }),
              run: () => openFile(p),
            }))
        : [];
    return [...matches, ...files].slice(0, 80);
  }, [query, actions, paths, setPage, openFile, t]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.children[index]?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const choose = (a: PaletteAction | undefined) => {
    if (!a) return;
    onOpenChange(false);
    a.run();
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={t('command-palette', { defaultValue: 'Command palette' })}
    >
      <TextField
        autoFocus
        value={query}
        placeholder={t('palette-ph', { defaultValue: 'Type a command, page or file name' })}
        aria-label={t('palette-ph', { defaultValue: 'Type a command, page or file name' })}
        role="combobox"
        aria-expanded
        aria-controls="tf2hud-palette-list"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setIndex((i) => Math.min(items.length - 1, i + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setIndex((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            choose(items[index]);
          }
        }}
        className="h-10 text-sm"
      />
      <ul
        id="tf2hud-palette-list"
        ref={listRef}
        role="listbox"
        className="mt-2 max-h-72 overflow-y-auto"
      >
        {items.map((a, i) => (
          <li key={a.id} role="option" aria-selected={i === index}>
            <button
              type="button"
              tabIndex={-1}
              onClick={() => choose(a)}
              onPointerEnter={() => setIndex(i)}
              className={cn(
                'flex w-full items-center justify-between gap-3 rounded-(--app-radius-sm) px-2 py-1.5 text-start text-sm',
                i === index ? 'bg-(--app-accent-dim) text-(--app-text)' : 'text-(--app-text-muted)',
              )}
            >
              <span className="truncate">{a.label}</span>
              {a.hint ? (
                <span className="shrink-0 text-[11px] text-(--app-text-dim)">{a.hint}</span>
              ) : null}
            </button>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="px-2 py-6 text-center text-xs text-(--app-text-dim)">
            {t('no-results', { defaultValue: 'Nothing matches.' })}
          </li>
        ) : null}
      </ul>
    </Modal>
  );
}

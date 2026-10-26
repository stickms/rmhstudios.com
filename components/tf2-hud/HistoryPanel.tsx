/**
 * History — every undoable step, newest first. Click any row to travel to that
 * state; the steps after it stay available as redo until a new edit is made.
 */
'use client';

import { Redo2, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '@/lib/tf2-hud/store';
import { cn } from '@/lib/utils';
import { EmptyNote, IconBtn, PanelHead } from './ui';

function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function HistoryPanel() {
  const { t } = useTranslation('c-tf2-hud');
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const travel = useEditor((s) => s.travel);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const now = Date.now();

  // Newest first: redo steps (furthest ahead on top), the present, then the past.
  const rows = [
    ...[...future].reverse().map((e, i) => ({
      key: `f${i}`,
      label: e.label,
      at: e.at,
      steps: future.length - i,
      kind: 'future' as const,
    })),
    {
      key: 'now',
      label: t('current-state', { defaultValue: 'Current state' }),
      at: now,
      steps: 0,
      kind: 'now' as const,
    },
    ...[...past].reverse().map((e, i) => ({
      key: `p${i}`,
      label: e.label,
      at: e.at,
      steps: -(i + 1),
      kind: 'past' as const,
    })),
  ];

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={t('history', { defaultValue: 'History' })}
    >
      <PanelHead
        title={t('history', { defaultValue: 'History' })}
        actions={
          <>
            <IconBtn
              icon={Undo2}
              label={t('undo', { defaultValue: 'Undo' })}
              disabled={past.length === 0}
              onClick={undo}
            />
            <IconBtn
              icon={Redo2}
              label={t('redo', { defaultValue: 'Redo' })}
              disabled={future.length === 0}
              onClick={redo}
            />
          </>
        }
      />
      <p className="border-b border-(--app-border) px-3 py-1.5 text-[11px] text-(--app-text-dim)">
        {t('history-hint', {
          defaultValue: 'Ctrl+Z undo · Ctrl+Shift+Z redo · click a step to jump to it',
        })}
      </p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {past.length === 0 && future.length === 0 ? (
          <EmptyNote>
            {t('history-empty', { defaultValue: 'Your edits will appear here.' })}
          </EmptyNote>
        ) : (
          <ol>
            {rows.map((r) => (
              <li key={r.key}>
                <button
                  type="button"
                  disabled={r.kind === 'now'}
                  aria-current={r.kind === 'now'}
                  onClick={() => travel(r.steps)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-start text-xs',
                    r.kind === 'now' && 'bg-(--app-accent-dim) font-semibold text-(--app-text)',
                    r.kind === 'future' && 'text-(--app-text-dim) hover:bg-(--app-surface-hover)',
                    r.kind === 'past' && 'text-(--app-text-muted) hover:bg-(--app-surface-hover)',
                  )}
                >
                  <span className="truncate">{r.label}</span>
                  {r.kind !== 'now' ? (
                    <span className="shrink-0 text-[11px] text-(--app-text-dim)">
                      {ago(r.at, now)}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

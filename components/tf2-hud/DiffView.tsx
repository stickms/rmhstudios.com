/**
 * Diff — every changed file against the TF2 Default base, line by line.
 */
'use client';

import { Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { diffLines, diffStats, withContext } from '@/lib/tf2-hud/project/diff';
import { changedFiles } from '@/lib/tf2-hud/project/model';
import { isTextPath } from '@/lib/tf2-hud/project/paths';
import { baseCache, useEditor } from '@/lib/tf2-hud/store';
import { cn } from '@/lib/utils';
import { Btn, EmptyNote, PanelHead, Pill, SelectField } from './ui';

const MAX_ROWS = 2500;

export default function DiffView() {
  const { t } = useTranslation('c-tf2-hud');
  const overlay = useEditor((s) => s.overlay);
  const baseIndex = useEditor((s) => s.baseIndex);
  const baseVersion = useEditor((s) => s.baseVersion);
  const activePath = useEditor((s) => s.activePath);
  const ensureFiles = useEditor((s) => s.ensureFiles);
  const revertPath = useEditor((s) => s.revertPath);
  const revertAll = useEditor((s) => s.revertAll);
  const jump = useEditor((s) => s.jump);
  const [picked, setPicked] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  const changed = useMemo(() => changedFiles(overlay, baseIndex), [overlay, baseIndex]);
  const path =
    picked && changed.some((c) => c.path === picked)
      ? picked
      : activePath && changed.some((c) => c.path === activePath)
        ? activePath
        : (changed[0]?.path ?? null);
  const entry = changed.find((c) => c.path === path);

  useEffect(() => {
    if (path && entry && entry.status !== 'added') void ensureFiles([path]);
  }, [path, entry, ensureFiles]);

  const rows = useMemo(() => {
    if (!path || !entry) return null;
    const next = overlay.get(path);
    const newText = next && next.kind === 'text' ? next.text : '';
    const oldText = entry.status === 'added' ? '' : (baseCache.getText(path) ?? null);
    if (oldText === null) return 'loading' as const;
    if (!isTextPath(path)) return 'binary' as const;
    return diffLines(oldText, newText);
    // `baseVersion` signals the base copy arriving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, entry, overlay, baseVersion]);

  const stats = Array.isArray(rows) ? diffStats(rows) : null;
  const display = Array.isArray(rows) ? (full ? rows : withContext(rows, 3)) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PanelHead
        title={t('changes', { defaultValue: 'Changes' })}
        actions={
          changed.length ? (
            <Btn size="xs" variant="ghost" icon={Undo2} onClick={revertAll}>
              {t('revert-all', { defaultValue: 'Revert all' })}
            </Btn>
          ) : null
        }
      />
      {changed.length === 0 ? (
        <EmptyNote>
          {t('no-changes-yet', { defaultValue: 'No changes from the TF2 Default HUD yet.' })}
        </EmptyNote>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-(--app-border) px-3 py-2">
            <SelectField
              aria-label={t('changed-file', { defaultValue: 'Changed file' })}
              value={path ?? ''}
              onChange={(e) => setPicked(e.target.value)}
              className="min-w-0 flex-1"
            >
              {changed.map((c) => (
                <option key={c.path} value={c.path}>
                  {c.status[0].toUpperCase()} · {c.path}
                </option>
              ))}
            </SelectField>
            {stats ? (
              <span className="flex gap-1 text-[11px] font-semibold">
                <Pill tone="success">+{stats.added}</Pill>
                <Pill tone="danger">−{stats.removed}</Pill>
              </span>
            ) : null}
            {path ? (
              <Btn size="xs" variant="ghost" icon={Undo2} onClick={() => revertPath(path)}>
                {t('revert-file', { defaultValue: 'Revert' })}
              </Btn>
            ) : null}
            <label className="flex items-center gap-1.5 text-[11px] text-(--app-text-muted)">
              <input type="checkbox" checked={full} onChange={(e) => setFull(e.target.checked)} />
              {t('whole-file', { defaultValue: 'Whole file' })}
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-(--app-bg-subtle) font-mono text-[12px] leading-5">
            {rows === 'loading' ? (
              <EmptyNote>{t('loading', { defaultValue: 'Loading…' })}</EmptyNote>
            ) : rows === 'binary' ? (
              <EmptyNote>
                {t('binary-changed', { defaultValue: 'Binary file — changed.' })}
              </EmptyNote>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {display.slice(0, MAX_ROWS).map((row, i) =>
                    row === null ? (
                      <tr key={`gap-${i}`}>
                        <td
                          colSpan={3}
                          className="bg-(--tf2-panel) px-3 py-0.5 text-center text-[11px] text-(--app-text-dim)"
                        >
                          ⋯
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={i}
                        className={cn(
                          row.kind === 'add' && 'tf2hud-diff-add',
                          row.kind === 'del' && 'tf2hud-diff-del',
                        )}
                        onDoubleClick={() => path && row.newLine && jump(path, 0)}
                      >
                        <td className="w-10 select-none px-1 text-end text-(--app-text-dim)">
                          {row.oldLine ?? ''}
                        </td>
                        <td className="w-10 select-none px-1 text-end text-(--app-text-dim)">
                          {row.newLine ?? ''}
                        </td>
                        <td className="whitespace-pre px-2 text-(--app-text)">
                          <span className="select-none text-(--app-text-dim)">
                            {row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '}
                          </span>
                          {row.text}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            )}
            {Array.isArray(rows) && display.length > MAX_ROWS ? (
              <p className="px-3 py-2 text-center text-[11px] text-(--app-text-dim)">
                {t('diff-truncated', {
                  defaultValue: 'Showing the first {{n}} rows.',
                  n: MAX_ROWS,
                })}
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Outline — every panel in the current page as a list. Click to select, toggle
 * visibility, spot hidden ones. It is also the keyboard/screen-reader route to
 * everything the canvas shows.
 */
'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from '@/lib/tf2-hud/store';
import { cn } from '@/lib/utils';
import { useSceneContext } from './scene-context';
import { EmptyNote, IconBtn, PanelHead } from './ui';

export default function OutlinePanel() {
  const { t } = useTranslation('c-tf2-hud');
  const { scene } = useSceneContext();
  const selectedId = useEditor((s) => s.selectedId);
  const select = useEditor((s) => s.select);
  const toggleSelect = useEditor((s) => s.toggleSelect);
  const selectedIds = useEditor((s) => s.selectedIds);
  const hover = useEditor((s) => s.hover);
  const toggleForce = useEditor((s) => s.toggleForce);
  const resetForce = useEditor((s) => s.resetForce);
  const jump = useEditor((s) => s.jump);

  const groups = useMemo(() => {
    const map = new Map<string, NonNullable<typeof scene>['nodes']>();
    for (const n of scene?.nodes ?? []) {
      const list = map.get(n.file) ?? [];
      list.push(n);
      map.set(n.file, list);
    }
    return [...map.entries()];
  }, [scene]);

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={t('outline', { defaultValue: 'Outline' })}
    >
      <PanelHead
        title={t('outline', { defaultValue: 'Outline' })}
        actions={
          <button
            type="button"
            onClick={resetForce}
            className="text-[11px] font-semibold text-(--app-text-muted) hover:text-(--app-text)"
          >
            {t('reset-visibility', { defaultValue: 'Reset visibility' })}
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {groups.length === 0 ? (
          <EmptyNote>
            {t('outline-empty', { defaultValue: 'Nothing to show for this page yet.' })}
          </EmptyNote>
        ) : (
          groups.map(([file, nodes]) => (
            <div key={file}>
              <h3 className="truncate px-3 pt-2 pb-1 font-mono text-[11px] text-(--app-text-dim)">
                {file.replace('resource/', '')}
              </h3>
              <ul>
                {nodes.map((n) => (
                  <li
                    key={n.id}
                    className={cn(
                      'group flex items-center gap-1 pe-1 hover:bg-(--app-surface-hover)',
                      (selectedId === n.id || selectedIds.has(n.id)) && 'bg-(--app-accent-dim)',
                    )}
                    onPointerEnter={() => hover(n.id)}
                    onPointerLeave={() => hover(null)}
                  >
                    <button
                      type="button"
                      onClick={(e) =>
                        e.shiftKey || e.ctrlKey || e.metaKey ? toggleSelect(n.id) : select(n.id)
                      }
                      onDoubleClick={() => jump(n.file, n.source.start)}
                      aria-current={selectedId === n.id}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 py-1 text-start text-xs',
                        n.isFrame ? 'ps-3 font-semibold' : 'ps-6',
                        n.shown ? 'text-(--app-text)' : 'text-(--app-text-dim)',
                      )}
                    >
                      <span className="truncate">{n.name}</span>
                      <span className="ms-auto shrink-0 text-[10px] text-(--app-text-dim)">
                        {n.control}
                      </span>
                    </button>
                    <IconBtn
                      icon={n.shown ? Eye : EyeOff}
                      size="xs"
                      label={
                        n.shown
                          ? t('hide-panel', { defaultValue: 'Hide {{name}}', name: n.name })
                          : t('show-panel', { defaultValue: 'Show {{name}}', name: n.name })
                      }
                      onClick={() => toggleForce(n.id, !n.shown)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

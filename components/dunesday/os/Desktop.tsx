'use client';

/**
 * The desktop surface: wallpaper, soap bubbles, icons and gadgets.
 *
 * Icons behave like Windows 7's:
 * - click selects, Ctrl/⌘-click adds, Shift-click extends, and dragging on
 *   empty desktop draws a rubber-band selection;
 * - double-click opens (a single tap on touch screens);
 * - drag icons to rearrange them on a grid, onto a folder to move them in, or
 *   onto the Recycle Bin to delete them — and drag files in from Explorer;
 * - F2 renames, Delete recycles, Enter opens, arrow keys move between icons;
 * - right-click for the context menu (or long-press / Shift+F10).
 *
 * Gadgets sit in a column on the right and can be dragged anywhere.
 */

import { m as motion } from 'framer-motion';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as RPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  DESKTOP,
  RECYCLE,
  ROOT,
  children,
  copy as vfsCopy,
  create,
  move as vfsMove,
  rename as vfsRename,
  recycle,
  type VNode,
} from '@/lib/dunesday/vfs';
import { cn } from '@/lib/utils';
import { useDunesday } from '../DunesdayProvider';
import { Clock, MeterGadget, TearOff, Weather } from '../Gadgets';
import { sfx } from '../sound';
import { openApp, openNode, showMessage } from './actions';
import { BubbleField } from './BubbleField';
import { beginDrag } from './dnd';
import { Icon } from './icons';
import { PopupMenu, type MenuItem } from './Menu';
import { iconFor } from './nodeIcon';
import { useOs } from './store';
import { Wallpaper } from './Wallpaper';

const CELLS = { small: { w: 76, h: 80 }, medium: { w: 88, h: 96 }, large: { w: 112, h: 124 } };
const MARGIN = 8;

interface DeskItem {
  id: string;
  name: string;
  node: VNode | null;
  icon: ReturnType<typeof iconFor>;
  system: 'computer' | 'recycle' | null;
}

export function Desktop({ compact }: { compact: boolean }) {
  const { t } = useTranslation('c-dunesday');
  const { pct, state } = useDunesday();
  const prefs = useOs((s) => s.prefs);
  const vfs = useOs((s) => s.vfs);
  const iconPos = useOs((s) => s.iconPos);
  const setIconPos = useOs((s) => s.setIconPos);
  const clearIconPos = useOs((s) => s.clearIconPos);
  const setPrefs = useOs((s) => s.setPrefs);
  const fs = useOs((s) => s.fs);
  const clipboard = useOs((s) => s.clipboard);
  const setClipboard = useOs((s) => s.setClipboard);
  const focusWin = useOs((s) => s.focus);

  const surface = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<null | { x: number; y: number; target: string | null }>(null);
  const [band, setBand] = useState<null | { x: number; y: number; w: number; h: number }>(null);
  const [rows, setRows] = useState(6);

  const cell = CELLS[compact ? 'large' : prefs.iconSize];

  useEffect(() => {
    const el = surface.current;
    if (!el) return;
    const measure = () => setRows(Math.max(1, Math.floor((el.clientHeight - MARGIN * 2) / cell.h)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cell.h]);

  const cannotOpen = (name: string) =>
    t('cannot-open', {
      defaultValue:
        'Windows can’t open “{{name}}”. There is no program on this computer for this type of file.',
      name,
    });

  const items: DeskItem[] = useMemo(() => {
    const list: DeskItem[] = [
      {
        id: ROOT,
        name: t('computer', { defaultValue: 'Computer' }),
        node: vfs[ROOT] ?? null,
        icon: 'computer',
        system: 'computer',
      },
      {
        id: RECYCLE,
        name: t('recycle-bin', { defaultValue: 'Recycle Bin' }),
        node: vfs[RECYCLE] ?? null,
        icon: vfs[RECYCLE] ? iconFor(vfs[RECYCLE], vfs) : 'recycle-empty',
        system: 'recycle',
      },
    ];
    if (vfs[DESKTOP]) {
      for (const n of children(vfs, DESKTOP))
        list.push({ id: n.id, name: n.name, node: n, icon: iconFor(n, vfs), system: null });
    }
    return list;
  }, [vfs, t]);

  // Grid placement: stored cells first, then fill the gaps column by column.
  const placed = useMemo(() => {
    const taken = new Set<string>();
    const out = new Map<string, { col: number; row: number }>();
    if (!prefs.autoArrange && !compact) {
      for (const it of items) {
        const p = iconPos[it.id];
        if (p && p.row < rows && !taken.has(`${p.col},${p.row}`)) {
          out.set(it.id, p);
          taken.add(`${p.col},${p.row}`);
        }
      }
    }
    let col = 0;
    let row = 0;
    for (const it of items) {
      if (out.has(it.id)) continue;
      while (taken.has(`${col},${row}`)) {
        row++;
        if (row >= rows) {
          row = 0;
          col++;
        }
      }
      out.set(it.id, { col, row });
      taken.add(`${col},${row}`);
    }
    return out;
  }, [items, iconPos, rows, prefs.autoArrange, compact]);

  const open = (it: DeskItem) => {
    sfx.tick();
    if (it.system === 'computer') return void openApp('explorer', { params: { path: ROOT } });
    if (it.system === 'recycle') return void openApp('explorer', { params: { path: RECYCLE } });
    if (it.node) openNode(it.node, cannotOpen);
  };

  const removeSelected = (ids = [...selected]) => {
    for (const id of ids) {
      if (id === ROOT || id === RECYCLE) continue;
      const err = fs((v) => recycle(v, id));
      if (err) return showMessage({ icon: 'error', text: err.message });
    }
    if (ids.length) sfx.pop();
    setSelected(new Set());
  };

  const commitRename = (id: string, name: string) => {
    setRenaming(null);
    const node = vfs[id];
    if (!node || name.trim() === node.name) return;
    const err = fs((v) => vfsRename(v, id, name));
    if (err)
      showMessage({
        icon: 'error',
        title: t('rename', { defaultValue: 'Rename' }),
        text: err.message,
      });
  };

  const newItem = (kind: 'folder' | 'txt') => {
    let created: string | null = null;
    const err = fs((v) => {
      const r = create(
        v,
        DESKTOP,
        kind === 'folder'
          ? { name: t('new-folder', { defaultValue: 'New folder' }), kind: 'folder' }
          : {
              name: t('new-txt', { defaultValue: 'New Text Document.txt' }),
              kind: 'file',
              content: '',
            },
      );
      created = r.id;
      return r.vfs;
    });
    if (err) return showMessage({ icon: 'error', text: err.message });
    if (created) {
      setSelected(new Set([created]));
      setRenaming(created);
    }
  };

  const paste = () => {
    if (!clipboard) return;
    for (const id of clipboard.ids) {
      if (!useOs.getState().vfs[id]) continue;
      const err =
        clipboard.op === 'cut'
          ? fs((v) => vfsMove(v, id, DESKTOP))
          : fs((v) => vfsCopy(v, id, DESKTOP).vfs);
      if (err) return showMessage({ icon: 'error', text: err.message });
    }
    if (clipboard.op === 'cut') setClipboard(null);
  };

  // ── Pointer: select, drag icons, rubber band ─────────────────────────────
  const onIconPointerDown = (it: DeskItem) => (e: RPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    focusWin(null);
    setFocusId(it.id);
    const additive = e.ctrlKey || e.metaKey;
    let sel = selected;
    if (additive) {
      sel = new Set(selected);
      if (sel.has(it.id)) sel.delete(it.id);
      else sel.add(it.id);
    } else if (!selected.has(it.id)) {
      sel = new Set([it.id]);
    }
    setSelected(sel);
    const dragIds = [...sel].filter((id) => id !== ROOT && id !== RECYCLE);
    const movingSystem = it.system !== null;
    beginDrag(
      e,
      { kind: 'node', ids: movingSystem ? [] : dragIds.length ? dragIds : [it.id] },
      sel.size > 1 ? t('n-items', { defaultValue: '{{count}} items', count: sel.size }) : it.name,
      ({ target, x, y }) => {
        if (target !== 'desktop' && !(movingSystem && target === 'recycle'))
          return movingSystem ? true : false;
        // Rearranging on the desktop: move the dragged icons to the drop cell.
        const r = surface.current?.getBoundingClientRect();
        if (!r) return true;
        const col = Math.max(0, Math.floor((x - r.left - MARGIN) / cell.w));
        const row = Math.min(rows - 1, Math.max(0, Math.floor((y - r.top - MARGIN) / cell.h)));
        const ids = movingSystem ? [it.id] : dragIds.length ? dragIds : [it.id];
        ids.forEach((id, i) => setIconPos(id, { col, row: Math.min(rows - 1, row + i) }));
        if (prefs.autoArrange) setPrefs({ autoArrange: false });
        return true;
      },
    );
  };

  const onSurfacePointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return;
    focusWin(null);
    setSelected(new Set());
    setRenaming(null);
    const r = e.currentTarget.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const x = ev.clientX - r.left;
      const y = ev.clientY - r.top;
      const rect = {
        x: Math.min(sx, x),
        y: Math.min(sy, y),
        w: Math.abs(x - sx),
        h: Math.abs(y - sy),
      };
      if (rect.w < 4 && rect.h < 4) return;
      setBand(rect);
      const hit = new Set<string>();
      for (const it of items) {
        const p = placed.get(it.id);
        if (!p) continue;
        const ix = MARGIN + p.col * cell.w;
        const iy = MARGIN + p.row * cell.h;
        if (
          ix < rect.x + rect.w &&
          ix + cell.w > rect.x &&
          iy < rect.y + rect.h &&
          iy + cell.h > rect.y
        )
          hit.add(it.id);
      }
      setSelected(hit);
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      setBand(null);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  // ── Keyboard ──────────────────────────────────────────────────────────────
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return;
    const current = items.find((i) => i.id === focusId) ?? items[0];
    if (!current) return;
    const p = placed.get(current.id)!;
    const step: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
    };
    if (step[e.key]) {
      e.preventDefault();
      const [dc, dr] = step[e.key];
      let best: DeskItem | null = null;
      let bestScore = Infinity;
      for (const it of items) {
        const q = placed.get(it.id)!;
        const dx = q.col - p.col;
        const dy = q.row - p.row;
        if (dc && Math.sign(dx) !== dc) continue;
        if (dr && Math.sign(dy) !== dr) continue;
        if (!dx && !dy) continue;
        const score = dc ? Math.abs(dx) * 10 + Math.abs(dy) : Math.abs(dy) * 10 + Math.abs(dx);
        if (score < bestScore) {
          bestScore = score;
          best = it;
        }
      }
      if (best) {
        setFocusId(best.id);
        setSelected(new Set([best.id]));
        document.getElementById(`ds-icon-${best.id}`)?.focus();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(current);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      removeSelected(selected.size ? [...selected] : [current.id]);
    } else if (e.key === 'F2' && current.node && !current.system) {
      e.preventDefault();
      setRenaming(current.id);
    } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      const el = document.getElementById(`ds-icon-${current.id}`)?.getBoundingClientRect();
      setMenu({ x: el?.right ?? 100, y: el?.top ?? 100, target: current.id });
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(items.map((i) => i.id)));
    }
  };

  // ── Context menus ─────────────────────────────────────────────────────────
  const menuItems = (): MenuItem[] => {
    const target = menu?.target ? items.find((i) => i.id === menu.target) : null;
    if (target) {
      const sys = target.system;
      const list: MenuItem[] = [
        {
          label: t('ctx-open', { defaultValue: 'Open' }),
          bold: true,
          onSelect: () => open(target),
        },
      ];
      if (sys === 'recycle') {
        list.push({
          label: t('empty-bin', { defaultValue: 'Empty Recycle Bin' }),
          disabled: !children(vfs, RECYCLE).length,
          onSelect: () => openApp('explorer', { params: { path: RECYCLE, empty: '1' } }),
        });
      }
      if (!sys) {
        list.push(
          { separator: true },
          {
            label: t('ctx-cut', { defaultValue: 'Cut' }),
            onSelect: () =>
              setClipboard({
                op: 'cut',
                ids: [...(selected.size ? selected : new Set([target.id]))],
              }),
          },
          {
            label: t('ctx-copy', { defaultValue: 'Copy' }),
            onSelect: () =>
              setClipboard({
                op: 'copy',
                ids: [...(selected.size ? selected : new Set([target.id]))],
              }),
          },
          { separator: true },
          {
            label: t('ctx-delete', { defaultValue: 'Delete' }),
            onSelect: () => removeSelected(selected.size ? [...selected] : [target.id]),
          },
          {
            label: t('ctx-rename', { defaultValue: 'Rename' }),
            onSelect: () => setRenaming(target.id),
          },
        );
      }
      list.push(
        { separator: true },
        {
          label: t('ctx-properties', { defaultValue: 'Properties' }),
          onSelect: () => {
            if (sys === 'computer') openApp('about');
            else
              showMessage({
                icon: 'info',
                title: t('ctx-properties', { defaultValue: 'Properties' }),
                text: `${target.name}\n${target.node ? (target.node.kind === 'folder' ? t('type-folder', { defaultValue: 'File folder' }) : '') : ''}`.trim(),
              });
          },
        },
      );
      return list;
    }
    return [
      {
        label: t('view-large', { defaultValue: 'Large icons' }),
        checked: prefs.iconSize === 'large',
        onSelect: () => setPrefs({ iconSize: 'large' }),
      },
      {
        label: t('view-medium', { defaultValue: 'Medium icons' }),
        checked: prefs.iconSize === 'medium',
        onSelect: () => setPrefs({ iconSize: 'medium' }),
      },
      {
        label: t('view-small', { defaultValue: 'Small icons' }),
        checked: prefs.iconSize === 'small',
        onSelect: () => setPrefs({ iconSize: 'small' }),
      },
      { separator: true },
      {
        label: t('auto-arrange', { defaultValue: 'Auto arrange icons' }),
        checked: prefs.autoArrange,
        onSelect: () => setPrefs({ autoArrange: !prefs.autoArrange }),
      },
      {
        label: t('show-gadgets', { defaultValue: 'Show desktop gadgets' }),
        checked: prefs.showGadgets,
        onSelect: () => setPrefs({ showGadgets: !prefs.showGadgets }),
      },
      { label: t('sort-name', { defaultValue: 'Sort by name' }), onSelect: () => clearIconPos() },
      { label: t('refresh', { defaultValue: 'Refresh' }), onSelect: () => sfx.tick() },
      { separator: true },
      { label: t('paste', { defaultValue: 'Paste' }), disabled: !clipboard, onSelect: paste },
      { separator: true },
      { label: t('new-folder', { defaultValue: 'New folder' }), onSelect: () => newItem('folder') },
      {
        label: t('new-txt-menu', { defaultValue: 'New text document' }),
        onSelect: () => newItem('txt'),
      },
      { separator: true },
      {
        label: t('personalize', { defaultValue: 'Personalize' }),
        onSelect: () => openApp('personalize'),
      },
    ];
  };

  return (
    <div className="ds-desk" data-drop="desktop">
      <Wallpaper variant={prefs.wallpaper} progress={pct / 100} night={state.night} />
      <BubbleField count={compact ? 6 : 11} />
      <div
        ref={surface}
        className={cn('ds-desk-surface', `ds-desk-surface--${compact ? 'large' : prefs.iconSize}`)}
        role="listbox"
        aria-multiselectable="true"
        aria-label={t('desktop', { defaultValue: 'Desktop' })}
        onPointerDown={onSurfacePointerDown}
        onKeyDown={onKey}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, target: null });
        }}
      >
        {items.map((it) => {
          const p = placed.get(it.id)!;
          const isSel = selected.has(it.id);
          const cut = clipboard?.op === 'cut' && clipboard.ids.includes(it.id);
          return (
            <button
              key={it.id}
              id={`ds-icon-${it.id}`}
              type="button"
              role="option"
              aria-selected={isSel}
              tabIndex={(focusId ?? items[0]?.id) === it.id ? 0 : -1}
              className={cn('ds-dicon', isSel && 'ds-dicon--sel', cut && 'ds-dicon--cut')}
              style={{
                left: MARGIN + p.col * cell.w,
                top: MARGIN + p.row * cell.h,
                width: cell.w - 4,
              }}
              data-drop={
                it.system === 'recycle'
                  ? 'recycle'
                  : it.node?.kind === 'folder'
                    ? `folder:${it.id}`
                    : undefined
              }
              onPointerDown={onIconPointerDown(it)}
              onDoubleClick={() => open(it)}
              onClick={(e) => {
                // A tap opens on touch screens, where there is no double-click.
                if (
                  (e.nativeEvent as PointerEvent).pointerType &&
                  (e.nativeEvent as PointerEvent).pointerType !== 'mouse'
                )
                  open(it);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.has(it.id)) setSelected(new Set([it.id]));
                setMenu({ x: e.clientX, y: e.clientY, target: it.id });
              }}
            >
              <Icon
                name={it.icon}
                size={
                  compact
                    ? 56
                    : prefs.iconSize === 'small'
                      ? 36
                      : prefs.iconSize === 'large'
                        ? 64
                        : 48
                }
                shortcut={it.node?.kind === 'shortcut'}
              />
              {renaming === it.id ? (
                <RenameBox
                  initial={it.name}
                  onDone={(name) => commitRename(it.id, name)}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <span className="ds-dicon-label">{it.name}</span>
              )}
            </button>
          );
        })}
        {band && (
          <div
            className="ds-band"
            style={{ left: band.x, top: band.y, width: band.w, height: band.h }}
            aria-hidden="true"
          />
        )}
      </div>

      {prefs.showGadgets && !compact && <DesktopGadgets />}

      {menu && (
        <PopupMenu
          at={{ x: menu.x, y: menu.y }}
          label={t('ctx-menu', { defaultValue: 'Context menu' })}
          items={menuItems()}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function RenameBox({
  initial,
  onDone,
  onCancel,
}: {
  initial: string;
  onDone: (v: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const { t } = useTranslation('c-dunesday');
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const dot = initial.lastIndexOf('.');
    el.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  return (
    <input
      ref={ref}
      className="ds-rename"
      defaultValue={initial}
      aria-label={t('rename', { defaultValue: 'Rename' })}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') onDone(e.currentTarget.value);
        if (e.key === 'Escape') onCancel();
      }}
      onBlur={(e) => onDone(e.currentTarget.value)}
    />
  );
}

/** Vista/7 sidebar gadgets, each draggable to anywhere on the desktop. */
function DesktopGadgets() {
  const { t } = useTranslation('c-dunesday');
  const { today, pct, tonight } = useDunesday();
  const gadgetPos = useOs((s) => s.gadgetPos);
  const setGadgetPos = useOs((s) => s.setGadgetPos);
  const list = [
    { id: 'clock', node: <Clock /> },
    {
      id: 'meter',
      node: (
        <MeterGadget
          pct={pct}
          tonightMinutes={tonight?.minutes ?? 0}
          tonightBudget={tonight?.budget ?? 0}
        />
      ),
    },
    { id: 'weather', node: <Weather today={today} /> },
    { id: 'calendar', node: <TearOff today={today} /> },
  ];
  return (
    <div
      className="ds-gadget-col"
      aria-label={t('gadgets', { defaultValue: 'Gadgets' })}
      role="group"
    >
      {list.map((g) => {
        const pos = gadgetPos[g.id] ?? { x: 0, y: 0 };
        return (
          <motion.div
            key={g.id}
            className="ds-gadget-slot"
            drag
            dragMomentum={false}
            dragElastic={0.08}
            whileDrag={{ scale: 1.04, zIndex: 5 }}
            initial={false}
            animate={{ x: pos.x, y: pos.y }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
            onDragEnd={(_, info) =>
              setGadgetPos(g.id, { x: pos.x + info.offset.x, y: pos.y + info.offset.y })
            }
          >
            {g.node}
          </motion.div>
        );
      })}
    </div>
  );
}

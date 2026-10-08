'use client';

/**
 * Windows Explorer for the Dunesday 7 sandbox.
 *
 * It browses two kinds of thing through one interface:
 *
 * - **The file system** (`lib/dunesday/vfs.ts`): folders, text files, images,
 *   shortcuts. New folder / new text document, rename (F2), cut / copy /
 *   paste, delete to the Recycle Bin, drag between windows and the desktop.
 * - **The watch list**, as the Videos library: each MCU phase (and Dune, and
 *   your extras) is a folder and each title is a video file, with a green tick
 *   once watched. Mark watched, leave out of the plan (it goes to the Recycle
 *   Bin), restore, open Properties, or ask Messenger about it.
 *
 * Windows 7 furniture: back / forward, a breadcrumb address bar you can also
 * type a path into (C:\Users\…), live search, a navigation pane, Details and
 * Large icons views with sortable columns, a details pane and a status bar.
 */

import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  LayoutGrid,
  List,
  PanelLeft,
  Search,
} from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent as RMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { formatMinutes } from '@/lib/dunesday/schedule';
import { allTitles, isIncluded, isWatched, orderedTitles, runtimeOf } from '@/lib/dunesday/state';
import type { WatchTitle } from '@/lib/dunesday/titles';
import {
  DESKTOP,
  DOCUMENTS,
  DOWNLOADS,
  DRIVE,
  HOME,
  MUSIC,
  PICTURES,
  RECYCLE,
  ROOT,
  VIDEOS,
  children,
  copy as vfsCopy,
  create,
  move as vfsMove,
  pathOf,
  purge,
  recycle,
  rename as vfsRename,
  resolve,
  restore,
  trail,
  type VNode,
} from '@/lib/dunesday/vfs';
import { cn } from '@/lib/utils';
import { useDunesday } from '../../DunesdayProvider';
import { sfx } from '../../sound';
import { openApp, openNode, showMessage } from '../actions';
import type { AppProps } from '../apps';
import { beginDrag } from '../dnd';
import { Icon, type IconName } from '../icons';
import { PopupMenu, type MenuItem } from '../Menu';
import { iconFor, sizeLabel, typeLabel } from '../nodeIcon';
import { useOs } from '../store';

type GroupKey = 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'dune' | 'extra';
type Filter = 'tonight' | 'unwatched' | 'watched' | 'essentials';

interface Item {
  key: string;
  kind: 'node' | 'title' | 'vgroup';
  name: string;
  icon: IconName;
  type: string;
  size: string;
  date: string;
  sortDate: number;
  status: string;
  node?: VNode;
  title?: WatchTitle;
  group?: GroupKey;
}

const groupOf = (x: WatchTitle): GroupKey =>
  x.franchise === 'dune' ? 'dune' : x.franchise === 'extra' ? 'extra' : (`p${x.phase}` as GroupKey);

export default function ExplorerApp({ win }: AppProps) {
  const { t, i18n } = useTranslation('c-dunesday');
  const { state, actions, plan, today } = useDunesday();
  const vfs = useOs((s) => s.vfs);
  const fs = useOs((s) => s.fs);
  const clipboard = useOs((s) => s.clipboard);
  const setClipboard = useOs((s) => s.setClipboard);
  const setTitle = useOs((s) => s.setTitle);

  const [history, setHistory] = useState<string[]>([win.params?.path ?? HOME]);
  const [cursor, setCursor] = useState(0);
  const path = history[cursor];
  const [view, setView] = useState<'details' | 'icons'>(() =>
    path.startsWith('videos') || path === VIDEOS ? 'icons' : 'details',
  );
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sort, setSort] = useState<{
    col: 'name' | 'date' | 'type' | 'size' | 'status';
    dir: 1 | -1;
  }>({ col: 'name', dir: 1 });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [menu, setMenu] = useState<null | { x: number; y: number; key: string | null }>(null);
  const [confirm, setConfirm] = useState<null | { text: string; run: () => void }>(null);
  const [navOpen, setNavOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const cannotOpen = (name: string) =>
    t('cannot-open', {
      defaultValue:
        'Windows can’t open “{{name}}”. There is no program on this computer for this type of file.',
      name,
    });

  const groupName = (g: GroupKey) =>
    g === 'dune'
      ? t('group-dune', { defaultValue: 'Dune' })
      : g === 'extra'
        ? t('group-extra', { defaultValue: 'Your extras' })
        : t('group-phase', { defaultValue: 'MCU Phase {{n}}', n: g.slice(1) });
  const filterName = (f: Filter) =>
    f === 'tonight'
      ? t('fav-tonight', { defaultValue: 'Tonight' })
      : f === 'unwatched'
        ? t('fav-unwatched', { defaultValue: 'Unwatched' })
        : f === 'watched'
          ? t('fav-watched', { defaultValue: 'Watched' })
          : t('fav-essentials', { defaultValue: 'Essentials' });

  const isVideos = path === VIDEOS || path.startsWith('videos:') || path.startsWith('filter:');
  const isBin = path === RECYCLE;
  const folderLabel = path.startsWith('videos:')
    ? groupName(path.slice(7) as GroupKey)
    : path.startsWith('filter:')
      ? filterName(path.slice(7) as Filter)
      : path === ROOT
        ? t('computer', { defaultValue: 'Computer' })
        : path === RECYCLE
          ? t('recycle-bin', { defaultValue: 'Recycle Bin' })
          : (vfs[path]?.name ?? '');

  useEffect(() => {
    setTitle(win.id, folderLabel);
  }, [folderLabel, setTitle, win.id]);

  // "Empty Recycle Bin" from the desktop's context menu opens us with ?empty.
  useEffect(() => {
    if (win.params?.empty && isBin) askEmpty();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigate = (next: string) => {
    if (next === path) return;
    const h = [...history.slice(0, cursor + 1), next];
    setHistory(h);
    setCursor(h.length - 1);
    setSelected(new Set());
    setQuery('');
    setRenaming(null);
    if (next === VIDEOS || next.startsWith('videos:') || next.startsWith('filter:'))
      setView('icons');
  };

  const titleItem = (x: WatchTitle): Item => {
    const watched = isWatched(state, x);
    const included = isIncluded(state, x);
    const eps = state.episodesWatched[x.id] ?? 0;
    return {
      key: `t:${x.id}`,
      kind: 'title',
      name: x.title,
      icon: watched ? 'film-watched' : x.kind === 'series' ? 'series' : 'film',
      type:
        x.kind === 'series'
          ? t('type-series', { defaultValue: 'Series' })
          : x.kind === 'special'
            ? t('type-special', { defaultValue: 'Special' })
            : t('type-film', { defaultValue: 'Film' }),
      size: formatMinutes(runtimeOf(state, x)),
      date: x.released.startsWith('9999') ? '' : x.released.slice(0, 4),
      sortDate: x.released.startsWith('9999') ? 0 : Date.parse(x.released),
      status: !included
        ? t('status-excluded', { defaultValue: 'Not in plan' })
        : watched
          ? t('status-watched', { defaultValue: 'Watched' })
          : x.episodes && eps
            ? t('status-eps', { defaultValue: 'Ep {{n}}/{{total}}', n: eps, total: x.episodes })
            : t('status-todo', { defaultValue: 'To watch' }),
      title: x,
    };
  };

  const items: Item[] = useMemo(() => {
    let list: Item[] = [];
    if (path === VIDEOS) {
      const groups: GroupKey[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'dune', 'extra'];
      const titles = allTitles(state);
      for (const g of groups) {
        const inG = titles.filter((x) => groupOf(x) === g && isIncluded(state, x));
        if (!inG.length && g === 'extra') continue;
        const seen = inG.filter((x) => isWatched(state, x)).length;
        list.push({
          key: `g:${g}`,
          kind: 'vgroup',
          name: groupName(g),
          icon: 'folder-videos',
          type: t('type-folder', { defaultValue: 'File folder' }),
          size: '',
          date: '',
          sortDate: groups.indexOf(g),
          status: t('status-group', {
            defaultValue: '{{seen}} of {{total}} watched',
            seen,
            total: inG.length,
          }),
          group: g,
        });
      }
    } else if (path.startsWith('videos:')) {
      const g = path.slice(7) as GroupKey;
      list = orderedTitles(state)
        .filter((x) => groupOf(x) === g && isIncluded(state, x))
        .map(titleItem);
    } else if (path.startsWith('filter:')) {
      const f = path.slice(7) as Filter;
      const tonightIds = new Set(
        (plan.days.find((d) => d.date >= today && d.entries.length)?.entries ?? []).map(
          (e) => e.titleId,
        ),
      );
      list = orderedTitles(state)
        .filter((x) => isIncluded(state, x))
        .filter((x) =>
          f === 'tonight'
            ? tonightIds.has(x.id)
            : f === 'watched'
              ? isWatched(state, x)
              : f === 'unwatched'
                ? !isWatched(state, x)
                : x.essential,
        )
        .map(titleItem);
    } else {
      const nodes = children(vfs, path);
      list = nodes.map((n) => ({
        key: `n:${n.id}`,
        kind: 'node' as const,
        name: n.name,
        icon: iconFor(n, vfs),
        type: typeLabel(n, t),
        size: n.id === VIDEOS ? '' : sizeLabel(n),
        date: n.system
          ? ''
          : new Date(n.modified).toLocaleString(i18n.language, {
              dateStyle: 'short',
              timeStyle: 'short',
            }),
        sortDate: n.modified,
        status: '',
        node: n,
      }));
      if (isBin) {
        list.push(
          ...allTitles(state)
            .filter((x) => !isIncluded(state, x))
            .map(titleItem),
        );
      }
    }
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((i) => i.name.toLowerCase().includes(q));
    // Videos keep plan order unless a column was clicked; folders stay first.
    if (!(path.startsWith('videos:') && sort.col === 'name' && sort.dir === 1 && !q)) {
      list = [...list].sort((a, b) => {
        if (
          (a.kind !== 'title' && a.node?.kind === 'folder') !==
          (b.kind !== 'title' && b.node?.kind === 'folder')
        ) {
          return a.node?.kind === 'folder' ? -1 : 1;
        }
        const k = sort.col;
        const va = k === 'date' ? a.sortDate : a[k];
        const vb = k === 'date' ? b.sortDate : b[k];
        return (
          (typeof va === 'number'
            ? va - (vb as number)
            : String(va).localeCompare(String(vb), undefined, { numeric: true })) * sort.dir
        );
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, vfs, state, query, sort, plan, today, isBin, i18n.language, t]);

  const selItems = items.filter((i) => selected.has(i.key));
  const selTitles = selItems.filter((i) => i.title).map((i) => i.title!);
  const selNodes = selItems.filter((i) => i.node).map((i) => i.node!);

  // ── Operations ────────────────────────────────────────────────────────────
  const fail = (err: { message: string } | null) => {
    if (err) {
      sfx.undo();
      showMessage({ icon: 'error', text: err.message });
      return true;
    }
    return false;
  };

  const openItem = (it: Item) => {
    sfx.tick();
    if (it.kind === 'vgroup') return navigate(`videos:${it.group}`);
    if (it.title) return void openApp('properties', { params: { title: it.title.id } });
    if (it.node) {
      if (it.node.kind === 'folder') return navigate(it.node.id);
      openNode(it.node, cannotOpen);
    }
  };

  const newItem = (kind: 'folder' | 'txt') => {
    if (isVideos || isBin || path === ROOT) return;
    let id: string | null = null;
    const err = fs((v) => {
      const r = create(
        v,
        path,
        kind === 'folder'
          ? { name: t('new-folder', { defaultValue: 'New folder' }), kind: 'folder' }
          : {
              name: t('new-txt', { defaultValue: 'New Text Document.txt' }),
              kind: 'file',
              content: '',
            },
      );
      id = r.id;
      return r.vfs;
    });
    if (fail(err) || !id) return;
    setSelected(new Set([`n:${id}`]));
    setRenaming(`n:${id}`);
  };

  const deleteSelected = () => {
    if (isBin) {
      if (!selItems.length) return;
      setConfirm({
        text: t('confirm-purge', {
          defaultValue: 'Are you sure you want to permanently delete these {{count}} items?',
          count: selItems.length,
        }),
        run: () => {
          for (const it of selItems) {
            if (it.node) fs((v) => purge(v, it.node!.id));
            // A built-in title can't be destroyed — it simply stays out of the plan.
          }
          sfx.pop();
          setSelected(new Set());
        },
      });
      return;
    }
    if (selTitles.length) {
      actions.setIncludedMany(
        selTitles.map((x) => x.id),
        false,
      );
      sfx.pop();
    }
    for (const n of selNodes) if (fail(fs((v) => recycle(v, n.id)))) return;
    if (selNodes.length) sfx.pop();
    setSelected(new Set());
  };

  const restoreSelected = () => {
    for (const it of selItems) {
      if (it.title) actions.setIncludedMany([it.title.id], true);
      if (it.node) fs((v) => restore(v, it.node!.id));
    }
    sfx.bloop();
    setSelected(new Set());
  };

  function askEmpty() {
    const count = children(useOs.getState().vfs, RECYCLE).length;
    if (!count) return;
    setConfirm({
      text: t('confirm-empty', {
        defaultValue: 'Are you sure you want to permanently delete these {{count}} items?',
        count,
      }),
      run: () => {
        for (const n of children(useOs.getState().vfs, RECYCLE)) fs((v) => purge(v, n.id));
        sfx.pop();
      },
    });
  }

  const paste = () => {
    if (!clipboard || isVideos || isBin || path === ROOT) return;
    for (const id of clipboard.ids) {
      if (!useOs.getState().vfs[id]) continue;
      if (
        fail(
          clipboard.op === 'cut'
            ? fs((v) => vfsMove(v, id, path))
            : fs((v) => vfsCopy(v, id, path).vfs),
        )
      )
        return;
    }
    if (clipboard.op === 'cut') setClipboard(null);
    sfx.tick();
  };

  const commitRename = (key: string, name: string) => {
    setRenaming(null);
    const it = items.find((i) => i.key === key);
    if (!it?.node || name.trim() === it.node.name) return;
    fail(fs((v) => vfsRename(v, it.node!.id, name)));
  };

  const markWatched = (on: boolean) => {
    for (const x of selTitles) {
      const watched = isWatched(state, x);
      if (watched !== on) actions.toggleWatched(x.id);
    }
    if (on) sfx.chime();
    else sfx.undo();
  };

  // ── Selection + keyboard ──────────────────────────────────────────────────
  const clickItem = (it: Item, e: RMouseEvent) => {
    if (e.shiftKey && anchor) {
      const a = items.findIndex((i) => i.key === anchor);
      const b = items.findIndex((i) => i.key === it.key);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(new Set(items.slice(lo, hi + 1).map((i) => i.key)));
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected);
      if (next.has(it.key)) next.delete(it.key);
      else next.add(it.key);
      setSelected(next);
    } else {
      setSelected(new Set([it.key]));
    }
    setAnchor(it.key);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming || (e.target as HTMLElement).tagName === 'INPUT') return;
    const idx = items.findIndex((i) => i.key === anchor);
    const cols =
      view === 'icons' ? Math.max(1, Math.floor((listRef.current?.clientWidth ?? 600) / 112)) : 1;
    const go = (n: number) => {
      const next = items[Math.min(items.length - 1, Math.max(0, n))];
      if (!next) return;
      setSelected(new Set([next.key]));
      setAnchor(next.key);
      document.getElementById(`${win.id}-${next.key}`)?.focus();
    };
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      go(idx + cols);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      go(idx - cols);
    } else if (e.key === 'ArrowRight' && view === 'icons') {
      e.preventDefault();
      go(idx + 1);
    } else if (e.key === 'ArrowLeft' && view === 'icons') {
      e.preventDefault();
      go(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      go(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      go(items.length - 1);
    } else if (e.key === 'Enter' && selItems[0]) {
      e.preventDefault();
      openItem(selItems[0]);
    } else if (e.key === 'Delete') {
      e.preventDefault();
      deleteSelected();
    } else if (e.key === 'F2' && selItems[0]?.node && !selItems[0].node.system) {
      e.preventDefault();
      setRenaming(selItems[0].key);
    } else if (e.key === ' ' && selTitles.length) {
      e.preventDefault();
      markWatched(!isWatched(state, selTitles[0]));
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      up();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(items.map((i) => i.key)));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selNodes.length)
      setClipboard({ op: 'copy', ids: selNodes.map((n) => n.id) });
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && selNodes.length)
      setClipboard({ op: 'cut', ids: selNodes.map((n) => n.id) });
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') paste();
  };

  const up = () => {
    if (path.startsWith('videos:') || path.startsWith('filter:')) return navigate(VIDEOS);
    const parent = vfs[path]?.parent;
    if (parent) navigate(parent);
  };

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onItemPointerDown = (it: Item) => (e: React.PointerEvent) => {
    if (e.button !== 0 || renaming === it.key) return;
    const keys = selected.has(it.key) ? [...selected] : [it.key];
    const chosen = items.filter((i) => keys.includes(i.key));
    const titles = chosen.filter((i) => i.title).map((i) => i.title!.id);
    const nodes = chosen.filter((i) => i.node && !i.node.system).map((i) => i.node!.id);
    const label =
      chosen.length > 1
        ? t('n-items', { defaultValue: '{{count}} items', count: chosen.length })
        : it.name;
    if (titles.length) beginDrag(e, { kind: 'title', ids: titles }, label);
    else if (nodes.length) beginDrag(e, { kind: 'node', ids: nodes }, label);
  };

  // ── Menus ─────────────────────────────────────────────────────────────────
  const itemMenu = (it: Item): MenuItem[] => {
    if (it.title) {
      const watched = isWatched(state, it.title);
      const included = isIncluded(state, it.title);
      return [
        {
          label: t('ctx-properties-open', { defaultValue: 'Open' }),
          bold: true,
          onSelect: () => openItem(it),
        },
        {
          label: watched
            ? t('mark-unwatched', { defaultValue: 'Mark as unwatched' })
            : t('mark-watched', { defaultValue: 'Mark as watched' }),
          onSelect: () => markWatched(!watched),
        },
        included
          ? {
              label: t('leave-out', { defaultValue: 'Leave out of plan' }),
              onSelect: deleteSelected,
            }
          : { label: t('restore', { defaultValue: 'Restore' }), onSelect: restoreSelected },
        { separator: true },
        {
          label: t('ask-about', { defaultValue: 'Ask Messenger about this' }),
          onSelect: () =>
            openApp('messenger', {
              params: {
                ask: t('ask-about-q', {
                  defaultValue: 'Tell me about {{title}} — why does it matter for Dunesday?',
                  title: it.title!.title,
                }),
              },
            }),
        },
      ];
    }
    if (it.kind === 'vgroup')
      return [
        {
          label: t('ctx-open', { defaultValue: 'Open' }),
          bold: true,
          onSelect: () => openItem(it),
        },
      ];
    const sys = it.node?.system;
    return [
      { label: t('ctx-open', { defaultValue: 'Open' }), bold: true, onSelect: () => openItem(it) },
      ...(isBin
        ? [
            {
              label: t('restore', { defaultValue: 'Restore' }),
              onSelect: restoreSelected,
            } as MenuItem,
          ]
        : [
            { separator: true } as MenuItem,
            {
              label: t('ctx-cut', { defaultValue: 'Cut' }),
              disabled: sys,
              onSelect: () => setClipboard({ op: 'cut', ids: selNodes.map((n) => n.id) }),
            },
            {
              label: t('ctx-copy', { defaultValue: 'Copy' }),
              disabled: sys,
              onSelect: () => setClipboard({ op: 'copy', ids: selNodes.map((n) => n.id) }),
            },
            { separator: true } as MenuItem,
            {
              label: t('ctx-delete', { defaultValue: 'Delete' }),
              disabled: sys,
              onSelect: deleteSelected,
            },
            {
              label: t('ctx-rename', { defaultValue: 'Rename' }),
              disabled: sys,
              onSelect: () => setRenaming(it.key),
            },
          ]),
    ];
  };
  const bgMenu = (): MenuItem[] => [
    {
      label: t('view-details', { defaultValue: 'Details' }),
      checked: view === 'details',
      onSelect: () => setView('details'),
    },
    {
      label: t('view-large', { defaultValue: 'Large icons' }),
      checked: view === 'icons',
      onSelect: () => setView('icons'),
    },
    { separator: true },
    { label: t('refresh', { defaultValue: 'Refresh' }), onSelect: () => sfx.tick() },
    ...(!isVideos && !isBin && path !== ROOT
      ? ([
          { label: t('paste', { defaultValue: 'Paste' }), disabled: !clipboard, onSelect: paste },
          { separator: true },
          {
            label: t('new-folder', { defaultValue: 'New folder' }),
            onSelect: () => newItem('folder'),
          },
          {
            label: t('new-txt-menu', { defaultValue: 'New text document' }),
            onSelect: () => newItem('txt'),
          },
        ] as MenuItem[])
      : []),
    ...(isBin
      ? [
          {
            label: t('empty-bin', { defaultValue: 'Empty Recycle Bin' }),
            onSelect: askEmpty,
          } as MenuItem,
        ]
      : []),
  ];

  // ── Address bar ───────────────────────────────────────────────────────────
  const crumbs: { label: string; path: string }[] = (() => {
    if (path === VIDEOS || path.startsWith('videos:') || path.startsWith('filter:')) {
      const base = trail(vfs, VIDEOS).map((n) => ({
        label: n.id === DRIVE ? 'Local Disk (C:)' : n.name,
        path: n.id,
      }));
      if (path !== VIDEOS) base.push({ label: folderLabel, path });
      return base;
    }
    if (path === RECYCLE)
      return [{ label: t('recycle-bin', { defaultValue: 'Recycle Bin' }), path: RECYCLE }];
    return trail(vfs, path).map((n) => ({
      label: n.id === ROOT ? t('computer', { defaultValue: 'Computer' }) : n.name,
      path: n.id,
    }));
  })();

  const dropTarget = isBin
    ? 'recycle'
    : isVideos
      ? 'videos'
      : path === ROOT
        ? undefined
        : `folder:${path}`;

  // ── Details pane ──────────────────────────────────────────────────────────
  const detail = selItems.length === 1 ? selItems[0] : null;

  return (
    <div className="ds-ex">
      <div className="ds-ex-top">
        <div className="ds-ex-navbtns">
          <button
            type="button"
            className="ds-ex-round"
            disabled={cursor === 0}
            aria-label={t('back', { defaultValue: 'Back' })}
            onClick={() => setCursor((c) => c - 1)}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="ds-ex-round"
            disabled={cursor >= history.length - 1}
            aria-label={t('forward', { defaultValue: 'Forward' })}
            onClick={() => setCursor((c) => c + 1)}
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="ds-ex-address">
          {editingPath ? (
            <input
              className="ds-ex-pathinput"
               
              autoFocus
              defaultValue={isVideos || isBin ? folderLabel : pathOf(vfs, path)}
              aria-label={t('address', { defaultValue: 'Address' })}
              onBlur={() => setEditingPath(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditingPath(false);
                if (e.key === 'Enter') {
                  const target = resolve(vfs, DRIVE, e.currentTarget.value);
                  setEditingPath(false);
                  if (target && vfs[target]?.kind === 'folder') navigate(target);
                  else
                    showMessage({
                      icon: 'error',
                      text: t('path-not-found', {
                        defaultValue:
                          'Windows can’t find “{{path}}”. Check the spelling and try again.',
                        path: e.currentTarget.value,
                      }),
                    });
                }
              }}
            />
          ) : (
            <div
              className="ds-ex-crumbs"
              onClick={(e) => e.target === e.currentTarget && setEditingPath(true)}
              role="presentation"
            >
              <Icon
                name={isBin ? 'recycle-empty' : isVideos ? 'folder-videos' : 'folder'}
                size={16}
              />
              {crumbs.map((c, i) => (
                <span key={c.path} className="ds-ex-crumb">
                  {i > 0 && <ChevronRight size={12} aria-hidden="true" />}
                  <button type="button" onClick={() => navigate(c.path)}>
                    {c.label}
                  </button>
                </span>
              ))}
              <button
                type="button"
                className="ds-ex-editpath"
                aria-label={t('edit-address', { defaultValue: 'Edit address' })}
                onClick={() => setEditingPath(true)}
              />
            </div>
          )}
        </div>
        <label className="ds-ex-search">
          <span className="ds-sr-only">
            {t('search-folder', { defaultValue: 'Search {{name}}', name: folderLabel })}
          </span>
          <input
            type="search"
            value={query}
            placeholder={t('search-folder', { defaultValue: 'Search {{name}}', name: folderLabel })}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search size={14} aria-hidden="true" />
        </label>
      </div>

      <div
        className="ds-ex-cmd"
        role="toolbar"
        aria-label={t('commands', { defaultValue: 'Commands' })}
      >
        <button
          type="button"
          className="ds-ex-cmdbtn ds-ex-navtoggle"
          aria-pressed={navOpen}
          aria-label={t('nav-pane', { defaultValue: 'Navigation pane' })}
          onClick={() => setNavOpen((v) => !v)}
        >
          <PanelLeft size={15} aria-hidden="true" />
        </button>
        {selTitles.length > 0 && (
          <>
            <button
              type="button"
              className="ds-ex-cmdbtn"
              onClick={() => markWatched(!selTitles.every((x) => isWatched(state, x)))}
            >
              {selTitles.every((x) => isWatched(state, x))
                ? t('mark-unwatched', { defaultValue: 'Mark as unwatched' })
                : t('mark-watched', { defaultValue: 'Mark as watched' })}
            </button>
            {isBin ? (
              <button type="button" className="ds-ex-cmdbtn" onClick={restoreSelected}>
                {t('restore', { defaultValue: 'Restore' })}
              </button>
            ) : (
              <button type="button" className="ds-ex-cmdbtn" onClick={deleteSelected}>
                {t('leave-out', { defaultValue: 'Leave out of plan' })}
              </button>
            )}
            <button
              type="button"
              className="ds-ex-cmdbtn"
              onClick={() => openItem(selItems.find((i) => i.title)!)}
            >
              {t('ctx-properties', { defaultValue: 'Properties' })}
            </button>
          </>
        )}
        {!isVideos && !isBin && path !== ROOT && (
          <>
            <button type="button" className="ds-ex-cmdbtn" onClick={() => newItem('folder')}>
              {t('new-folder', { defaultValue: 'New folder' })}
            </button>
            <button type="button" className="ds-ex-cmdbtn" onClick={() => newItem('txt')}>
              {t('new-txt-menu', { defaultValue: 'New text document' })}
            </button>
          </>
        )}
        {selNodes.length > 0 && !isBin && (
          <button
            type="button"
            className="ds-ex-cmdbtn"
            onClick={deleteSelected}
            disabled={selNodes.some((n) => n.system)}
          >
            {t('ctx-delete', { defaultValue: 'Delete' })}
          </button>
        )}
        {isBin && (
          <>
            <button
              type="button"
              className="ds-ex-cmdbtn"
              onClick={askEmpty}
              disabled={!children(vfs, RECYCLE).length}
            >
              {t('empty-bin', { defaultValue: 'Empty Recycle Bin' })}
            </button>
            <button
              type="button"
              className="ds-ex-cmdbtn"
              onClick={restoreSelected}
              disabled={!selItems.length}
            >
              {t('restore-selected', { defaultValue: 'Restore the selected items' })}
            </button>
          </>
        )}
        {path === VIDEOS || path.startsWith('videos:') ? (
          <label className="ds-ex-order">
            <span>{t('plan-order', { defaultValue: 'Plan order' })}</span>
            <select
              value={state.order}
              onChange={(e) => actions.setOrder(e.target.value as typeof state.order)}
            >
              <option value="release">{t('order-release', { defaultValue: 'Release' })}</option>
              <option value="story">
                {t('order-story', { defaultValue: 'Story (timeline)' })}
              </option>
              <option value="custom">{t('order-custom', { defaultValue: 'My order' })}</option>
            </select>
          </label>
        ) : null}
        <span className="ds-ex-cmdspacer" />
        <button
          type="button"
          className="ds-ex-cmdbtn"
          aria-pressed={view === 'details'}
          aria-label={t('view-details', { defaultValue: 'Details' })}
          onClick={() => setView('details')}
        >
          <List size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="ds-ex-cmdbtn"
          aria-pressed={view === 'icons'}
          aria-label={t('view-large', { defaultValue: 'Large icons' })}
          onClick={() => setView('icons')}
        >
          <LayoutGrid size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="ds-ex-main">
        {navOpen && (
          <nav
            className="ds-ex-nav"
            aria-label={t('nav-pane', { defaultValue: 'Navigation pane' })}
          >
            <p className="ds-ex-navhead">{t('favorites', { defaultValue: 'Favorites' })}</p>
            <NavItem
              current={path}
              onGo={navigate}
              to={DESKTOP}
              icon="folder"
              label={t('desktop', { defaultValue: 'Desktop' })}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to={DOWNLOADS}
              icon="folder-downloads"
              label={t('downloads', { defaultValue: 'Downloads' })}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to="filter:tonight"
              icon="player"
              label={filterName('tonight')}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to="filter:unwatched"
              icon="film"
              label={filterName('unwatched')}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to="filter:watched"
              icon="film-watched"
              label={filterName('watched')}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to="filter:essentials"
              icon="welcome"
              label={filterName('essentials')}
            />
            <p className="ds-ex-navhead">{t('libraries', { defaultValue: 'Libraries' })}</p>
            <NavItem
              current={path}
              onGo={navigate}
              to={DOCUMENTS}
              icon="folder-docs"
              label={t('documents', { defaultValue: 'Documents' })}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to={MUSIC}
              icon="folder-music"
              label={t('music', { defaultValue: 'Music' })}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to={PICTURES}
              icon="folder-pics"
              label={t('pictures', { defaultValue: 'Pictures' })}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to={VIDEOS}
              icon="folder-videos"
              label={t('videos-watchlist', { defaultValue: 'Videos (watch list)' })}
            />
            <p className="ds-ex-navhead">{t('computer', { defaultValue: 'Computer' })}</p>
            <NavItem
              current={path}
              onGo={navigate}
              to={HOME}
              icon="folder-user"
              label={vfs[HOME]?.name ?? ''}
            />
            <NavItem
              current={path}
              onGo={navigate}
              to={DRIVE}
              icon="drive"
              label="Local Disk (C:)"
            />
            <NavItem
              current={path}
              onGo={navigate}
              to={RECYCLE}
              icon={
                children(vfs, RECYCLE).length || allTitles(state).some((x) => !isIncluded(state, x))
                  ? 'recycle-full'
                  : 'recycle-empty'
              }
              label={t('recycle-bin', { defaultValue: 'Recycle Bin' })}
            />
          </nav>
        )}

        <div
          ref={listRef}
          className={cn(
            'ds-ex-list',
            view === 'icons' ? 'ds-ex-list--icons' : 'ds-ex-list--details',
          )}
          data-drop={dropTarget}
          role="listbox"
          onKeyDown={(e) => {
            if (e.target === e.currentTarget) onKey(e);
          }}
          aria-multiselectable="true"
          aria-label={folderLabel}
          tabIndex={items.length ? -1 : 0}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSelected(new Set());
          }}
          onContextMenu={(e) => {
            if (e.target !== e.currentTarget) return;
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, key: null });
          }}
        >
          {view === 'details' && (
            <div className="ds-ex-head" role="presentation">
              {(['name', 'date', 'type', 'size', 'status'] as const).map((col) => (
                <button
                  key={col}
                  type="button"
                  className={cn(
                    'ds-ex-col',
                    `ds-ex-col--${col}`,
                    sort.col === col && 'ds-ex-col--on',
                  )}
                  onClick={() =>
                    setSort((s) => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : 1 }))
                  }
                  aria-label={t('sort-by', { defaultValue: 'Sort by {{col}}', col })}
                >
                  {col === 'name'
                    ? t('col-name', { defaultValue: 'Name' })
                    : col === 'date'
                      ? isVideos || isBin
                        ? t('col-year', { defaultValue: 'Year' })
                        : t('col-modified', { defaultValue: 'Date modified' })
                      : col === 'type'
                        ? t('col-type', { defaultValue: 'Type' })
                        : col === 'size'
                          ? isVideos
                            ? t('col-length', { defaultValue: 'Length' })
                            : t('col-size', { defaultValue: 'Size' })
                          : t('col-status', { defaultValue: 'Status' })}
                  {sort.col === col && (
                    <span aria-hidden="true">{sort.dir === 1 ? ' ▴' : ' ▾'}</span>
                  )}
                </button>
              ))}
            </div>
          )}
          {items.map((it) => (
            <div
              key={it.key}
              id={`${win.id}-${it.key}`}
              role="option"
              onKeyDown={onKey}
              aria-selected={selected.has(it.key)}
              tabIndex={anchor === it.key || (!anchor && it === items[0]) ? 0 : -1}
              className={cn(
                'ds-ex-item',
                selected.has(it.key) && 'ds-ex-item--sel',
                clipboard?.op === 'cut' &&
                  it.node &&
                  clipboard.ids.includes(it.node.id) &&
                  'ds-ex-item--cut',
              )}
              data-drop={
                it.node?.kind === 'folder'
                  ? it.node.id === RECYCLE
                    ? 'recycle'
                    : it.node.id === VIDEOS
                      ? 'videos'
                      : `folder:${it.node.id}`
                  : it.kind === 'vgroup'
                    ? 'videos'
                    : undefined
              }
              onPointerDown={onItemPointerDown(it)}
              onClick={(e) => {
                clickItem(it, e);
                if (
                  (e.nativeEvent as PointerEvent).pointerType &&
                  (e.nativeEvent as PointerEvent).pointerType !== 'mouse' &&
                  !e.ctrlKey &&
                  !e.shiftKey
                )
                  openItem(it);
              }}
              onDoubleClick={() => openItem(it)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.has(it.key)) setSelected(new Set([it.key]));
                setAnchor(it.key);
                setMenu({ x: e.clientX, y: e.clientY, key: it.key });
              }}
            >
              <Icon
                name={it.icon}
                size={view === 'icons' ? 48 : 18}
                shortcut={it.node?.kind === 'shortcut'}
              />
              {renaming === it.key ? (
                <input
                  className="ds-rename"
                   
                  autoFocus
                  defaultValue={it.name}
                  aria-label={t('rename', { defaultValue: 'Rename' })}
                  onFocus={(e) => {
                    const dot = it.name.lastIndexOf('.');
                    e.currentTarget.setSelectionRange(0, dot > 0 ? dot : it.name.length);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === 'Enter') commitRename(it.key, e.currentTarget.value);
                    if (e.key === 'Escape') setRenaming(null);
                  }}
                  onBlur={(e) => commitRename(it.key, e.currentTarget.value)}
                />
              ) : (
                <span className="ds-ex-name">{it.name}</span>
              )}
              {view === 'details' && (
                <>
                  <span className="ds-ex-cell ds-ex-col--date">{it.date}</span>
                  <span className="ds-ex-cell ds-ex-col--type">{it.type}</span>
                  <span className="ds-ex-cell ds-ex-col--size">{it.size}</span>
                  <span className="ds-ex-cell ds-ex-col--status">{it.status}</span>
                </>
              )}
            </div>
          ))}
          {!items.length && (
            <p className="ds-ex-empty">
              {query
                ? t('search-none', { defaultValue: 'No items match your search.' })
                : t('folder-empty', { defaultValue: 'This folder is empty.' })}
            </p>
          )}
        </div>
      </div>

      <div className="ds-ex-details" aria-live="polite">
        {detail ? (
          <>
            <Icon name={detail.icon} size={40} />
            <div>
              <strong>{detail.name}</strong>
              <span>
                {[detail.type, detail.size, detail.date].filter(Boolean).join(' · ')}
                {detail.title?.hook ? ` — ${detail.title.hook}` : ''}
              </span>
              {detail.status && <span>{detail.status}</span>}
            </div>
          </>
        ) : (
          <span>
            {selItems.length > 1
              ? t('n-selected', {
                  defaultValue: '{{count}} items selected',
                  count: selItems.length,
                })
              : t('n-items', { defaultValue: '{{count}} items', count: items.length })}
          </span>
        )}
      </div>

      {menu && (
        <PopupMenu
          at={{ x: menu.x, y: menu.y }}
          label={t('ctx-menu', { defaultValue: 'Context menu' })}
          items={menu.key ? itemMenu(items.find((i) => i.key === menu.key)!) : bgMenu()}
          onClose={() => setMenu(null)}
        />
      )}

      {confirm && (
        <div
          className="ds-ex-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={t('confirm-delete', { defaultValue: 'Delete Multiple Items' })}
        >
          <div className="ds-ex-confirmbox">
            <Icon name="warning" size={36} />
            <p>{confirm.text}</p>
            <div className="ds-row">
              <button
                type="button"
                className="ds-btn7"
                 
                autoFocus
                onClick={() => {
                  confirm.run();
                  setConfirm(null);
                }}
              >
                {t('yes', { defaultValue: 'Yes' })}
              </button>
              <button type="button" className="ds-btn7" onClick={() => setConfirm(null)}>
                {t('no', { defaultValue: 'No' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({
  to,
  icon,
  label,
  current,
  onGo,
}: {
  to: string;
  icon: IconName;
  label: string;
  current: string;
  onGo: (to: string) => void;
}) {
  return (
    <button
      type="button"
      className={cn('ds-ex-nav-item', current === to && 'ds-ex-nav-item--on')}
      onClick={() => onGo(to)}
      data-drop={
        to.includes(':')
          ? undefined
          : to === RECYCLE
            ? 'recycle'
            : to === VIDEOS
              ? 'videos'
              : `folder:${to}`
      }
      aria-current={current === to ? 'page' : undefined}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );
}

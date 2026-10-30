/**
 * The file tree — the HUD's real TF2 folder structure, with change status,
 * a "changed only" filter, search, and per-file actions.
 */
'use client';

import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  FilePlus,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Monitor,
  Music,
  Pencil,
  Search,
  Trash2,
  Type,
  Undo2,
  Upload,
} from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TfTabs, type TfTab } from './TfTabs';
import { changedFiles, statusOf } from '@/lib/tf2-hud/project/model';
import {
  HUD_ROOT_FOLDERS,
  basename,
  categoryOf,
  type FileCategory,
} from '@/lib/tf2-hud/project/paths';
import type { FileStatus } from '@/lib/tf2-hud/project/types';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { useEditor } from '@/lib/tf2-hud/store';
import { useValidationContext } from './validation-context';
import { SINGLE_FILE_PREFIX } from '@/lib/tf2-hud/pages';
import { cn } from '@/lib/utils';
import { ConfirmDialog, PromptDialog, UploadDialog } from './dialogs';
import { ContextMenu, IconBtn, PanelHead, type MenuItem } from './ui';

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: Map<string, TreeNode>;
}

function buildTree(paths: readonly string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', isDir: true, children: new Map() };
  for (const p of paths) {
    const parts = p.split('/');
    let cur = root;
    parts.forEach((part, i) => {
      const isDir = i < parts.length - 1;
      const path = parts.slice(0, i + 1).join('/') + (isDir ? '/' : '');
      let next = cur.children.get(part);
      if (!next) {
        next = { name: part, path, isDir, children: new Map() };
        cur.children.set(part, next);
      }
      cur = next;
    });
  }
  return root;
}

const ICON: Record<FileCategory, typeof FileIcon> = {
  scheme: Type,
  panel: FileText,
  script: FileText,
  image: ImageIcon,
  font: Type,
  sound: Music,
  text: FileText,
  other: FileIcon,
};

const STATUS_LETTER: Record<Exclude<FileStatus, 'unchanged'>, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
};

function sortedChildren(node: TreeNode): TreeNode[] {
  const order = (n: TreeNode) => {
    const i = (HUD_ROOT_FOLDERS as readonly string[]).indexOf(n.name);
    return node.path === '' && i >= 0 ? i : 99;
  };
  return [...node.children.values()].sort(
    (a, b) =>
      order(a) - order(b) ||
      Number(b.isDir) - Number(a.isDir) ||
      a.name.localeCompare(b.name, 'en', { numeric: true }),
  );
}

export default function FileTree() {
  const { t } = useTranslation('c-tf2-hud');
  const overlay = useEditor((s) => s.overlay);
  const baseIndex = useEditor((s) => s.baseIndex);
  const activePath = useEditor((s) => s.activePath);
  const openFile = useEditor((s) => s.openFile);
  const setPage = useEditor((s) => s.setPage);
  const createFile = useEditor((s) => s.createFile);
  const deletePath = useEditor((s) => s.deletePath);
  const renamePath = useEditor((s) => s.renamePath);
  const revertPath = useEditor((s) => s.revertPath);
  const readText = useEditor((s) => s.readText);
  const readBytes = useEditor((s) => s.readBytes);
  const ensureFiles = useEditor((s) => s.ensureFiles);
  const filter = useTf2HudPrefs((s) => s.treeFilter);
  const setPref = useTf2HudPrefs((s) => s.set);
  const { byPath } = useValidationContext();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(['resource/', 'resource/ui/']),
  );
  const [menu, setMenu] = useState<{
    at: { x: number; y: number };
    path: string;
    isDir: boolean;
  } | null>(null);
  const [prompt, setPrompt] = useState<{
    kind: 'new' | 'rename' | 'duplicate';
    path: string;
  } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [uploads, setUploads] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const changed = useMemo(() => changedFiles(overlay, baseIndex), [overlay, baseIndex]);
  const allPaths = useMemo(() => {
    // The base also carries game files the browser game's menus read (cfg/, hl2/): not HUD files.
    const set = new Set<string>(
      baseIndex ? [...baseIndex.files.keys()].filter((p) => (HUD_ROOT_FOLDERS as readonly string[]).includes(p.split('/')[0])) : [],
    );
    for (const [p, c] of overlay) {
      if (c === null) set.delete(p);
      else set.add(p);
    }
    return [...set];
  }, [overlay, baseIndex]);

  const visiblePaths = useMemo(() => {
    let list: string[];
    if (filter === 'modified') {
      list = changed.map((c) => c.path);
    } else if (filter === 'problems') {
      list = allPaths.filter((p) => byPath.has(p));
    } else list = allPaths;
    const q = query.trim().toLowerCase();
    return q ? list.filter((p) => p.toLowerCase().includes(q)) : list;
  }, [filter, changed, allPaths, byPath, query]);

  const tree = useMemo(() => buildTree(visiblePaths), [visiblePaths]);
  const searching = query.trim() !== '' || filter !== 'all';

  const toggle = useCallback((path: string) => {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const tabs: TfTab[] = [
    { id: 'all', label: t('filter-all', { defaultValue: 'All' }) },
    {
      id: 'modified',
      label: t('filter-changed', { defaultValue: 'Changed' }),
      count: changed.length,
    },
    {
      id: 'problems',
      label: t('filter-problems', { defaultValue: 'Problems' }),
      count: byPath.size,
    },
  ];

  const download = async (path: string) => {
    await ensureFiles([path]);
    const bytes = readBytes(path);
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
    const a = document.createElement('a');
    a.href = url;
    a.download = basename(path);
    a.click();
    URL.revokeObjectURL(url);
  };

  const duplicate = async (path: string, to: string) => {
    await ensureFiles([path]);
    const text = readText(path);
    if (text !== undefined) createFile(to, text);
    else
      toast.error(
        t('cannot-duplicate', { defaultValue: 'Only text files can be duplicated here.' }),
      );
  };

  const menuItems = (path: string, isDir: boolean): MenuItem[] => {
    const status = statusOf(overlay, baseIndex, path);
    const dir = isDir ? path : path.slice(0, path.lastIndexOf('/') + 1);
    const items: MenuItem[] = [];
    if (!isDir) {
      items.push({
        id: 'open',
        label: t('open', { defaultValue: 'Open' }),
        icon: FileText,
        onSelect: () => openFile(path),
      });
      if (categoryOf(path) === 'panel' || categoryOf(path) === 'scheme') {
        items.push({
          id: 'preview',
          label: t('preview-file', { defaultValue: 'Preview this file' }),
          icon: Monitor,
          onSelect: () => {
            void ensureFiles([path]).then(() => setPage(`${SINGLE_FILE_PREFIX}${path}`));
          },
        });
      }
    }
    items.push({
      id: 'new',
      label: t('new-file-here', { defaultValue: 'New file here…' }),
      icon: FilePlus,
      onSelect: () => setPrompt({ kind: 'new', path: dir }),
    });
    if (!isDir) {
      items.push(
        {
          id: 'rename',
          label: t('rename', { defaultValue: 'Rename / move…' }),
          icon: Pencil,
          onSelect: () => setPrompt({ kind: 'rename', path }),
        },
        {
          id: 'dup',
          label: t('duplicate', { defaultValue: 'Duplicate…' }),
          icon: Copy,
          onSelect: () => setPrompt({ kind: 'duplicate', path }),
        },
        {
          id: 'download',
          label: t('download-file', { defaultValue: 'Download file' }),
          icon: Download,
          onSelect: () => void download(path),
        },
      );
    } else {
      items.push({
        id: 'rename',
        label: t('rename-folder', { defaultValue: 'Rename folder…' }),
        icon: Pencil,
        onSelect: () => setPrompt({ kind: 'rename', path }),
      });
    }
    if (status === 'modified' || status === 'deleted' || status === 'added') {
      items.push({
        id: 'revert',
        label: t('revert', { defaultValue: 'Revert changes' }),
        icon: Undo2,
        onSelect: () => revertPath(path),
      });
    }
    items.push({
      id: 'delete',
      label: t('delete', { defaultValue: 'Delete' }),
      icon: Trash2,
      danger: true,
      onSelect: () => setConfirm(path),
    });
    return items;
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const expanded = searching || open.has(node.path);
    if (node.isDir) {
      return (
        <li key={node.path} role="none">
          <button
            type="button"
            role="treeitem"
            aria-selected={false}
            aria-expanded={expanded}
            onClick={() => toggle(node.path)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ at: { x: e.clientX, y: e.clientY }, path: node.path, isDir: true });
            }}
            style={{ paddingInlineStart: 8 + depth * 12 }}
            className="flex h-7 w-full items-center gap-1.5 pe-2 text-start text-xs text-(--app-text-muted) hover:bg-(--app-surface-hover)"
          >
            {expanded ? (
              <ChevronDown className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" aria-hidden />
            )}
            {expanded ? (
              <FolderOpen className="size-3.5 shrink-0" aria-hidden />
            ) : (
              <Folder className="size-3.5 shrink-0" aria-hidden />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {expanded ? (
            <ul role="group">{sortedChildren(node).map((c) => renderNode(c, depth + 1))}</ul>
          ) : null}
        </li>
      );
    }
    const status = statusOf(overlay, baseIndex, node.path);
    const Icon = ICON[categoryOf(node.path)];
    const sev = byPath.get(node.path);
    return (
      <li key={node.path} role="none">
        <button
          type="button"
          role="treeitem"
          aria-selected={activePath === node.path}
          data-active={activePath === node.path}
          onClick={() => openFile(node.path)}
          onDoubleClick={() => {
            if (categoryOf(node.path) === 'panel') {
              void ensureFiles([node.path]).then(() =>
                setPage(`${SINGLE_FILE_PREFIX}${node.path}`),
              );
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ at: { x: e.clientX, y: e.clientY }, path: node.path, isDir: false });
          }}
          style={{ paddingInlineStart: 8 + depth * 12 + 16 }}
          className="tf2hud-tree-row flex h-7 w-full items-center gap-1.5 pe-2 text-start text-xs text-(--app-text) hover:bg-(--app-surface-hover)"
        >
          <Icon className="size-3.5 shrink-0 text-(--app-text-dim)" aria-hidden />
          <span className={cn('truncate', status === 'deleted' && 'line-through opacity-60')}>
            {node.name}
          </span>
          {sev ? (
            <span
              className={cn(
                'ms-auto size-1.5 shrink-0 rounded-full',
                sev === 'error'
                  ? 'bg-(--app-danger)'
                  : sev === 'warning'
                    ? 'bg-(--app-warning)'
                    : 'bg-(--app-info)',
              )}
              role="img"
              aria-label={t('has-issues', { defaultValue: 'Has {{severity}}', severity: sev })}
            />
          ) : null}
          {status !== 'unchanged' ? (
            <span
              className={cn(
                'font-mono text-[10px] font-bold',
                sev ? '' : 'ms-auto',
                status === 'modified' && 'tf2hud-badge-modified',
                status === 'added' && 'tf2hud-badge-added',
                status === 'deleted' && 'tf2hud-badge-deleted',
              )}
              title={status}
            >
              {STATUS_LETTER[status]}
            </span>
          ) : null}
        </button>
      </li>
    );
  };

  const promptTitle =
    prompt?.kind === 'new'
      ? t('new-file', { defaultValue: 'New file' })
      : prompt?.kind === 'duplicate'
        ? t('duplicate-file', { defaultValue: 'Duplicate file' })
        : t('rename-file', { defaultValue: 'Rename / move' });

  return (
    <section
      className="flex h-full min-h-0 flex-col"
      aria-label={t('files', { defaultValue: 'Files' })}
    >
      <PanelHead
        title={t('files', { defaultValue: 'Files' })}
        actions={
          <>
            <IconBtn
              icon={FilePlus}
              label={t('new-file', { defaultValue: 'New file' })}
              onClick={() => setPrompt({ kind: 'new', path: 'resource/ui/' })}
            />
            <IconBtn
              icon={Upload}
              label={t('upload-files', { defaultValue: 'Upload files' })}
              onClick={() => fileInput.current?.click()}
            />
          </>
        }
      />
      <div className="space-y-2 border-b border-(--app-border) p-2">
        <TfTabs
          tabs={tabs}
          value={filter}
          size="sm"
          onChange={(id) => setPref('treeFilter', id as 'all' | 'modified' | 'problems')}
          aria-label={t('file-filter', { defaultValue: 'File filter' })}
        />
        <div className="relative">
          <Search
            className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-(--app-text-dim)"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search-files', { defaultValue: 'Search files' })}
            aria-label={t('search-files', { defaultValue: 'Search files' })}
            className="h-8 w-full rounded-(--app-radius-sm) border border-(--app-border-bright) bg-(--app-bg) ps-7 pe-2 text-xs text-(--app-text) placeholder:text-(--app-text-dim)"
          />
        </div>
      </div>
      {/* Dropping files is an extra route; the Upload button is the keyboard path. */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div
        className="min-h-0 flex-1 overflow-y-auto py-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const files = [...e.dataTransfer.files];
          if (files.length) setUploads(files);
        }}
      >
        {visiblePaths.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-(--app-text-dim)">
            {filter === 'modified'
              ? t('no-changes', { defaultValue: 'No changed files yet.' })
              : filter === 'problems'
                ? t('no-problems-files', { defaultValue: 'No files with problems.' })
                : t('no-files', { defaultValue: 'No files match.' })}
          </p>
        ) : (
          <ul role="tree" aria-label={t('hud-files', { defaultValue: 'HUD files' })}>
            {sortedChildren(tree).map((c) => renderNode(c, 0))}
          </ul>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          if (files.length) setUploads(files);
          e.target.value = '';
        }}
      />
      {menu ? (
        <ContextMenu
          at={menu.at}
          items={menuItems(menu.path, menu.isDir)}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <PromptDialog
        open={prompt !== null}
        onOpenChange={(o) => !o && setPrompt(null)}
        title={promptTitle}
        label={t('path', { defaultValue: 'Path' })}
        initial={
          prompt?.kind === 'rename'
            ? prompt.path.replace(/\/$/, '')
            : prompt?.kind === 'duplicate'
              ? prompt.path.replace(/(\.[^.]+)?$/, '_copy$1')
              : (prompt?.path ?? '')
        }
        confirm={t('ok', { defaultValue: 'OK' })}
        onSubmit={(value) => {
          if (!prompt) return;
          if (prompt.kind === 'new') createFile(value, '');
          else if (prompt.kind === 'rename') renamePath(prompt.path, value);
          else void duplicate(prompt.path, value);
        }}
      />
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('delete-confirm-title', {
          defaultValue: 'Delete {{name}}?',
          name: confirm ? basename(confirm.replace(/\/$/, '')) : '',
        })}
        description={t('delete-confirm', {
          defaultValue:
            'You can undo this, or revert the file later to restore the TF2 Default copy.',
        })}
        confirm={t('delete', { defaultValue: 'Delete' })}
        danger
        onConfirm={() => confirm && deletePath(confirm)}
      />
      <UploadDialog files={uploads} onClose={() => setUploads([])} />
    </section>
  );
}

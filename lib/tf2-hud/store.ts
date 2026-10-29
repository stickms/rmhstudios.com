/**
 * The editor's state: the project (overlay over the TF2 Default base), its
 * undo history, what is open, and the preview settings. Pure project logic
 * lives in `project/`; this file only sequences it and owns identity.
 */

import { create } from 'zustand';
import {
  clearTfAssets,
  DRAFT_CHANNEL,
  deleteDraft,
  loadDraft,
  loadTfAssets,
  saveDraft,
  saveTfAssets,
} from './local-drafts';
import type { AiContext } from './ai-context';
import { DEFAULT_TEST_STATE, type TestState } from './fixtures';
import { DEFAULT_PAGE_ID, resolvePage } from './pages';
import { baseCache } from './project/base-cache';
import {
  binaryContent,
  contentBytes,
  deleteFile,
  listPaths,
  renamePath as renameInOverlay,
  revertFile,
  textContent,
  writeFile,
} from './project/model';
import { isTextPath, sanitizePath } from './project/paths';
import {
  DEFAULT_META,
  type BaseIndex,
  type FileContent,
  type HudMeta,
  type Overlay,
} from './project/types';
import { DEFAULT_VIEW, type ViewSettings } from './view';
import { importZip, type ImportResult } from './zip/import';
import { buildHudZip } from './zip/build';
import type { ExportScope } from './zip/export';
import { decodeUtf8, encodeUtf8 } from './util/sha1';

export { baseCache };

/** Files every preview needs regardless of page. */
export const CORE_FILES = [
  'resource/clientscheme.res',
  'resource/sourcescheme.res',
  // Where every HUD element sits: without it frames are missing and panels lay out against the screen.
  'scripts/hudlayout.res',
] as const;

const HISTORY_LIMIT = 200;
const COALESCE_MS = 900;

/**
 * While a continuous gesture (dragging a panel) is in progress, every edit with
 * its key folds into one history step no matter how slowly the frames arrive.
 */
let activeGesture: string | null = null;
export const beginGesture = (key: string): void => {
  activeGesture = key;
};
export const endGesture = (): void => {
  activeGesture = null;
};

/** Something asked of the HUD assistant from elsewhere in the editor (a panel, a problem, the scheme). */
export interface AssistantRequest {
  /** Changes on every request, so asking the same thing twice still opens it. */
  nonce: number;
  /** Words to put in the box, or to send straight away. */
  prompt?: string;
  autoSend?: boolean;
  /** What the request is about; its files are shown to the model without asking which files are needed. */
  context?: AiContext;
}

export interface HistoryEntry {
  overlay: Overlay;
  label: string;
  at: number;
}

export type SaveState = 'local' | 'dirty' | 'saving' | 'saved' | 'error';

export interface EditorState {
  draftId: string;
  remoteId?: string;
  slug?: string;
  /** The HUD this one was forked from, sent with the first cloud save. */
  forkOfId?: string;
  meta: HudMeta;
  overlay: Overlay;
  past: HistoryEntry[];
  future: HistoryEntry[];
  lastEdit: { key: string; at: number } | null;

  baseStatus: 'loading' | 'ready' | 'error';
  baseIndex?: BaseIndex;
  /** Bumped whenever base file bytes arrive, so memoised scenes recompute. */
  baseVersion: number;
  tfAssets: Map<string, Uint8Array>;
  tfVersion: number;
  activePath: string | null;
  openPaths: string[];
  pageId: string;
  selectedId: string | null;
  /** Every selected panel (shift-click, marquee); `selectedId` is the one the inspector shows. */
  selectedIds: ReadonlySet<string>;
  /** The block being worked on in the Blocks panel; its members are outlined on the canvas. */
  focusedBlockId: string | null;
  hoverId: string | null;
  /** Screens Play mode came through, so a Back button can return to them. */
  playStack: string[];
  /** The latest request to the assistant from a button elsewhere; the assistant takes it and opens. */
  assistantRequest: AssistantRequest | null;
  /** Something (Play mode, the Test panel's animation runner) needs the HUD's animation scripts loaded. */
  animsWanted: boolean;
  /** The button the pointer is on in Play mode. */
  playHover: { file: string; name: string } | null;
  /** The layout property being edited, so the preview can draw its measurement. */
  focusProp: { nodeId: string; key: 'xpos' | 'ypos' | 'wide' | 'tall' } | null;
  forceShown: ReadonlySet<string>;
  forceHidden: ReadonlySet<string>;
  test: TestState;
  view: ViewSettings;
  saveState: SaveState;
  importWarnings: string[];
  /** When the draft was last written to this device (ms), or null. */
  lastAutosaveAt: number | null;
  /** One-shot request for the code editor to reveal an offset in a file. */
  jumpTo: { path: string; offset: number; nonce: number } | null;

  boot(): Promise<void>;
  ensureFiles(paths: readonly string[]): Promise<void>;
  /** Fetch base files without announcing a change (textures: the image store awaits them itself). */
  ensureBytes(paths: readonly string[]): Promise<void>;

  readText(path: string): string | undefined;
  readBytes(path: string): Uint8Array | undefined;
  hasFile(path: string): boolean;
  paths(): string[];

  writeText(path: string, text: string, coalesceKey?: string): void;
  /** Several text edits as ONE history step (so one undo reverts them all). */
  applyBatch(label: string, files: Readonly<Record<string, string>>, coalesceKey?: string): void;
  writeBinary(path: string, bytes: Uint8Array): void;
  createFile(path: string, text?: string): string | null;
  deletePath(path: string): void;
  renamePath(from: string, to: string): void;
  revertPath(path: string): void;
  revertAll(): void;
  undo(): void;
  redo(): void;
  /** Move through history by `steps` (negative = back, positive = forward). */
  travel(steps: number): void;
  noteAutosave(at: number): void;

  setMeta(patch: Partial<HudMeta>): void;
  newProject(meta?: Partial<HudMeta>): void;
  loadProject(args: {
    draftId?: string;
    remoteId?: string;
    slug?: string;
    forkOfId?: string;
    meta: HudMeta;
    overlay: Overlay;
  }): void;
  importZipFile(file: File | Blob): Promise<ImportResult>;
  exportBlob(
    scope: ExportScope,
    opts?: {
      includeInfoVdf?: boolean;
      /** Keep editor-only data (blocks) in the zip so the HUD re-imports with it. */
      includeEditorData?: boolean;
      onProgress?: (done: number, total: number) => void;
    },
  ): Promise<Blob>;
  restoreDraft(id: string): Promise<boolean>;

  setPage(id: string): void;
  select(id: string | null): void;
  /** Add or remove one panel from the selection (it becomes the inspected one when added). */
  toggleSelect(id: string): void;
  selectMany(ids: readonly string[]): void;
  focusBlock(id: string | null): void;
  setPlay(on: boolean): void;
  wantAnimations(): void;
  askAssistant(req: Omit<AssistantRequest, 'nonce'>): void;
  /** The assistant has picked the request up. */
  clearAssistantRequest(): void;
  /** Open another screen from Play mode (keeping a way back). False when the editor has no such page. */
  playGo(page: string): boolean;
  playBack(): void;
  setPlayHover(p: { file: string; name: string } | null): void;
  hover(id: string | null): void;
  setFocusProp(p: EditorState['focusProp']): void;
  toggleForce(id: string, shown: boolean): void;
  resetForce(): void;
  openFile(path: string): void;
  jump(path: string, offset: number): void;
  closeFile(path: string): void;
  setTest(patch: Partial<TestState>): void;
  setView(patch: Partial<ViewSettings>): void;
  setTfAssets(files: Map<string, Uint8Array>): Promise<void>;
  clearTfAssets(): Promise<void>;
  markSaved(remote: { id: string; slug?: string }): void;
  setSaveState(s: SaveState): void;
}

const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const useEditor = create<EditorState>((set, get) => {
  /** Apply an overlay change with history; `coalesceKey` merges rapid edits. */
  const commit = (label: string, next: Overlay, coalesceKey?: string): void => {
    const s = get();
    if (next === s.overlay) return;
    const now = Date.now();
    const coalesce =
      coalesceKey !== undefined &&
      s.lastEdit?.key === coalesceKey &&
      (activeGesture === coalesceKey || now - s.lastEdit.at < COALESCE_MS) &&
      s.past.length > 0;
    const past = coalesce
      ? s.past
      : [...s.past, { overlay: s.overlay, label, at: now }].slice(-HISTORY_LIMIT);
    set({
      overlay: next,
      past,
      future: [],
      lastEdit: coalesceKey !== undefined ? { key: coalesceKey, at: now } : null,
      saveState: s.remoteId ? 'dirty' : 'local',
    });
  };

  return {
    draftId: newId(),
    meta: { ...DEFAULT_META },
    overlay: new Map(),
    past: [],
    future: [],
    lastEdit: null,

    baseStatus: 'loading',
    baseVersion: 0,
    tfAssets: new Map(),
    tfVersion: 0,

    activePath: null,
    openPaths: [],
    pageId: DEFAULT_PAGE_ID,
    selectedId: null,
    selectedIds: new Set(),
    focusedBlockId: null,
    hoverId: null,
    playStack: [],
    assistantRequest: null,
    animsWanted: false,
    playHover: null,
    focusProp: null,
    forceShown: new Set(),
    forceHidden: new Set(),
    test: { ...DEFAULT_TEST_STATE },
    view: { ...DEFAULT_VIEW },
    saveState: 'local',
    importWarnings: [],
    lastAutosaveAt: null,
    jumpTo: null,

    async boot() {
      if (get().baseStatus === 'ready') return;
      try {
        const [index, tf] = await Promise.all([baseCache.loadIndex(), loadTfAssets()]);
        set({
          baseIndex: index,
          baseStatus: 'ready',
          tfAssets: tf,
          tfVersion: get().tfVersion + 1,
        });
        await get().ensureFiles(CORE_FILES);
      } catch {
        set({ baseStatus: 'error' });
      }
    },

    async ensureFiles(paths) {
      await baseCache.ensure(paths);
      set((s) => ({ baseVersion: s.baseVersion + 1 }));
    },

    async ensureBytes(paths) {
      await baseCache.ensure(paths);
    },

    readText(path) {
      const o = get().overlay.get(path);
      if (o === null) return undefined;
      if (o) return o.kind === 'text' ? o.text : undefined;
      return baseCache.getText(path);
    },

    readBytes(path) {
      const o = get().overlay.get(path);
      if (o === null) return undefined;
      if (o) return contentBytes(o);
      return baseCache.getBytes(path) ?? get().tfAssets.get(path);
    },

    hasFile(path) {
      const s = get();
      const o = s.overlay.get(path);
      if (o === null) return false;
      return Boolean(o) || (s.baseIndex?.files.has(path) ?? false) || s.tfAssets.has(path);
    },

    paths() {
      const s = get();
      return listPaths(s.overlay, s.baseIndex);
    },

    writeText(path, text, coalesceKey) {
      const s = get();
      commit(
        `Edit ${path}`,
        writeFile(s.overlay, s.baseIndex, path, textContent(text)),
        coalesceKey ?? `text:${path}`,
      );
    },

    applyBatch(label, files, coalesceKey) {
      const s = get();
      let next = s.overlay;
      for (const [path, text] of Object.entries(files)) {
        next = writeFile(next, s.baseIndex, path, textContent(text));
      }
      commit(label, next, coalesceKey);
    },

    writeBinary(path, bytes) {
      const s = get();
      commit(`Add ${path}`, writeFile(s.overlay, s.baseIndex, path, binaryContent(bytes)));
    },

    createFile(rawPath, text = '') {
      const path = sanitizePath(rawPath);
      if (!path) return null;
      const s = get();
      const content: FileContent = isTextPath(path)
        ? textContent(text)
        : binaryContent(encodeUtf8(text));
      commit(`New ${path}`, writeFile(s.overlay, s.baseIndex, path, content));
      get().openFile(path);
      return path;
    },

    deletePath(path) {
      const s = get();
      const targets = path.endsWith('/') ? s.paths().filter((p) => p.startsWith(path)) : [path];
      let next = s.overlay;
      for (const p of targets) next = deleteFile(next, s.baseIndex, p);
      commit(`Delete ${path}`, next);
      set((st) => ({
        openPaths: st.openPaths.filter((p) => !targets.includes(p)),
        activePath: st.activePath && targets.includes(st.activePath) ? null : st.activePath,
      }));
    },

    renamePath(from, to) {
      const dst = sanitizePath(to);
      if (!dst) return;
      const s = get();
      const target = from.endsWith('/') ? `${dst}/` : dst;
      const read = (p: string): FileContent | undefined => {
        const o = s.overlay.get(p);
        if (o) return o;
        const b = baseCache.getBytes(p);
        if (!b) return undefined;
        return isTextPath(p) ? textContent(decodeUtf8(b)) : binaryContent(b);
      };
      const move = from.endsWith('/') ? s.paths().filter((p) => p.startsWith(from)) : [from];
      void baseCache.ensure(move).then(() => {
        const cur = get();
        const renamed = renameInOverlay(
          cur.overlay,
          cur.baseIndex,
          from,
          target,
          read,
          cur.paths(),
        );
        commit(`Rename ${from}`, renamed);
        set((st) => ({
          openPaths: st.openPaths.map((p) =>
            p.startsWith(from) ? target + p.slice(from.length) : p,
          ),
          activePath:
            st.activePath && st.activePath.startsWith(from)
              ? target + st.activePath.slice(from.length)
              : st.activePath,
        }));
      });
    },

    revertPath(path) {
      commit(`Revert ${path}`, revertFile(get().overlay, path));
    },

    revertAll() {
      commit('Revert all changes', new Map());
    },

    undo() {
      get().travel(-1);
    },

    redo() {
      get().travel(1);
    },

    travel(steps) {
      if (steps === 0) return;
      const s = get();
      // States S0..Sn with the present at index `here`. `produced[k]` / `at[k]`
      // describe the edit that produced Sk (a past entry stores the state it
      // left plus that edit's label; a future entry stores the state it made).
      const states = [
        ...s.past.map((e) => e.overlay),
        s.overlay,
        ...s.future.map((e) => e.overlay),
      ];
      const produced = ['', ...s.past.map((e) => e.label), ...s.future.map((e) => e.label)];
      const at = [0, ...s.past.map((e) => e.at), ...s.future.map((e) => e.at)];
      const here = s.past.length;
      const target = Math.max(0, Math.min(states.length - 1, here + steps));
      if (target === here) return;
      set({
        overlay: states[target],
        past: states
          .slice(0, target)
          .map((overlay, i) => ({ overlay, label: produced[i + 1], at: at[i + 1] })),
        future: states.slice(target + 1).map((overlay, i) => ({
          overlay,
          label: produced[target + 1 + i],
          at: at[target + 1 + i],
        })),
        lastEdit: null,
        saveState: s.remoteId ? 'dirty' : 'local',
      });
    },

    noteAutosave(at) {
      set({ lastAutosaveAt: at });
    },

    setMeta(patch) {
      set((s) => ({ meta: { ...s.meta, ...patch }, saveState: s.remoteId ? 'dirty' : 'local' }));
    },

    newProject(meta) {
      get().loadProject({ meta: { ...DEFAULT_META, ...meta }, overlay: new Map() });
    },

    loadProject({ draftId, remoteId, slug, forkOfId, meta, overlay }) {
      set({
        draftId: draftId ?? newId(),
        remoteId,
        slug,
        forkOfId,
        meta,
        overlay,
        past: [],
        future: [],
        lastEdit: null,
        activePath: null,
        openPaths: [],
        selectedId: null,
        selectedIds: new Set(),
        focusedBlockId: null,
        hoverId: null,
        forceShown: new Set(),
        forceHidden: new Set(),
        saveState: remoteId ? 'saved' : 'local',
        importWarnings: [],
      });
    },

    async importZipFile(file) {
      await get().boot();
      const result = await importZip(file, get().baseIndex);
      const name = (file as File).name?.replace(/\.zip$/i, '') || get().meta.name;
      get().loadProject({
        meta: { ...DEFAULT_META, name },
        overlay: result.overlay,
      });
      set({ importWarnings: result.warnings });
      return result;
    },

    async exportBlob(scope, opts = {}) {
      await get().boot();
      const { meta, overlay } = get();
      return buildHudZip({
        meta,
        overlay,
        base: baseCache,
        scope,
        includeInfoVdf: opts.includeInfoVdf,
        includeEditorData: opts.includeEditorData,
        onProgress: opts.onProgress,
      });
    },

    async restoreDraft(id) {
      const rec = await loadDraft(id);
      if (!rec) return false;
      get().loadProject({
        draftId: id,
        remoteId: rec.remoteId,
        meta: rec.meta,
        overlay: rec.overlay,
      });
      return true;
    },

    setPage(id) {
      const page = resolvePage(id);
      if (!page) return;
      set({
        // A page can set the class/weapon/meters it exists to show.
        test: page.state ? { ...get().test, ...page.state } : get().test,
        pageId: id,
        selectedId: null,
        selectedIds: new Set(),
        hoverId: null,
        forceShown: new Set(),
        forceHidden: new Set(),
      });
    },

    select(id) {
      set({ selectedId: id, selectedIds: id ? new Set([id]) : new Set() });
    },
    toggleSelect(id) {
      set((s) => {
        const ids = new Set(s.selectedIds);
        if (s.selectedId) ids.add(s.selectedId);
        if (ids.has(id)) {
          ids.delete(id);
          const rest = [...ids];
          return { selectedIds: ids, selectedId: rest[rest.length - 1] ?? null };
        }
        ids.add(id);
        return { selectedIds: ids, selectedId: id };
      });
    },
    selectMany(ids) {
      const list = [...new Set(ids)];
      set({ selectedIds: new Set(list), selectedId: list[list.length - 1] ?? null });
    },
    focusBlock(id) {
      set({ focusedBlockId: id });
    },
    setPlay(on) {
      set((s) => ({
        view: { ...s.view, play: on },
        playStack: [],
        playHover: null,
        selectedId: on ? null : s.selectedId,
        selectedIds: on ? new Set() : s.selectedIds,
      }));
    },
    askAssistant(req) {
      set({ assistantRequest: { ...req, nonce: (get().assistantRequest?.nonce ?? 0) + 1 } });
    },
    clearAssistantRequest() {
      if (get().assistantRequest) set({ assistantRequest: null });
    },
    wantAnimations() {
      if (!get().animsWanted) set({ animsWanted: true });
    },
    playGo(page) {
      if (!resolvePage(page)) return false;
      const s = get();
      if (page === s.pageId) return true;
      set({ playStack: [...s.playStack, s.pageId], playHover: null });
      get().setPage(page);
      return true;
    },
    playBack() {
      const s = get();
      const prev =
        s.playStack[s.playStack.length - 1] ??
        (s.pageId === DEFAULT_PAGE_ID ? null : DEFAULT_PAGE_ID);
      if (!prev) return;
      get().setPage(prev);
      set({ playStack: s.playStack.slice(0, -1), playHover: null });
    },
    setPlayHover(p) {
      const cur = get().playHover;
      if (cur?.file === p?.file && cur?.name === p?.name) return;
      set({ playHover: p });
    },
    hover(id) {
      if (get().hoverId !== id) set({ hoverId: id });
    },

    setFocusProp(p) {
      set({ focusProp: p });
    },

    toggleForce(id, shown) {
      set((s) => {
        const fs = new Set(s.forceShown);
        const fh = new Set(s.forceHidden);
        if (shown) {
          fs.add(id);
          fh.delete(id);
        } else {
          fh.add(id);
          fs.delete(id);
        }
        return { forceShown: fs, forceHidden: fh };
      });
    },
    resetForce() {
      set({ forceShown: new Set(), forceHidden: new Set() });
    },

    openFile(path) {
      set((s) => ({
        activePath: path,
        openPaths: s.openPaths.includes(path) ? s.openPaths : [...s.openPaths, path],
      }));
      // A file that cannot be fetched just stays unloaded; the UI shows "Loading…".
      void get()
        .ensureFiles([path])
        .catch(() => undefined);
    },

    jump(path, offset) {
      get().openFile(path);
      set({ jumpTo: { path, offset, nonce: Date.now() } });
    },

    closeFile(path) {
      set((s) => {
        const openPaths = s.openPaths.filter((p) => p !== path);
        const activePath =
          s.activePath === path ? (openPaths[openPaths.length - 1] ?? null) : s.activePath;
        return { openPaths, activePath };
      });
    },

    setTest(patch) {
      set((s) => ({ test: { ...s.test, ...patch } }));
    },
    setView(patch) {
      set((s) => ({ view: { ...s.view, ...patch } }));
    },

    async setTfAssets(files) {
      await saveTfAssets(files);
      set((s) => ({ tfAssets: files, tfVersion: s.tfVersion + 1 }));
    },
    async clearTfAssets() {
      await clearTfAssets();
      set((s) => ({ tfAssets: new Map(), tfVersion: s.tfVersion + 1 }));
    },

    markSaved(remote) {
      set({ remoteId: remote.id, slug: remote.slug ?? get().slug, saveState: 'saved' });
    },
    setSaveState(saveState) {
      set({ saveState });
    },
  };
});

/* ── Local autosave ─────────────────────────────────────────────────────── */

let saveTimer: ReturnType<typeof setTimeout> | undefined;
const LOCAL_SAVE_DELAY = 1200;

function announceDraft(id: string): void {
  try {
    const channel = new BroadcastChannel(DRAFT_CHANNEL);
    channel.postMessage({ type: 'draft-saved', id });
    channel.close();
  } catch {
    /* no BroadcastChannel: the game picks the draft up on its next load */
  }
}

async function flushLocal(): Promise<boolean> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const cur = useEditor.getState();
  // An untouched project is not worth a draft.
  if (cur.overlay.size === 0 && cur.meta.name === DEFAULT_META.name && cur.meta.description === '')
    return false;
  await saveDraft(cur.draftId, cur.meta, cur.overlay, cur.remoteId);
  useEditor.getState().noteAutosave(Date.now());
  announceDraft(cur.draftId);
  return true;
}

/**
 * Write the draft now (the game's "Test in game" reads it). False when the project is untouched — the
 * TF2 Default, which needs no draft.
 */
export function flushLocalDraft(): Promise<boolean> {
  return flushLocal();
}

/**
 * Debounced draft persistence; call once from the editor. Also flushes
 * immediately when the tab is hidden or closed, so a crash after the last
 * keystroke loses nothing. Returns an unsubscribe.
 */
export function startLocalAutosave(): () => void {
  const unsub = useEditor.subscribe((s, prev) => {
    if (s.overlay === prev.overlay && s.meta === prev.meta) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void flushLocal(), LOCAL_SAVE_DELAY);
  });
  const onHide = () => {
    if (document.visibilityState === 'hidden' && saveTimer !== undefined) void flushLocal();
  };
  const onPageHide = () => {
    if (saveTimer !== undefined) void flushLocal();
  };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);
  return () => {
    unsub();
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
    clearTimeout(saveTimer);
  };
}

export async function discardDraft(id: string): Promise<void> {
  await deleteDraft(id);
}

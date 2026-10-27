/**
 * The HUD editor workspace: files and outline on the left, the live preview in
 * the middle, and inspector / code / test / changes / problems / assets on the
 * right. On a phone the same panes become one-at-a-time views.
 */
'use client';

import { useNavigate } from '@tanstack/react-router';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { TfTabs, type TfTab } from './TfTabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { api, ApiError } from '@/lib/tf2-hud/api';
import { loadOverlay, type Progress } from '@/lib/tf2-hud/cloud';
import { useTf2HudPrefs } from '@/lib/tf2-hud/prefs';
import { startLocalAutosave, useEditor } from '@/lib/tf2-hud/store';
import { ImportError } from '@/lib/tf2-hud/zip/import';
import type { PaletteAction } from './CommandPalette';
import { ConfirmDialog } from './dialogs';
import { useCloudSave } from './use-cloud-save';
import FileTree from './FileTree';
import Inspector from './Inspector';
import OutlinePanel from './OutlinePanel';
import Preview from './Preview';
import PreviewToolbar from './PreviewToolbar';
import { SceneProvider } from './scene-context';
import TopBar from './TopBar';
import { ValidationProvider } from './validation-context';

// The heavy panels (CodeMirror especially) and every dialog load on first use, so the editor
// paints with just the file tree, preview and inspector; they are prefetched at idle below.
const AssetsPanel = lazy(() => import('./AssetsPanel'));
const CodePane = lazy(() => import('./CodePane'));
const CommandPalette = lazy(() => import('./CommandPalette'));
const DiffView = lazy(() => import('./DiffView'));
const ExportDialog = lazy(() => import('./ExportDialog'));
const HudAssistant = lazy(() => import('./HudAssistant'));
const HistoryPanel = lazy(() => import('./HistoryPanel'));
const ShortcutsDialog = lazy(() => import('./ShortcutsDialog'));
const ProblemsPanel = lazy(() => import('./ProblemsPanel'));
const SchemePanel = lazy(() => import('./SchemePanel'));
const SaveShareDialog = lazy(() => import('./SaveShareDialog'));
const TestPanel = lazy(() => import('./TestPanel'));

/** Mounts a lazy dialog the first time it opens, then keeps it mounted so its exit animation runs. */
function OnFirstOpen({ open, children }: { open: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(open);
  if (open && !seen) setSeen(true);
  return seen ? <Suspense fallback={null}>{children}</Suspense> : null;
}

function PanelFallback() {
  const { t } = useTranslation('c-tf2-hud');
  return (
    <p role="status" className="p-4 text-xs text-(--app-text-dim)">
      {t('loading-panel', { defaultValue: 'Loading…' })}
    </p>
  );
}

function prefetchHeavyPanels() {
  const run = () => {
    void import('./CodePane');
    void import('./SchemePanel');
    void import('./DiffView');
  };
  if (typeof window.requestIdleCallback === 'function')
    window.requestIdleCallback(run, { timeout: 4000 });
  else window.setTimeout(run, 2500);
}

type RightTab =
  'inspector' | 'code' | 'scheme' | 'test' | 'history' | 'diff' | 'problems' | 'assets';
type MobileView = 'files' | 'preview' | 'edit';

interface Props {
  draft?: string;
  hud?: string;
  fork?: string;
}

export default function Tf2HudEditor({ draft, hud, fork }: Props) {
  const { t } = useTranslation('c-tf2-hud');
  const navigate = useNavigate();
  const boot = useEditor((s) => s.boot);
  const baseStatus = useEditor((s) => s.baseStatus);
  const restoreDraft = useEditor((s) => s.restoreDraft);
  const loadProject = useEditor((s) => s.loadProject);
  const importZipFile = useEditor((s) => s.importZipFile);
  const draftId = useEditor((s) => s.draftId);
  const overlaySize = useEditor((s) => s.overlay.size);
  const metaName = useEditor((s) => s.meta.name);
  const saveState = useEditor((s) => s.saveState);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const revertAll = useEditor((s) => s.revertAll);
  const setView = useEditor((s) => s.setView);
  const view = useEditor((s) => s.view);

  const desktop = useMediaQuery('(min-width: 1024px)');
  const rightTab = useTf2HudPrefs((s) => s.rightTab);
  const treeOpen = useTf2HudPrefs((s) => s.treeOpen);
  const setPref = useTf2HudPrefs((s) => s.set);

  const [leftTab, setLeftTab] = useState<'files' | 'outline'>('files');
  const [mobile, setMobile] = useState<MobileView>('preview');
  const [exportOpen, setExportOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const { save: cloudSave, canQuickSave } = useCloudSave();
  const [confirmImport, setConfirmImport] = useState<File | null>(null);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const [loading, setLoading] = useState<Progress | 'init' | null>('init');
  const [error, setError] = useState<string | null>(null);
  const zipInput = useRef<HTMLInputElement>(null);
  const tRef = useRef(t);
  tRef.current = t;
  const loadedKey = useRef<string>('');

  /* ── load what the URL asks for ── */
  useEffect(() => {
    const key = `${draft ?? ''}|${hud ?? ''}|${fork ?? ''}`;
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    // A run is stale once the URL has moved on to a different key; it must not
    // apply its result then. (Not "the effect re-ran": React Strict Mode does
    // that on purpose, and the first run is the one that has to finish.)
    const current = () => loadedKey.current === key;
    (async () => {
      const tr = tRef.current;
      setError(null);
      setLoading('init');
      await boot();
      try {
        if (draft) {
          const ok = await restoreDraft(draft);
          if (!ok && current())
            toast.error(
              tr('draft-missing', { defaultValue: 'That draft is no longer on this device.' }),
            );
        } else if (hud || fork) {
          const id = (hud ?? fork)!;
          const detail = await api.get(id);
          const { overlay, meta } = await loadOverlay(
            detail,
            { hud: detail.id },
            (p) => current() && setLoading(p),
          );
          if (!current()) return;
          if (hud && detail.isOwner) {
            loadProject({ remoteId: detail.id, slug: detail.slug, meta, overlay });
          } else {
            loadProject({
              forkOfId: detail.id,
              meta: {
                ...meta,
                name: `${meta.name} ${tr('copy-suffix', { defaultValue: '(copy)' })}`.slice(0, 80),
              },
              overlay,
            });
            if (hud)
              toast.info(
                tr('opened-as-copy', {
                  defaultValue: 'Opened as your own copy — the original is untouched.',
                }),
              );
          }
        }
      } catch (e) {
        if (current()) {
          setError(
            e instanceof ApiError && e.status === 404
              ? tr('hud-not-found', {
                  defaultValue: 'That HUD could not be found, or you do not have access to it.',
                })
              : tr('load-failed', {
                  defaultValue: 'Could not load the HUD. Check your connection and try again.',
                }),
          );
        }
      } finally {
        if (current()) setLoading(null);
      }
    })();
  }, [draft, hud, fork, boot, restoreDraft, loadProject]);

  /* ── autosave + keep the URL pointing at the draft ── */
  useEffect(() => startLocalAutosave(), []);
  useEffect(() => prefetchHeavyPanels(), []);
  useEffect(() => {
    if (draft || hud || (overlaySize === 0 && metaName === 'My HUD')) return;
    void navigate({ to: '/tf2/hud-editor/editor', search: { draft: draftId }, replace: true });
  }, [draft, hud, overlaySize, metaName, draftId, navigate]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().saveState === 'dirty') e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  /* ── import ── */
  const doImport = useCallback(
    async (file: File) => {
      try {
        const r = await importZipFile(file);
        toast.success(
          t('imported', {
            defaultValue: 'Imported {{changed}} changed files ({{same}} matched the default)',
            changed: r.changed,
            same: r.unchanged,
          }),
        );
        for (const w of r.warnings) toast.warning(w);
      } catch (e) {
        toast.error(
          e instanceof ImportError
            ? e.message
            : t('import-failed', { defaultValue: 'Could not read that zip.' }),
        );
      }
    },
    [importZipFile, t],
  );
  const requestImport = useCallback(
    (file: File) => {
      const s = useEditor.getState();
      if (s.overlay.size > 0) setConfirmImport(file);
      else void doImport(file);
    },
    [doImport],
  );

  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const f = [...(e.dataTransfer?.files ?? [])].find((x) => /\.zip$/i.test(x.name));
      if (!f) return;
      e.preventDefault();
      requestImport(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [requestImport]);

  /* ── keyboard ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement | null;
      const typing = target?.closest(
        'input, textarea, select, [contenteditable="true"], .cm-editor',
      );
      if (!mod && e.key === '?' && !typing) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (!mod) return;
      const inCode = (e.target as HTMLElement | null)?.closest('.cm-editor');
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (key === 's') {
        e.preventDefault();
        // Signed in with a saved HUD: just save. Otherwise open the dialog.
        if (canQuickSave) void cloudSave(false);
        else setSaveOpen(true);
      } else if (key === 'e' && e.shiftKey) {
        e.preventDefault();
        setExportOpen(true);
      } else if (!inCode && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (!inCode && key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, canQuickSave, cloudSave]);

  const actions = useMemo<PaletteAction[]>(
    () => [
      {
        id: 'download',
        label: t('download-hud', { defaultValue: 'Download HUD' }),
        hint: 'Ctrl+Shift+E',
        run: () => setExportOpen(true),
      },
      {
        id: 'save',
        label: t('save-share', { defaultValue: 'Save & share' }),
        hint: 'Ctrl+S',
        run: () => setSaveOpen(true),
      },
      {
        id: 'import',
        label: t('import-zip', { defaultValue: 'Import zip' }),
        run: () => zipInput.current?.click(),
      },
      { id: 'undo', label: t('undo', { defaultValue: 'Undo' }), hint: 'Ctrl+Z', run: undo },
      { id: 'redo', label: t('redo', { defaultValue: 'Redo' }), hint: 'Ctrl+Shift+Z', run: redo },
      {
        id: 'hidden',
        label: t('toggle-hidden', { defaultValue: 'Toggle hidden panels' }),
        run: () => setView({ showHidden: !view.showHidden }),
      },
      {
        id: 'bounds',
        label: t('toggle-bounds', { defaultValue: 'Toggle panel bounds' }),
        run: () => setView({ showBounds: !view.showBounds }),
      },
      {
        id: 'minmode',
        label: t('toggle-minmode', { defaultValue: 'Toggle minmode' }),
        run: () => setView({ minmode: !view.minmode }),
      },
      {
        id: 'revert',
        label: t('revert-all-changes', { defaultValue: 'Revert all changes' }),
        run: () => setConfirmRevert(true),
      },
      {
        id: 'history',
        label: t('show-history', { defaultValue: 'Show edit history' }),
        run: () => {
          setPref('rightOpen', true);
          setPref('rightTab', 'history');
        },
      },
      {
        id: 'shortcuts',
        label: t('shortcuts', { defaultValue: 'Keyboard shortcuts' }),
        hint: '?',
        run: () => setShortcutsOpen(true),
      },
      {
        id: 'changes',
        label: t('show-changes', { defaultValue: 'Show changed files' }),
        run: () => {
          setPref('rightOpen', true);
          setPref('rightTab', 'diff');
        },
      },
      {
        id: 'problems',
        label: t('show-problems', { defaultValue: 'Show problems' }),
        run: () => {
          setPref('rightOpen', true);
          setPref('rightTab', 'problems');
        },
      },
    ],
    [t, undo, redo, setView, view.showHidden, view.showBounds, view.minmode, setPref],
  );

  const rightTabs: TfTab[] = [
    { id: 'inspector', label: t('inspector', { defaultValue: 'Inspector' }) },
    { id: 'code', label: t('code', { defaultValue: 'Code' }) },
    { id: 'scheme', label: t('scheme', { defaultValue: 'Scheme' }) },
    { id: 'test', label: t('test', { defaultValue: 'Test' }) },
    { id: 'history', label: t('history', { defaultValue: 'History' }) },
    { id: 'diff', label: t('changes', { defaultValue: 'Changes' }) },
    { id: 'problems', label: t('problems', { defaultValue: 'Problems' }) },
    { id: 'assets', label: t('assets', { defaultValue: 'Assets' }) },
  ];

  const leftTabs: TfTab[] = [
    { id: 'files', label: t('files', { defaultValue: 'Files' }) },
    { id: 'outline', label: t('outline', { defaultValue: 'Outline' }) },
  ];

  const rightBody = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-(--app-border) p-1.5">
        <TfTabs
          tabs={rightTabs}
          value={rightTab}
          size="sm"
          onChange={(id) => setPref('rightTab', id as RightTab)}
          aria-label={t('editor-tools', { defaultValue: 'Editor tools' })}
        />
      </div>
      <div className="min-h-0 flex-1">
        {rightTab === 'inspector' ? <Inspector /> : null}
        <Suspense fallback={<PanelFallback />}>
          {rightTab === 'code' ? <CodePane /> : null}
          {rightTab === 'scheme' ? <SchemePanel /> : null}
          {rightTab === 'test' ? <TestPanel /> : null}
          {rightTab === 'history' ? <HistoryPanel /> : null}
          {rightTab === 'diff' ? <DiffView /> : null}
          {rightTab === 'problems' ? <ProblemsPanel /> : null}
          {rightTab === 'assets' ? <AssetsPanel /> : null}
        </Suspense>
      </div>
    </div>
  );

  const leftBody = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-(--app-border) p-1.5">
        <TfTabs
          tabs={leftTabs}
          value={leftTab}
          size="sm"
          onChange={(id) => setLeftTab(id as 'files' | 'outline')}
          aria-label={t('sidebar', { defaultValue: 'Sidebar' })}
        />
      </div>
      <div className="min-h-0 flex-1">{leftTab === 'files' ? <FileTree /> : <OutlinePanel />}</div>
    </div>
  );

  const center = (
    <div className="flex h-full min-h-0 flex-col">
      <PreviewToolbar />
      <Preview />
    </div>
  );

  if (error) {
    return (
      <div className="app-page flex min-h-dvh flex-col items-center justify-center gap-4 bg-(--app-bg) p-6 text-center text-(--app-text)">
        <p className="max-w-md text-sm text-(--app-text-muted)">{error}</p>
        <a
          href="/tf2/hud-editor"
          className="rounded-(--app-radius-sm) bg-(--app-accent) px-4 py-2 text-sm font-semibold text-(--app-accent-fg)"
        >
          {t('back-to-start', { defaultValue: 'Back to start' })}
        </a>
      </div>
    );
  }

  const mobileTabs: TfTab[] = [
    { id: 'files', label: t('files', { defaultValue: 'Files' }) },
    { id: 'preview', label: t('preview', { defaultValue: 'Preview' }) },
    { id: 'edit', label: t('edit', { defaultValue: 'Edit' }) },
  ];

  return (
    <SceneProvider>
      <ValidationProvider>
        <div className="app-viewport flex h-dvh min-h-0 flex-col bg-(--app-bg) text-(--app-text)">
          <TopBar
            onImport={() => zipInput.current?.click()}
            onExport={() => setExportOpen(true)}
            onSave={() => setSaveOpen(true)}
            onPalette={() => setPaletteOpen(true)}
            onAssistant={() => setAssistantOpen(true)}
          />
          {loading ? (
            <div
              className="shrink-0 bg-(--app-accent-dim) px-3 py-1 text-center text-xs text-(--app-text)"
              role="status"
            >
              {loading === 'init' || baseStatus === 'loading'
                ? t('loading-editor', { defaultValue: 'Loading the TF2 Default HUD…' })
                : t('loading-hud', {
                    defaultValue: 'Downloading files {{done}}/{{total}}…',
                    done: loading.done,
                    total: loading.total,
                  })}
            </div>
          ) : null}
          {baseStatus === 'error' ? (
            <div
              className="shrink-0 bg-(--app-danger-dim) px-3 py-1 text-center text-xs text-(--app-danger)"
              role="alert"
            >
              {t('base-error', {
                defaultValue: 'Could not load the TF2 Default HUD files. Reload to retry.',
              })}
            </div>
          ) : null}

          {desktop ? (
            <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
              {treeOpen ? (
                <>
                  <ResizablePanel
                    defaultSize="20%"
                    minSize="14%"
                    maxSize="32%"
                    className="min-h-0 bg-(--app-bg-subtle)"
                  >
                    {leftBody}
                  </ResizablePanel>
                  <ResizableHandle className="bg-(--app-border)" />
                </>
              ) : null}
              <ResizablePanel defaultSize="46%" minSize="24%" className="min-h-0">
                {center}
              </ResizablePanel>
              <ResizableHandle className="bg-(--app-border)" />
              <ResizablePanel
                defaultSize="34%"
                minSize="22%"
                maxSize="60%"
                className="min-h-0 bg-(--app-bg-subtle)"
              >
                {rightBody}
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <>
              <div className="min-h-0 flex-1 bg-(--app-bg-subtle)">
                {mobile === 'files' ? leftBody : mobile === 'preview' ? center : rightBody}
              </div>
              <div className="shrink-0 border-t border-(--app-border) p-1.5 pb-[max(0.375rem,var(--app-safe-bottom))]">
                <TfTabs
                  tabs={mobileTabs}
                  value={mobile}
                  onChange={(id) => setMobile(id as MobileView)}
                  aria-label={t('view', { defaultValue: 'View' })}
                />
              </div>
            </>
          )}

          <input
            ref={zipInput}
            type="file"
            accept=".zip,application/zip"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) requestImport(f);
            }}
          />
          <OnFirstOpen open={exportOpen}>
            <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
          </OnFirstOpen>
          <OnFirstOpen open={saveOpen}>
            <SaveShareDialog open={saveOpen} onOpenChange={setSaveOpen} />
          </OnFirstOpen>
          <OnFirstOpen open={shortcutsOpen}>
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
          </OnFirstOpen>
          <OnFirstOpen open={assistantOpen}>
            <HudAssistant open={assistantOpen} onOpenChange={setAssistantOpen} />
          </OnFirstOpen>
          <OnFirstOpen open={paletteOpen}>
            <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} actions={actions} />
          </OnFirstOpen>
          <ConfirmDialog
            open={confirmImport !== null}
            onOpenChange={(o) => !o && setConfirmImport(null)}
            title={t('replace-hud', { defaultValue: 'Replace the current HUD?' })}
            description={t('replace-hud-body', {
              defaultValue:
                'Importing a zip starts a new project. Your current work stays saved as a draft on this device.',
            })}
            confirm={t('import', { defaultValue: 'Import' })}
            onConfirm={() => confirmImport && void doImport(confirmImport)}
          />
          <ConfirmDialog
            open={confirmRevert}
            onOpenChange={setConfirmRevert}
            title={t('revert-all-title', { defaultValue: 'Revert every change?' })}
            description={t('revert-all-body', {
              defaultValue: 'This returns the HUD to the TF2 Default. You can undo it.',
            })}
            confirm={t('revert-all', { defaultValue: 'Revert all' })}
            danger
            onConfirm={revertAll}
          />
          <span className="sr-only" aria-live="polite">
            {saveState === 'saved' ? t('status-saved', { defaultValue: 'Saved to account' }) : ''}
          </span>
        </div>
      </ValidationProvider>
    </SceneProvider>
  );
}

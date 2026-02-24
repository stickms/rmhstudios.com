'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { authClient } from '@/lib/auth-client';
import ActivityBar from './ActivityBar';
import FileExplorer from './FileExplorer';
import TabBar from './TabBar';
import EditorArea from './EditorArea';
import StatusBar from './StatusBar';
import GuestBanner from './GuestBanner';
import GitPanel from './GitPanel';
import Terminal from './Terminal';
import NewProjectDialog from './NewProjectDialog';
import NewFileDialog from './NewFileDialog';
import QuickOpenPanel from './QuickOpenPanel';
import SettingsPanel from './SettingsPanel';
import { SettingsProvider } from './SettingsContext';
import type { FileMeta, ProjectMeta } from './utils';
import { getLanguage } from './utils';

type Panel = 'files' | 'git';

const SAMPLE_FILE: FileMeta = {
  id: '__sample__',
  name: 'welcome.ts',
  path: 'welcome.ts',
  language: 'typescript',
  updatedAt: new Date().toISOString(),
};

const SAMPLE_CONTENT = `// Welcome to RMH Code!
// Sign in to save your files and create projects.

interface Developer {
  name: string;
  skills: string[];
  isAwesome: boolean;
}

const you: Developer = {
  name: "You",
  skills: ["TypeScript", "React", "Next.js"],
  isAwesome: true,
};

function greet(dev: Developer): string {
  return \`Hello, \${dev.name}! Ready to build something great?\`;
}

console.log(greet(you));
`;

// ─── Local FS helpers ─────────────────────────────────────────────────────────
const SKIP_ENTRIES = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv']);

async function readDirRecursive(
  dirHandle: FileSystemDirectoryHandle,
  fileHandles: Map<string, FileSystemFileHandle>,
  prefix = ''
): Promise<FileMeta[]> {
  const results: FileMeta[] = [];
  for await (const [name, handle] of dirHandle as unknown as AsyncIterable<[string, FileSystemHandle]>) {
    if (name.startsWith('.') || SKIP_ENTRIES.has(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === 'file') {
      fileHandles.set(path, handle as FileSystemFileHandle);
      results.push({ id: path, name, path, language: getLanguage(name), updatedAt: new Date().toISOString() });
    } else if (handle.kind === 'directory') {
      const sub = await readDirRecursive(handle as FileSystemDirectoryHandle, fileHandles, path);
      results.push(...sub);
    }
  }
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

// ─── Recent files (localStorage) ──────────────────────────────────────────────
const RECENT_KEY = 'rmhcode:recent';
const MAX_RECENT = 10;

interface RecentEntry {
  fileId: string;
  fileName: string;
  filePath: string;
  projectId: string;
  projectName: string;
  language: string | null;
  openedAt: number;
}

function loadRecent(): RecentEntry[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch { return []; }
}

function pushRecent(entry: Omit<RecentEntry, 'openedAt'>) {
  const list = loadRecent().filter(r => r.fileId !== entry.fileId);
  list.unshift({ ...entry, openedAt: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}

// ─── Layout persistence (localStorage) ────────────────────────────────────────
const LAYOUT_KEY = 'rmhcode:layout';

interface LayoutPersist {
  sidebarWidth: number;
  terminalHeight: number;
  terminalOpen: boolean;
}

function loadLayout(): Partial<LayoutPersist> {
  try {
    return JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}');
  } catch { return {}; }
}

// ─── Inner app (wrapped in SettingsProvider below) ────────────────────────────

function RMHCodeInner() {
  const { data: session, isPending } = authClient.useSession();
  const isGuest = !isPending && !session?.user;

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<Panel>('files');
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(224); // px (default w-56)
  const [terminalHeight, setTerminalHeight] = useState(220); // px

  // Cloud projects & files
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectMeta | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);

  // Local folder mode
  const [localDirHandle, setLocalDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [localFiles, setLocalFiles] = useState<FileMeta[]>([]);
  const localFileHandles = useRef<Map<string, FileSystemFileHandle>>(new Map());

  // Tabs
  const [openTabs, setOpenTabs] = useState<FileMeta[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // Content cache & save state
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [dirtyFiles, setDirtyFiles] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cursor position
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);

  // Dialogs
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newFileFolderPrefix, setNewFileFolderPrefix] = useState('');
  const [showQuickOpen, setShowQuickOpen] = useState(false);

  const isLocal = !!localDirHandle;
  const activeFiles = isLocal ? localFiles : files;

  // ─── Layout persistence ───────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadLayout();
    if (saved.sidebarWidth) setSidebarWidth(saved.sidebarWidth);
    if (saved.terminalHeight) setTerminalHeight(saved.terminalHeight);
    if (saved.terminalOpen !== undefined) setTerminalOpen(saved.terminalOpen);
  }, []);

  useEffect(() => {
    try {
      const layout: LayoutPersist = { sidebarWidth, terminalHeight, terminalOpen };
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch { /* ignore */ }
  }, [sidebarWidth, terminalHeight, terminalOpen]);

  // ─── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.user) return;
    loadProjects();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useEffect(() => {
    if (!activeProject) return;
    loadProjectFiles(activeProject.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id]);

  useEffect(() => {
    if (isGuest) {
      setOpenTabs([SAMPLE_FILE]);
      setActiveTabId(SAMPLE_FILE.id);
      setFileContents({ [SAMPLE_FILE.id]: SAMPLE_CONTENT });
    }
  }, [isGuest]);

  // ─── Download file via custom event ──────────────────────────────────────
  useEffect(() => {
    function onDownload(e: Event) {
      const { fileId } = (e as CustomEvent<{ fileId: string }>).detail;
      const file = [...files, ...localFiles].find(f => f.id === fileId);
      const content = fileContents[fileId];
      if (!file || content === undefined) return;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
    window.addEventListener('rmhcode:download-file', onDownload);
    return () => window.removeEventListener('rmhcode:download-file', onDownload);
  }, [files, localFiles, fileContents]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+P → Quick open
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        if (!isGuest) setShowQuickOpen(o => !o);
      }
      // F11 → Zen mode
      if (e.key === 'F11') {
        e.preventDefault();
        setZenMode(z => !z);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isGuest]);

  // ─── Sidebar resize ───────────────────────────────────────────────────────
  function handleSidebarResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    function onMouseMove(ev: MouseEvent) {
      const newWidth = Math.max(160, Math.min(480, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ─── Terminal resize ──────────────────────────────────────────────────────
  function handleTerminalResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = terminalHeight;

    function onMouseMove(ev: MouseEvent) {
      // Dragging up (negative dy) makes terminal taller
      const newHeight = Math.max(80, Math.min(600, startHeight - (ev.clientY - startY)));
      setTerminalHeight(newHeight);
    }
    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  // ─── Cloud project ops ────────────────────────────────────────────────────
  async function loadProjects() {
    const res = await fetch('/api/rmh-code/projects');
    if (!res.ok) return;
    const data = await res.json();
    setProjects(data.projects);
    if (data.projects.length > 0 && !activeProject) {
      setActiveProject(data.projects[0]);
    } else if (data.projects.length === 0) {
      setShowNewProject(true);
    }
  }

  async function loadProjectFiles(projectId: string) {
    const res = await fetch(`/api/rmh-code/projects/${projectId}`);
    if (!res.ok) return;
    const data = await res.json();
    setFiles(data.project.files);
  }

  async function loadFileContent(file: FileMeta): Promise<string> {
    if (fileContents[file.id] !== undefined) return fileContents[file.id];
    if (!activeProject) return '';
    const res = await fetch(`/api/rmh-code/projects/${activeProject.id}/files/${file.id}`);
    if (!res.ok) return '';
    const data = await res.json();
    const content = data.file.content as string;
    setFileContents(prev => ({ ...prev, [file.id]: content }));
    return content;
  }

  // ─── Local folder ops ────────────────────────────────────────────────────
  async function openLocalFolder() {
    if (!('showDirectoryPicker' in window)) return;
    try {
      type DirPicker = (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
      const pick = (window as unknown as Record<string, unknown>).showDirectoryPicker as DirPicker;
      const handle = await pick({ mode: 'readwrite' });
      const handles = new Map<string, FileSystemFileHandle>();
      const lFiles = await readDirRecursive(handle, handles);

      const contentPatch: Record<string, string> = {};
      await Promise.all(lFiles.slice(0, 100).map(async f => {
        try {
          const fh = handles.get(f.path)!;
          const file = await fh.getFile();
          if (file.size < 300_000) contentPatch[f.id] = await file.text();
        } catch { /* skip unreadable files */ }
      }));

      localFileHandles.current = handles;
      setLocalDirHandle(handle);
      setLocalFiles(lFiles);
      setFileContents(prev => ({ ...prev, ...contentPatch }));
      setOpenTabs([]);
      setActiveTabId(null);
    } catch { /* user cancelled */ }
  }

  function closeLocalFolder() {
    setLocalDirHandle(null);
    setLocalFiles([]);
    localFileHandles.current.clear();
    setOpenTabs([]);
    setActiveTabId(null);
  }

  // ─── File opening ─────────────────────────────────────────────────────────
  async function openFile(file: FileMeta) {
    if (isLocal) {
      if (fileContents[file.id] === undefined) {
        const fh = localFileHandles.current.get(file.path);
        if (fh) {
          try {
            const f = await fh.getFile();
            const text = await f.text();
            setFileContents(prev => ({ ...prev, [file.id]: text }));
          } catch { /* skip */ }
        }
      }
    } else {
      await loadFileContent(file);
      if (activeProject) {
        pushRecent({
          fileId: file.id,
          fileName: file.name,
          filePath: file.path,
          projectId: activeProject.id,
          projectName: activeProject.name,
          language: file.language,
        });
      }
    }
    setOpenTabs(prev => prev.find(t => t.id === file.id) ? prev : [...prev, file]);
    setActiveTabId(file.id);
  }

  function closeTab(fileId: string) {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === fileId);
      const next = prev.filter(t => t.id !== fileId);
      if (activeTabId === fileId) {
        setActiveTabId((next[idx] ?? next[idx - 1])?.id ?? null);
      }
      return next;
    });
    const timer = saveTimers.current.get(fileId);
    if (timer) { clearTimeout(timer); saveTimers.current.delete(fileId); }
  }

  // ─── Auto-save ────────────────────────────────────────────────────────────
  const saveFileToCloud = useCallback(async (fileId: string, content: string) => {
    if (!activeProject) return;
    setSaveStatus('saving');
    try {
      await fetch(`/api/rmh-code/projects/${activeProject.id}/files/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      setDirtyFiles(prev => { const next = new Set(prev); next.delete(fileId); return next; });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  }, [activeProject]);

  const saveFileToLocal = useCallback(async (filePath: string, content: string) => {
    const fh = localFileHandles.current.get(filePath);
    if (!fh) return;
    setSaveStatus('saving');
    try {
      const writable = await fh.createWritable();
      await writable.write(content);
      await writable.close();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    } catch {
      setSaveStatus('idle');
    }
  }, []);

  function handleContentChange(fileId: string, content: string) {
    if (isGuest) return;
    setFileContents(prev => ({ ...prev, [fileId]: content }));
    setDirtyFiles(prev => new Set(prev).add(fileId));
    setSaveStatus('idle');

    const existing = saveTimers.current.get(fileId);
    if (existing) clearTimeout(existing);

    if (isLocal) {
      const file = localFiles.find(f => f.id === fileId);
      if (file) {
        saveTimers.current.set(fileId, setTimeout(() => {
          saveFileToLocal(file.path, content);
          setDirtyFiles(prev => { const next = new Set(prev); next.delete(fileId); return next; });
        }, 1500));
      }
    } else {
      saveTimers.current.set(fileId, setTimeout(() => saveFileToCloud(fileId, content), 1500));
    }
  }

  // ─── Terminal file write ──────────────────────────────────────────────────
  function handleFileWrite(path: string, content: string) {
    if (isLocal) {
      const file = localFiles.find(f => f.path === path);
      if (file) {
        setFileContents(prev => ({ ...prev, [file.id]: content }));
        saveFileToLocal(path, content);
      }
    } else {
      const file = files.find(f => f.path === path);
      if (file) {
        setFileContents(prev => ({ ...prev, [file.id]: content }));
        saveFileToCloud(file.id, content);
      }
    }
  }

  // ─── Project CRUD ─────────────────────────────────────────────────────────
  async function handleNewProject(name: string, templateFiles?: Array<{ path: string; content: string }>) {
    setShowNewProject(false);
    const res = await fetch('/api/rmh-code/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const newProject = { ...data.project, _count: { files: 0 } } as ProjectMeta;
    setProjects(prev => [newProject, ...prev]);
    setActiveProject(newProject);
    setFiles([]);
    setOpenTabs([]);
    setActiveTabId(null);

    if (templateFiles && templateFiles.length > 0) {
      const created: FileMeta[] = [];
      for (const tf of templateFiles) {
        const fname = tf.path.split('/').pop() ?? tf.path;
        const r = await fetch(`/api/rmh-code/projects/${newProject.id}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fname, path: tf.path, content: tf.content }),
        });
        if (r.ok) {
          const d = await r.json();
          created.push({
            id: d.file.id, name: d.file.name, path: d.file.path,
            language: d.file.language, updatedAt: d.file.updatedAt,
          });
          setFileContents(prev => ({ ...prev, [d.file.id]: tf.content }));
        }
      }
      if (created.length > 0) {
        setFiles(created.sort((a, b) => a.path.localeCompare(b.path)));
        openFile(created[0]);
      }
    }
  }

  async function handleDeleteProject(id: string) {
    if (!confirm('Delete this project and all its files?')) return;
    await fetch(`/api/rmh-code/projects/${id}`, { method: 'DELETE' });
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProject?.id === id) {
      const remaining = projects.filter(p => p.id !== id);
      setActiveProject(remaining[0] ?? null);
      setFiles([]);
      setOpenTabs([]);
      setActiveTabId(null);
    }
  }

  async function handleRenameProject(id: string, newName: string) {
    const res = await fetch(`/api/rmh-code/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) return;
    setProjects(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));
    if (activeProject?.id === id) {
      setActiveProject(prev => prev ? { ...prev, name: newName } : prev);
    }
  }

  async function handleNewFile(path: string, content = '') {
    setShowNewFile(false);
    setNewFileFolderPrefix('');
    if (!activeProject) return;
    const name = path.split('/').pop() ?? path;
    const res = await fetch(`/api/rmh-code/projects/${activeProject.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, content }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const newFile: FileMeta = {
      id: data.file.id, name: data.file.name,
      path: data.file.path, language: data.file.language,
      updatedAt: data.file.updatedAt,
    };
    setFiles(prev => [...prev, newFile].sort((a, b) => a.path.localeCompare(b.path)));
    setFileContents(prev => ({ ...prev, [newFile.id]: content }));
    openFile(newFile);
  }

  async function handleDeleteFile(fileId: string) {
    if (!activeProject) return;
    const file = files.find(f => f.id === fileId);
    if (!file || !confirm(`Delete "${file.name}"?`)) return;
    await fetch(`/api/rmh-code/projects/${activeProject.id}/files/${fileId}`, { method: 'DELETE' });
    setFiles(prev => prev.filter(f => f.id !== fileId));
    closeTab(fileId);
  }

  async function handleRenameFile(fileId: string, newPath: string) {
    if (!activeProject) return;
    const newName = newPath.split('/').pop() ?? newPath;
    const res = await fetch(`/api/rmh-code/projects/${activeProject.id}/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName, path: newPath }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const updated: FileMeta = data.file;
    setFiles(prev => prev.map(f => f.id === fileId ? updated : f).sort((a, b) => a.path.localeCompare(b.path)));
    setOpenTabs(prev => prev.map(t => t.id === fileId ? updated : t));
  }

  async function handleUploadFiles(uploadedFiles: File[]) {
    if (!activeProject) return;
    for (const f of uploadedFiles) {
      if (f.size > 500_000) continue;
      try {
        const content = await f.text();
        await handleNewFile(f.name, content);
      } catch { /* skip binary/unreadable files */ }
    }
  }

  async function handleExportZip() {
    if (!activeProject) return;
    const res = await fetch(`/api/rmh-code/projects/${activeProject.id}/export`);
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeProject.name}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleNewFolder() {
    setNewFileFolderPrefix('');
    setShowNewFile(true);
  }

  // ─── Panel toggle ─────────────────────────────────────────────────────────
  function handleSetPanel(panel: Panel) {
    if (activePanel === panel) {
      setSidebarOpen(o => !o);
    } else {
      setActivePanel(panel);
      setSidebarOpen(true);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const activeTab = openTabs.find(t => t.id === activeTabId) ?? null;
  const activeContent = activeTabId ? (fileContents[activeTabId] ?? '') : '';

  if (isPending) {
    return (
      <div className="h-screen w-screen bg-[#1e1e1e] flex items-center justify-center text-[#858585] text-sm">
        Loading…
      </div>
    );
  }

  // ── Zen mode ──────────────────────────────────────────────────────────────
  if (zenMode) {
    return (
      <div className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-white overflow-hidden">
        {/* Zen exit button — top right corner */}
        <button
          onClick={() => setZenMode(false)}
          title="Exit Zen mode (F11)"
          className="fixed top-2 right-3 z-50 text-[10px] text-[#555] hover:text-[#aaa] transition-colors select-none"
        >
          F11 to exit
        </button>

        {/* Editor fills the entire screen */}
        <div className="flex flex-col flex-1 min-h-0">
          <EditorArea
            file={activeTab}
            content={activeContent}
            readOnly={isGuest}
            onChange={value => activeTabId && handleContentChange(activeTabId, value)}
            onCursorChange={(line, col) => { setCursorLine(line); setCursorCol(col); }}
            onOpenRecentFile={openFile}
            activeProject={activeProject}
            isLocal={isLocal}
            localDirName={localDirHandle?.name}
          />
          {terminalOpen && (
            <Terminal
              files={activeFiles}
              fileContents={fileContents}
              onFileWrite={handleFileWrite}
              onClose={() => setTerminalOpen(false)}
              height={terminalHeight}
              onResizeStart={handleTerminalResizeStart}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Normal mode ───────────────────────────────────────────────────────────
  return (
    <div className="h-screen w-screen flex flex-col bg-[#1e1e1e] text-white overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between h-8 bg-[#3c3c3c] px-3 border-b border-[#252526] shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-white tracking-wide">RMH Code</span>
          {isLocal ? (
            <span className="text-xs text-[#e3a752]">— {localDirHandle!.name} (local)</span>
          ) : activeProject ? (
            <span className="text-xs text-[#858585]">— {activeProject.name}</span>
          ) : null}
        </div>
        <a href="/" className="text-[10px] text-[#858585] hover:text-white transition-colors">
          ← Back to site
        </a>
      </div>

      {/* Guest banner */}
      {isGuest && <GuestBanner />}

      {/* Main area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity bar */}
        <ActivityBar
          activePanel={activePanel}
          onSetPanel={handleSetPanel}
          terminalOpen={terminalOpen}
          onToggleTerminal={() => setTerminalOpen(o => !o)}
          settingsOpen={showSettings}
          onToggleSettings={() => setShowSettings(o => !o)}
          isGuest={isGuest}
        />

        {/* Sidebar */}
        {sidebarOpen && (
          <div
            className="shrink-0 border-r border-[#252526] flex flex-col overflow-hidden relative"
            style={{ width: sidebarWidth }}
          >
            {activePanel === 'files' && (
              <FileExplorer
                projects={projects}
                activeProject={activeProject}
                files={files}
                localDirHandle={localDirHandle}
                localFiles={localFiles}
                onSelectProject={p => {
                  setActiveProject(p);
                  setOpenTabs([]);
                  setActiveTabId(null);
                }}
                onNewProject={() => setShowNewProject(true)}
                onDeleteProject={handleDeleteProject}
                onRenameProject={handleRenameProject}
                onNewFile={() => setShowNewFile(true)}
                onNewFolder={handleNewFolder}
                onDeleteFile={handleDeleteFile}
                onRenameFile={handleRenameFile}
                onUploadFiles={handleUploadFiles}
                onExportZip={handleExportZip}
                onOpenLocalFolder={openLocalFolder}
                onCloseLocalFolder={closeLocalFolder}
                activeFileId={activeTabId}
                onOpenFile={openFile}
              />
            )}
            {activePanel === 'git' && (
              <GitPanel
                activeProject={activeProject}
                files={files}
                onCloneSuccess={async () => { await loadProjects(); }}
                onPushSuccess={() => { /* SHAs updated server-side */ }}
              />
            )}

            {/* Sidebar resize handle */}
            <div
              onMouseDown={handleSidebarResizeStart}
              className="absolute top-0 right-0 w-1 h-full cursor-ew-resize bg-transparent hover:bg-[#007acc] transition-colors z-10"
              title="Drag to resize sidebar"
            />
          </div>
        )}

        {/* Editor column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <TabBar
            tabs={openTabs}
            activeFileId={activeTabId}
            dirtyFiles={dirtyFiles}
            onSelectTab={setActiveTabId}
            onCloseTab={closeTab}
          />
          <EditorArea
            file={activeTab}
            content={activeContent}
            readOnly={isGuest}
            onChange={value => activeTabId && handleContentChange(activeTabId, value)}
            onCursorChange={(line, col) => { setCursorLine(line); setCursorCol(col); }}
            onOpenRecentFile={openFile}
            activeProject={activeProject}
            isLocal={isLocal}
            localDirName={localDirHandle?.name}
          />
          {terminalOpen && (
            <Terminal
              files={activeFiles}
              fileContents={fileContents}
              onFileWrite={handleFileWrite}
              onClose={() => setTerminalOpen(false)}
              height={terminalHeight}
              onResizeStart={handleTerminalResizeStart}
            />
          )}
        </div>

        {/* Settings panel */}
        {showSettings && (
          <SettingsPanel onClose={() => setShowSettings(false)} />
        )}
      </div>

      {/* Status bar */}
      <StatusBar
        file={activeTab}
        line={cursorLine}
        col={cursorCol}
        saveStatus={saveStatus}
        isGuest={isGuest}
      />

      {/* Dialogs */}
      {showNewProject && !isGuest && (
        <NewProjectDialog onConfirm={handleNewProject} onClose={() => setShowNewProject(false)} />
      )}
      {showNewFile && !isGuest && activeProject && (
        <NewFileDialog
          folderPrefix={newFileFolderPrefix}
          onConfirm={handleNewFile}
          onClose={() => { setShowNewFile(false); setNewFileFolderPrefix(''); }}
        />
      )}
      {showQuickOpen && !isGuest && (
        <QuickOpenPanel
          files={activeFiles}
          onOpen={openFile}
          onClose={() => setShowQuickOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Root export — wrapped in SettingsProvider ────────────────────────────────

export default function RMHCodeApp() {
  return (
    <SettingsProvider>
      <RMHCodeInner />
    </SettingsProvider>
  );
}

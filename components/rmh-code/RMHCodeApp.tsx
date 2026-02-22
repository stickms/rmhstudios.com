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
  // FileSystemDirectoryHandle is iterable via asyncIterator in modern browsers
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

export default function RMHCodeApp() {
  const { data: session, isPending } = authClient.useSession();
  const isGuest = !isPending && !session?.user;

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<Panel>('files');
  const [terminalOpen, setTerminalOpen] = useState(false);

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

  const isLocal = !!localDirHandle;
  const activeFiles = isLocal ? localFiles : files;

  // ─── Init ──────────────────────────────────────────────────────────────────
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

      // Prefetch text files into content cache (up to 100)
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
    } catch { /* user cancelled or permission denied */ }
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
  async function handleNewProject(name: string) {
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

  async function handleNewFile(path: string) {
    setShowNewFile(false);
    if (!activeProject) return;
    const name = path.split('/').pop() ?? path;
    const res = await fetch(`/api/rmh-code/projects/${activeProject.id}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, content: '' }),
    });
    if (!res.ok) return;
    const data = await res.json();
    const newFile: FileMeta = {
      id: data.file.id, name: data.file.name,
      path: data.file.path, language: data.file.language,
      updatedAt: data.file.updatedAt,
    };
    setFiles(prev => [...prev, newFile].sort((a, b) => a.path.localeCompare(b.path)));
    setFileContents(prev => ({ ...prev, [newFile.id]: '' }));
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

  // ─── Panel toggle (click active to collapse sidebar) ─────────────────────
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
          isGuest={isGuest}
        />

        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 border-r border-[#252526] flex flex-col overflow-hidden">
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
                onNewFile={() => setShowNewFile(true)}
                onDeleteFile={handleDeleteFile}
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
          />
          {terminalOpen && (
            <Terminal
              files={activeFiles}
              fileContents={fileContents}
              onFileWrite={handleFileWrite}
              onClose={() => setTerminalOpen(false)}
            />
          )}
        </div>
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
        <NewFileDialog onConfirm={handleNewFile} onClose={() => setShowNewFile(false)} />
      )}
    </div>
  );
}

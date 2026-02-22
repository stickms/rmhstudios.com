'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { authClient } from '@/lib/auth-client';
import ActivityBar from './ActivityBar';
import FileExplorer from './FileExplorer';
import TabBar from './TabBar';
import EditorArea from './EditorArea';
import StatusBar from './StatusBar';
import GuestBanner from './GuestBanner';
import NewProjectDialog from './NewProjectDialog';
import NewFileDialog from './NewFileDialog';
import type { FileMeta, ProjectMeta } from './utils';

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

export default function RMHCodeApp() {
  const { data: session, isPending } = authClient.useSession();
  const isGuest = !isPending && !session?.user;

  // Layout
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Projects & files
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProject, setActiveProject] = useState<ProjectMeta | null>(null);
  const [files, setFiles] = useState<FileMeta[]>([]);

  // Tabs
  const [openTabs, setOpenTabs] = useState<FileMeta[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  // File content cache
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

  // Load projects on mount (authenticated only)
  useEffect(() => {
    if (!session?.user) return;
    loadProjects();
  }, [session?.user?.id]);

  // Load files when active project changes
  useEffect(() => {
    if (!activeProject) return;
    loadProjectFiles(activeProject.id);
  }, [activeProject?.id]);

  // Guest: open sample file
  useEffect(() => {
    if (isGuest) {
      setOpenTabs([SAMPLE_FILE]);
      setActiveTabId(SAMPLE_FILE.id);
      setFileContents({ [SAMPLE_FILE.id]: SAMPLE_CONTENT });
    }
  }, [isGuest]);

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
    const res = await fetch(`/api/rmh-code/projects/${activeProject!.id}/files/${file.id}`);
    if (!res.ok) return '';
    const data = await res.json();
    const content = data.file.content as string;
    setFileContents(prev => ({ ...prev, [file.id]: content }));
    return content;
  }

  async function openFile(file: FileMeta) {
    // Load content if not cached
    await loadFileContent(file);
    setOpenTabs(prev => {
      if (prev.find(t => t.id === file.id)) return prev;
      return [...prev, file];
    });
    setActiveTabId(file.id);
  }

  function closeTab(fileId: string) {
    setOpenTabs(prev => {
      const idx = prev.findIndex(t => t.id === fileId);
      const next = prev.filter(t => t.id !== fileId);
      if (activeTabId === fileId) {
        const nextActive = next[idx] ?? next[idx - 1] ?? null;
        setActiveTabId(nextActive?.id ?? null);
      }
      return next;
    });
    // Clear save timer for this file
    const timer = saveTimers.current.get(fileId);
    if (timer) { clearTimeout(timer); saveTimers.current.delete(fileId); }
  }

  const saveFile = useCallback(async (fileId: string, content: string) => {
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

  function handleContentChange(fileId: string, content: string) {
    if (isGuest) return;
    setFileContents(prev => ({ ...prev, [fileId]: content }));
    setDirtyFiles(prev => new Set(prev).add(fileId));
    setSaveStatus('idle');

    const existing = saveTimers.current.get(fileId);
    if (existing) clearTimeout(existing);
    saveTimers.current.set(fileId, setTimeout(() => saveFile(fileId, content), 1500));
  }

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
    const res = await fetch(`/api/rmh-code/projects/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
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
      id: data.file.id,
      name: data.file.name,
      path: data.file.path,
      language: data.file.language,
      updatedAt: data.file.updatedAt,
    };
    setFiles(prev => [...prev, newFile].sort((a, b) => a.path.localeCompare(b.path)));
    setFileContents(prev => ({ ...prev, [newFile.id]: '' }));
    openFile(newFile);
  }

  async function handleDeleteFile(fileId: string) {
    if (!activeProject) return;
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    if (!confirm(`Delete "${file.name}"?`)) return;
    const res = await fetch(`/api/rmh-code/projects/${activeProject.id}/files/${fileId}`, {
      method: 'DELETE',
    });
    if (!res.ok) return;
    setFiles(prev => prev.filter(f => f.id !== fileId));
    closeTab(fileId);
  }

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
          {activeProject && (
            <span className="text-xs text-[#858585]">— {activeProject.name}</span>
          )}
        </div>
        <a
          href="/"
          className="text-[10px] text-[#858585] hover:text-white transition-colors"
        >
          ← Back to site
        </a>
      </div>

      {/* Guest banner */}
      {isGuest && <GuestBanner />}

      {/* Main editor area */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Activity bar */}
        <ActivityBar sidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen(o => !o)} />

        {/* Sidebar / file explorer */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 border-r border-[#252526] flex flex-col overflow-hidden">
            <FileExplorer
              projects={projects}
              activeProject={activeProject}
              files={files}
              activeFileId={activeTabId}
              onSelectProject={p => {
                setActiveProject(p);
                setOpenTabs([]);
                setActiveTabId(null);
              }}
              onNewProject={() => setShowNewProject(true)}
              onDeleteProject={handleDeleteProject}
              onOpenFile={openFile}
              onNewFile={() => setShowNewFile(true)}
              onDeleteFile={handleDeleteFile}
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
          />
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
        <NewProjectDialog
          onConfirm={handleNewProject}
          onClose={() => setShowNewProject(false)}
        />
      )}
      {showNewFile && !isGuest && activeProject && (
        <NewFileDialog
          onConfirm={handleNewFile}
          onClose={() => setShowNewFile(false)}
        />
      )}
    </div>
  );
}

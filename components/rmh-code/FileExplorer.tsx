'use client';

import { useState } from 'react';
import { ChevronDown, Plus, Trash2, FilePlus, FolderPlus, FolderOpen, X } from 'lucide-react';
import type { FileMeta, ProjectMeta } from './utils';

interface FileExplorerProps {
  // Cloud mode
  projects: ProjectMeta[];
  activeProject: ProjectMeta | null;
  files: FileMeta[];
  onSelectProject: (project: ProjectMeta) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onNewFile: () => void;
  onDeleteFile: (id: string) => void;
  // Local mode
  localDirHandle: FileSystemDirectoryHandle | null;
  localFiles: FileMeta[];
  onOpenLocalFolder: () => void;
  onCloseLocalFolder: () => void;
  // Shared
  activeFileId: string | null;
  onOpenFile: (file: FileMeta) => void;
}

function FileIcon({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const colorMap: Record<string, string> = {
    ts: 'text-blue-400', tsx: 'text-blue-400',
    js: 'text-yellow-400', jsx: 'text-yellow-400',
    css: 'text-purple-400', scss: 'text-purple-400',
    json: 'text-yellow-300', md: 'text-gray-300',
    html: 'text-orange-400', py: 'text-green-400',
    rs: 'text-orange-500', go: 'text-cyan-400',
    sh: 'text-gray-400', toml: 'text-gray-400',
  };
  return (
    <span className={`text-xs mr-1.5 shrink-0 ${colorMap[ext] ?? 'text-[#858585]'}`}>◆</span>
  );
}

function groupFiles(files: FileMeta[]) {
  const groups: Record<string, FileMeta[]> = {};
  const root: FileMeta[] = [];
  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length === 1) {
      root.push(f);
    } else {
      const folder = parts[0];
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(f);
    }
  }
  return { root, groups };
}

function FileTree({
  files,
  activeFileId,
  onOpenFile,
  onDeleteFile,
  isLocal,
}: {
  files: FileMeta[];
  activeFileId: string | null;
  onOpenFile: (f: FileMeta) => void;
  onDeleteFile?: (id: string) => void;
  isLocal?: boolean;
}) {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [hoveredFile, setHoveredFile] = useState<string | null>(null);

  function toggleFolder(name: string) {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const { root, groups } = groupFiles(files);

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden text-xs">
      {root.map(file => (
        <div
          key={file.id}
          onMouseEnter={() => setHoveredFile(file.id)}
          onMouseLeave={() => setHoveredFile(null)}
          onClick={() => onOpenFile(file)}
          className={`flex items-center gap-1 px-3 py-0.5 cursor-pointer transition-colors ${
            activeFileId === file.id ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2d2e] text-[#ccc]'
          }`}
        >
          <FileIcon filename={file.name} />
          <span className="truncate flex-1">{file.name}</span>
          {hoveredFile === file.id && !isLocal && onDeleteFile && (
            <button
              onClick={e => { e.stopPropagation(); onDeleteFile(file.id); }}
              className="text-[#858585] hover:text-red-400 transition-colors shrink-0"
            >
              <Trash2 size={11} />
            </button>
          )}
        </div>
      ))}

      {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)).map(([folder, folderFiles]) => (
        <div key={folder}>
          <button
            onClick={() => toggleFolder(folder)}
            className="w-full flex items-center gap-1 px-2 py-0.5 hover:bg-[#2a2d2e] text-[#ccc] transition-colors"
          >
            <ChevronDown
              size={12}
              className={`shrink-0 transition-transform ${expandedFolders.has(folder) ? '' : '-rotate-90'}`}
            />
            <Plus size={12} className="shrink-0 text-[#858585]" />
            <span className="truncate">{folder}</span>
          </button>
          {expandedFolders.has(folder) && folderFiles.map(file => (
            <div
              key={file.id}
              onMouseEnter={() => setHoveredFile(file.id)}
              onMouseLeave={() => setHoveredFile(null)}
              onClick={() => onOpenFile(file)}
              className={`flex items-center gap-1 pl-7 pr-3 py-0.5 cursor-pointer transition-colors ${
                activeFileId === file.id ? 'bg-[#37373d] text-white' : 'hover:bg-[#2a2d2e] text-[#ccc]'
              }`}
            >
              <FileIcon filename={file.name} />
              <span className="truncate flex-1">{file.name}</span>
              {hoveredFile === file.id && !isLocal && onDeleteFile && (
                <button
                  onClick={e => { e.stopPropagation(); onDeleteFile(file.id); }}
                  className="text-[#858585] hover:text-red-400 transition-colors shrink-0"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function FileExplorer({
  projects, activeProject, files,
  onSelectProject, onNewProject, onDeleteProject, onNewFile, onDeleteFile,
  localDirHandle, localFiles, onOpenLocalFolder, onCloseLocalFolder,
  activeFileId, onOpenFile,
}: FileExplorerProps) {
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const isLocal = !!localDirHandle;
  const supportsLocalFs = typeof window !== 'undefined' && 'showDirectoryPicker' in window;

  const displayFiles = isLocal ? localFiles : files;

  return (
    <div className="flex flex-col h-full bg-[#252526] text-[#ccc] select-none min-w-0">
      {/* Header */}
      <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[#bbb] border-b border-[#3c3c3c] shrink-0">
        Explorer
      </div>

      {/* Local folder banner */}
      {isLocal && (
        <div className="flex items-center justify-between px-2 py-1.5 bg-[#1e1e1e] border-b border-[#3c3c3c] shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-[#ccc] truncate">
            <FolderOpen size={13} className="text-[#e3a752] shrink-0" />
            <span className="truncate">{localDirHandle.name}</span>
          </div>
          <button
            onClick={onCloseLocalFolder}
            title="Close local folder"
            className="shrink-0 text-[#858585] hover:text-white transition-colors ml-1"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Project selector (cloud mode only) */}
      {!isLocal && (
        <div className="px-2 pt-2 pb-1 shrink-0">
          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(o => !o)}
              className="w-full flex items-center justify-between gap-1 px-2 py-1.5 bg-[#3c3c3c] hover:bg-[#4a4a4a] rounded text-xs text-white transition-colors"
            >
              <span className="truncate">{activeProject?.name ?? 'Select project…'}</span>
              <ChevronDown size={12} className="shrink-0 text-[#858585]" />
            </button>

            {projectDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-40 bg-[#1e1e1e] border border-[#454545] rounded shadow-xl max-h-48 overflow-y-auto">
                {projects.map(p => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between px-2 py-1.5 hover:bg-[#2a2d2e] cursor-pointer group"
                    onClick={() => { onSelectProject(p); setProjectDropdownOpen(false); }}
                  >
                    <span className="text-xs truncate">{p.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteProject(p.id); }}
                      className="opacity-0 group-hover:opacity-100 text-[#858585] hover:text-red-400 transition-all ml-1 shrink-0"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
                {projects.length === 0 && (
                  <div className="px-3 py-2 text-xs text-[#858585]">No projects yet</div>
                )}
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-[#007acc] hover:bg-[#2a2d2e] cursor-pointer border-t border-[#3c3c3c]"
                  onClick={() => { setProjectDropdownOpen(false); onNewProject(); }}
                >
                  <FolderPlus size={12} /> New project…
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File section header */}
      {(activeProject || isLocal) && (
        <div className="flex items-center justify-between px-3 py-1 shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-[#858585] font-semibold truncate">
            {isLocal ? localDirHandle!.name : activeProject!.name}
          </span>
          {!isLocal && (
            <button onClick={onNewFile} title="New File" className="text-[#858585] hover:text-white transition-colors shrink-0">
              <FilePlus size={14} />
            </button>
          )}
        </div>
      )}

      {/* Empty states */}
      {!activeProject && !isLocal && (
        <div className="px-3 py-4 space-y-3">
          <p className="text-[#858585] text-center text-xs">Select or create a project to get started.</p>
          {supportsLocalFs ? (
            <button
              onClick={onOpenLocalFolder}
              className="w-full flex items-center justify-center gap-1.5 px-2.5 py-2 bg-[#3c3c3c] hover:bg-[#4a4a4a] text-white rounded text-xs transition-colors"
            >
              <FolderOpen size={13} /> Open Local Folder
            </button>
          ) : (
            <p className="text-[10px] text-[#555] text-center">
              Local file access requires Chrome or Edge.
            </p>
          )}
        </div>
      )}

      {(activeProject || isLocal) && displayFiles.length === 0 && (
        <div className="px-4 py-4 text-[#858585] text-center text-xs">
          No files yet.{' '}
          {!isLocal && (
            <button onClick={onNewFile} className="text-[#007acc] hover:underline">Create one</button>
          )}
        </div>
      )}

      {/* File tree */}
      {displayFiles.length > 0 && (
        <FileTree
          files={displayFiles}
          activeFileId={activeFileId}
          onOpenFile={onOpenFile}
          onDeleteFile={!isLocal ? onDeleteFile : undefined}
          isLocal={isLocal}
        />
      )}

      {/* Open Local Folder button at bottom when cloud project is active */}
      {activeProject && !isLocal && supportsLocalFs && (
        <div className="shrink-0 border-t border-[#3c3c3c] p-2">
          <button
            onClick={onOpenLocalFolder}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 text-[#858585] hover:text-white hover:bg-[#3c3c3c] rounded text-xs transition-colors"
          >
            <FolderOpen size={12} /> Open Local Folder
          </button>
        </div>
      )}
    </div>
  );
}

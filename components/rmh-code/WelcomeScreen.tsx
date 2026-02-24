'use client';

import { useEffect, useState } from 'react';
import { Clock, FileCode } from 'lucide-react';
import type { FileMeta, ProjectMeta } from './utils';

const RECENT_KEY = 'rmhcode:recent';

interface RecentEntry {
  fileId: string;
  fileName: string;
  filePath: string;
  projectId: string;
  projectName: string;
  language: string | null;
  openedAt: number;
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface WelcomeScreenProps {
  activeProject: ProjectMeta | null;
  onOpenFile: (file: FileMeta) => void;
}

export default function WelcomeScreen({ activeProject, onOpenFile }: WelcomeScreenProps) {
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'));
    } catch { /* ignore */ }
  }, []);

  // Show recent files for the current project only
  const projectRecent = activeProject
    ? recent.filter(r => r.projectId === activeProject.id)
    : [];

  function handleOpenRecent(entry: RecentEntry) {
    // Reconstruct a FileMeta from stored data; openFile will fetch content if needed
    const file: FileMeta = {
      id: entry.fileId,
      name: entry.fileName,
      path: entry.filePath,
      language: entry.language,
      updatedAt: new Date(entry.openedAt).toISOString(),
    };
    onOpenFile(file);
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#1e1e1e] text-[#858585] select-none px-8 gap-6">
      <div className="text-center">
        <div className="text-5xl opacity-20 mb-3">⌨</div>
        <p className="text-sm text-[#858585]">Open a file from the explorer to start editing</p>
      </div>

      {projectRecent.length > 0 && (
        <div className="w-full max-w-xs">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[#555] mb-2">
            <Clock size={10} />
            Recent files
          </div>
          <div className="space-y-0.5">
            {projectRecent.map(entry => (
              <button
                key={entry.fileId}
                onClick={() => handleOpenRecent(entry)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#2a2d2e] text-left transition-colors group"
              >
                <FileCode size={13} className="text-[#555] shrink-0 group-hover:text-[#858585]" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-[#ccc] truncate group-hover:text-white">{entry.fileName}</div>
                  <div className="text-[10px] text-[#555] truncate">{entry.filePath}</div>
                </div>
                <span className="text-[10px] text-[#555] shrink-0">{timeAgo(entry.openedAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

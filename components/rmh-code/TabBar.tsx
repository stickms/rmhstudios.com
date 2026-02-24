'use client';

import { X } from 'lucide-react';
import type { FileMeta } from './utils';

interface TabBarProps {
  tabs: FileMeta[];
  activeFileId: string | null;
  dirtyFiles: Set<string>;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
}

export default function TabBar({ tabs, activeFileId, dirtyFiles, onSelectTab, onCloseTab }: TabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex items-end bg-[#252526] border-b border-[#252526] overflow-x-auto shrink-0 h-9">
      {tabs.map(tab => {
        const isActive = tab.id === activeFileId;
        const isDirty = dirtyFiles.has(tab.id);
        return (
          <div
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 h-9 cursor-pointer border-r border-[#252526] shrink-0 max-w-[180px] group transition-colors ${
              isActive
                ? 'bg-[#1e1e1e] text-white border-t border-t-[#007acc]'
                : 'bg-[#2d2d2d] text-[#858585] hover:bg-[#2a2d2e] hover:text-[#ccc]'
            }`}
          >
            {isDirty && !isActive && (
              <span className="text-[#007acc] text-base leading-none shrink-0">●</span>
            )}
            <span className="text-xs truncate">{tab.name}</span>
            <button
              onClick={e => { e.stopPropagation(); onCloseTab(tab.id); }}
              className={`shrink-0 rounded transition-colors ml-0.5 ${
                isDirty
                  ? 'text-[#007acc] hover:text-white'
                  : 'text-transparent group-hover:text-[#858585] hover:!text-white'
              }`}
            >
              {isDirty ? '●' : <X size={12} />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

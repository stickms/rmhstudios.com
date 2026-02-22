'use client';

import { Files, Settings } from 'lucide-react';

interface ActivityBarProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export default function ActivityBar({ sidebarOpen, onToggleSidebar }: ActivityBarProps) {
  return (
    <div className="flex flex-col items-center w-12 bg-[#333333] border-r border-[#252526] py-2 gap-1 shrink-0">
      <button
        onClick={onToggleSidebar}
        title="Explorer"
        className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
          sidebarOpen
            ? 'text-white border-l-2 border-white'
            : 'text-[#858585] hover:text-white'
        }`}
      >
        <Files size={22} />
      </button>
      <div className="flex-1" />
      <button
        title="Settings (coming soon)"
        className="w-10 h-10 flex items-center justify-center rounded text-[#858585] hover:text-white transition-colors"
      >
        <Settings size={22} />
      </button>
    </div>
  );
}

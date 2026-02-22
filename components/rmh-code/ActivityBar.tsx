'use client';

import { Files, GitBranch, Settings, SquareTerminal } from 'lucide-react';

type Panel = 'files' | 'git';

interface ActivityBarProps {
  activePanel: Panel;
  onSetPanel: (panel: Panel) => void;
  terminalOpen: boolean;
  onToggleTerminal: () => void;
  isGuest: boolean;
}

export default function ActivityBar({
  activePanel, onSetPanel, terminalOpen, onToggleTerminal, isGuest,
}: ActivityBarProps) {
  return (
    <div className="flex flex-col items-center w-12 bg-[#333333] border-r border-[#252526] py-2 gap-1 shrink-0">
      {/* Top group */}
      <button
        onClick={() => onSetPanel('files')}
        title="Explorer"
        className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
          activePanel === 'files'
            ? 'text-white border-l-2 border-white'
            : 'text-[#858585] hover:text-white'
        }`}
      >
        <Files size={22} />
      </button>

      <button
        onClick={() => { if (!isGuest) onSetPanel('git'); }}
        title={isGuest ? 'Sign in to use Git' : 'Source Control'}
        className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
          isGuest
            ? 'text-[#555] cursor-not-allowed'
            : activePanel === 'git'
            ? 'text-white border-l-2 border-white'
            : 'text-[#858585] hover:text-white'
        }`}
      >
        <GitBranch size={22} />
      </button>

      <div className="flex-1" />

      {/* Bottom group */}
      <button
        onClick={onToggleTerminal}
        title="Terminal"
        className={`w-10 h-10 flex items-center justify-center rounded transition-colors ${
          terminalOpen ? 'text-white' : 'text-[#858585] hover:text-white'
        }`}
      >
        <SquareTerminal size={22} />
      </button>

      <button
        title="Settings (coming soon)"
        className="w-10 h-10 flex items-center justify-center rounded text-[#858585] hover:text-white transition-colors"
      >
        <Settings size={22} />
      </button>
    </div>
  );
}

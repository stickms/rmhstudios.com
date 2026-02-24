'use client';

import { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import TerminalSession, { type TerminalSessionHandle, type ThemeColors } from './TerminalSession';
import type { FileMeta } from './utils';
import { useSettings } from './SettingsContext';

// ─── Themes ───────────────────────────────────────────────────────────────────

const THEMES: ThemeColors[] = [
  {
    name: 'Dark',
    bg: '#0d0d0d',
    textOutput: '#d4d4d4',
    textPrompt: '#858585',
    textError: '#f48771',
    textInfo: '#9cdcfe',
  },
  {
    name: 'Dim',
    bg: '#111827',
    textOutput: '#d1d5db',
    textPrompt: '#6b7280',
    textError: '#f87171',
    textInfo: '#93c5fd',
  },
  {
    name: 'Matrix',
    bg: '#001100',
    textOutput: '#00ff41',
    textPrompt: '#007a1e',
    textError: '#ff5555',
    textInfo: '#33cc55',
  },
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
}

interface TerminalProps {
  files: FileMeta[];
  fileContents: Record<string, string>;
  onFileWrite: (path: string, content: string) => void;
  onClose: () => void;
  height: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Terminal({ files, fileContents, onFileWrite, onClose, height, onResizeStart }: TerminalProps) {
  const { settings, updateSettings } = useSettings();
  const [tabs, setTabs] = useState<Tab[]>([{ id: 'term-1', label: 'Terminal 1' }]);
  const [activeTabId, setActiveTabId] = useState('term-1');

  const tabCounterRef = useRef(1);
  const sessionRefs = useRef<Map<string, TerminalSessionHandle>>(new Map());

  const theme = THEMES[settings.terminalThemeIndex] ?? THEMES[0];

  function addTab() {
    tabCounterRef.current++;
    const id = `term-${tabCounterRef.current}`;
    const label = `Terminal ${tabCounterRef.current}`;
    setTabs(prev => [...prev, { id, label }]);
    setActiveTabId(id);
  }

  function closeTab(id: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id);
        setActiveTabId((next[idx] ?? next[idx - 1])?.id ?? '');
      }
      return next;
    });
    sessionRefs.current.delete(id);
  }

  function clearActive() {
    sessionRefs.current.get(activeTabId)?.clear();
  }

  function cycleTheme() {
    updateSettings({ terminalThemeIndex: (settings.terminalThemeIndex + 1) % THEMES.length });
  }

  return (
    <div
      className="flex flex-col shrink-0 border-t border-[#252526] bg-[#1e1e1e]"
      style={{ height }}
    >
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        className="h-1 w-full cursor-ns-resize bg-transparent hover:bg-[#007acc] transition-colors shrink-0"
        title="Drag to resize terminal"
      />

      {/* Tab bar */}
      <div className="flex items-center h-8 bg-[#252526] border-b border-[#3c3c3c] shrink-0 overflow-hidden">
        {/* Tab pills (scrollable) */}
        <div className="flex items-center flex-1 min-w-0 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`flex items-center gap-1.5 px-3 h-8 text-xs shrink-0 cursor-pointer border-r border-[#3c3c3c] select-none transition-colors ${
                tab.id === activeTabId
                  ? 'bg-[#1e1e1e] text-white'
                  : 'text-[#858585] hover:text-[#ccc] hover:bg-[#2a2d2e]'
              }`}
              onClick={() => setActiveTabId(tab.id)}
            >
              <span>{tab.label}</span>
              {tabs.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                  className="text-[#555] hover:text-[#ccc] transition-colors"
                  title="Close tab"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            title="New terminal tab"
            className="flex items-center justify-center h-8 w-8 shrink-0 text-[#858585] hover:text-white transition-colors border-r border-[#3c3c3c]"
          >
            <Plus size={13} />
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-0.5 px-2 shrink-0">
          <button
            onClick={cycleTheme}
            title={`Theme: ${theme.name} — click to cycle`}
            className="text-[10px] text-[#858585] hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-[#3c3c3c]"
          >
            {theme.name}
          </button>
          <button
            onClick={clearActive}
            title="Clear terminal"
            className="text-[10px] text-[#858585] hover:text-white transition-colors px-1.5 py-0.5 rounded hover:bg-[#3c3c3c]"
          >
            Clear
          </button>
          <button
            onClick={onClose}
            title="Close terminal"
            className="text-[#858585] hover:text-white transition-colors p-0.5 ml-0.5"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Sessions — all mounted, inactive ones are hidden so state is preserved */}
      {tabs.map(tab => (
        <div
          key={tab.id}
          className={`flex-col flex-1 min-h-0 ${tab.id === activeTabId ? 'flex' : 'hidden'}`}
        >
          <TerminalSession
            ref={handle => {
              if (handle) sessionRefs.current.set(tab.id, handle);
              else sessionRefs.current.delete(tab.id);
            }}
            files={files}
            fileContents={fileContents}
            onFileWrite={onFileWrite}
            isActive={tab.id === activeTabId}
            theme={theme}
          />
        </div>
      ))}
    </div>
  );
}

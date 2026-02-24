'use client';

import type { FileMeta } from './utils';
import { getLanguage } from './utils';
import { useSettings } from './SettingsContext';

interface StatusBarProps {
  file: FileMeta | null;
  line: number;
  col: number;
  saveStatus: 'saved' | 'saving' | 'idle';
  isGuest: boolean;
}

export default function StatusBar({ file, line, col, saveStatus, isGuest }: StatusBarProps) {
  const { settings, updateSettings } = useSettings();
  const language = file ? (file.language ?? getLanguage(file.name)) : null;

  return (
    <div className="flex items-center justify-between h-6 bg-[#007acc] text-white text-[11px] px-3 shrink-0 select-none">
      <div className="flex items-center gap-3">
        {isGuest && (
          <span className="bg-white/20 px-1.5 rounded text-[10px] font-semibold tracking-wide">
            GUEST — Read Only
          </span>
        )}
        {file && (
          <span className="opacity-90">{file.path}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        {saveStatus === 'saving' && <span className="opacity-80">Saving…</span>}
        {saveStatus === 'saved' && <span className="opacity-80">Saved</span>}
        {file && <span className="opacity-80">Ln {line}, Col {col}</span>}
        {language && (
          <span className="capitalize opacity-90">{language}</span>
        )}
        {file && (
          <button
            onClick={() => updateSettings({ showMinimap: !settings.showMinimap })}
            title={settings.showMinimap ? 'Hide minimap' : 'Show minimap'}
            className={`transition-opacity hover:opacity-100 ${settings.showMinimap ? 'opacity-90' : 'opacity-40'}`}
          >
            Map
          </button>
        )}
        {file && (
          <button
            onClick={() => updateSettings({ stickyScroll: !settings.stickyScroll })}
            title={settings.stickyScroll ? 'Disable sticky scroll' : 'Enable sticky scroll'}
            className={`transition-opacity hover:opacity-100 ${settings.stickyScroll ? 'opacity-90' : 'opacity-40'}`}
          >
            Sticky
          </button>
        )}
        <span className="opacity-70">RMH Code</span>
      </div>
    </div>
  );
}

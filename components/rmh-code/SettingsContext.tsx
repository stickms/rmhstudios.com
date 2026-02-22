'use client';

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EditorSettings {
  editorTheme: string;
  fontFamily: string;
  fontSize: number;
  showMinimap: boolean;
  stickyScroll: boolean;
  terminalThemeIndex: number;
}

interface SettingsContextValue {
  settings: EditorSettings;
  updateSettings: (patch: Partial<EditorSettings>) => void;
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULTS: EditorSettings = {
  editorTheme: 'vs-dark',
  fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  fontSize: 14,
  showMinimap: true,
  stickyScroll: false,
  terminalThemeIndex: 0,
};

const SETTINGS_KEY = 'rmhcode:settings';

// ─── Context ─────────────────────────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULTS,
  updateSettings: () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<EditorSettings>(DEFAULTS);

  // Load persisted settings after mount (avoids SSR/localStorage mismatch)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        setSettings(prev => ({ ...prev, ...JSON.parse(stored) }));
      }
    } catch { /* ignore parse errors */ }
  }, []);

  // Persist whenever settings change
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch { /* ignore quota errors */ }
  }, [settings]);

  function updateSettings(patch: Partial<EditorSettings>) {
    setSettings(prev => ({ ...prev, ...patch }));
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useSettings() {
  return useContext(SettingsContext);
}

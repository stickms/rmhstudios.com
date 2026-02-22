'use client';

import { X } from 'lucide-react';
import { useSettings } from './SettingsContext';
import { ALL_THEMES } from './themes';

// ─── Terminal themes (must match Terminal.tsx) ────────────────────────────────

const TERMINAL_THEME_NAMES = ['Dark', 'Dim', 'Matrix'];

const FONT_FAMILIES = [
  { label: 'JetBrains Mono', value: '"JetBrains Mono", monospace' },
  { label: 'Fira Code',      value: '"Fira Code", monospace' },
  { label: 'Cascadia Code',  value: '"Cascadia Code", monospace' },
  { label: 'Consolas',       value: 'Consolas, monospace' },
  { label: 'Menlo',          value: 'Menlo, monospace' },
  { label: 'Courier New',    value: '"Courier New", monospace' },
  { label: 'System Mono',    value: 'monospace' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold tracking-widest text-[#858585] uppercase mb-2">
      {children}
    </p>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button
      onClick={onChange}
      className="flex items-center gap-2.5 text-sm text-[#ccc] hover:text-white transition-colors w-full py-0.5"
    >
      <div
        className={`relative w-8 h-4 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-[#007acc]' : 'bg-[#3c3c3c]'
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
      {label}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface SettingsPanelProps {
  onClose: () => void;
}

export default function SettingsPanel({ onClose }: SettingsPanelProps) {
  const { settings, updateSettings } = useSettings();

  return (
    <div className="w-72 shrink-0 flex flex-col bg-[#252526] border-l border-[#3c3c3c] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-[#3c3c3c] shrink-0">
        <span className="text-sm font-semibold text-white">Settings</span>
        <button
          onClick={onClose}
          title="Close settings"
          className="text-[#858585] hover:text-white transition-colors p-0.5 rounded"
        >
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-5">

        {/* ── Theme ── */}
        <section>
          <SectionHeader>Theme</SectionHeader>
          <div className="grid grid-cols-3 gap-1.5">
            {ALL_THEMES.map(theme => (
              <button
                key={theme.id}
                onClick={() => updateSettings({ editorTheme: theme.id })}
                title={theme.label}
                className={`flex flex-col rounded overflow-hidden border-2 transition-colors focus:outline-none ${
                  settings.editorTheme === theme.id
                    ? 'border-[#007acc]'
                    : 'border-transparent hover:border-[#555]'
                }`}
              >
                {/* Mini code preview */}
                <div
                  className="w-full p-1.5 flex flex-col gap-0.5 text-[7px] leading-tight font-mono"
                  style={{ background: theme.bg, color: theme.text }}
                >
                  <span style={{ color: theme.accent }}>function</span>
                  <span style={{ opacity: 0.55 }}>// comment</span>
                  <span style={{ color: theme.accent, opacity: 0.75 }}>&quot;string&quot;</span>
                </div>
                {/* Theme name */}
                <div className="text-center text-[8px] py-0.5 bg-[#1e1e1e] text-[#aaa] truncate px-0.5 leading-tight">
                  {theme.label}
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Font Family ── */}
        <section>
          <SectionHeader>Font Family</SectionHeader>
          <select
            value={settings.fontFamily}
            onChange={e => updateSettings({ fontFamily: e.target.value })}
            className="w-full bg-[#3c3c3c] border border-[#555] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#007acc]"
          >
            {FONT_FAMILIES.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </section>

        {/* ── Font Size ── */}
        <section>
          <SectionHeader>Font Size</SectionHeader>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={settings.fontSize}
              onChange={e => updateSettings({ fontSize: Number(e.target.value) })}
              className="flex-1 accent-[#007acc]"
            />
            <span className="text-sm text-[#ccc] w-8 text-right shrink-0">{settings.fontSize}px</span>
          </div>
        </section>

        {/* ── Editor ── */}
        <section>
          <SectionHeader>Editor</SectionHeader>
          <div className="space-y-1.5">
            <Toggle
              checked={settings.showMinimap}
              onChange={() => updateSettings({ showMinimap: !settings.showMinimap })}
              label="Minimap"
            />
            <Toggle
              checked={settings.stickyScroll}
              onChange={() => updateSettings({ stickyScroll: !settings.stickyScroll })}
              label="Sticky Scroll"
            />
          </div>
        </section>

        {/* ── Terminal Theme ── */}
        <section>
          <SectionHeader>Terminal Theme</SectionHeader>
          <div className="flex gap-1.5">
            {TERMINAL_THEME_NAMES.map((name, idx) => (
              <button
                key={name}
                onClick={() => updateSettings({ terminalThemeIndex: idx })}
                className={`flex-1 text-xs py-1 rounded border transition-colors ${
                  settings.terminalThemeIndex === idx
                    ? 'border-[#007acc] text-white bg-[#007acc20]'
                    : 'border-[#3c3c3c] text-[#858585] hover:text-white hover:border-[#555]'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

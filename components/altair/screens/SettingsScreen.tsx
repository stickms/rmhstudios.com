/**
 * SettingsScreen — Theme, keybinds, and gameplay options.
 */
'use client';

import { useState, useCallback, useEffect } from 'react';
import { Sun, Moon, RotateCcw } from 'lucide-react';
import { useAltairSettingsStore, Keybinds } from '@/lib/altair/stores/settings-store';
import { useAltairMetaStore } from '@/lib/altair/stores/meta-store';

interface SettingsScreenProps {
  onBack: () => void;
}

const KEY_LABELS: Record<string, string> = {
  KeyW: 'W', KeyA: 'A', KeyS: 'S', KeyD: 'D',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Space: 'Space', Escape: 'Esc', ShiftLeft: 'L.Shift', ShiftRight: 'R.Shift',
  ControlLeft: 'L.Ctrl', ControlRight: 'R.Ctrl',
};

function keyLabel(code: string): string {
  return KEY_LABELS[code] || code.replace('Key', '').replace('Digit', '');
}

export default function SettingsScreen({ onBack }: SettingsScreenProps) {
  const { theme, keybinds, screenShake, doubleTime, setTheme, setKeybind, resetKeybinds, setScreenShake, setDoubleTime } = useAltairSettingsStore();
  const doubleTimeUnlocked = useAltairMetaStore((s) => s.doubleTimeUnlocked);
  const [rebinding, setRebinding] = useState<keyof Keybinds | null>(null);

  useEffect(() => {
    if (!rebinding) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      setKeybind(rebinding, e.code);
      setRebinding(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [rebinding, setKeybind]);

  const bindActions: { key: keyof Keybinds; label: string }[] = [
    { key: 'up', label: 'Move Up' },
    { key: 'down', label: 'Move Down' },
    { key: 'left', label: 'Move Left' },
    { key: 'right', label: 'Move Right' },
    { key: 'pause', label: 'Pause' },
  ];

  return (
    <div className="altair-parchment flex flex-col min-h-[calc(100vh-56px)] px-4 py-8 max-w-lg mx-auto">
      <h2 className="text-2xl font-bold text-(--altair-text) mb-6">Settings</h2>

      {/* Theme */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-(--altair-text-muted) uppercase tracking-wider mb-3">Theme</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setTheme('dark')}
            className={`flex-1 py-2.5 rounded-lg border font-medium transition-colors flex items-center justify-center gap-2 ${
              theme === 'dark'
                ? 'border-(--altair-accent) bg-(--altair-accent-dim) text-(--altair-accent)'
                : 'border-(--altair-border) bg-(--altair-surface) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
            }`}
          >
            <Moon size={16} /> Dark
          </button>
          <button
            onClick={() => setTheme('light')}
            className={`flex-1 py-2.5 rounded-lg border font-medium transition-colors flex items-center justify-center gap-2 ${
              theme === 'light'
                ? 'border-(--altair-accent) bg-(--altair-accent-dim) text-(--altair-accent)'
                : 'border-(--altair-border) bg-(--altair-surface) text-(--altair-text-muted) hover:bg-(--altair-surface-hover)'
            }`}
          >
            <Sun size={16} /> Light
          </button>
        </div>
      </section>

      {/* Keybinds */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-(--altair-text-muted) uppercase tracking-wider">Keybinds</h3>
          <button
            onClick={resetKeybinds}
            className="text-xs text-(--altair-text-dim) hover:text-(--altair-accent) transition-colors flex items-center gap-1"
          >
            <RotateCcw size={12} /> Reset
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {bindActions.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-(--altair-surface) border border-(--altair-border)"
            >
              <span className="text-sm text-(--altair-text)">{label}</span>
              <button
                onClick={() => setRebinding(key)}
                className={`px-3 py-1 rounded text-sm font-mono font-bold transition-colors ${
                  rebinding === key
                    ? 'bg-(--altair-accent) text-white animate-pulse'
                    : 'bg-(--altair-surface-hover) text-(--altair-text) hover:bg-(--altair-surface-active)'
                }`}
                style={{ fontFamily: 'var(--altair-font-mono)' }}
              >
                {rebinding === key ? 'Press a key...' : keyLabel(keybinds[key])}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Gameplay */}
      <section className="mb-6">
        <h3 className="text-sm font-semibold text-(--altair-text-muted) uppercase tracking-wider mb-3">Gameplay</h3>
        <div className="flex flex-col gap-2">
          <label className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-(--altair-surface) border border-(--altair-border) cursor-pointer">
            <span className="text-sm text-(--altair-text)">Screen Shake</span>
            <input
              type="checkbox"
              checked={screenShake}
              onChange={(e) => setScreenShake(e.target.checked)}
              className="w-4 h-4 accent-(--altair-accent)"
            />
          </label>
          {doubleTimeUnlocked && (
            <label className="flex items-center justify-between py-2.5 px-4 rounded-lg bg-(--altair-surface) border border-(--altair-border) cursor-pointer">
              <span className="text-sm text-(--altair-text)">
                Double Time (2× speed)
              </span>
              <input
                type="checkbox"
                checked={doubleTime}
                onChange={(e) => setDoubleTime(e.target.checked)}
                className="w-4 h-4 accent-(--altair-accent)"
              />
            </label>
          )}
        </div>
      </section>

      {/* Back button */}
      <button
        onClick={onBack}
        className="mt-auto py-3 rounded-xl font-semibold text-(--altair-text) bg-(--altair-surface) border border-(--altair-border) hover:bg-(--altair-surface-hover) transition-colors"
      >
        Back
      </button>
    </div>
  );
}

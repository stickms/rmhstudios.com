/**
 * ShortcutsOverlay — Keyboard shortcuts help modal.
 *
 * Shows all available keyboard shortcuts for the video player and room.
 * Toggled via Shift+? or the shortcuts button.
 */
'use client';

import { X } from 'lucide-react';

interface ShortcutsOverlayProps {
  onClose: () => void;
}

const SHORTCUT_GROUPS = [
  {
    title: 'Playback',
    shortcuts: [
      { keys: ['Space'], label: 'Play / Pause' },
      { keys: ['←'], label: 'Seek back 10s' },
      { keys: ['→'], label: 'Seek forward 10s' },
      { keys: ['N'], label: 'Skip to next' },
    ],
  },
  {
    title: 'Audio & Video',
    shortcuts: [
      { keys: ['↑'], label: 'Volume up' },
      { keys: ['↓'], label: 'Volume down' },
      { keys: ['M'], label: 'Toggle mute' },
      { keys: ['C'], label: 'Toggle captions' },
    ],
  },
  {
    title: 'Display',
    shortcuts: [
      { keys: ['F'], label: 'Toggle fullscreen' },
      { keys: ['T'], label: 'Toggle theater mode' },
      { keys: ['P'], label: 'Toggle picture-in-picture' },
      { keys: ['?'], label: 'Show this help' },
    ],
  },
];

export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  return (
    <div className="rmhtube-shortcuts-overlay" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-(--rmhtube-text)">Keyboard Shortcuts</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-(--rmhtube-text-muted) hover:text-(--rmhtube-text)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider mb-2 text-(--rmhtube-text-dim)">
                {group.title}
              </h4>
              <div className="space-y-1.5">
                {group.shortcuts.map((s) => (
                  <div key={s.label} className="flex items-center justify-between text-sm">
                    <span className="text-(--rmhtube-text-muted)">{s.label}</span>
                    <div className="flex items-center gap-1">
                      {s.keys.map((key) => (
                        <kbd key={key}>{key}</kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-5 text-xs text-center text-(--rmhtube-text-dim)">
          Shortcuts are disabled when a text input is focused
        </p>
      </div>
    </div>
  );
}

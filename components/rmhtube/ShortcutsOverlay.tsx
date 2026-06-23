/**
 * ShortcutsOverlay — Keyboard shortcuts help modal.
 *
 * Shows all available keyboard shortcuts for the video player and room.
 * Toggled via Shift+? or the shortcuts button.
 */
'use client';

import { X } from 'lucide-react';
import { useTranslation } from "react-i18next";

interface ShortcutsOverlayProps {
  onClose: () => void;
}

export default function ShortcutsOverlay({ onClose }: ShortcutsOverlayProps) {
  const { t } = useTranslation("c-rmhtube");

  const SHORTCUT_GROUPS = [
    {
      title: t("shortcuts-group-playback", { defaultValue: "Playback" }),
      shortcuts: [
        { keys: ['Space'], label: t("shortcut-play-pause", { defaultValue: "Play / Pause" }) },
        { keys: ['←'], label: t("shortcut-seek-back", { defaultValue: "Seek back 10s" }) },
        { keys: ['→'], label: t("shortcut-seek-forward", { defaultValue: "Seek forward 10s" }) },
        { keys: ['N'], label: t("shortcut-skip-next", { defaultValue: "Skip to next" }) },
      ],
    },
    {
      title: t("shortcuts-group-audio-video", { defaultValue: "Audio & Video" }),
      shortcuts: [
        { keys: ['↑'], label: t("shortcut-volume-up", { defaultValue: "Volume up" }) },
        { keys: ['↓'], label: t("shortcut-volume-down", { defaultValue: "Volume down" }) },
        { keys: ['M'], label: t("shortcut-toggle-mute", { defaultValue: "Toggle mute" }) },
        { keys: ['C'], label: t("shortcut-toggle-captions", { defaultValue: "Toggle captions" }) },
      ],
    },
    {
      title: t("shortcuts-group-display", { defaultValue: "Display" }),
      shortcuts: [
        { keys: ['F'], label: t("shortcut-toggle-fullscreen", { defaultValue: "Toggle fullscreen" }) },
        { keys: ['T'], label: t("shortcut-toggle-theater", { defaultValue: "Toggle theater mode" }) },
        { keys: ['P'], label: t("shortcut-toggle-pip", { defaultValue: "Toggle picture-in-picture" }) },
        { keys: ['?'], label: t("shortcut-show-help", { defaultValue: "Show this help" }) },
      ],
    },
  ];

  return (
    <div className="rmhtube-shortcuts-overlay" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full max-w-md rounded-xl border border-(--rmhtube-border) bg-(--rmhtube-surface) p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-(--rmhtube-text)">{t("keyboard-shortcuts-title", { defaultValue: "Keyboard Shortcuts" })}</h3>
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
          {t("shortcuts-disabled-hint", { defaultValue: "Shortcuts are disabled when a text input is focused" })}
        </p>
      </div>
    </div>
  );
}

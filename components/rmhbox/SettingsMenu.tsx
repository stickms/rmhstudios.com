/**
 * SettingsMenu — Settings panel for RMHbox.
 *
 * Trigger button is a static circle intended for placement in the header.
 * Panel opens centered on screen as a modal.
 *
 * Contains audio controls (master, SFX, music volume)
 * and a light/dark theme toggle.
 *
 * Reads/writes to the Zustand store (persisted to localStorage).
 */
'use client';

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Settings, Volume2, VolumeX, Sun, Moon, X } from 'lucide-react';
import { useRMHboxStore } from '@/lib/rmhbox/store';

interface SettingsMenuProps {
  /** Current theme: 'dark' | 'light' */
  theme: 'dark' | 'light';
  /** Toggle theme callback */
  onToggleTheme: () => void;
}

export default function SettingsMenu({ theme, onToggleTheme }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const settings = useRMHboxStore((s) => s.settings);
  const updateSettings = useRMHboxStore((s) => s.updateSettings);

  const handleVolumeChange = useCallback(
    (key: 'masterVolume' | 'sfxVolume' | 'musicVolume', value: number) => {
      updateSettings({ [key]: value });
    },
    [updateSettings],
  );

  return (
    <>
      {/* Trigger button — static circle for header placement */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-10 w-10 items-center justify-center rounded-full transition-all hover:scale-110 active:scale-95"
        style={{
          backgroundColor: 'var(--rmhbox-surface)',
          border: '1px solid var(--rmhbox-border)',
          color: 'var(--rmhbox-text-muted)',
        }}
        aria-label="Settings"
        title="Settings"
      >
        <Settings className="h-5 w-5" />
      </button>

      {/* Modal — portaled to body to escape header containing block */}
      {isOpen && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="rmhbox-overlay fixed inset-0 z-60 bg-black/30"
            onClick={() => setIsOpen(false)}
          />

          {/* Settings panel — centered on screen */}
          <div
            className="rmhbox-modal fixed inset-x-4 top-1/2 z-70 mx-auto max-w-sm -translate-y-1/2 rounded-xl border p-4 shadow-xl"
            style={{
              backgroundColor: 'var(--rmhbox-surface)',
              borderColor: 'var(--rmhbox-border)',
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold uppercase tracking-wider text-(--rmhbox-text-muted)">
                Settings
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded p-1 text-(--rmhbox-text-muted) transition-colors hover:text-(--rmhbox-text)"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-(--rmhbox-text)">Theme</span>
                <button
                  onClick={onToggleTheme}
                  className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    backgroundColor: 'var(--rmhbox-bg)',
                    color: 'var(--rmhbox-text)',
                    border: '1px solid var(--rmhbox-border)',
                  }}
                >
                  {theme === 'dark' ? (
                    <>
                      <Moon className="h-3.5 w-3.5" /> Dark
                    </>
                  ) : (
                    <>
                      <Sun className="h-3.5 w-3.5" /> Light
                    </>
                  )}
                </button>
              </div>

              {/* Divider */}
              <hr style={{ borderColor: 'var(--rmhbox-border)' }} />

              {/* Audio Section */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-(--rmhbox-text-muted)">
                  {settings.masterVolume === 0 ? (
                    <VolumeX className="h-3.5 w-3.5" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5" />
                  )}
                  Audio
                </div>

                {/* Master Volume */}
                <VolumeSlider
                  label="Master"
                  value={settings.masterVolume}
                  onChange={(v) => handleVolumeChange('masterVolume', v)}
                />

                {/* SFX Volume */}
                <VolumeSlider
                  label="SFX"
                  value={settings.sfxVolume}
                  onChange={(v) => handleVolumeChange('sfxVolume', v)}
                />

                {/* Music Volume */}
                <VolumeSlider
                  label="Music"
                  value={settings.musicVolume}
                  onChange={(v) => handleVolumeChange('musicVolume', v)}
                />
              </div>
            </div>
          </div>
        </>,
        document.querySelector('.rmhbox-theme') ?? document.body,
      )}
    </>
  );
}

/** Reusable volume slider with label and percentage display. */
function VolumeSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3">
      <span className="w-12 text-xs text-(--rmhbox-text)">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-(--rmhbox-accent)"
        style={{ height: '4px' }}
      />
      <span className="w-8 text-right text-xs tabular-nums text-(--rmhbox-text-muted)">
        {Math.round(value * 100)}
      </span>
    </label>
  );
}

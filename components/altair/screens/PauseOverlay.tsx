/**
 * PauseOverlay — Displayed when the game is paused.
 */
'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useKeyboardNav } from '@/lib/altair/hooks/use-keyboard-nav';

interface PauseOverlayProps {
  onResume: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export default function PauseOverlay({ onResume, onSettings, onQuit }: PauseOverlayProps) {
  const { t } = useTranslation("c-altair");
  const actions = useMemo(() => [onResume, onSettings, onQuit], [onResume, onSettings, onQuit]);
  const { focusedIndex } = useKeyboardNav({
    itemCount: 3,
    onSelect: (i) => actions[i](),
    orientation: 'vertical',
  });

  const focusClass = (i: number) =>
    focusedIndex === i ? 'ring-2 ring-(--altair-accent)/50 scale-[1.03]' : '';

  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center altair-overlay">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="altair-parchment-surface absolute inset-0 sm:relative sm:inset-auto z-10 flex flex-col items-center justify-center bg-(--altair-surface) sm:rounded-2xl sm:p-8 p-6">
        <div className="text-(--altair-text-dim) text-xs font-mono tracking-[0.4em] uppercase mb-2">
          {t("game-paused", { defaultValue: "Game Paused" })}
        </div>
        <h2 className="text-5xl font-black text-(--altair-text) mb-8 tracking-wider">{t("paused-heading", { defaultValue: "PAUSED" })}</h2>
        <div className="flex flex-col gap-3 w-56 sm:w-48">
          <button
            onClick={onResume}
            className={`py-3 bg-(--altair-accent) hover:bg-(--altair-accent-hover) text-white font-bold rounded-lg tracking-widest uppercase transition-all ${focusClass(0)}`}
          >
            {t("resume", { defaultValue: "Resume" })}
          </button>
          <button
            onClick={onSettings}
            data-altair-sfx="menu_open"
            className={`py-3 bg-(--altair-surface-hover) hover:bg-(--altair-surface) border border-(--altair-border) text-(--altair-text) font-bold rounded-lg tracking-widest uppercase transition-all ${focusClass(1)}`}
          >
            {t("settings", { defaultValue: "Settings" })}
          </button>
          <button
            onClick={onQuit}
            data-altair-sfx="menu_back"
            className={`py-3 bg-(--altair-surface-hover) hover:bg-(--altair-surface) border border-(--altair-border) text-(--altair-text-muted) hover:text-(--altair-text) font-bold rounded-lg tracking-widest uppercase transition-all text-sm ${focusClass(2)}`}
          >
            {t("quit-to-menu", { defaultValue: "Quit to Menu" })}
          </button>
        </div>
        <div className="text-(--altair-text-dim) text-xs font-mono mt-6">{t("keyboard-hint", { defaultValue: "[Esc] resume · [W/S] navigate · [Space] select" })}</div>
      </div>
    </div>
  );
}

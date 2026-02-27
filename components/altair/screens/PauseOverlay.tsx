/**
 * PauseOverlay — Displayed when the game is paused.
 */
'use client';

interface PauseOverlayProps {
  onResume: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export default function PauseOverlay({ onResume, onSettings, onQuit }: PauseOverlayProps) {
  return (
    <div className="absolute inset-0 z-50 flex flex-col items-center justify-center altair-overlay">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="altair-parchment-surface relative z-10 flex flex-col items-center bg-(--altair-surface) rounded-2xl p-8">
        <div className="text-(--altair-text-dim) text-xs font-mono tracking-[0.4em] uppercase mb-2">
          Game Paused
        </div>
        <h2 className="text-5xl font-black text-(--altair-text) mb-8 tracking-wider">PAUSED</h2>
        <div className="flex flex-col gap-3 w-48">
          <button
            onClick={onResume}
            className="py-3 bg-(--altair-accent) hover:bg-(--altair-accent-hover) text-white font-bold rounded-lg tracking-widest uppercase transition-colors"
          >
            Resume
          </button>
          <button
            onClick={onSettings}
            className="py-3 bg-(--altair-surface) hover:bg-(--altair-surface-hover) border border-(--altair-border) text-(--altair-text) font-bold rounded-lg tracking-widest uppercase transition-colors"
          >
            Settings
          </button>
          <button
            onClick={onQuit}
            className="py-3 bg-(--altair-surface) hover:bg-(--altair-surface-hover) border border-(--altair-border) text-(--altair-text-muted) hover:text-(--altair-text) font-bold rounded-lg tracking-widest uppercase transition-colors text-sm"
          >
            Quit to Menu
          </button>
        </div>
        <div className="text-(--altair-text-dim) text-xs font-mono mt-6">[Esc] to resume</div>
      </div>
    </div>
  );
}

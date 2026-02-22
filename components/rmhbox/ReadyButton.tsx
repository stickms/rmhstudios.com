/**
 * ReadyButton — Toggle button for player ready/not-ready state.
 *
 * Shows a pulse animation when not ready, solid green when ready.
 *
 * Props:
 *   isReady: boolean — Current ready state
 *   onToggle: () => void — Callback to toggle ready state
 */
'use client';

interface ReadyButtonProps {
  isReady: boolean;
  onToggle: () => void;
}

export default function ReadyButton({ isReady, onToggle }: ReadyButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`relative rounded-xl px-8 py-3 text-lg font-bold transition-all duration-200 ${
        isReady
          ? 'bg-[var(--rmhbox-success)] text-black hover:brightness-110'
          : 'bg-[var(--rmhbox-accent)] text-white hover:bg-[var(--rmhbox-accent-hover)]'
      }`}
    >
      {/* Pulse ring when not ready */}
      {!isReady && (
        <span className="absolute inset-0 animate-ping rounded-xl bg-[var(--rmhbox-accent)] opacity-30" />
      )}
      <span className="relative z-10">{isReady ? '✓ Ready!' : 'Ready Up'}</span>
    </button>
  );
}

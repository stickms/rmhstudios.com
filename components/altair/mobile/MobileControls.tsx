/**
 * MobileControls — Pause button for mobile.
 */
'use client';

import { Pause } from 'lucide-react';

interface MobileControlsProps {
  onPause: () => void;
}

export default function MobileControls({ onPause }: MobileControlsProps) {
  return (
    <div
      className="absolute z-40 pointer-events-auto"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 96px)',
        right: 'calc(env(safe-area-inset-right, 0px) + 12px)',
      }}
    >
      <button
        onClick={onPause}
        className="w-10 h-10 rounded-full bg-(--altair-hud-scrim)/40 border border-(--altair-hud-ink)/20 flex items-center justify-center text-(--altair-hud-ink)/60 hover:text-(--altair-hud-ink) transition-colors"
      >
        <Pause size={18} />
      </button>
    </div>
  );
}

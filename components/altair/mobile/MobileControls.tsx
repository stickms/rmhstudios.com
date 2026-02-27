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
    <div className="absolute top-24 right-3 z-40 pointer-events-auto">
      <button
        onClick={onPause}
        className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white/60 hover:text-white transition-colors"
      >
        <Pause size={18} />
      </button>
    </div>
  );
}

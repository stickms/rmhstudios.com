"use client";

import { useState, useEffect, useCallback } from "react";
import { MusicManager } from "@/lib/house-always-wins/music";

interface MenuOverlayProps {
  open: boolean;
  onClose: () => void;
}

export function MenuOverlay({ open, onClose }: MenuOverlayProps) {
  const [volume, setVolume] = useState(() => MusicManager.getVolume());

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    MusicManager.setVolume(v);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.code === "KeyM" || e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-neutral-700/50 rounded-xl p-6 w-72 shadow-2xl">
        <h2 className="text-amber-100/90 text-lg font-bold tracking-wide mb-6 text-center">
          Menu
        </h2>

        {/* Volume */}
        <div className="mb-6">
          <label className="text-neutral-400 text-xs font-mono tracking-widest uppercase block mb-2">
            Music Volume
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={handleVolumeChange}
              className="flex-1 accent-amber-700 h-1 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-neutral-500 text-xs font-mono w-8 text-right">
              {Math.round(volume * 100)}
            </span>
          </div>
        </div>

        {/* Controls reference */}
        <div className="mb-6 text-neutral-500 text-xs font-mono space-y-1">
          <div>WASD / Arrows &mdash; Move</div>
          <div>Space &mdash; Jump</div>
          <div>E &mdash; Interact</div>
          <div>M &mdash; Menu</div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 border border-neutral-600/30 text-neutral-300 text-sm font-mono rounded-lg transition-colors"
        >
          Resume [M]
        </button>
      </div>
    </div>
  );
}

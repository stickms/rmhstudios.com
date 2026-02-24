/**
 * FakeAdOverlay — Fake ad popup overlay for Scroll Soul.
 *
 * Renders a fake advertisement that obscures the game canvas.
 * Contains two close buttons:
 *   - A large, prominent fake "X" that tricks players into clicking
 *   - A small, hard-to-find real "X" that properly dismisses the ad
 *
 * On any click, captures the click position and calls onClose
 * so the server can determine whether the player was tricked.
 *
 * Props:
 *   ad: SCActiveAd — Ad data from the server (template, buttons, id)
 *   onClose: (adId, clickPosition) => void — Callback when ad is clicked
 */
'use client';

import { useCallback } from 'react';
import { motion } from 'framer-motion';
import type { SCActiveAd } from './ScrollSoulGame';

// ─── Props ───────────────────────────────────────────────────────

interface FakeAdOverlayProps {
  ad: SCActiveAd;
  onClose: (adId: string, clickPosition: { x: number; y: number }) => void;
}

// ─── Component ───────────────────────────────────────────────────

export default function FakeAdOverlay({ ad, onClose }: FakeAdOverlayProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickPosition = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      onClose(ad.adId, clickPosition);
    },
    [ad.adId, onClose],
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Ad container */}
      <div
        className="relative mx-4 w-full max-w-sm rounded-xl border-2 border-yellow-400/60 bg-gradient-to-b from-yellow-50 to-orange-50 p-6 shadow-2xl"
        onClick={handleClick}
        role="dialog"
        aria-label="Advertisement popup"
      >
        {/* Fake close button (large, prominent — the trap) */}
        <button
          className="absolute flex items-center justify-center rounded-full bg-red-500 text-xl font-bold text-white shadow-lg hover:bg-red-600"
          style={{
            top: ad.fakeCloseButton.y,
            right: ad.fakeCloseButton.x,
            width: ad.fakeCloseButton.size,
            height: ad.fakeCloseButton.size,
          }}
          aria-label="Close advertisement"
        >
          ✕
        </button>

        {/* Real close button (small, hard to find) */}
        <button
          className="absolute flex items-center justify-center text-gray-400/60 hover:text-gray-600"
          style={{
            top: ad.realCloseButton.y,
            right: ad.realCloseButton.x,
            width: ad.realCloseButton.size,
            height: ad.realCloseButton.size,
            fontSize: ad.realCloseButton.size * 0.6,
          }}
          aria-label="Close"
        >
          ×
        </button>

        {/* Ad content */}
        <div className="mt-4 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Sponsored
          </p>
          <h3 className="mt-2 text-lg font-extrabold text-gray-800">
            {ad.headline}
          </h3>
          <p className="mt-1 text-sm text-gray-600">
            {ad.body}
          </p>
          <div className="mt-4 rounded-lg bg-gradient-to-r from-orange-400 to-red-500 px-4 py-2 text-sm font-bold text-white">
            CLAIM NOW — FREE!!!
          </div>
          <p className="mt-2 text-[10px] text-gray-300">
            Ad · {ad.template}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

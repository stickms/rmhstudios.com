/**
 * HowToPlayContent.tsx — Signal Forge
 * ────────────────────────────────────
 * Reusable How-to-Play modal content. Used by both the landing screen and
 * the pause menu so the rules text is defined in exactly one place.
 */

'use client';

import React from 'react';

interface Props {
  /** Called when the user dismisses the modal. */
  onClose: () => void;
}

export function HowToPlayContent({ onClose }: Props) {
  return (
    <div className="w-full h-full bg-black bg-opacity-90 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div
        className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-400 p-8 rounded-lg max-w-2xl w-full max-h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-cyan-400">📖 How to Play</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-cyan-400 text-2xl font-bold">✕</button>
        </div>

        <div className="space-y-4 text-slate-300 text-sm">
          <section>
            <h3 className="text-lg font-bold text-cyan-300 mb-2">🎯 Objective</h3>
            <p>Survive escalating floors by defeating enemies with waveform cards. Build your deck, collect relics, and master signal patterns!</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-300 mb-2">🃏 Cards & Waveforms</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-red-400 font-bold">Pulse</span> — High damage, aggressive</li>
              <li><span className="text-green-400 font-bold">Sine</span> — Shield & healing</li>
              <li><span className="text-yellow-400 font-bold">Saw</span> — Utility & debuffs</li>
              <li><span className="text-purple-400 font-bold">Noise</span> — Static-based, chaotic</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-green-300 mb-2">🔗 Sequences</h3>
            <p>Each turn has a target sequence (e.g., Pulse → Sine → Saw). Match it by playing cards in order to trigger <span className="text-yellow-400 font-bold">Forge Burst</span> for massive bonus damage!</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-purple-300 mb-2">⚡ Energy & Tempo</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-yellow-400">Energy</span> — Spent to play cards. Refreshes each turn.</li>
              <li><span className="text-purple-400">Tempo</span> — Builds as you play cards. Adds bonus damage to all cards.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-red-300 mb-2">⚠️ Static & Glitch</h3>
            <p>Playing duplicate waveform types increases <span className="text-red-400">Static</span>. At threshold (4), a <span className="text-red-400">Glitch</span> card is injected into your deck — unplayable junk that clogs your hand!</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-orange-300 mb-2">🔮 Relics</h3>
            <p>Powerful passive items found in shops and as boss rewards. Stack multiple copies for stronger effects!</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-cyan-300 mb-2">🎮 Controls</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-cyan-400">Click</span> cards to play/unplay</li>
              <li><span className="text-cyan-400">1-9</span> — Quick-play cards by position</li>
              <li><span className="text-cyan-400">Q</span> — End turn</li>
              <li><span className="text-cyan-400">S</span> — Cycle hand sort mode</li>
              <li><span className="text-cyan-400">D / F</span> — View draw pile / discard pile</li>
              <li><span className="text-cyan-400">Esc</span> — Pause menu</li>
            </ul>
          </section>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 rounded-lg"
        >
          Got it!
        </button>
      </div>
    </div>
  );
}

/**
 * HowToPlayContent.tsx — Signal Forge
 * ────────────────────────────────────
 * Reusable How-to-Play modal content. Used by both the landing screen and
 * the pause menu so the rules text is defined in exactly one place.
 */

'use client';

import React from 'react';
import { useTranslation } from "react-i18next";

interface Props {
  /** Called when the user dismisses the modal. */
  onClose: () => void;
}

export function HowToPlayContent({ onClose }: Props) {
  const { t } = useTranslation("c-signal-forge");
  return (
    <div className="w-full h-full bg-black bg-opacity-90 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div
        className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-400 p-8 rounded-lg max-w-2xl w-full max-h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold text-cyan-400">{t("how-to-play-title", { defaultValue: "📖 How to Play" })}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-cyan-400 text-2xl font-bold">✕</button>
        </div>

        <div className="space-y-4 text-slate-300 text-sm">
          <section>
            <h3 className="text-lg font-bold text-cyan-300 mb-2">{t("objective-heading", { defaultValue: "🎯 Objective" })}</h3>
            <p>{t("objective-body", { defaultValue: "Survive escalating floors by defeating enemies with waveform cards. Build your deck, collect relics, and master signal patterns!" })}</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-yellow-300 mb-2">{t("cards-waveforms-heading", { defaultValue: "🃏 Cards & Waveforms" })}</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-red-400 font-bold">{t("waveform-pulse", { defaultValue: "Pulse" })}</span> {t("waveform-pulse-desc", { defaultValue: "— High damage, aggressive" })}</li>
              <li><span className="text-green-400 font-bold">{t("waveform-sine", { defaultValue: "Sine" })}</span> {t("waveform-sine-desc", { defaultValue: "— Shield & healing" })}</li>
              <li><span className="text-yellow-400 font-bold">{t("waveform-saw", { defaultValue: "Saw" })}</span> {t("waveform-saw-desc", { defaultValue: "— Utility & debuffs" })}</li>
              <li><span className="text-purple-400 font-bold">{t("waveform-noise", { defaultValue: "Noise" })}</span> {t("waveform-noise-desc", { defaultValue: "— Static-based, chaotic" })}</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-green-300 mb-2">{t("sequences-heading", { defaultValue: "🔗 Sequences" })}</h3>
            <p>{t("sequences-body-before", { defaultValue: "Each turn has a target sequence (e.g., Pulse → Sine → Saw). Match it by playing cards in order to trigger" })} <span className="text-yellow-400 font-bold">{t("forge-burst", { defaultValue: "Forge Burst" })}</span> {t("sequences-body-after", { defaultValue: "for massive bonus damage!" })}</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-purple-300 mb-2">{t("energy-tempo-heading", { defaultValue: "⚡ Energy & Tempo" })}</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-yellow-400">{t("energy-label", { defaultValue: "Energy" })}</span> {t("energy-desc", { defaultValue: "— Spent to play cards. Refreshes each turn." })}</li>
              <li><span className="text-purple-400">{t("tempo-label", { defaultValue: "Tempo" })}</span> {t("tempo-desc", { defaultValue: "— Builds as you play cards. Adds bonus damage to all cards." })}</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-red-300 mb-2">{t("static-glitch-heading", { defaultValue: "⚠️ Static & Glitch" })}</h3>
            <p>{t("static-glitch-body-before", { defaultValue: "Playing duplicate waveform types increases" })} <span className="text-red-400">{t("static-label", { defaultValue: "Static" })}</span>{t("static-glitch-body-middle", { defaultValue: ". At threshold (4), a" })} <span className="text-red-400">{t("glitch-label", { defaultValue: "Glitch" })}</span> {t("static-glitch-body-after", { defaultValue: "card is injected into your deck — unplayable junk that clogs your hand!" })}</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-orange-300 mb-2">{t("relics-heading", { defaultValue: "🔮 Relics" })}</h3>
            <p>{t("relics-body", { defaultValue: "Powerful passive items found in shops and as boss rewards. Stack multiple copies for stronger effects!" })}</p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-cyan-300 mb-2">{t("controls-heading", { defaultValue: "🎮 Controls" })}</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><span className="text-cyan-400">{t("control-click", { defaultValue: "Click" })}</span> {t("control-click-desc", { defaultValue: "cards to play/unplay" })}</li>
              <li><span className="text-cyan-400">1-9</span> {t("control-19-desc", { defaultValue: "— Quick-play cards by position" })}</li>
              <li><span className="text-cyan-400">Q</span> {t("control-q-desc", { defaultValue: "— End turn" })}</li>
              <li><span className="text-cyan-400">S</span> {t("control-s-desc", { defaultValue: "— Cycle hand sort mode" })}</li>
              <li><span className="text-cyan-400">D / F</span> {t("control-df-desc", { defaultValue: "— View draw pile / discard pile" })}</li>
              <li><span className="text-cyan-400">Esc</span> {t("control-esc-desc", { defaultValue: "— Pause menu" })}</li>
            </ul>
          </section>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 rounded-lg"
        >
          {t("got-it", { defaultValue: "Got it!" })}
        </button>
      </div>
    </div>
  );
}

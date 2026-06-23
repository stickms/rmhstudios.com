/**
 * StarterRelicScreen.tsx — Signal Forge
 * ──────────────────────────────────────
 * Displays three starter-relic options at the beginning of a new run.
 * The player must pick one before combat begins.
 */

'use client';

import React from 'react';
import { useTranslation } from "react-i18next";
import type { RelicTemplate } from '@/lib/signal-forge';
import { relicRarityBorder } from './uiHelpers';

interface Props {
  choices: RelicTemplate[];
  floor: number;
  onSelect: (relic: RelicTemplate) => void;
}

export function StarterRelicScreen({ choices, floor, onSelect }: Props) {
  const { t } = useTranslation("c-signal-forge");
  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-purple-500 p-8 rounded-lg max-w-3xl w-full shadow-2xl">
        <h2 className="text-3xl font-bold text-purple-400 mb-6 text-center">{t("choose-starter-relic", { defaultValue: "Choose Your Starter Relic" })}</h2>
        <p className="text-slate-400 text-center mb-6">{t("select-relic-prompt", { defaultValue: "Select a relic to begin your run with:" })}</p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {choices.map((relic) => (
            <button
              key={relic.key}
              onClick={() => onSelect(relic)}
              className={`border-l-4 p-4 rounded hover:brightness-125 transition cursor-pointer text-left ${relicRarityBorder(relic.rarity)}`}
            >
              <h3 className="text-lg font-bold text-slate-100 mb-1">🔮 {relic.name}</h3>
              <p className="text-xs text-slate-400 capitalize mb-2">{t("rarity-relic", { defaultValue: "{{rarity}} Relic", rarity: relic.rarity })}</p>
              <p className="text-sm text-slate-300">{relic.description}</p>
            </button>
          ))}
        </div>
        <p className="text-slate-500 text-xs text-center">{t("floor-label", { defaultValue: "Floor {{floor}}", floor })}</p>
      </div>
    </div>
  );
}

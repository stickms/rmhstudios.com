/**
 * MulliganOverlay.tsx — Signal Forge
 * ───────────────────────────────────
 * Frosted overlay shown at the start of combat allowing the player
 * to select up to 2 cards to redraw before their first turn.
 */

'use client';

import React from 'react';
import { useTranslation } from "react-i18next";

interface Props {
  selectedCount: number;
  onConfirm: () => void;
}

export function MulliganOverlay({ selectedCount, onConfirm }: Props) {
  const { t } = useTranslation("c-signal-forge");
  return (
    <>
      {/* Gray/blur overlay covering top through played area, blocking canvas interaction */}
      <div className="w-full h-[69%] bg-black/50 backdrop-blur-sm z-30">
        <div className="absolute inset-0 bg-linear-to-b from-transparent to-black/30" />
        {/* Mulligan banner centered in grayed-out area */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-linear-to-b from-purple-900 to-purple-950 border-2 border-purple-400 p-4 rounded-lg shadow-2xl max-w-md">
            <div className="text-center mb-3">
              <h3 className="text-xl font-bold text-purple-300 mb-1">♻️ {t("mulligan-phase", { defaultValue: "Mulligan Phase" })}</h3>
              <p className="text-sm text-purple-200">
                {t("mulligan-instructions", { defaultValue: "Click up to 2 cards below to replace them (selected: {{count}}/2)", count: selectedCount })}
              </p>
            </div>
            <div className="flex justify-center">
              <button
                onClick={onConfirm}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition"
              >
                {selectedCount > 0 ? t("redraw-count", { defaultValue: "Redraw {{count}}", count: selectedCount }) : t("keep-hand", { defaultValue: "Keep Hand" })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

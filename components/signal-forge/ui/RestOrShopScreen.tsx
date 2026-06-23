/**
 * RestOrShopScreen.tsx — Signal Forge
 * ────────────────────────────────────
 * Between-floor decision: rest to heal 50% HP, or visit the shop
 * (which also heals 25% HP).
 */

'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface Props {
  floor: number;
  playerHp: number;
  playerMaxHp: number;
  onChooseRest: () => void;
  onChooseShop: () => void;
}

export function RestOrShopScreen({ floor, playerHp, playerMaxHp, onChooseRest, onChooseShop }: Props) {
  const { t } = useTranslation("c-signal-forge");
  return (
    <div className="w-full h-full bg-black bg-opacity-75 flex items-center justify-center z-50 p-6">
      <div className="bg-linear-to-b from-slate-900 to-black border-2 border-cyan-500 p-8 rounded-lg max-w-md w-full shadow-2xl">
        <h2 className="text-3xl font-bold text-cyan-400 mb-6 text-center">{t("floor-cleared", { defaultValue: "Floor {{floor}} Cleared!", floor })}</h2>
        <p className="text-slate-300 text-center mb-6">{t("hp-display", { defaultValue: "HP: {{hp}}/{{maxHp}}", hp: playerHp, maxHp: playerMaxHp })}</p>
        <div className="grid grid-cols-2 gap-4">
          <Button
            onClick={onChooseRest}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-6 rounded-lg"
          >
            🛌 {t("rest-label", { defaultValue: "Rest" })}<br />
            <span className="text-sm font-normal">{t("rest-description", { defaultValue: "Heal 50%" })}</span>
          </Button>
          <Button
            onClick={onChooseShop}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 rounded-lg"
          >
            🏪 {t("shop-label", { defaultValue: "Shop" })}<br />
            <span className="text-sm font-normal">{t("shop-description", { defaultValue: "Heal 25% + Shop" })}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

import React from 'react';
import { useTranslation } from "react-i18next";
import { useWeatherStore } from '@/lib/store/useWeatherStore';

const colorBlindModes = [
  { key: 'none', label: 'Default' },
  { key: 'protanopia', label: 'Protanopia' },
  { key: 'deuteranopia', label: 'Deuteranopia' },
  { key: 'tritanopia', label: 'Tritanopia' },
];

export const ColorBlindSelector = () => {
  const { colorBlindMode, setColorBlindMode } = useWeatherStore();
  const { t } = useTranslation("c-rmh-weather");

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-yellow-400 mb-2">{t("color-blind-friendly-icons", { defaultValue: "Color-Blind Friendly Icons" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <div className="flex gap-4">
          {colorBlindModes.map(m => (
            <button
              key={m.key}
              className={`px-4 py-2 rounded-lg border ${colorBlindMode === m.key ? 'bg-yellow-500 text-white' : 'bg-white text-yellow-500'}`}
              onClick={() => setColorBlindMode(m.key as 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia')}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-500">{t("select-icon-mode", { defaultValue: "Select icon mode for color-blind accessibility." })}</div>
      </div>
    </div>
  );
};

import React from 'react';
import { useTranslation } from "react-i18next";
import { useWeatherStore } from '@/lib/store/useWeatherStore';

const themes = [
  { key: 'minimal', label: 'Minimal' },
  { key: 'nerdy', label: 'Nerdy/Data-heavy' },
  { key: 'lifestyle', label: 'Lifestyle' },
];

export const ThemeSelector = () => {
  const { t } = useTranslation("c-rmh-weather");
  const { theme, setTheme } = useWeatherStore();

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-purple-400 mb-2">{t("theme-selection", { defaultValue: "Theme Selection" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <div className="flex gap-4">
          {themes.map(themeItem => (
            <button
              key={themeItem.key}
              className={`px-4 py-2 rounded-lg border ${theme === themeItem.key ? 'bg-purple-500 text-white' : 'bg-white text-purple-500'}`}
              onClick={() => setTheme(themeItem.key as 'minimal' | 'nerdy' | 'lifestyle')}
            >
              {themeItem.key === 'minimal' && t("theme-minimal", { defaultValue: "Minimal" })}
              {themeItem.key === 'nerdy' && t("theme-nerdy", { defaultValue: "Nerdy/Data-heavy" })}
              {themeItem.key === 'lifestyle' && t("theme-lifestyle", { defaultValue: "Lifestyle" })}
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-500">{t("choose-dashboard-style", { defaultValue: "Choose your dashboard style." })}</div>
      </div>
    </div>
  );
};

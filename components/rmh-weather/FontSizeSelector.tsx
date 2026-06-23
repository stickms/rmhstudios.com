import React from 'react';
import { useTranslation } from "react-i18next";
import { useWeatherStore } from '@/lib/store/useWeatherStore';

export const FontSizeSelector = () => {
  const { t } = useTranslation("c-rmh-weather");
  const { fontSize, setFontSize } = useWeatherStore();

  const fontSizes = [
    { key: 'small', label: t("font-size-small", { defaultValue: "Small" }) },
    { key: 'medium', label: t("font-size-medium", { defaultValue: "Medium" }) },
    { key: 'large', label: t("font-size-large", { defaultValue: "Large" }) },
  ];

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-blue-400 mb-2">{t("font-size-accessibility", { defaultValue: "Font Size & Accessibility" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <div className="flex gap-4">
          {fontSizes.map(f => (
            <button
              key={f.key}
              className={`px-4 py-2 rounded-lg border ${fontSize === f.key ? 'bg-blue-500 text-white' : 'bg-white text-blue-500'}`}
              onClick={() => setFontSize(f.key as 'small' | 'medium' | 'large')}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-500">{t("adjust-font-size", { defaultValue: "Adjust font size for accessibility." })}</div>
      </div>
    </div>
  );
};

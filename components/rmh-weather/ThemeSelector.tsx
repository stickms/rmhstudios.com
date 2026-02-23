import React from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';

const themes = [
  { key: 'minimal', label: 'Minimal' },
  { key: 'nerdy', label: 'Nerdy/Data-heavy' },
  { key: 'lifestyle', label: 'Lifestyle' },
];

export const ThemeSelector = () => {
  const { theme, setTheme } = useWeatherStore();

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-purple-400 mb-2">Theme Selection</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <div className="flex gap-4">
          {themes.map(t => (
            <button
              key={t.key}
              className={`px-4 py-2 rounded-lg border ${theme === t.key ? 'bg-purple-500 text-white' : 'bg-white text-purple-500'}`}
              onClick={() => setTheme(t.key as 'minimal' | 'nerdy' | 'lifestyle')}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-500">Choose your dashboard style.</div>
      </div>
    </div>
  );
};

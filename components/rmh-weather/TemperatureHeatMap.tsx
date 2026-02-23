import React from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import { fetchWeather } from '@/lib/weather';

// Simple temperature heat map overlay (mocked for demo)
export const TemperatureHeatMap = () => {
  const { locations } = useWeatherStore();
  // For demo, generate random temps for each location
  const tempData = locations.map(loc => ({
    name: loc.name,
    temp: Math.round(10 + Math.random() * 20),
    lat: loc.lat,
    lon: loc.lon,
  }));

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-red-400 mb-2">Temperature Heat Map Overlay</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <div className="flex flex-wrap gap-4">
          {tempData.map((t) => (
            <div key={t.name} className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full" style={{ background: `rgba(255,0,0,${(t.temp-10)/30})` }}></div>
              <div className="mt-2 text-sm">{t.name}: {t.temp}°C</div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-xs text-gray-500">Demo: Overlay shows temperature intensity for saved locations.</div>
      </div>
    </div>
  );
};

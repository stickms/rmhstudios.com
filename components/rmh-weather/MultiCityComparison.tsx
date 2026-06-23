import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { searchCities, fetchWeather, WeatherData } from '@/lib/weather';

interface CityWeather {
  name: string;
  lat: number;
  lon: number;
  data: WeatherData | null;
}

export const MultiCityComparison = () => {
  const { t } = useTranslation("c-rmh-weather");
  const [cities, setCities] = useState<CityWeather[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAddCity() {
    setLoading(true);
    const results = await searchCities(input);
    if (results.length > 0) {
      const city = results[0];
      const data = await fetchWeather(city.lat, city.lon, 'metric');
      setCities(prev => [...prev, { name: city.name, lat: city.lat, lon: city.lon, data }]);
    }
    setLoading(false);
    setInput('');
  }

  function handleRemoveCity(name: string) {
    setCities(prev => prev.filter(c => c.name !== name));
  }

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-blue-400 mb-2">{t("multi-city-comparison", { defaultValue: "Multi-City Comparison" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather flex flex-col gap-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && !!input.trim() && handleAddCity()}
            placeholder={t("enter-city-name", { defaultValue: "Enter city name" })}
            className="flex-1 min-w-0 bg-weather-glass border border-weather rounded-xl px-3 py-2 text-weather placeholder:text-weather-muted focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm"
          />
          <button
            onClick={handleAddCity}
            disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-xl bg-blue-500/80 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors whitespace-nowrap"
          >
            {loading ? '…' : t("add", { defaultValue: "Add" })}
          </button>
        </div>

        {cities.length === 0 && (
          <p className="text-xs text-weather-muted text-center py-1">{t("add-cities-prompt", { defaultValue: "Add cities to compare weather." })}</p>
        )}

        <div className="flex flex-col gap-2">
          {cities.map(city => (
            <div key={city.name} className="bg-weather-glass rounded-xl px-3 py-2 border border-weather">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-weather text-sm">{city.name}</span>
                <button
                  onClick={() => handleRemoveCity(city.name)}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  {t("remove", { defaultValue: "Remove" })}
                </button>
              </div>
              {city.data ? (
                <div className="flex justify-between text-xs text-weather-muted">
                  <span>{Math.round(city.data.current.temp)}°C · {city.data.current.humidity}% hum</span>
                  <span>↑{Math.round(city.data.daily[0].maxTemp)}° ↓{Math.round(city.data.daily[0].minTemp)}°</span>
                </div>
              ) : (
                <div className="text-xs text-weather-muted">{t("loading", { defaultValue: "Loading…" })}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

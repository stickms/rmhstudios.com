import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { searchCities, fetchWeather, WeatherData } from '@/lib/weather';

const inputClass =
  'w-full bg-weather-glass border border-weather rounded-xl px-3 py-2 text-weather placeholder:text-weather-muted focus:outline-none focus:ring-1 focus:ring-blue-400 text-sm';

export const TripWeatherPlanner = () => {
  const { t } = useTranslation("c-rmh-weather");
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [city, setCity] = useState<{ name: string; lat: number; lon: number } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch() {
    setLoading(true);
    const results = await searchCities(destination);
    if (results.length > 0) {
      const c = results[0];
      setCity(c);
      const data = await fetchWeather(c.lat, c.lon, 'metric');
      setWeather(data);
    }
    setLoading(false);
  }

  function filterDailyByDate(daily: WeatherData['daily']) {
    if (!startDate || !endDate) return daily;
    return daily.filter(d => {
      const date = new Date(d.date);
      return date >= new Date(startDate) && date <= new Date(endDate);
    });
  }

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-blue-400 mb-2">{t("trip-weather-planner", { defaultValue: "Trip Weather Planner" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather flex flex-col gap-3">
        <input
          value={destination}
          onChange={e => setDestination(e.target.value)}
          placeholder={t("destination-city", { defaultValue: "Destination city" })}
          className={inputClass}
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className={`${inputClass} min-w-0`}
          />
          <input
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className={`${inputClass} min-w-0`}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !destination.trim()}
          className="w-full px-4 py-2 rounded-xl bg-blue-500/80 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold text-sm transition-colors"
        >
          {loading ? t("searching", { defaultValue: "Searching…" }) : t("get-forecast", { defaultValue: "Get Forecast" })}
        </button>

        {weather && city && (
          <div className="mt-1 flex flex-col gap-1">
            <div className="font-semibold text-weather text-sm">{city.name}</div>
            <ul className="space-y-1">
              {filterDailyByDate(weather.daily).map(day => (
                <li key={day.date} className="flex items-center justify-between text-xs">
                  <span className="text-weather-muted">{new Date(day.date).toLocaleDateString()}</span>
                  <span className="text-weather">↑{Math.round(day.maxTemp)}° ↓{Math.round(day.minTemp)}°</span>
                  <span className="text-blue-400">{Math.round(day.rainSum)}mm</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

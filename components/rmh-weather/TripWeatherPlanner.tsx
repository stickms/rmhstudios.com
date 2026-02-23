import React, { useState } from 'react';
import { searchCities, fetchWeather, WeatherData } from '@/lib/weather';

export const TripWeatherPlanner = () => {
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
    <div className="my-8">
      <div className="text-lg font-semibold text-blue-400 mb-2">Trip Weather Planner</div>
      <div className="flex gap-2 mb-4">
        <input
          value={destination}
          onChange={e => setDestination(e.target.value)}
          placeholder="Destination city"
          className="p-2 rounded border border-weather"
        />
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="p-2 rounded border border-weather"
        />
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="p-2 rounded border border-weather"
        />
        <button
          onClick={handleSearch}
          disabled={loading || !destination.trim()}
          className="px-4 py-2 rounded bg-blue-500 text-white font-bold"
        >Get Forecast</button>
      </div>
      {weather && city && (
        <div className="bg-weather-glass rounded-2xl p-4 border border-weather">
          <div className="font-bold text-weather mb-2">{city.name} ({city.lat.toFixed(2)}, {city.lon.toFixed(2)})</div>
          <ul className="space-y-2">
            {filterDailyByDate(weather.daily).map(day => (
              <li key={day.date} className="flex items-center gap-4">
                <span className="text-weather font-semibold">{new Date(day.date).toLocaleDateString()}</span>
                <span className="text-weather-muted">High: {Math.round(day.maxTemp)}°C</span>
                <span className="text-weather-muted">Low: {Math.round(day.minTemp)}°C</span>
                <span className="text-blue-400">Rain: {Math.round(day.rainSum)}mm</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

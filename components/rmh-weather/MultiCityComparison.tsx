import React, { useState } from 'react';
import { searchCities, fetchWeather, WeatherData } from '@/lib/weather';

interface CityWeather {
  name: string;
  lat: number;
  lon: number;
  data: WeatherData | null;
}

export const MultiCityComparison = () => {
  const [cities, setCities] = useState<CityWeather[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAddCity() {
    setLoading(true);
    const results = await searchCities(input);
    if (results.length > 0) {
      const city = results[0];
      const data = await fetchWeather(city.lat, city.lon, 'metric');
      setCities([...cities, { name: city.name, lat: city.lat, lon: city.lon, data }]);
    }
    setLoading(false);
    setInput('');
  }

  function handleRemoveCity(name: string) {
    setCities(cities.filter(c => c.name !== name));
  }

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-blue-400 mb-2">Multi-City Comparison</div>
      <div className="flex gap-2 mb-4">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Enter city name"
          className="p-2 rounded border border-weather"
        />
        <button
          onClick={handleAddCity}
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded bg-blue-500 text-white font-bold"
        >Add</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {cities.map(city => (
          <div key={city.name} className="bg-weather-glass rounded-2xl p-4 border border-weather">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold text-weather">{city.name}</div>
              <button onClick={() => handleRemoveCity(city.name)} className="text-red-500 font-bold">Remove</button>
            </div>
            {city.data ? (
              <div>
                <div>Current: {Math.round(city.data.current.temp)}°C, {city.data.current.humidity}% humidity</div>
                <div>High: {Math.round(city.data.daily[0].maxTemp)}°C, Low: {Math.round(city.data.daily[0].minTemp)}°C</div>
                <div>Condition: {city.data.current.conditionCode}</div>
              </div>
            ) : (
              <div>Loading...</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

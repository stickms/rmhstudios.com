import React from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';

const metrics = [
  { key: 'temperature', label: 'Temperature', units: ['°C', '°F'] },
  { key: 'wind', label: 'Wind Speed', units: ['km/h', 'mph', 'knots'] },
  { key: 'pressure', label: 'Pressure', units: ['hPa', 'inHg'] },
  { key: 'precip', label: 'Precipitation', units: ['mm', 'in'] },
];

export const UnitSelector = () => {
  const { metricUnits, setMetricUnits } = useWeatherStore();

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-green-400 mb-2">Unit Selection (Per Metric)</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {metrics.map(m => (
          <div key={m.key} className="mb-2">
            <span className="mr-2 font-semibold">{m.label}:</span>
            {m.units.map(u => (
              <button
                key={u}
                className={`px-2 py-1 mx-1 rounded border ${metricUnits[m.key as 'temperature' | 'wind' | 'pressure' | 'precip'] === u ? 'bg-green-500 text-white' : 'bg-white text-green-500'}`}
                onClick={() => setMetricUnits(m.key as 'temperature' | 'wind' | 'pressure' | 'precip', u)}
              >
                {u}
              </button>
            ))}
          </div>
        ))}
        <div className="mt-4 text-xs text-gray-500">Choose units for each metric independently.</div>
      </div>
    </div>
  );
};

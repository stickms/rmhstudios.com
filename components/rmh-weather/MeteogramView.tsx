import React from 'react';

export const MeteogramView = ({ hourly }: { hourly: any[] }) => {
  // hourly: array of hourly weather data
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-purple-400 mb-2">Meteogram View</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <svg width="100%" height="120" viewBox="0 0 240 120">
          {/* Temperature */}
          <polyline
            fill="none"
            stroke="#f87171"
            strokeWidth="2"
            points={hourly.map((h, i) => `${i*10},${120-h.temp*3}`).join(' ')}
          />
          {/* Precipitation */}
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            points={hourly.map((h, i) => `${i*10},${120-h.precip*10}`).join(' ')}
          />
        </svg>
        <div className="mt-4 text-xs text-gray-500">Demo: Temperature (red) and precipitation (blue) over time.</div>
      </div>
    </div>
  );
};

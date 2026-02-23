import React from 'react';

export const SoundingProfileChart = () => {
  // Mock data for demo
  const temps = [10, 8, 5, 2, -1, -3];
  const heights = [0, 500, 1000, 1500, 2000, 2500];
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-blue-400 mb-2">Sounding/Atmospheric Profile Chart</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <svg width="100%" height="120" viewBox="0 0 120 120">
          <polyline
            fill="none"
            stroke="#0ea5e9"
            strokeWidth="2"
            points={temps.map((t, i) => `${i*20},${120-t*4}`).join(' ')}
          />
        </svg>
        <div className="mt-4 text-xs text-gray-500">Demo: Temperature profile vs. height (mock data).</div>
      </div>
    </div>
  );
};

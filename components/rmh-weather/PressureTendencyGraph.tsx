import React from 'react';

export const PressureTendencyGraph = ({ pressure }: { pressure: number[] }) => {
  // pressure: array of last 3 hours
  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-blue-400 mb-2">Pressure Tendency (Last 3 Hours)</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <svg width="100%" height="80" viewBox="0 0 120 80">
          <polyline
            fill="none"
            stroke="#3b82f6"
            strokeWidth="2"
            points={pressure.map((p, i) => `${i*40},${80-p}`).join(' ')}
          />
        </svg>
        <div className="mt-4 text-xs text-gray-500">Demo: Shows pressure trend (mock data).</div>
      </div>
    </div>
  );
};

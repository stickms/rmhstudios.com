import React, { useEffect, useState } from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import { fetchWeather } from '@/lib/weather';

export const HistoricalTemperatureTrend = () => {
  const { selectedLocation } = useWeatherStore();
  const [trend, setTrend] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedLocation) return;
    setLoading(true);
    // Mock: Generate random historical temps for past 30 days
    setTimeout(() => {
      setTrend(Array.from({ length: 30 }, () => Math.round(5 + Math.random() * 20)));
      setLoading(false);
    }, 500);
  }, [selectedLocation]);

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-blue-400 mb-2">Historical Temperature Trend (30 days)</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {loading ? 'Loading...' : (
          <svg width="100%" height="120" viewBox="0 0 300 120">
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              points={trend.map((t, i) => `${10*i},${120-t*4}`).join(' ')}
            />
          </svg>
        )}
        <div className="mt-4 text-xs text-gray-500">Demo: Shows temperature trend for past 30 days (mock data).</div>
      </div>
    </div>
  );
};

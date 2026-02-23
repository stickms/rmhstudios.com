import React, { useEffect, useState } from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import { fetchWeather } from '@/lib/weather';

export const PrecipitationTotals = () => {
  const { selectedLocation } = useWeatherStore();
  const [total, setTotal] = useState<number>(0);
  const [average, setAverage] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedLocation) return;
    setLoading(true);
    // Mock: Generate random precipitation totals
    setTimeout(() => {
      setTotal(Math.round(20 + Math.random() * 30));
      setAverage(Math.round(25 + Math.random() * 10));
      setLoading(false);
    }, 500);
  }, [selectedLocation]);

  return (
    <div className="my-8">
      <div className="text-lg font-semibold text-cyan-400 mb-2">Precipitation Totals (Current Month)</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {loading ? 'Loading...' : (
          <div>
            <div>Total: {total} mm</div>
            <div>Average: {average} mm</div>
            <div className={total > average ? 'text-red-500' : 'text-green-500'}>
              {total > average ? 'Above average precipitation' : 'Below average precipitation'}
            </div>
          </div>
        )}
        <div className="mt-4 text-xs text-gray-500">Demo: Shows precipitation totals for current month (mock data).</div>
      </div>
    </div>
  );
};

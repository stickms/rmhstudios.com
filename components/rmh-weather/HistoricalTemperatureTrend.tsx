import React, { useEffect, useState } from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export const HistoricalTemperatureTrend = () => {
  const { selectedLocation } = useWeatherStore();
  const [data, setData] = useState<{ day: string; temp: number }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedLocation) return;
    setLoading(true);
    setTimeout(() => {
      const today = new Date();
      const points = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() - (29 - i));
        return {
          day: `${d.getMonth() + 1}/${d.getDate()}`,
          temp: Math.round(5 + Math.random() * 20),
        };
      });
      setData(points);
      setLoading(false);
    }, 500);
  }, [selectedLocation]);

  const tickStyle = { fill: 'var(--weather-fg-muted)', fontSize: 11 };
  const gridColor = 'rgba(148,163,184,0.15)';

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-blue-400 mb-2">Historical Temperature Trend (30 days)</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {loading ? (
          <div className="h-48 flex items-center justify-center text-sm text-weather-muted">Loading...</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data} margin={{ top: 36, right: 16, left: 0, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="day"
                tick={tickStyle}
                interval={4}
                label={{ value: 'Date', position: 'insideBottom', offset: -16, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
              />
              <YAxis
                tick={tickStyle}
                label={{ value: '°C', angle: -90, position: 'insideLeft', offset: 12, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
              />
              <Tooltip
                contentStyle={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#3b82f6' }}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`${v}°C`, 'Temperature']}
              />
              <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 12, color: 'var(--weather-fg-muted)', paddingBottom: 8 }} />
              <Line
                type="monotone"
                dataKey="temp"
                name="Temperature (°C)"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

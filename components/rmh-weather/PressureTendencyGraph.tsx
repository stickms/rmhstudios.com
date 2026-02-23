import React, { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

export const PressureTendencyGraph = ({ pressure }: { pressure: number[] }) => {
  const data = useMemo(() => {
    const values = (pressure ?? []).filter((v) => v != null && !isNaN(v));
    if (values.length === 0) return [];
    // Show last 6 readings (or however many we have), labelled as hours ago
    const slice = values.slice(-6);
    return slice.map((p, i) => ({
      time: i === slice.length - 1 ? 'Now' : `-${slice.length - 1 - i}h`,
      pressure: Math.round(p * 10) / 10,
    }));
  }, [pressure]);

  const tickStyle = { fill: 'var(--weather-fg-muted)', fontSize: 11 };
  const gridColor = 'rgba(148,163,184,0.15)';

  if (data.length === 0) {
    return (
      <div className="my-2">
        <div className="text-lg font-semibold text-blue-400 mb-2">Pressure Tendency</div>
        <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
          <div className="h-32 flex items-center justify-center text-sm text-weather-muted">No pressure data available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-blue-400 mb-2">Pressure Tendency</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data} margin={{ top: 36, right: 16, left: 8, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="time"
              tick={tickStyle}
              label={{ value: 'Time', position: 'insideBottom', offset: -16, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
            />
            <YAxis
              tick={tickStyle}
              domain={['auto', 'auto']}
              label={{ value: 'hPa', angle: -90, position: 'insideLeft', offset: 12, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }}
              itemStyle={{ color: '#3b82f6' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any) => [`${v} hPa`, 'Pressure']}
            />
            <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 12, color: 'var(--weather-fg-muted)', paddingBottom: 8 }} />
            <Line
              type="monotone"
              dataKey="pressure"
              name="Pressure (hPa)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 4, fill: '#3b82f6' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

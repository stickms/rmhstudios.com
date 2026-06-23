import React from 'react';
import { useTranslation } from "react-i18next";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// Mock atmospheric sounding data (temperature vs. altitude)
const SOUNDING_DATA = [
  { temp: 18, height: 0 },
  { temp: 14, height: 500 },
  { temp: 10, height: 1000 },
  { temp: 5, height: 1500 },
  { temp: 0, height: 2000 },
  { temp: -5, height: 2500 },
  { temp: -12, height: 3000 },
  { temp: -20, height: 4000 },
  { temp: -30, height: 5000 },
];

export const SoundingProfileChart = () => {
  const { t } = useTranslation("c-rmh-weather");
  const tickStyle = { fill: 'var(--weather-fg-muted)', fontSize: 11 };
  const gridColor = 'rgba(148,163,184,0.15)';

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-blue-400 mb-2">{t("atmospheric-sounding-profile", { defaultValue: "Atmospheric Sounding Profile" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 36, right: 16, left: 8, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              type="number"
              dataKey="temp"
              name="Temperature"
              tick={tickStyle}
              domain={['auto', 'auto']}
              label={{ value: t("temperature-celsius", { defaultValue: "Temperature (°C)" }), position: 'insideBottom', offset: -20, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="height"
              name="Altitude"
              tick={tickStyle}
              domain={[0, 'auto']}
              label={{ value: t("altitude-m", { defaultValue: "Altitude (m)" }), angle: -90, position: 'insideLeft', offset: 16, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) =>
                name === 'Temperature' ? [`${v}°C`, name] : [`${v} m`, name]
              }
            />
            <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 12, color: 'var(--weather-fg-muted)', paddingBottom: 8 }} />
            <Scatter
              name={t("temp-profile", { defaultValue: "Temp. Profile" })}
              data={SOUNDING_DATA}
              line={{ stroke: '#0ea5e9', strokeWidth: 2 }}
              lineType="joint"
              fill="#0ea5e9"
              shape="circle"
            />
          </ScatterChart>
        </ResponsiveContainer>
        <div className="mt-1 text-xs text-weather-muted">{t("sounding-demo-note", { defaultValue: "Demo: Standard atmosphere temperature lapse rate (mock data)." })}</div>
      </div>
    </div>
  );
};

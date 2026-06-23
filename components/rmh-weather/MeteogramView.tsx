import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

interface HourlyPoint {
  time: string;
  temp: number;
  precipProb: number;
}

export const MeteogramView = ({ hourly }: { hourly: HourlyPoint[] }) => {
  const { t } = useTranslation("c-rmh-weather");
  const data = useMemo(() =>
    (hourly ?? []).slice(0, 24).map((h) => {
      const date = new Date(h.time);
      return {
        time: `${date.getHours()}:00`,
        temp: h.temp,
        precip: h.precipProb,
      };
    }),
    [hourly]
  );

  const tickStyle = { fill: 'var(--weather-fg-muted)', fontSize: 11 };
  const gridColor = 'rgba(148,163,184,0.15)';

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-purple-400 mb-2">{t("meteogram-title", { defaultValue: "Meteogram (24h)" })}</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        <ResponsiveContainer width="100%" height={240}>
          <ComposedChart data={data} margin={{ top: 36, right: 40, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="time"
              tick={tickStyle}
              interval={3}
              label={{ value: t("hour-label", { defaultValue: "Hour" }), position: 'insideBottom', offset: -16, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
            />
            <YAxis
              yAxisId="temp"
              tick={tickStyle}
              label={{ value: t("temp-unit", { defaultValue: "°C" }), angle: -90, position: 'insideLeft', offset: 12, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
            />
            <YAxis
              yAxisId="precip"
              orientation="right"
              domain={[0, 100]}
              tick={tickStyle}
              label={{ value: t("precip-pct-label", { defaultValue: "Precip %" }), angle: 90, position: 'insideRight', offset: 14, fill: 'var(--weather-fg-muted)', fontSize: 12 }}
            />
            <Tooltip
              contentStyle={{ background: 'rgba(15,23,42,0.85)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 8 }}
              labelStyle={{ color: '#94a3b8' }}
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              formatter={(v: any, name: any) =>
                name === 'Temperature (°C)' ? [`${v}°C`, name] : [`${v}%`, name]
              }
            />
            <Legend verticalAlign="top" align="center" wrapperStyle={{ fontSize: 12, color: 'var(--weather-fg-muted)', paddingBottom: 8 }} />
            <Bar
              yAxisId="precip"
              dataKey="precip"
              name={t("precip-probability-name", { defaultValue: "Precip. Probability (%)" })}
              fill="#38bdf8"
              opacity={0.5}
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="temp"
              name={t("temperature-name", { defaultValue: "Temperature (°C)" })}
              stroke="#f87171"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

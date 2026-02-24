import React, { useMemo } from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';

function tempToColor(temp: number): string {
  // Map temperature to a color: cold=blue → mild=green → warm=orange → hot=red
  const stops: [number, [number, number, number]][] = [
    [-10, [59, 130, 246]],   // blue
    [5,   [34, 197, 94]],    // green
    [20,  [251, 191, 36]],   // amber
    [35,  [239, 68, 68]],    // red
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (temp >= stops[i][0] && temp <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const t = Math.max(0, Math.min(1, (temp - lo[0]) / (hi[0] - lo[0])));
  const r = Math.round(lo[1][0] + t * (hi[1][0] - lo[1][0]));
  const g = Math.round(lo[1][1] + t * (hi[1][1] - lo[1][1]));
  const b = Math.round(lo[1][2] + t * (hi[1][2] - lo[1][2]));
  return `rgb(${r},${g},${b})`;
}

export const TemperatureHeatMap = () => {
  const { locations } = useWeatherStore();

  const tempData = useMemo(() =>
    locations.map((loc) => ({
      name: loc.name,
      temp: Math.round(5 + Math.random() * 30),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locations.length]
  );

  return (
    <div className="my-2">
      <div className="text-lg font-semibold text-red-400 mb-2">Temperature Heat Map</div>
      <div className="bg-weather-glass rounded-2xl p-4 border border-weather text-weather">
        {tempData.length === 0 ? (
          <div className="text-sm text-weather-muted">Add locations to see comparisons.</div>
        ) : (
          <div className="flex flex-wrap gap-4 justify-center">
            {tempData.map((t) => (
              <div key={t.name} className="flex flex-col items-center gap-1">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-lg"
                  style={{ background: tempToColor(t.temp) }}
                >
                  {t.temp}°
                </div>
                <div className="text-xs text-weather-muted text-center max-w-[64px] truncate" title={t.name}>
                  {t.name}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Color scale legend */}
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-weather-muted whitespace-nowrap">Cold</span>
            <div
              className="flex-1 h-3 rounded-full"
              style={{
                background: 'linear-gradient(to right, rgb(59,130,246), rgb(34,197,94), rgb(251,191,36), rgb(239,68,68))',
              }}
            />
            <span className="text-xs text-weather-muted whitespace-nowrap">Hot</span>
          </div>
          <div className="flex justify-between mt-0.5 px-0">
            <span className="text-xs text-weather-muted">−10°C</span>
            <span className="text-xs text-weather-muted">5°C</span>
            <span className="text-xs text-weather-muted">20°C</span>
            <span className="text-xs text-weather-muted">35°C</span>
          </div>
        </div>
        <div className="mt-2 text-xs text-weather-muted">Demo: Temperature intensity for saved locations (mock data).</div>
      </div>
    </div>
  );
};

'use client';

import React from 'react';
import { GlassCard } from './GlassCard';
import { WeatherData } from '@/lib/weather';
import { Droplets } from 'lucide-react';

interface ForecastHourlyProps {
  data: WeatherData['hourly'];
  units: 'metric' | 'imperial';
}

export const ForecastHourly = ({ data, units }: ForecastHourlyProps) => {
  const tempUnit = units === 'metric' ? '°C' : '°F';

  return (
    <GlassCard className="p-0 overflow-hidden">
      <div className="px-6 py-4 border-b border-weather bg-weather-glass">
        <h3 className="text-lg font-semibold text-weather flex items-center gap-2">
          48-Hour Forecast
        </h3>
      </div>
      <div className="flex overflow-x-auto p-6 gap-6 scrollbar-hide select-none">
        {data.map((hour, i) => {
          const time = new Date(hour.time).toLocaleTimeString([], { hour: 'numeric', hour12: true });
          const isNow = i === 0;

          return (
            <div key={hour.time} className="flex flex-col items-center min-w-[80px] space-y-4">
              <span className={`text-sm ${isNow ? 'text-blue-500 font-extrabold' : 'text-weather-muted'}`}>
                {isNow ? 'Now' : time}
              </span>
              
              <div className="text-2xl font-bold text-weather">
                {Math.round(hour.temp)}{tempUnit}
              </div>

              <div className="flex flex-col items-center gap-1">
                <Droplets className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] text-weather-muted font-mono">
                  {hour.precipProb}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

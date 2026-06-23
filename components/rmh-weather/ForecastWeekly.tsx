'use client';

import React from 'react';
import { useTranslation } from 'react-i18next';
import { GlassCard } from './GlassCard';
import { WeatherData, getWeatherCondition } from '@/lib/weather';
import { Cloud, Sun, CloudRain, CloudLightning, CloudSnow } from 'lucide-react';

interface ForecastWeeklyProps {
  data: WeatherData['daily'];
  units: 'metric' | 'imperial';
}

export const ForecastWeekly = ({ data, units }: ForecastWeeklyProps) => {
  const { t } = useTranslation("c-rmh-weather");
  const tempUnit = units === 'metric' ? '°C' : '°F';

  const getIcon = (code: number) => {
    if (code === 0) return Sun;
    if (code >= 1 && code <= 3) return Cloud;
    if (code >= 51 && code <= 67) return CloudRain;
    if (code >= 71 && code <= 77) return CloudSnow;
    if (code >= 80 && code <= 82) return CloudRain;
    if (code >= 95) return CloudLightning;
    return Cloud;
  };

  return (
    <GlassCard className="p-0">
      <div className="px-6 py-4 border-b border-weather bg-weather-glass">
        <h3 className="text-lg font-semibold text-weather">
          {t("7-day-forecast", { defaultValue: "7-Day Forecast" })}
        </h3>
      </div>
      <div className="divide-y border-weather overflow-x-auto">
        {data.map((day, i) => {
          const date = new Date(day.date).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
          const Icon = getIcon(day.conditionCode);
          const isToday = i === 0;

          return (
            <div key={day.date} className="px-6 py-4 flex items-center justify-between group hover:bg-white/5 transition-colors min-w-105">
              <div className="w-32">
                <div className={`font-medium ${isToday ? 'text-blue-500 font-bold' : 'text-weather'}`}>
                  {isToday ? t("today", { defaultValue: "Today" }) : date.split(',')[0]}
                </div>
                <div className="text-xs text-weather-muted opacity-80">
                  {date.split(',')[1]}
                </div>
              </div>

              <div className="flex flex-1 items-center gap-4">
                <Icon className="w-6 h-6 text-weather-muted" />
                <span className="text-sm text-weather-muted/80 hidden sm:inline truncate">
                  {getWeatherCondition(day.conditionCode)}
                </span>
              </div>

              <div className="flex items-center gap-4 min-w-25 justify-end">
                <span className="text-weather font-bold">{Math.round(day.maxTemp)}{tempUnit}</span>
                <span className="text-weather-muted opacity-60">{Math.round(day.minTemp)}{tempUnit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
};

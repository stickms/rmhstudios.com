import { Wind, Droplets, Sun, Eye, Thermometer, Star } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { WeatherData, getWeatherCondition } from '@/lib/weather';
import { motion } from 'framer-motion';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import { useTranslation } from "react-i18next";

interface CurrentWeatherProps {
  data: WeatherData['current'];
  units: 'metric' | 'imperial';
  locationName: string;
  lat: number;
  lon: number;
  hourly?: Array<{ precipProb: number; time: string }>;
}

export const CurrentWeather = ({ data, units, locationName, lat, lon, hourly }: CurrentWeatherProps) => {
  const { t } = useTranslation("c-rmh-weather");
  const { favorites, addFavorite, removeFavorite } = useWeatherStore();
  const isFavorite = favorites.some(f => f.name === locationName);

  const toggleFavorite = () => {
    if (isFavorite) {
      removeFavorite(locationName);
    } else {
      addFavorite({ name: locationName, lat, lon });
    }
  };
  const tempUnit = units === 'metric' ? '°C' : '°F';
  const { windUnit } = useWeatherStore();
  let speedUnit = windUnit;
  let windSpeed = data.windSpeed;
  if (windUnit === 'knots') windSpeed = Math.round(data.windSpeed * 0.539957);
  if (windUnit === 'km/h' && units === 'imperial') windSpeed = Math.round(data.windSpeed * 1.60934);
  if (windUnit === 'mph' && units === 'metric') windSpeed = Math.round(data.windSpeed * 0.621371);

  const stats = [
    { label: t("feels-like", { defaultValue: "Feels Like" }), value: `${Math.round(data.feelsLike)}${tempUnit}`, icon: Thermometer, color: 'text-orange-400' },
    { label: t("humidity", { defaultValue: "Humidity" }), value: `${data.humidity}%`, icon: Droplets, color: 'text-blue-400' },
    { label: t("wind-speed", { defaultValue: "Wind Speed" }), value: `${windSpeed} ${speedUnit}`, icon: Wind, color: 'text-cyan-400' },
    { label: t("uv-index", { defaultValue: "UV Index" }), value: data.uvIndex, icon: Sun, color: 'text-yellow-400' },
    { label: t("visibility", { defaultValue: "Visibility" }), value: `${(data.visibility / 1000).toFixed(1)} km`, icon: Eye, color: 'text-indigo-400' },
  ];

    // Clothing suggestion logic
    function getClothingSuggestion(temp: number, conditionCode: number): string {
      if (temp <= 0) return t("clothing-heavy-coat", { defaultValue: "Wear a heavy coat, gloves, and a hat." });
      if (temp <= 10) return t("clothing-warm-jacket", { defaultValue: "Wear a warm jacket and layers." });
      if (temp <= 20) return t("clothing-light-jacket", { defaultValue: "A light jacket or sweater is recommended." });
      if (temp <= 28) return t("clothing-comfortable", { defaultValue: "Dress comfortably, maybe a t-shirt and jeans." });
      if (temp > 28) return t("clothing-shorts", { defaultValue: "Wear shorts and a t-shirt, stay hydrated." });
      if ([51,53,55,61,63,65,80,81,82].includes(conditionCode)) return t("clothing-umbrella", { defaultValue: "Bring an umbrella or raincoat." });
      if ([71,73,75,77,85,86].includes(conditionCode)) return t("clothing-warm-boots", { defaultValue: "Wear warm clothes and boots." });
      return t("clothing-comfort", { defaultValue: "Dress for comfort." });
    }

    const clothingSuggestion = getClothingSuggestion(data.feelsLike, data.conditionCode);
    const showUmbrellaReminder = hourly && shouldRemindUmbrella(hourly);

  // Umbrella reminder logic
  function shouldRemindUmbrella(hourly: Array<{ precipProb: number; time: string }>): boolean {
    return hourly.slice(0, 12).some(h => h.precipProb >= 50);
  }

  return (
    <div className="space-y-6">
      <GlassCard className="flex flex-col md:flex-row items-center justify-between gap-8 py-10 px-12">
        <div className="flex flex-col items-center md:items-start space-y-4">
            {/* Clothing suggestion */}
            <div className="text-sm text-blue-400 font-semibold pb-2">
              {clothingSuggestion}
            </div>
          {showUmbrellaReminder && (
            <div className="text-sm text-blue-500 font-bold pb-2">
              {t("rain-reminder", { defaultValue: "☔ Rain expected soon — bring an umbrella!" })}
            </div>
          )}
          <div className="flex items-center gap-6">
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-8xl md:text-9xl font-bold tracking-tighter text-weather drop-shadow-2xl"
            >
              {Math.round(data.temp)}{tempUnit}
            </motion.div>
            <button
              onClick={toggleFavorite}
              className={`p-4 rounded-3xl border transition-all ${
                isFavorite 
                  ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.2)]' 
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Star className={`w-8 h-8 ${isFavorite ? 'fill-yellow-500' : ''}`} />
            </button>
          </div>
          <div className="text-2xl text-weather-dim font-medium pb-2 border-b border-weather w-full md:w-auto">
            {getWeatherCondition(data.conditionCode)}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 w-full md:w-auto">
          {stats.map((stat, i) => (
            <div key={stat.label} className="flex flex-col items-center md:items-start space-y-1">
              <div className="flex items-center gap-2 text-weather-muted text-sm">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                {stat.label}
              </div>
              <div className="text-xl font-semibold text-weather">
                {stat.value}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
};

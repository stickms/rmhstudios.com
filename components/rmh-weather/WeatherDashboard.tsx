'use client';
import './weather.css';

import React, { useState, useEffect } from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import { fetchWeather, WeatherData, getWeatherTheme } from '@/lib/weather';
import { WeatherSearch } from './WeatherSearch';
import { CurrentWeather } from './CurrentWeather';
import { ForecastHourly } from './ForecastHourly';
import { ForecastWeekly } from './ForecastWeekly';
import { DynamicBackground } from './DynamicBackground';
import { ThemeSelector } from './ThemeSelector';
import { FontSizeSelector } from './FontSizeSelector';
import { ColorBlindSelector } from './ColorBlindSelector';
import { UnitSelector } from './UnitSelector';
import { SavedLocations } from './SavedLocations';
import { TemperatureHeatMap } from './TemperatureHeatMap';
import { HistoricalTemperatureTrend } from './HistoricalTemperatureTrend';
import { PrecipitationTotals } from './PrecipitationTotals';
import { Loader2, AlertCircle, Menu, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@tanstack/react-router';
import { ExportWeatherData } from './ExportWeatherData';
import { PressureTendencyGraph } from './PressureTendencyGraph';
import { MeteogramView } from './MeteogramView';
import { ModelDataToggle } from './ModelDataToggle';
import { SoundingProfileChart } from './SoundingProfileChart';
import { TripWeatherPlanner } from './TripWeatherPlanner';
import { MultiCityComparison } from './MultiCityComparison';

// Mock function for dog walking comfort
function getDogWalkingComfort(current: any, hourly: any) {
  if (!current) return 'No data';
  if (current.temp > 30) return 'Too hot for dogs! Walk early or late.';
  if (current.temp < 0) return 'Too cold for most dogs.';
  if (current.humidity > 80) return 'High humidity, take caution.';
  if (hourly && hourly.some((h: any) => h.precipProb >= 50)) return 'Rain likely, bring umbrella.';
  return 'Great weather for a walk!';
}

// Mock function for camping/hiking suitability
function getCampingHikingSuitability(daily: any) {
  if (!daily || daily.length === 0) return 'No forecast data.';
  const today = daily[0];
  if (today.maxTemp > 35) return 'Too hot for hiking/camping.';
  if (today.minTemp < 0) return 'Too cold for camping.';
  if (today.rainSum > 10) return 'Heavy rain expected, not ideal.';
  if ([95, 96, 99].includes(today.conditionCode)) return 'Thunderstorm risk, avoid outdoor activities.';
  return 'Good conditions for camping/hiking!';
}

export const WeatherDashboard = () => {
    const { units, lastLocation, setLastLocation, setUnits, hasHydrated, windUnit, setWindUnit } = useWeatherStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [mode, setMode] = useState<'dark' | 'light'>(
      typeof window !== 'undefined' && localStorage.getItem('rmhweather-mode') === 'light' ? 'light' : 'dark'
    );
    const [data, setData] = useState<any>(null);

    useEffect(() => {
      document.body.classList.toggle('bg-white', mode === 'light');
      document.body.classList.toggle('bg-slate-950', mode === 'dark');
      localStorage.setItem('rmhweather-mode', mode);
    }, [mode]);

    const loadWeather = async (loc: { name: string; lat: number; lon: number }) => {
      setLoading(true);
      setError(null);
      try {
        const weather = await fetchWeather(loc.lat, loc.lon, units);
        setData(weather);
        setLastLocation(loc);
      } catch (err) {
        setError('Failed to fetch weather data. Please try again.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      if (!hasHydrated) return;
      if (lastLocation) {
        loadWeather(lastLocation);
      } else {
        loadWeather({ name: 'New York', lat: 40.71, lon: -74.01 });
      }
    }, [hasHydrated, units]);

    const theme = data ? getWeatherTheme(data.current.conditionCode) : 'default';
  // ...existing code...

  return (
    <div className={`relative min-h-screen py-12 px-4 md:px-8 overflow-hidden ${mode === 'light' ? 'bg-white text-black' : 'bg-slate-950 text-white'}`} data-weather-theme={theme}>
      <AnimatePresence>
        {data && <DynamicBackground conditionCode={data.current.conditionCode} />}
      </AnimatePresence>

      <SavedLocations 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onSelect={loadWeather} 
        theme={theme}
      />

      <div className="relative z-10 max-w-6xl mx-auto space-y-12">
        {/* Top Bar with Search and Settings */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 w-full flex-1">
            <Link
              to="/secret"
              className="p-4 bg-weather-glass border border-weather rounded-2xl hover:bg-weather-glass-hover transition-all backdrop-blur-md shrink-0"
              title="Back to homepage"
            >
              <ArrowLeft className="w-6 h-6 text-weather" />
            </Link>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-4 bg-weather-glass border border-weather rounded-2xl hover:bg-weather-glass-hover transition-all backdrop-blur-md"
            >
              <Menu className="w-6 h-6 text-weather" />
            </button>
            <div className="flex-1">
              <WeatherSearch theme={theme} onSelect={loadWeather} />
            </div>
          </div>
          {/* Mode toggle */}
          <div className="flex items-center gap-2 p-1 bg-weather-glass rounded-2xl backdrop-blur-md border border-weather">
            <button
              onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                mode === 'light' ? 'bg-yellow-400 text-black shadow-lg' : 'bg-slate-900 text-white shadow-lg'
              }`}
            >
              {mode === 'light' ? '☀ Light Mode' : '🌙 Dark Mode'}
            </button>
            <button
              onClick={() => setUnits('metric')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                units === 'metric' ? 'bg-blue-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              Metric
            </button>
            <button
              onClick={() => setUnits('imperial')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                units === 'imperial' ? 'bg-blue-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              Imperial
            </button>
            <button
              onClick={() => setWindUnit('km/h')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                windUnit === 'km/h' ? 'bg-cyan-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              km/h
            </button>
            <button
              onClick={() => setWindUnit('mph')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                windUnit === 'mph' ? 'bg-cyan-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              mph
            </button>
            <button
              onClick={() => setWindUnit('knots')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                windUnit === 'knots' ? 'bg-cyan-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              knots
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl text-red-200 backdrop-blur-md animate-shake">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-32 space-y-4"
            >
              <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
              <p className="text-weather-muted font-medium animate-pulse">Fetching atmospheric data...</p>
            </motion.div>
          ) : data ? (
            <motion.div
              key="content"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Location Header */}
              <div className="text-center md:text-left space-y-2">
                <h1 className="text-4xl md:text-5xl font-bold text-weather tracking-tight">
                  {lastLocation?.name || 'New York'}
                </h1>
                <p className="text-weather-dim font-medium">
                  {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>

              <CurrentWeather 
                data={data.current} 
                units={units} 
                locationName={lastLocation?.name || 'New York'}
                lat={lastLocation?.lat || 40.71}
                lon={lastLocation?.lon || -74.01}
                hourly={data.hourly}
              />

              {/* Commute Weather Summary */}
              <div className="my-8">
                <div className="text-lg font-semibold text-blue-400 mb-2">Commute Weather Summary</div>
                <div className="grid grid-cols-2 gap-6">
                  {['morning', 'evening'].map((period) => {
                    const commuteHours = period === 'morning' ? [7,8,9] : [17,18,19];
                    const now = new Date();
                    const today = now.toISOString().split('T')[0];
                    const hourly = data.hourly.filter((h: any) => {
                      const hour = new Date(h.time).getHours();
                      const date = h.time.split('T')[0];
                      return date === today && commuteHours.includes(hour);
                    });
                    return (
                      <div key={period} className="bg-weather-glass rounded-2xl p-4 border border-weather">
                        <div className="font-bold text-weather mb-2">{period === 'morning' ? 'Morning (7–9 AM)' : 'Evening (5–7 PM)'}</div>
                        {hourly.length === 0 ? (
                          <div className="text-weather-muted">No forecast available.</div>
                        ) : (
                          <ul className="space-y-2">
                            {hourly.map((h: any) => (
                              <li key={h.time} className="flex items-center gap-3">
                                <span className="text-weather font-semibold">{new Date(h.time).toLocaleTimeString([], { hour: 'numeric', hour12: true })}</span>
                                <span className="text-weather-muted">{Math.round(h.temp)}{units === 'metric' ? '°C' : '°F'}</span>
                                <span className="text-blue-400">{h.precipProb}% rain</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <ForecastHourly data={data.hourly} units={units} />
                </div>
                <div>
                  <ForecastWeekly data={data.daily} units={units} />
                </div>
              </div>

              {/* Advanced Features Section */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mt-12">
                <div className="bg-weather-glass rounded-2xl p-6 border border-weather flex flex-col gap-4">
                  <TemperatureHeatMap />
                  <HistoricalTemperatureTrend />
                  <PrecipitationTotals />
                  <PressureTendencyGraph pressure={data.hourly?.map((h: any) => h.pressure)} />
                </div>
                <div className="bg-weather-glass rounded-2xl p-6 border border-weather flex flex-col gap-4">
                  <MeteogramView hourly={data.hourly} />
                  <ModelDataToggle />
                  <SoundingProfileChart />
                </div>
                <div className="bg-weather-glass rounded-2xl p-6 border border-weather flex flex-col gap-4">
                  <TripWeatherPlanner />
                  <MultiCityComparison />
                  <ExportWeatherData data={data} />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
                {/* Hourly Precipitation Bar Chart */}
                <div className="my-8">
                  <div className="text-lg font-semibold text-blue-400 mb-2">Hourly Precipitation Probability</div>
                  <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                    {data.hourly.slice(0, 24).map((h: any, i: number) => (
                      <div key={h.time} className="flex flex-col items-center min-w-8">
                        <div
                          className="w-6 rounded-t-lg bg-blue-400"
                          style={{ height: `${h.precipProb}px`, opacity: h.precipProb / 100 }}
                          title={`${h.precipProb}%`}
                        />
                        <span className="text-[10px] text-weather-muted mt-1">
                          {new Date(h.time).getHours()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

  return (
    <div className={`relative min-h-screen py-12 px-4 md:px-8 overflow-hidden ${mode === 'light' ? 'bg-white text-black' : 'bg-slate-950 text-white'}`} data-weather-theme={theme}>
      <AnimatePresence>
        {data && <DynamicBackground conditionCode={data.current.conditionCode} />}
      </AnimatePresence>

      <SavedLocations 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onSelect={loadWeather} 
        theme={theme}
      />

      <div className="relative z-10 max-w-6xl mx-auto space-y-12">
        {/* Top Bar with Search and Settings */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4 w-full flex-1">
            <Link
              to="/secret"
              className="p-4 bg-weather-glass border border-weather rounded-2xl hover:bg-weather-glass-hover transition-all backdrop-blur-md shrink-0"
              title="Back to homepage"
            >
              <ArrowLeft className="w-6 h-6 text-weather" />
            </Link>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-4 bg-weather-glass border border-weather rounded-2xl hover:bg-weather-glass-hover transition-all backdrop-blur-md"
            >
              <Menu className="w-6 h-6 text-weather" />
            </button>
            <div className="flex-1">
              <WeatherSearch theme={theme} onSelect={loadWeather} />
            </div>
          </div>
          {/* Mode toggle */}
          <div className="flex items-center gap-2 p-1 bg-weather-glass rounded-2xl backdrop-blur-md border border-weather">
            <button
              onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                mode === 'light' ? 'bg-yellow-400 text-black shadow-lg' : 'bg-slate-900 text-white shadow-lg'
              }`}
            >
              {mode === 'light' ? '☀ Light Mode' : '🌙 Dark Mode'}
            </button>
            <button
              onClick={() => setUnits('metric')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                units === 'metric' ? 'bg-blue-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              Metric
            </button>
            <button
              onClick={() => setUnits('imperial')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                units === 'imperial' ? 'bg-blue-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              Imperial
            </button>
            <button
              onClick={() => setWindUnit('km/h')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                windUnit === 'km/h' ? 'bg-cyan-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              km/h
            </button>
            <button
              onClick={() => setWindUnit('mph')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                windUnit === 'mph' ? 'bg-cyan-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              mph
            </button>
            <button
              onClick={() => setWindUnit('knots')}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                windUnit === 'knots' ? 'bg-cyan-600 text-white shadow-lg' : 'text-weather-muted hover:text-weather'
              }`}
            >
              knots
            </button>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-3 p-4 bg-red-500/20 border border-red-500/30 rounded-2xl text-red-200 backdrop-blur-md animate-shake">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="loader"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-32 space-y-4"
            >
              <Loader2 className="w-12 h-12 text-blue-400 animate-spin" />
              <p className="text-weather-muted font-medium animate-pulse">Fetching atmospheric data...</p>
            </motion.div>
          ) : data ? (
            <motion.div
              key="content"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-8"
            >
              {/* Location Header */}
              <div className="text-center md:text-left space-y-2">
                <h1 className="text-4xl md:text-5xl font-bold text-weather tracking-tight">
                  {lastLocation?.name || 'New York'}
                </h1>
                <p className="text-weather-dim font-medium">
                  {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </p>
              </div>

              <CurrentWeather 
                data={data.current} 
                units={units} 
                locationName={lastLocation?.name || 'New York'}
                lat={lastLocation?.lat || 40.71}
                lon={lastLocation?.lon || -74.01}
                hourly={data.hourly}
              />

              {/* Commute Weather Summary */}
              <div className="my-8">
                <div className="text-lg font-semibold text-blue-400 mb-2">Commute Weather Summary</div>
                <div className="grid grid-cols-2 gap-6">
                  {['morning', 'evening'].map((period) => {
                    const commuteHours = period === 'morning' ? [7,8,9] : [17,18,19];
                    const now = new Date();
                    const today = now.toISOString().split('T')[0];
                    const hourly = data.hourly.filter((h: any) => {
                      const hour = new Date(h.time).getHours();
                      const date = h.time.split('T')[0];
                      return date === today && commuteHours.includes(hour);
                    });
                    return (
                      <div key={period} className="bg-weather-glass rounded-2xl p-4 border border-weather">
                        <div className="font-bold text-weather mb-2">{period === 'morning' ? 'Morning (7–9 AM)' : 'Evening (5–7 PM)'}</div>
                        {hourly.length === 0 ? (
                          <div className="text-weather-muted">No forecast available.</div>
                        ) : (
                          <ul className="space-y-2">
                            {hourly.map((h: any) => (
                              <li key={h.time} className="flex items-center gap-3">
                                <span className="text-weather font-semibold">{new Date(h.time).toLocaleTimeString([], { hour: 'numeric', hour12: true })}</span>
                                <span className="text-weather-muted">{Math.round(h.temp)}{units === 'metric' ? '°C' : '°F'}</span>
                                <span className="text-blue-400">{h.precipProb}% rain</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2">
                  <ForecastHourly data={data.hourly} units={units} />
                </div>
                <div>
                  <ForecastWeekly data={data.daily} units={units} />
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};

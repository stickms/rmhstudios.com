'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, MapPin, Loader2, X } from 'lucide-react';
import { searchCities, GeocodingResult } from '@/lib/weather';
import { motion, AnimatePresence } from 'framer-motion';

interface WeatherSearchProps {
  onSelect: (location: { name: string; lat: number; lon: number }) => void;
  theme?: string;
}

export const WeatherSearch = ({ onSelect, theme }: WeatherSearchProps) => {
  const { t } = useTranslation("c-rmh-weather");
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handler = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setLoading(true);
        try {
          const data = await searchCities(query);
          setResults(data);
          setIsOpen(true);
        } catch (err) {
          console.error(err);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
        setIsOpen(false);
      }
    }, 400);

    return () => clearTimeout(handler);
  }, [query]);

  const handleDetectLocation = () => {
    if (!navigator.geolocation) return;
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onSelect({ 
          name: 'Current Location', 
          lat: pos.coords.latitude, 
          lon: pos.coords.longitude 
        });
        setLoading(false);
        setQuery('');
      },
      () => setLoading(false)
    );
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-2xl mx-auto z-50">
      <div className="relative group">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          {loading ? (
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
          ) : (
            <Search className="w-5 h-5 text-weather-muted group-focus-within:text-blue-500 transition-colors" />
          )}
        </div>
        
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search-for-a-city", { defaultValue: "Search for a city..." })}
          className="w-full h-14 pl-12 pr-24 bg-weather-glass border border-weather rounded-2xl text-weather placeholder:text-weather-muted/60 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-weather-glass-hover transition-all text-lg backdrop-blur-md"
        />

        <div className="absolute inset-y-0 right-2 flex items-center gap-2">
          {query && (
            <button 
              onClick={() => setQuery('')}
              className="p-2 text-weather-muted hover:text-weather transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={handleDetectLocation}
            className="flex items-center gap-2 h-10 px-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl transition-all border border-blue-500/30"
          >
            <MapPin className="w-4 h-4" />
            <span className="hidden sm:inline text-sm font-medium">{t("auto", { defaultValue: "Auto" })}</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && results.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className={`absolute mt-3 w-full border border-weather rounded-2xl overflow-hidden backdrop-blur-xl shadow-2xl ${
              theme === 'snowy' ? 'bg-white/95' : 'bg-slate-900/90'
            }`}
          >
            {results.map((city, i) => (
              <button
                key={`${city.lat}-${city.lon}-${i}`}
                onClick={() => {
                  onSelect({ name: city.name, lat: city.lat, lon: city.lon });
                  setQuery('');
                  setIsOpen(false);
                }}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-weather-glass-hover transition-colors border-b border-weather last:border-0 group"
              >
                <div className="text-left">
                  <div className="text-weather font-medium group-hover:text-blue-500 transition-colors">
                    {city.name}
                  </div>
                  <div className="text-sm text-weather-muted opacity-80">
                    {city.admin1 ? `${city.admin1}, ` : ''}{city.country}
                  </div>
                </div>
                <div className="text-xs text-weather-muted/60 font-mono">
                  {city.lat.toFixed(2)}°, {city.lon.toFixed(2)}°
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

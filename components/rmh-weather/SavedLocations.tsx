'use client';

import React from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import { GlassCard } from './GlassCard';
import { X, Star, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SavedLocationsProps {
  onSelect: (location: { name: string; lat: number; lon: number }) => void;
  isOpen: boolean;
  onClose: () => void;
  theme?: string;
}

export const SavedLocations = ({ onSelect, isOpen, onClose, theme }: SavedLocationsProps) => {
  const { favorites, removeFavorite, setLastLocation } = useWeatherStore();
  const [home, setHome] = React.useState<{ name: string; lat: number; lon: number } | null>(null);
  const [work, setWork] = React.useState<{ name: string; lat: number; lon: number } | null>(null);

  // Load from localStorage
  React.useEffect(() => {
    const h = localStorage.getItem('rmhweather-home');
    const w = localStorage.getItem('rmhweather-work');
    if (h) setHome(JSON.parse(h));
    if (w) setWork(JSON.parse(w));
  }, []);

  function saveShortcut(type: 'home' | 'work', loc: { name: string; lat: number; lon: number }) {
    localStorage.setItem(`rmhweather-${type}`, JSON.stringify(loc));
    if (type === 'home') setHome(loc);
    else setWork(loc);
  }

  return (
    <>
      {/* Backdrop for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: isOpen ? 0 : '-100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed top-0 left-0 bottom-0 w-80 bg-weather-glass backdrop-blur-3xl border-r border-weather z-50 p-6 flex flex-col gap-6 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-weather flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
            Saved
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-weather-muted hover:text-weather transition-colors lg:hidden"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Home/Work Shortcuts */}
        <div className="flex gap-4 mb-4">
          <button
            disabled={!home}
            onClick={() => { if (home) { onSelect(home); onClose(); } }}
            className={`flex-1 p-2 rounded-xl border border-blue-500 bg-blue-500/10 text-blue-400 font-bold ${!home ? 'opacity-50 cursor-not-allowed' : ''}`}
          >🏠 Home</button>
          <button
            disabled={!work}
            onClick={() => { if (work) { onSelect(work); onClose(); } }}
            className={`flex-1 p-2 rounded-xl border border-purple-500 bg-purple-500/10 text-purple-400 font-bold ${!work ? 'opacity-50 cursor-not-allowed' : ''}`}
          >🏢 Work</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 scrollbar-hide">
          {favorites.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-weather-glass rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-weather-muted opacity-40" />
              </div>
              <p className="text-weather-muted font-medium">No saved locations yet</p>
              <p className="text-xs text-weather-muted/60 mt-2">Add a city from the dashboard to see it here.</p>
            </div>
          ) : (
            favorites.map((loc) => (
              <motion.div
                key={loc.name}
                layout
                className="group relative"
              >
                <button
                  onClick={() => {
                    onSelect(loc);
                    onClose();
                  }}
                  className="w-full text-left p-4 rounded-2xl bg-weather-glass border border-weather hover:bg-weather-glass-hover transition-all flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <MapPin className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-weather font-semibold group-hover:text-blue-500 transition-colors">
                        {loc.name}
                      </div>
                      <div className="text-[10px] text-weather-muted opacity-60 font-mono">
                        {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                      </div>
                    </div>
                  </div>
                </button>
                {/* Home/Work shortcut buttons */}
                <div className="absolute top-2 left-2 flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); saveShortcut('home', loc); }}
                    className="p-1 text-blue-400 bg-blue-500/10 rounded-full text-xs border border-blue-500 hover:bg-blue-500/20"
                  >🏠</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); saveShortcut('work', loc); }}
                    className="p-1 text-purple-400 bg-purple-500/10 rounded-full text-xs border border-purple-500 hover:bg-purple-500/20"
                  >🏢</button>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFavorite(loc.name);
                  }}
                  className="absolute top-2 right-2 p-1 text-weather-muted/40 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            ))
          )}
        </div>

        <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10">
          <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wider text-center">
            Synced via LocalStorage
          </p>
        </div>
      </motion.div>
    </>
  );
};

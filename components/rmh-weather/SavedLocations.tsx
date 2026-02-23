'use client';

import React from 'react';
import { useWeatherStore } from '@/lib/store/useWeatherStore';
import { X, Star, MapPin, Home, Building2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface SavedLocationsProps {
  onSelect: (location: { name: string; lat: number; lon: number }) => void;
  isOpen: boolean;
  onClose: () => void;
  theme?: string;
}

type Shortcut = { name: string; lat: number; lon: number } | null;

export const SavedLocations = ({ onSelect, isOpen, onClose }: SavedLocationsProps) => {
  const { favorites, removeFavorite } = useWeatherStore();
  const [home, setHome] = React.useState<Shortcut>(null);
  const [work, setWork] = React.useState<Shortcut>(null);

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

  function clearShortcut(type: 'home' | 'work') {
    localStorage.removeItem(`rmhweather-${type}`);
    if (type === 'home') setHome(null);
    else setWork(null);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-weather flex items-center gap-2">
            <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
            Saved
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-weather-muted hover:text-weather hover:bg-weather-glass transition-colors"
            aria-label="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Home / Work shortcuts */}
        <div className="flex gap-3">
          {/* Home */}
          <div className="flex-1 relative">
            <button
              disabled={!home}
              onClick={() => { if (home) { onSelect(home); onClose(); } }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border font-semibold transition-all text-left ${
                home
                  ? 'border-blue-500 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                  : 'border-dashed border-weather bg-transparent text-weather-muted opacity-50 cursor-not-allowed'
              }`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold leading-none">Home</div>
                <div className="text-[10px] opacity-70 truncate mt-0.5">
                  {home ? home.name : 'Not set'}
                </div>
              </div>
            </button>
            {home && (
              <button
                onClick={() => clearShortcut('home')}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                title="Clear home"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Work */}
          <div className="flex-1 relative">
            <button
              disabled={!work}
              onClick={() => { if (work) { onSelect(work); onClose(); } }}
              className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border font-semibold transition-all text-left ${
                work
                  ? 'border-purple-500 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
                  : 'border-dashed border-weather bg-transparent text-weather-muted opacity-50 cursor-not-allowed'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-bold leading-none">Work</div>
                <div className="text-[10px] opacity-70 truncate mt-0.5">
                  {work ? work.name : 'Not set'}
                </div>
              </div>
            </button>
            {work && (
              <button
                onClick={() => clearShortcut('work')}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-purple-500 text-white flex items-center justify-center hover:bg-red-500 transition-colors"
                title="Clear work"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        </div>

        {/* Favorites list */}
        <div className="flex-1 overflow-y-auto space-y-3 scrollbar-hide">
          {favorites.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 bg-weather-glass rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="w-8 h-8 text-weather-muted opacity-40" />
              </div>
              <p className="text-weather-muted font-medium">No saved locations yet</p>
              <p className="text-xs text-weather-muted/60 mt-2">Add a city from the dashboard to see it here.</p>
            </div>
          ) : (
            favorites.map((loc) => {
              const isHome = home?.name === loc.name;
              const isWork = work?.name === loc.name;
              return (
                <motion.div key={loc.name} layout className="group relative">
                  <button
                    onClick={() => { onSelect(loc); onClose(); }}
                    className="w-full text-left p-4 rounded-2xl bg-weather-glass border border-weather hover:bg-weather-glass-hover transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 bg-blue-500/20 rounded-lg mt-0.5 shrink-0">
                        <MapPin className="w-4 h-4 text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0 pr-5">
                        <div className="text-weather font-semibold group-hover:text-blue-400 transition-colors truncate">
                          {loc.name}
                        </div>
                        <div className="text-[10px] text-weather-muted opacity-60 font-mono">
                          {loc.lat.toFixed(2)}°, {loc.lon.toFixed(2)}°
                        </div>

                        {/* Active shortcut badges */}
                        {(isHome || isWork) && (
                          <div className="flex gap-1.5 mt-1.5">
                            {isHome && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-500/40 font-semibold">
                                <Home className="w-2.5 h-2.5" /> Home
                              </span>
                            )}
                            {isWork && (
                              <span className="inline-flex items-center gap-1 text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded-full border border-purple-500/40 font-semibold">
                                <Building2 className="w-2.5 h-2.5" /> Work
                              </span>
                            )}
                          </div>
                        )}

                        {/* Set shortcut actions — shown on hover */}
                        <div className="flex flex-wrap gap-1.5 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isHome ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); saveShortcut('home', loc); }}
                              className="inline-flex items-center gap-1 text-[10px] bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                            >
                              <Home className="w-2.5 h-2.5" /> Set Home
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); clearShortcut('home'); }}
                              className="inline-flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full border border-red-500/30 hover:bg-red-500/20 transition-colors"
                            >
                              <X className="w-2.5 h-2.5" /> Unset Home
                            </button>
                          )}
                          {!isWork ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); saveShortcut('work', loc); }}
                              className="inline-flex items-center gap-1 text-[10px] bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-full border border-purple-500/30 hover:bg-purple-500/25 transition-colors"
                            >
                              <Building2 className="w-2.5 h-2.5" /> Set Work
                            </button>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); clearShortcut('work'); }}
                              className="inline-flex items-center gap-1 text-[10px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full border border-red-500/30 hover:bg-red-500/20 transition-colors"
                            >
                              <X className="w-2.5 h-2.5" /> Unset Work
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </button>

                  {/* Remove from favorites */}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeFavorite(loc.name); }}
                    className="absolute top-2 right-2 p-1 text-weather-muted/40 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded-lg hover:bg-red-500/10"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              );
            })
          )}
        </div>

        <div className="p-3 rounded-2xl bg-blue-500/5 border border-blue-500/10">
          <p className="text-[10px] text-blue-400 font-medium uppercase tracking-wider text-center">
            Synced via LocalStorage
          </p>
        </div>
      </motion.div>
    </>
  );
};

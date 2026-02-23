'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import { getWeatherTheme } from '@/lib/weather';

interface DynamicBackgroundProps {
  conditionCode: number;
}

export const DynamicBackground = ({ conditionCode }: DynamicBackgroundProps) => {
  const theme = getWeatherTheme(conditionCode);

  const configs = {
    clear: {
      bg: 'bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-800',
      overlay: 'bg-yellow-400/5',
      effect: 'sunlight'
    },
    cloudy: {
      bg: 'bg-gradient-to-br from-slate-400 via-slate-600 to-slate-800',
      overlay: 'bg-white/5',
      effect: 'clouds'
    },
    rainy: {
      bg: 'bg-gradient-to-br from-blue-700 via-indigo-900 to-slate-900',
      overlay: 'bg-blue-900/20',
      effect: 'rain'
    },
    snowy: {
      bg: 'bg-gradient-to-br from-blue-100 via-blue-300 to-indigo-400',
      overlay: 'bg-white/30',
      effect: 'snow'
    },
    stormy: {
      bg: 'bg-gradient-to-br from-slate-900 via-purple-900 to-black',
      overlay: 'bg-purple-900/10',
      effect: 'lightning'
    },
    default: {
      bg: 'bg-slate-950',
      overlay: '',
      effect: ''
    }
  };

  const config = configs[theme];

  return (
    <div className={`fixed inset-0 z-0 transition-colors duration-1000 ${config.bg}`}>
      <div className={`absolute inset-0 transition-opacity duration-1000 ${config.overlay} opacity-100`} />
      
      {/* Animated noise/texture */}
      <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-overlay">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
      </div>

      {/* Conditional effects */}
      <AnimatePresence mode="wait">
        {(theme === 'clear' || theme === 'default') && (
          <motion.div 
            key="clear"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="weather-sun-glow"
          />
        )}
        
        {theme === 'cloudy' && (
          <motion.div 
            key="cloudy"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="weather-clouds"
          >
            <div className="weather-cloud-item w-125 h-75 top-[10%] left-[-15%]" />
            <div className="weather-cloud-item w-150 h-100 top-[30%] left-[30%] [animation-delay:-20s]" />
            <div className="weather-cloud-item w-112.5 h-62.5 top-[60%] left-[5%] [animation-delay:-45s]" />
          </motion.div>
        )}

        {(theme === 'rainy' || theme === 'stormy') && (
          <motion.div 
            key="rain"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="weather-rain"
          >
            <div className="weather-rain-back" />
            <div className="weather-rain-mid" />
            <div className="weather-rain-front" />
          </motion.div>
        )}

        {theme === 'stormy' && (
          <motion.div 
            key="lightning"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="weather-lightning"
          />
        )}

        {theme === 'snowy' && (
          <motion.div 
            key="snow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="weather-snow"
          />
        )}
      </AnimatePresence>
    </div>
  );
};

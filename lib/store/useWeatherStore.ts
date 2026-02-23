import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Units = 'metric' | 'imperial';

interface WeatherState {
  metricUnits: {
    temperature: '°C' | '°F';
    wind: 'km/h' | 'mph' | 'knots';
    pressure: 'hPa' | 'inHg';
    precip: 'mm' | 'in';
  };
  setMetricUnits: (metric: 'temperature' | 'wind' | 'pressure' | 'precip', unit: string) => void;
  units: Units;
  windUnit: 'km/h' | 'mph' | 'knots';
  lastLocation: {
    name: string;
    lat: number;
    lon: number;
  } | null;
  favorites: Array<{ name: string; lat: number; lon: number }>;
  hasHydrated: boolean;
  theme: 'minimal' | 'nerdy' | 'lifestyle';
  fontSize: 'small' | 'medium' | 'large';
  colorBlindMode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia';
  selectedLocation: { name: string; lat: number; lon: number } | null;
  locations: Array<{ name: string; lat: number; lon: number }>;

  // Actions
  setUnits: (units: Units) => void;
  setWindUnit: (windUnit: 'km/h' | 'mph' | 'knots') => void;
  setLastLocation: (location: { name: string; lat: number; lon: number } | null) => void;
  addFavorite: (location: { name: string; lat: number; lon: number }) => void;
  removeFavorite: (name: string) => void;
  setHasHydrated: (val: boolean) => void;
  setTheme: (theme: 'minimal' | 'nerdy' | 'lifestyle') => void;
  setFontSize: (fontSize: 'small' | 'medium' | 'large') => void;
  setColorBlindMode: (mode: 'none' | 'protanopia' | 'deuteranopia' | 'tritanopia') => void;
  setSelectedLocation?: (location: { name: string; lat: number; lon: number } | null) => void;
}

export const useWeatherStore = create<WeatherState>()(
  persist(
    (set) => ({
      units: 'metric',
      windUnit: 'km/h',
      lastLocation: null,
      favorites: [],
      hasHydrated: false,
      theme: 'minimal',
      fontSize: 'medium',
      colorBlindMode: 'none',
      metricUnits: {
        temperature: '°C',
        wind: 'km/h',
        pressure: 'hPa',
        precip: 'mm',
      },
      selectedLocation: null,
      locations: [],
      setMetricUnits: (metric, unit) =>
        set((state) => ({
          metricUnits: { ...state.metricUnits, [metric]: unit }
        })),
      setUnits: (units) => set({ units }),
      setWindUnit: (windUnit) => set({ windUnit }),
      setLastLocation: (lastLocation) => set({ lastLocation }),
      addFavorite: (location) => 
        set((state) => ({
          favorites: [...state.favorites.filter(f => f.name !== location.name), location]
        })),
      removeFavorite: (name) =>
        set((state) => ({
          favorites: state.favorites.filter((f) => f.name !== name),
        })),
      setHasHydrated: (hasHydrated) => set({ hasHydrated }),
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setColorBlindMode: (colorBlindMode) => set({ colorBlindMode }),
    }),
    {
      name: 'rmh-weather-storage',
      onRehydrateStorage: (state) => {
        return () => state.setHasHydrated(true);
      }
    // ...existing code...
  },
  {
    name: 'rmh-weather-storage',
    onRehydrateStorage: (state) => {
      return () => state.setHasHydrated(true);
    }
  }
)
);

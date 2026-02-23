export interface WeatherData {
  current: {
    temp: number;
    feelsLike: number;
    humidity: number;
    windSpeed: number;
    uvIndex: number;
    visibility: number;
    conditionCode: number;
    isDay: boolean;
  };
  hourly: Array<{
    time: string;
    temp: number;
    conditionCode: number;
    precipProb: number;
  }>;
  daily: Array<{
    date: string;
    maxTemp: number;
    minTemp: number;
    conditionCode: number;
    rainSum: number;
  }>;
}

export interface GeocodingResult {
  name: string;
  lat: number;
  lon: number;
  country: string;
  admin1?: string;
}

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';
const GEOCODING_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

export async function fetchWeather(lat: number, lon: number, units: 'metric' | 'imperial'): Promise<WeatherData> {
  const unitQuery = units === 'imperial' ? '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' : '';
  const url = `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,visibility,uv_index&hourly=temperature_2m,weather_code,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto${unitQuery}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch weather data');
  const data = await res.json();

  return {
    current: {
      temp: data.current.temperature_2m,
      feelsLike: data.current.apparent_temperature,
      humidity: data.current.relative_humidity_2m,
      windSpeed: data.current.wind_speed_10m,
      uvIndex: data.current.uv_index,
      visibility: data.current.visibility,
      conditionCode: data.current.weather_code,
      isDay: !!data.current.is_day,
    },
    hourly: data.hourly.time.slice(0, 48).map((time: string, i: number) => ({
      time,
      temp: data.hourly.temperature_2m[i],
      conditionCode: data.hourly.weather_code[i],
      precipProb: data.hourly.precipitation_probability[i],
    })),
    daily: data.daily.time.map((date: string, i: number) => ({
      date,
      maxTemp: data.daily.temperature_2m_max[i],
      minTemp: data.daily.temperature_2m_min[i],
      conditionCode: data.daily.weather_code[i],
      rainSum: data.daily.precipitation_sum[i],
    })),
  };
}

export async function searchCities(query: string): Promise<GeocodingResult[]> {
  if (query.length < 2) return [];
  const url = `${GEOCODING_BASE}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
  
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  
  return (data.results || []).map((item: any) => ({
    name: item.name,
    lat: item.latitude,
    lon: item.longitude,
    country: item.country,
    admin1: item.admin1,
  }));
}

export function getWeatherCondition(code: number): string {
  // WMO Weather interpretation codes (WW)
  if (code === 0) return 'Clear sky';
  if (code === 1 || code === 2 || code === 3) return 'Mainly clear, partly cloudy, and overcast';
  if (code === 45 || code === 48) return 'Fog and depositing rime fog';
  if (code === 51 || code === 53 || code === 55) return 'Drizzle: Light, moderate, and dense intensity';
  if (code === 56 || code === 57) return 'Freezing Drizzle: Light and dense intensity';
  if (code === 61 || code === 63 || code === 65) return 'Rain: Slight, moderate and heavy intensity';
  if (code === 66 || code === 67) return 'Freezing Rain: Light and heavy intensity';
  if (code === 71 || code === 73 || code === 75) return 'Snow fall: Slight, moderate, and heavy intensity';
  if (code === 77) return 'Snow grains';
  if (code === 80 || code === 81 || code === 82) return 'Rain showers: Slight, moderate, and violent';
  if (code === 85 || code === 86) return 'Snow showers slight and heavy';
  if (code === 95) return 'Thunderstorm: Slight or moderate';
  if (code === 96 || code === 99) return 'Thunderstorm with slight and heavy hail';
  return 'Unknown';
}

export function getWeatherTheme(code: number): 'clear' | 'cloudy' | 'rainy' | 'snowy' | 'stormy' | 'default' {
  if (code === 0) return 'clear';
  if (code >= 1 && code <= 3 || code === 45 || code === 48) return 'cloudy';
  if (code >= 51 && code <= 67 || code >= 80 && code <= 82) return 'rainy';
  if (code >= 71 && code <= 77 || code >= 85 && code <= 86) return 'snowy';
  if (code >= 95) return 'stormy';
  return 'default';
}

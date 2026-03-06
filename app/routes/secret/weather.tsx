/**
 * Weather Layout Route
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/secret/weather')({
  head: () => ({
    meta: [
      { title: 'RMHWeather | Premium Weather Experience' },
      { name: 'description', content: 'Real-time weather data with a stunning, immersive glassmorphic interface.' },
    ],
  }),
  component: WeatherLayout,
});

function WeatherLayout() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Outlet />
    </div>
  );
}

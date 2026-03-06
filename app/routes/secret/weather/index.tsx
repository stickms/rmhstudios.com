/**
 * Weather Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import { WeatherDashboard } from '@/components/rmh-weather/WeatherDashboard';

export const Route = createFileRoute('/secret/weather/')({
  component: WeatherPage,
});

function WeatherPage() {
  return <WeatherDashboard />;
}

import { createAPIFileRoute } from "@tanstack/react-start/api";
import { fetchWeather } from '@/lib/weather';

export const APIRoute = createAPIFileRoute("/api/weather-data")({
  GET: async ({ request }) => {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lon = searchParams.get('lon');
  if (!lat || !lon) {
    return new Response(JSON.stringify({ error: 'Missing lat/lon' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // Default units to 'metric' for now; could be passed as query param
  const units = searchParams.get('units') || 'metric';
  const weather = await fetchWeather(Number(lat), Number(lon), units as 'metric' | 'imperial');
  return new Response(JSON.stringify(weather), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
},
});

import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/weather-webhook')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: "weather-webhook" });
  if (!allowed) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 });

  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.WEATHER_WEBHOOK_SECRET}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Here you could trigger custom automation/webhook logic
  return new Response(
    JSON.stringify({ status: 'ok' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
},
    },
  },
});

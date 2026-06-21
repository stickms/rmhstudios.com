import { createFileRoute } from '@tanstack/react-router';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { timingSafeEqual } from 'node:crypto';

/** Constant-time string compare that doesn't leak length via early return. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a comparison to keep timing uniform, then fail.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

export const Route = createFileRoute('/api/weather-webhook')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: "weather-webhook" });
  if (!allowed) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 });

  const authHeader = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.WEATHER_WEBHOOK_SECRET ?? ''}`;
  if (!process.env.WEATHER_WEBHOOK_SECRET || !safeEqual(authHeader, expected)) {
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

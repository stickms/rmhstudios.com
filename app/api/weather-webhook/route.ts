import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  // Echo received data
  const payload = await req.json();
  // Here you could trigger custom automation/webhook logic
  return new Response(
    JSON.stringify({ received: payload, status: 'Webhook received' }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

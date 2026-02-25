import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const save = await prisma.templeOfJoySave.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ saveData: save?.saveData ?? null });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'toj-save' });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(retryAfter) } });
  }

  let body: { saveData?: object };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { saveData } = body;
  if (!saveData || typeof saveData !== 'object') {
    return NextResponse.json({ error: 'Missing or invalid saveData' }, { status: 400 });
  }

  // Validate body size (max 500KB)
  const bodyStr = JSON.stringify(saveData);
  if (bodyStr.length > 500_000) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  const save = await prisma.templeOfJoySave.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      saveData,
    },
    update: {
      saveData,
    },
  });

  return NextResponse.json({ success: true, updatedAt: save.updatedAt });
}

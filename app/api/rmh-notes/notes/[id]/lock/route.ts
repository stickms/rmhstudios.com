import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { action: 'lock' | 'unlock'; password?: string } = { action: 'lock' };
  try { body = await req.json(); } catch { /* empty */ }

  if (body.action === 'lock') {
    if (!body.password || body.password.length < 1) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }
    const lockHash = await hashPassword(body.password);
    await prisma.note.update({ where: { id }, data: { isLocked: true, lockHash } });
    return NextResponse.json({ success: true, isLocked: true });
  }

  if (body.action === 'unlock') {
    if (!body.password) return NextResponse.json({ error: 'Password required' }, { status: 400 });
    const hash = await hashPassword(body.password);
    if (hash !== note.lockHash) {
      return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
    }
    await prisma.note.update({ where: { id }, data: { isLocked: false, lockHash: null } });
    return NextResponse.json({ success: true, isLocked: false });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

export async function PUT(req: Request, { params }: { params: Params }) {
  // Verify password without changing lock state (for viewing locked note)
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { password?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.password) return NextResponse.json({ error: 'Password required' }, { status: 400 });
  const hash = await hashPassword(body.password);
  if (hash !== note.lockHash) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 403 });
  }
  return NextResponse.json({ success: true });
}

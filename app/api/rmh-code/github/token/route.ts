import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const record = await prisma.userGitHubToken.findUnique({
    where: { userId: session.user.id },
    select: { login: true, updatedAt: true },
  });

  return NextResponse.json({ connected: !!record, login: record?.login ?? null });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { token } = body;
  if (!token || typeof token !== 'string' || token.trim().length === 0) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  // Validate the PAT by calling GitHub API
  const ghRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!ghRes.ok) {
    return NextResponse.json({ error: 'Invalid GitHub token — could not authenticate' }, { status: 400 });
  }

  const ghUser = await ghRes.json() as { login: string };

  await prisma.userGitHubToken.upsert({
    where: { userId: session.user.id },
    create: { userId: session.user.id, token: token.trim(), login: ghUser.login },
    update: { token: token.trim(), login: ghUser.login },
  });

  return NextResponse.json({ success: true, login: ghUser.login });
}

export async function DELETE() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await prisma.userGitHubToken.deleteMany({ where: { userId: session.user.id } });

  return NextResponse.json({ success: true });
}

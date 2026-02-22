import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const tokenRecord = await prisma.userGitHubToken.findUnique({
    where: { userId: session.user.id },
    select: { token: true },
  });

  if (!tokenRecord) {
    return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 });
  }

  const ghRes = await fetch(
    'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator',
    {
      headers: {
        Authorization: `Bearer ${tokenRecord.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!ghRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch repos from GitHub' }, { status: 502 });
  }

  const raw = await ghRes.json() as Array<{
    id: number; name: string; full_name: string; private: boolean;
    default_branch: string; description: string | null; updated_at: string;
  }>;

  const repos = raw.map(r => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    private: r.private,
    defaultBranch: r.default_branch,
    description: r.description,
    updatedAt: r.updated_at,
  }));

  return NextResponse.json({ repos });
}

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function POST(req: Request) {
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

  let body: { projectId?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { projectId, message = 'Update via RMH Code' } = body;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const project = await prisma.codeProject.findUnique({
    where: { id: projectId },
    include: {
      files: { select: { id: true, path: true, content: true, gitSha: true, updatedAt: true } },
    },
  });

  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (!project.gitOwner || !project.gitRepo) {
    return NextResponse.json({ error: 'Project is not linked to a GitHub repository' }, { status: 400 });
  }

  const { gitOwner: owner, gitRepo: repo, gitBranch: branch = 'main', gitLastSyncAt } = project;

  // Find changed files
  const changedFiles = project.files.filter(
    f => !gitLastSyncAt || f.updatedAt > gitLastSyncAt
  );

  if (changedFiles.length === 0) {
    return NextResponse.json({ success: true, pushed: 0, message: 'Nothing to push' });
  }

  const ghHeaders = {
    Authorization: `Bearer ${tokenRecord.token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };

  const results: Array<{ path: string; success: boolean; newSha?: string; error?: string }> = [];

  for (const file of changedFiles) {
    const contentBase64 = Buffer.from(file.content, 'utf-8').toString('base64');

    const body: Record<string, unknown> = {
      message,
      content: contentBase64,
      branch,
    };

    // If file has a known SHA (existing file), include it for update
    if (file.gitSha) {
      body.sha = file.gitSha;
    }

    const pushRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
      { method: 'PUT', headers: ghHeaders, body: JSON.stringify(body) }
    );

    if (!pushRes.ok) {
      const errText = await pushRes.text();
      results.push({ path: file.path, success: false, error: errText });
      continue;
    }

    const pushData = await pushRes.json() as { content: { sha: string } };
    const newSha = pushData.content?.sha;

    // Update stored SHA
    await prisma.codeFile.update({
      where: { id: file.id },
      data: { gitSha: newSha },
    });

    results.push({ path: file.path, success: true, newSha });
  }

  // Update project sync time
  await prisma.codeProject.update({
    where: { id: projectId },
    data: { gitLastSyncAt: new Date() },
  });

  const successCount = results.filter(r => r.success).length;

  return NextResponse.json({
    success: true,
    pushed: successCount,
    failed: results.filter(r => !r.success).length,
    results,
  });
}

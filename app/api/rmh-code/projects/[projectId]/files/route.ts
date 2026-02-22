import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript',
    js: 'javascript', jsx: 'javascript',
    css: 'css', scss: 'scss',
    json: 'json', md: 'markdown',
    html: 'html', htm: 'html',
    py: 'python', rs: 'rust',
    go: 'go', sh: 'shell',
    yaml: 'yaml', yml: 'yaml',
    toml: 'toml', xml: 'xml',
    sql: 'sql', c: 'c', cpp: 'cpp',
    java: 'java', rb: 'ruby', php: 'php',
  };
  return map[ext] ?? 'plaintext';
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId } = await params;

  const project = await prisma.codeProject.findUnique({
    where: { id: projectId },
    select: { userId: true },
  });

  if (!project || project.userId !== session.user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: { name?: string; path?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, path, content = '' } = body;
  if (!name || !path) {
    return NextResponse.json({ error: 'name and path are required' }, { status: 400 });
  }

  const existing = await prisma.codeFile.findUnique({
    where: { projectId_path: { projectId, path } },
  });
  if (existing) {
    return NextResponse.json({ error: 'A file at that path already exists' }, { status: 409 });
  }

  const file = await prisma.codeFile.create({
    data: {
      projectId,
      userId: session.user.id,
      name,
      path,
      content,
      language: getLanguage(name),
    },
  });

  // bump project updatedAt
  await prisma.codeProject.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ file }, { status: 201 });
}

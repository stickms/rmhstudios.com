import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { decrypt } from '@/lib/encryption';

const BINARY_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'mp3', 'wav', 'ogg', 'flac', 'aac',
  'mp4', 'webm', 'mov', 'avi',
  'zip', 'tar', 'gz', 'bz2', 'rar', '7z',
  'pdf', 'exe', 'bin', 'dll', 'so', 'dylib',
  'lock',
]);

function isBinary(path: string) {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return BINARY_EXTENSIONS.has(ext);
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    css: 'css', scss: 'scss', json: 'json', md: 'markdown',
    html: 'html', htm: 'html', py: 'python', rs: 'rust',
    go: 'go', sh: 'shell', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', xml: 'xml', sql: 'sql',
  };
  return map[ext] ?? 'plaintext';
}

function shouldSkip(path: string) {
  const parts = path.split('/');
  const skipDirs = ['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.venv', 'venv'];
  return parts.some(p => skipDirs.includes(p)) || parts[0].startsWith('.');
}

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

  let body: { owner?: string; repo?: string; branch?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { owner, repo, branch = 'main' } = body;
  if (!owner || !repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const ghHeaders = {
    Authorization: `Bearer ${decrypt(tokenRecord.token)}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Get the branch SHA
  const branchRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
    { headers: ghHeaders }
  );
  if (!branchRes.ok) {
    return NextResponse.json({ error: `Branch "${branch}" not found` }, { status: 404 });
  }
  const branchData = await branchRes.json() as { commit: { sha: string } };
  const treeSha = branchData.commit.sha;

  // Get recursive tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    { headers: ghHeaders }
  );
  if (!treeRes.ok) {
    return NextResponse.json({ error: 'Failed to fetch repository tree' }, { status: 502 });
  }
  const treeData = await treeRes.json() as {
    tree: Array<{ path: string; type: string; sha: string; size?: number }>;
  };

  // Filter to text files only
  const blobs = treeData.tree.filter(
    item =>
      item.type === 'blob' &&
      !shouldSkip(item.path) &&
      !isBinary(item.path) &&
      (item.size ?? 0) <= 300_000 // skip files >300KB
  );

  // Fetch blob contents (cap at 200 files)
  const filesToFetch = blobs.slice(0, 200);
  const fileEntries = await Promise.all(
    filesToFetch.map(async item => {
      try {
        const blobRes = await fetch(
          `https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`,
          { headers: ghHeaders }
        );
        if (!blobRes.ok) return null;
        const blobData = await blobRes.json() as { content: string; encoding: string };
        const content = blobData.encoding === 'base64'
          ? Buffer.from(blobData.content.replace(/\n/g, ''), 'base64').toString('utf-8')
          : blobData.content;
        const name = item.path.split('/').pop() ?? item.path;
        return { name, path: item.path, content, gitSha: item.sha, language: getLanguage(name) };
      } catch {
        return null;
      }
    })
  );

  const validFiles = fileEntries.filter(Boolean) as Array<{
    name: string; path: string; content: string; gitSha: string; language: string;
  }>;

  // Create project + files in DB
  const project = await prisma.codeProject.create({
    data: {
      userId: session.user.id,
      name: `${owner}/${repo}`,
      gitOwner: owner,
      gitRepo: repo,
      gitBranch: branch,
      gitLastSyncAt: new Date(),
      files: {
        create: validFiles.map(f => ({
          userId: session.user.id,
          name: f.name,
          path: f.path,
          content: f.content,
          language: f.language,
          gitSha: f.gitSha,
        })),
      },
    },
    select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { files: true } } },
  });

  return NextResponse.json({ project, fileCount: validFiles.length }, { status: 201 });
}

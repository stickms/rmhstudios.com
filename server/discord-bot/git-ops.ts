import path from 'path';
import fs from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

export const REPO_PATH = process.env.RMHBOT_REPO_PATH ?? process.cwd();
// Keep worktrees inside /app (container WORKDIR) rather than inside REPO_PATH,
// which is a host-mounted volume the container user may not own.
const WORKTREES_DIR = process.env.RMHBOT_WORKTREES_DIR ?? path.join(process.cwd(), '.rmhbot-worktrees');
const REPO_OWNER = 'stickms';
const REPO_NAME = 'rmhstudios.com';

export interface GitAuthor {
  name: string;
  email: string;
}

function gitConfigArgs(): string[] {
  const token = process.env.GITHUB_TOKEN;
  const args = ['-c', 'safe.directory=*'];
  if (token) {
    args.push('-c', `url.https://x-access-token:${token}@github.com/.insteadOf=https://github.com/`);
  }
  return args;
}

async function git(args: string[], cwd: string = REPO_PATH): Promise<string> {
  const { stdout } = await execFile('git', [...gitConfigArgs(), ...args], {
    cwd,
    env: { ...process.env as Record<string, string>, GIT_TERMINAL_PROMPT: '0' },
  });
  return stdout.trim();
}

// ─── Session clone operations ─────────────────────────────────────
// Using a fresh git init + fetch rather than git worktree, because worktrees
// require writing to the main repo's .git/ (host-mounted, not writable by the
// container's app user). A self-contained clone in /app/.rmhbot-worktrees/
// keeps all git writes inside the container.

export async function createWorktree(branchName: string): Promise<string> {
  await fs.mkdir(WORKTREES_DIR, { recursive: true });
  const clonePath = path.join(WORKTREES_DIR, branchName.replace(/[/\\]/g, '_'));

  // Clean up any stale clone from a previous crashed session
  await fs.rm(clonePath, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(clonePath, { recursive: true });

  // Init a brand-new repo in a container-owned directory — no host .git writes
  await git(['init'], clonePath);
  await git(
    ['remote', 'add', 'origin', `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`],
    clonePath,
  );
  // Shallow fetch of main from GitHub (fast; full history not needed for edits)
  await git(['fetch', '--depth=1', 'origin', 'main'], clonePath);
  await git(['checkout', '-b', branchName, 'FETCH_HEAD'], clonePath);

  return clonePath;
}

export async function removeWorktree(clonePath: string): Promise<void> {
  await fs.rm(clonePath, { recursive: true, force: true }).catch(() => {});
}

// ─── Per-worktree git ops ────────────────────────────────────────

export async function stageAll(cwd: string): Promise<void> {
  await git(['add', '-A'], cwd);
}

export async function commit(message: string, author: GitAuthor, cwd: string): Promise<string> {
  const fullMessage = `${message}\n\nCo-Authored-By: RMHBot <rmhbot@rmhstudios.com>`;
  await git(
    [
      '-c', `user.name=${author.name}`,
      '-c', `user.email=${author.email}`,
      'commit', '-m', fullMessage,
    ],
    cwd,
  );
  return git(['rev-parse', '--short', 'HEAD'], cwd);
}

export async function pushBranch(branchName: string, cwd: string): Promise<void> {
  await git(['push', 'origin', branchName, '--force-with-lease'], cwd);
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const status = await git(['status', '--porcelain'], cwd);
  return status.length > 0;
}

export async function getLastCommitMessage(cwd: string): Promise<string> {
  return git(['log', '-1', '--pretty=%s'], cwd);
}

// ─── GitHub API ──────────────────────────────────────────────────

export async function createPullRequest(
  branch: string,
  title: string,
  body: string,
): Promise<string> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GITHUB_TOKEN is not set');

  const response = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ title, body, head: branch, base: 'main' }),
    },
  );

  if (!response.ok) {
    throw new Error(`GitHub PR creation failed: ${await response.text()}`);
  }

  return ((await response.json()) as { html_url: string }).html_url;
}

// ─── Typecheck ───────────────────────────────────────────────────

export async function runTypecheck(): Promise<{ success: boolean; output: string }> {
  // Use the real TS JS file, not the .bin/ shell wrapper (which can't be run by Node directly).
  const tscBin = path.join(process.cwd(), 'node_modules/typescript/bin/tsc');
  const configPath = path.join(REPO_PATH, 'tsconfig.server.json');
  try {
    const { stdout, stderr } = await execFile(
      process.execPath,
      [tscBin, '--noEmit', '-p', configPath],
      { cwd: REPO_PATH },
    );
    return { success: true, output: (stdout + stderr).trim() };
  } catch (err: any) {
    return { success: false, output: (String(err.stdout ?? '') + String(err.stderr ?? '')).trim() };
  }
}

import path from 'path';
import fs from 'fs/promises';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);

export const REPO_PATH = process.env.RMHBOT_REPO_PATH ?? process.cwd();
const WORKTREES_DIR = path.join(REPO_PATH, '.rmhbot-worktrees');
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

// ─── Worktree operations ─────────────────────────────────────────

export async function createWorktree(branchName: string): Promise<string> {
  await fs.mkdir(WORKTREES_DIR, { recursive: true });
  const worktreePath = path.join(WORKTREES_DIR, branchName.replace(/\//g, '_'));

  // Remove stale worktree left by a crashed previous session
  try {
    await git(['worktree', 'remove', '--force', worktreePath]);
  } catch { /* doesn't exist, fine */ }

  // Also remove any orphaned local branch so the new `-b` doesn't conflict
  try {
    await git(['branch', '-D', branchName]);
  } catch { /* doesn't exist, fine */ }

  await git(['fetch', 'origin', 'main', '--quiet']);
  await git(['worktree', 'add', '-b', branchName, worktreePath, 'origin/main']);
  return worktreePath;
}

export async function removeWorktree(worktreePath: string): Promise<void> {
  try {
    await git(['worktree', 'remove', '--force', worktreePath]);
    await git(['worktree', 'prune']);
  } catch { /* best-effort */ }
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
  // In production the container WORKDIR is /app (has node_modules).
  // In dev, process.cwd() is the repo root (also has node_modules).
  const tscBin = path.join(process.cwd(), 'node_modules/.bin/tsc');
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

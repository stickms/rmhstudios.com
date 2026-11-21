import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { requireAuth } from '../lib/config.js';
import { apiRequest, API_BASE } from '../lib/api.js';
import { success, error, info, color } from '../lib/output.js';
import { commitFromGit, parseReleaseArgs } from '../lib/release-args.js';
import type { BuildItem, ReleaseItem } from '../types.js';

interface ListResponse {
  items: BuildItem[];
}

interface ReleaseResponse {
  release: ReleaseItem;
}

/** `git rev-parse HEAD` in the current directory, or undefined outside a git checkout. */
function headCommit(): string | undefined {
  try {
    return commitFromGit(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return undefined;
  }
}

async function chooseBuild(token: string, userId: string, rl: ReturnType<typeof createInterface>): Promise<BuildItem> {
  const data = await apiRequest<ListResponse>('/api/user-builds', { token, params: { userId, limit: '50' } });
  if (data.items.length === 0) throw new Error('You have no builds yet. Run `rmhcode push-build` to publish one.');
  if (data.items.length === 1) return data.items[0];
  if (!stdin.isTTY) throw new Error('You have several builds: pass --build <slug>.');
  console.log('');
  data.items.forEach((b, i) => console.log(`  ${color.cyan(String(i + 1).padStart(2))}  ${b.title} ${color.dim(`(${b.slug})`)}`));
  console.log('');
  const answer = (await rl.question(`${color.cyan('?')} Build number: `)).trim();
  const picked = data.items[Number(answer) - 1];
  if (!picked) throw new Error('Choose a number from the list.');
  return picked;
}

/** rmhcode release [--build <slug>] [--version <v>] [--notes <file>] [--commit <sha>] */
export async function release(args: string[]): Promise<void> {
  const config = requireAuth();
  const opts = parseReleaseArgs(args);
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    const slug = opts.build ?? (await chooseBuild(config.token, config.user.id, rl)).slug;

    let version = opts.version;
    if (!version) {
      if (!stdin.isTTY) throw new Error('Pass --version <v>.');
      version = (await rl.question(`${color.cyan('?')} Version: `)).trim();
    }
    if (!version) throw new Error('A release needs a version.');

    let changelog: string | undefined;
    if (opts.notes) {
      try {
        changelog = readFileSync(opts.notes, 'utf8');
      } catch {
        throw new Error(`Could not read the notes file ${opts.notes}`);
      }
    }

    const commitHash = opts.commit ?? headCommit();

    const data = await apiRequest<ReleaseResponse>(`/api/user-builds/${encodeURIComponent(slug)}/releases`, {
      method: 'POST',
      token: config.token,
      body: { version, ...(changelog ? { changelog } : {}), ...(commitHash ? { commitHash } : {}) },
    });

    success(`Published ${data.release.version}`);
    info(`${API_BASE}/builds/${slug}#releases`);
  } catch (e) {
    error(e instanceof Error ? e.message : 'Failed to publish the release');
    process.exit(1);
  } finally {
    rl.close();
  }
}

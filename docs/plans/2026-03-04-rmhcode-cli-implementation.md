# rmhcode CLI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the rmhcode CLI with 5 commands (login, whoami, push-build, list-builds, logout) that connect to the rmhstudios.com API, integrated alongside existing Claude Code functionality.

**Architecture:** Standalone `cli/` directory with zero external dependencies. Entry point intercepts RMH-specific commands and passes everything else through to Claude Code. Token stored at `~/.rmhcode/config.json`.

**Tech Stack:** Node.js 18+ (built-in fetch, readline, http, fs, crypto), TypeScript, compiled via tsc.

---

### Task 1: Server-side fix — Add CLI token auth to GET /api/user-builds

**Files:**
- Modify: `app/api/user-builds/route.ts:58-65`

**Step 1: Add CLI token fallback to GET handler**

In `app/api/user-builds/route.ts`, replace lines 58-65:

```typescript
    // Get current user session (optional, for liked status)
    let currentUserId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      currentUserId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }
```

With:

```typescript
    // Get current user — session OR CLI token
    let currentUserId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      currentUserId = session?.user?.id ?? null;
    } catch {
      // Not logged in via session
    }

    // Fall back to CLI token auth
    if (!currentUserId) {
      const cliUser = await getAuthenticatedUser(req, null);
      if (cliUser) currentUserId = cliUser.id;
    }
```

Note: `getAuthenticatedUser` is already imported at line 16.

**Step 2: Verify the build still compiles**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No new errors related to user-builds/route.ts

**Step 3: Commit**

```bash
git add app/api/user-builds/route.ts
git commit -m "feat(api): add CLI token auth to GET /api/user-builds"
```

---

### Task 2: Scaffold CLI package

**Files:**
- Create: `cli/package.json`
- Create: `cli/tsconfig.json`

**Step 1: Create cli/package.json**

```json
{
  "name": "rmhcode",
  "version": "0.1.0",
  "description": "AI-powered coding assistant with RMH integrations",
  "type": "module",
  "bin": {
    "rmhcode": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.0.0"
  }
}
```

**Step 2: Create cli/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": false
  },
  "include": ["src/**/*"]
}
```

**Step 3: Install dependencies**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npm install`
Expected: node_modules created, no errors

**Step 4: Commit**

```bash
git add cli/package.json cli/tsconfig.json cli/package-lock.json
git commit -m "feat(cli): scaffold rmhcode CLI package"
```

---

### Task 3: Core library — config, api, output

**Files:**
- Create: `cli/src/lib/config.ts`
- Create: `cli/src/lib/api.ts`
- Create: `cli/src/lib/output.ts`
- Create: `cli/src/types.ts`

**Step 1: Create types**

Create `cli/src/types.ts`:

```typescript
export interface UserInfo {
  id: string;
  name: string;
  username: string;
  email?: string;
  image?: string;
}

export interface RmhConfig {
  token: string;
  user: UserInfo;
}

export interface BuildItem {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  visibility: string;
  technologies: string[];
  likeCount: number;
  viewCount: number;
  createdAt: string;
  publishedAt: string | null;
}

export interface ApiError {
  error: string;
}
```

**Step 2: Create config module**

Create `cli/src/lib/config.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import type { RmhConfig } from '../types.js';

const CONFIG_DIR = join(homedir(), '.rmhcode');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function readConfig(): RmhConfig | null {
  try {
    const data = readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(data) as RmhConfig;
  } catch {
    return null;
  }
}

export function writeConfig(config: RmhConfig): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function deleteConfig(): boolean {
  if (existsSync(CONFIG_FILE)) {
    unlinkSync(CONFIG_FILE);
    return true;
  }
  return false;
}

export function requireAuth(): RmhConfig {
  const config = readConfig();
  if (!config) {
    console.error('\x1b[31mNot logged in. Run `rmhcode login` first.\x1b[0m');
    process.exit(1);
  }
  return config;
}
```

**Step 3: Create API client**

Create `cli/src/lib/api.ts`:

```typescript
import type { ApiError } from '../types.js';

const API_BASE = process.env.RMHCODE_API_URL || 'https://rmhstudios.com';

interface RequestOptions {
  method?: string;
  token?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', token, body, params } = options;

  let url = `${API_BASE}${path}`;
  if (params) {
    const search = new URLSearchParams(params);
    url += `?${search.toString()}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['X-RMHCode-Token'] = token;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return data as T;
}

export { API_BASE };
```

**Step 4: Create output helpers**

Create `cli/src/lib/output.ts`:

```typescript
const ESC = '\x1b';

export const color = {
  green: (s: string) => `${ESC}[32m${s}${ESC}[0m`,
  red: (s: string) => `${ESC}[31m${s}${ESC}[0m`,
  yellow: (s: string) => `${ESC}[33m${s}${ESC}[0m`,
  cyan: (s: string) => `${ESC}[36m${s}${ESC}[0m`,
  dim: (s: string) => `${ESC}[2m${s}${ESC}[0m`,
  bold: (s: string) => `${ESC}[1m${s}${ESC}[0m`,
  violet: (s: string) => `${ESC}[35m${s}${ESC}[0m`,
};

export function success(msg: string): void {
  console.log(color.green(`✓ ${msg}`));
}

export function error(msg: string): void {
  console.error(color.red(`✗ ${msg}`));
}

export function info(msg: string): void {
  console.log(color.cyan(`→ ${msg}`));
}

export function padEnd(str: string, len: number): string {
  return str.length >= len ? str.slice(0, len) : str + ' '.repeat(len - str.length);
}
```

**Step 5: Verify compilation**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npx tsc --noEmit`
Expected: No errors

**Step 6: Commit**

```bash
git add cli/src/types.ts cli/src/lib/config.ts cli/src/lib/api.ts cli/src/lib/output.ts
git commit -m "feat(cli): add core library — config, api client, output helpers"
```

---

### Task 4: Login command

**Files:**
- Create: `cli/src/commands/login.ts`

**Step 1: Create login command**

Create `cli/src/commands/login.ts`:

```typescript
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { writeConfig } from '../lib/config.js';
import { apiRequest, API_BASE } from '../lib/api.js';
import { success, error, info } from '../lib/output.js';
import type { UserInfo } from '../types.js';

function openBrowser(url: string): void {
  const { platform } = process;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';

  import('node:child_process').then(({ execFile }) => {
    execFile(cmd, [url], (err) => {
      if (err) {
        info(`Open this URL in your browser:\n  ${url}`);
      }
    });
  });
}

async function loginWithToken(token: string): Promise<void> {
  try {
    info('Validating token...');
    const data = await apiRequest<{ valid: boolean; user: UserInfo }>(
      '/api/rmhcode/auth/validate',
      { method: 'POST', body: { token } }
    );

    writeConfig({ token, user: data.user });
    success(`Logged in as ${data.user.username || data.user.name}`);
  } catch (e) {
    error(e instanceof Error ? e.message : 'Login failed');
    process.exit(1);
  }
}

async function loginWithBrowser(): Promise<void> {
  const sessionId = randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost`);
      const token = url.searchParams.get('token');
      const errorParam = url.searchParams.get('error');
      const userParam = url.searchParams.get('user');

      // Send response to browser
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <body style="background:#0a0a0a;color:#e4e4e7;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
            <div style="text-align:center">
              <h2>${token ? '✓ Authorized!' : '✗ Authorization failed'}</h2>
              <p>You can close this tab and return to the terminal.</p>
            </div>
          </body>
        </html>
      `);

      // Process result
      if (errorParam) {
        error('Authorization denied by user');
        server.close();
        process.exit(1);
      }

      if (token && userParam) {
        try {
          const user = JSON.parse(userParam) as UserInfo;
          writeConfig({ token, user });
          success(`Logged in as ${user.username || user.name}`);
        } catch {
          error('Failed to parse user info from callback');
        }
        server.close();
        resolve();
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        error('Failed to start local server');
        process.exit(1);
      }

      const callbackUrl = `http://127.0.0.1:${addr.port}`;
      const authUrl = `${API_BASE}/rmhcode/auth?callback=${encodeURIComponent(callbackUrl)}&session=${sessionId}`;

      info('Opening browser for authentication...');
      openBrowser(authUrl);
      info('Waiting for authorization...');
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      error('Login timed out after 5 minutes');
      server.close();
      reject(new Error('timeout'));
    }, 5 * 60 * 1000);
  });
}

export async function login(args: string[]): Promise<void> {
  const tokenIdx = args.indexOf('--token');
  if (tokenIdx !== -1) {
    const token = args[tokenIdx + 1];
    if (!token) {
      error('Missing token value. Usage: rmhcode login --token YOUR_TOKEN');
      process.exit(1);
    }
    await loginWithToken(token);
  } else {
    await loginWithBrowser();
  }
}
```

**Step 2: Verify compilation**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add cli/src/commands/login.ts
git commit -m "feat(cli): add login command with token and browser auth"
```

---

### Task 5: Whoami and Logout commands

**Files:**
- Create: `cli/src/commands/whoami.ts`
- Create: `cli/src/commands/logout.ts`

**Step 1: Create whoami command**

Create `cli/src/commands/whoami.ts`:

```typescript
import { requireAuth } from '../lib/config.js';
import { apiRequest } from '../lib/api.js';
import { success, error, color } from '../lib/output.js';
import type { UserInfo } from '../types.js';

export async function whoami(): Promise<void> {
  const config = requireAuth();

  try {
    const data = await apiRequest<{ valid: boolean; user: UserInfo }>(
      '/api/rmhcode/auth/validate',
      { method: 'POST', body: { token: config.token } }
    );

    const u = data.user;
    console.log('');
    console.log(color.bold('  Logged in as:'));
    console.log(`  Name:     ${u.name}`);
    if (u.username) console.log(`  Username: ${color.violet(`@${u.username}`)}`);
    if (u.email) console.log(`  Email:    ${color.dim(u.email)}`);
    console.log('');
  } catch (e) {
    error('Token is invalid or expired. Run `rmhcode login` to re-authenticate.');
    process.exit(1);
  }
}
```

**Step 2: Create logout command**

Create `cli/src/commands/logout.ts`:

```typescript
import { deleteConfig } from '../lib/config.js';
import { success, info } from '../lib/output.js';

export function logout(): void {
  const deleted = deleteConfig();
  if (deleted) {
    success('Logged out successfully');
  } else {
    info('Already logged out');
  }
}
```

**Step 3: Verify compilation**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npx tsc --noEmit`
Expected: No errors

**Step 4: Commit**

```bash
git add cli/src/commands/whoami.ts cli/src/commands/logout.ts
git commit -m "feat(cli): add whoami and logout commands"
```

---

### Task 6: Push-build command

**Files:**
- Create: `cli/src/commands/push-build.ts`

**Step 1: Create push-build command**

Create `cli/src/commands/push-build.ts`:

```typescript
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { requireAuth } from '../lib/config.js';
import { apiRequest, API_BASE } from '../lib/api.js';
import { success, error, info, color } from '../lib/output.js';

interface BuildResponse {
  id: string;
  slug: string;
  title: string;
  status: string;
}

async function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` ${color.dim(`(${defaultValue})`)}` : '';
  const answer = await rl.question(`${color.cyan('?')} ${question}${suffix}: `);
  return answer.trim() || defaultValue || '';
}

export async function pushBuild(): Promise<void> {
  const config = requireAuth();
  const rl = createInterface({ input: stdin, output: stdout });

  try {
    console.log('');
    console.log(color.bold('  Publish a new build to RMH User Builds'));
    console.log(color.dim('  Fields marked with * are required'));
    console.log('');

    // Required fields
    let title = '';
    while (title.length < 5 || title.length > 100) {
      title = await prompt(rl, 'Title *');
      if (title.length < 5) info('Title must be at least 5 characters');
      if (title.length > 100) info('Title must be at most 100 characters');
    }

    let description = '';
    while (description.length < 10 || description.length > 500) {
      description = await prompt(rl, 'Description *');
      if (description.length < 10) info('Description must be at least 10 characters');
      if (description.length > 500) info('Description must be at most 500 characters');
    }

    // Optional fields
    const repoUrl = await prompt(rl, 'Repository URL');
    const demoUrl = await prompt(rl, 'Demo URL');

    const techInput = await prompt(rl, 'Technologies (comma-separated)');
    const technologies = techInput ? techInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    const tagInput = await prompt(rl, 'Tags (comma-separated)');
    const tags = tagInput ? tagInput.split(',').map(t => t.trim()).filter(Boolean) : [];

    const visibilityInput = await prompt(rl, 'Visibility (public/unlisted/private)', 'public');
    const visibility = visibilityInput.toUpperCase() as 'PUBLIC' | 'UNLISTED' | 'PRIVATE';

    const publishInput = await prompt(rl, 'Publish now? (y/n)', 'y');
    const publish = publishInput.toLowerCase() !== 'n';

    // Check for README.md in current directory
    let readme: string | undefined;
    const readmePath = join(process.cwd(), 'README.md');
    if (existsSync(readmePath)) {
      const includeReadme = await prompt(rl, 'Include README.md from current directory? (y/n)', 'y');
      if (includeReadme.toLowerCase() !== 'n') {
        readme = readFileSync(readmePath, 'utf-8');
      }
    }

    rl.close();

    info('Publishing build...');

    const data = await apiRequest<BuildResponse>('/api/user-builds', {
      method: 'POST',
      token: config.token,
      body: {
        title,
        description,
        repoUrl: repoUrl || undefined,
        demoUrl: demoUrl || undefined,
        technologies,
        tags,
        visibility,
        publish,
        readme,
      },
    });

    console.log('');
    success(`Build "${data.title}" ${publish ? 'published' : 'saved as draft'}!`);
    console.log(`  ${color.dim('View at:')} ${API_BASE}/user-builds/${data.slug}`);
    console.log('');
  } catch (e) {
    rl.close();
    error(e instanceof Error ? e.message : 'Failed to publish build');
    process.exit(1);
  }
}
```

**Step 2: Verify compilation**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add cli/src/commands/push-build.ts
git commit -m "feat(cli): add push-build command with interactive prompts"
```

---

### Task 7: List-builds command

**Files:**
- Create: `cli/src/commands/list-builds.ts`

**Step 1: Create list-builds command**

Create `cli/src/commands/list-builds.ts`:

```typescript
import { requireAuth } from '../lib/config.js';
import { apiRequest } from '../lib/api.js';
import { error, color, padEnd } from '../lib/output.js';
import type { BuildItem } from '../types.js';

interface ListResponse {
  items: BuildItem[];
  hasMore: boolean;
}

function statusColor(status: string): string {
  switch (status) {
    case 'PUBLISHED': return color.green(status);
    case 'DRAFT': return color.yellow(status);
    case 'ARCHIVED': return color.dim(status);
    default: return status;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export async function listBuilds(): Promise<void> {
  const config = requireAuth();

  try {
    const data = await apiRequest<ListResponse>('/api/user-builds', {
      token: config.token,
      params: { userId: config.user.id, limit: '50' },
    });

    if (data.items.length === 0) {
      console.log('');
      console.log(color.dim('  No builds found. Run `rmhcode push-build` to publish one.'));
      console.log('');
      return;
    }

    console.log('');
    console.log(
      color.bold(
        `  ${padEnd('TITLE', 30)} ${padEnd('STATUS', 12)} ${padEnd('VISIBILITY', 12)} ${padEnd('LIKES', 6)} ${padEnd('VIEWS', 6)} DATE`
      )
    );
    console.log(color.dim(`  ${'─'.repeat(90)}`));

    for (const build of data.items) {
      const title = padEnd(build.title.slice(0, 28), 30);
      const status = padEnd(statusColor(build.status), 12 + 9); // +9 for ANSI codes
      const vis = padEnd(build.visibility, 12);
      const likes = padEnd(String(build.likeCount), 6);
      const views = padEnd(String(build.viewCount), 6);
      const date = formatDate(build.publishedAt || build.createdAt);

      console.log(`  ${title} ${status} ${vis} ${likes} ${views} ${date}`);
    }

    if (data.hasMore) {
      console.log(color.dim(`\n  ... and more. View all at rmhstudios.com/user-builds`));
    }
    console.log('');
  } catch (e) {
    error(e instanceof Error ? e.message : 'Failed to fetch builds');
    process.exit(1);
  }
}
```

**Step 2: Verify compilation**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npx tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add cli/src/commands/list-builds.ts
git commit -m "feat(cli): add list-builds command with table output"
```

---

### Task 8: Entry point — command router

**Files:**
- Create: `cli/src/index.ts`

**Step 1: Create entry point**

Create `cli/src/index.ts`:

```typescript
#!/usr/bin/env node

import { login } from './commands/login.js';
import { whoami } from './commands/whoami.js';
import { pushBuild } from './commands/push-build.js';
import { listBuilds } from './commands/list-builds.js';
import { logout } from './commands/logout.js';
import { color } from './lib/output.js';

const RMH_COMMANDS: Record<string, (args: string[]) => void | Promise<void>> = {
  login,
  whoami,
  'push-build': pushBuild,
  'list-builds': listBuilds,
  logout,
};

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // If first arg is an RMH command, handle it
  if (command && command in RMH_COMMANDS) {
    try {
      await RMH_COMMANDS[command](args.slice(1));
    } catch (e) {
      console.error(color.red(e instanceof Error ? e.message : 'Unknown error'));
      process.exit(1);
    }
    return;
  }

  // Otherwise, pass through to Claude Code
  const { execFile } = await import('node:child_process');
  const claudePath = process.env.CLAUDE_CODE_PATH || 'claude';

  const child = execFile(claudePath, args, {
    stdio: 'inherit' as unknown as undefined,
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  child.on('error', (err) => {
    // If claude binary isn't found, show help
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.log('');
      console.log(color.bold(`  rmh${color.violet('code')}`));
      console.log(color.dim('  AI-powered coding assistant with RMH integrations'));
      console.log('');
      console.log('  RMH Commands:');
      console.log(`    ${color.cyan('login')}        Authenticate with your RMH account`);
      console.log(`    ${color.cyan('whoami')}       Show current authenticated user`);
      console.log(`    ${color.cyan('push-build')}   Publish a project to User Builds`);
      console.log(`    ${color.cyan('list-builds')}  List your published builds`);
      console.log(`    ${color.cyan('logout')}       Sign out and remove stored token`);
      console.log('');
      console.log(color.dim('  All other arguments are passed to Claude Code.'));
      console.log(color.dim('  Set CLAUDE_CODE_PATH if claude is not in PATH.'));
      console.log('');
    } else {
      console.error(color.red(`Failed to start Claude Code: ${err.message}`));
      process.exit(1);
    }
  });
}

main();
```

**Step 2: Build the CLI**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npx tsc`
Expected: `dist/` directory created with compiled JS files

**Step 3: Test the help output**

Run: `node /Users/kaikaidu/Documents/GitHub/rmhstudios/cli/dist/index.js 2>&1`
Expected: Shows the rmhcode help text with RMH Commands list (since claude binary likely not in path in test)

**Step 4: Commit**

```bash
git add cli/src/index.ts
git commit -m "feat(cli): add entry point with command router and Claude Code passthrough"
```

---

### Task 9: Build, test end-to-end, add to .gitignore

**Files:**
- Modify: `.gitignore` (add `cli/dist/` and `cli/node_modules/`)

**Step 1: Add cli build artifacts to .gitignore**

Append to the root `.gitignore`:

```
# CLI build artifacts
cli/dist/
cli/node_modules/
```

**Step 2: Full build**

Run: `cd /Users/kaikaidu/Documents/GitHub/rmhstudios/cli && npm run build`
Expected: Clean compilation with no errors

**Step 3: Smoke test — help output**

Run: `node /Users/kaikaidu/Documents/GitHub/rmhstudios/cli/dist/index.js`
Expected: Shows help with login, whoami, push-build, list-builds, logout

**Step 4: Smoke test — login with bad token**

Run: `RMHCODE_API_URL=https://rmhstudios.com node /Users/kaikaidu/Documents/GitHub/rmhstudios/cli/dist/index.js login --token badtoken123`
Expected: Error message about invalid token format or invalid token

**Step 5: Smoke test — whoami without auth**

Run: `node /Users/kaikaidu/Documents/GitHub/rmhstudios/cli/dist/index.js whoami`
Expected: "Not logged in. Run `rmhcode login` first."

**Step 6: Smoke test — list-builds without auth**

Run: `node /Users/kaikaidu/Documents/GitHub/rmhstudios/cli/dist/index.js list-builds`
Expected: "Not logged in. Run `rmhcode login` first."

**Step 7: Smoke test — logout when already logged out**

Run: `node /Users/kaikaidu/Documents/GitHub/rmhstudios/cli/dist/index.js logout`
Expected: "Already logged out"

**Step 8: Final commit**

```bash
git add .gitignore
git commit -m "chore: add cli build artifacts to .gitignore"
```

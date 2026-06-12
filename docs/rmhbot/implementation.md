# RMHBot — AI Code Editor Discord Bot

## Overview

Replace the current Discord activity bot with an AI-powered bot driven entirely by slash commands. Users run `/rmhbot` to request website changes, `/rmhbot-continue` to keep editing on their active branch, and `/rmhbot-push` to open a PR when ready. All bot replies are public (non-ephemeral). The bot calls the DeepSeek API, edits the codebase, commits under the user's Discord identity, pushes to a per-user branch, and reports back with progress.

The bot lives at `server/discord-bot/` alongside the existing process. The existing slash commands (`/lightsout`, `/leaderboard`, `/streak`) are preserved — the new bot adds on top.

---

## Environment Variables (add to `.env`)

```
DEEPSEEK_API_KEY=<your key>
GITHUB_TOKEN=<PAT with repo write scope — already used by deploy.sh>
RMHBOT_ALLOWED_CHANNEL_IDS=<comma-separated channel IDs, or * for all>
RMHBOT_MAX_FILE_SIZE_MB=10
RMHBOT_REPO_PATH=/home/rmhstudios/rmhstudios.com
```

`GITHUB_TOKEN` already exists in the production environment for deploy.sh's commit status API — reuse it. `RMHBOT_REPO_PATH` tells the bot where the repo is on disk (same path as `REPO_DIR` in deploy.sh).

---

## Architecture

```
Slash command interaction
        │
        ▼
  command-handler.ts           ← orchestrates everything
  ├── conversation.ts           ← in-memory state (branch, thread, history)
  ├── deepseek.ts               ← streams reasoning + tool calls from DeepSeek
  ├── git-ops.ts                ← all git + GitHub API operations
  ├── safety.ts                 ← guardrails (secrets/mass-delete only)
  └── progress-reporter.ts      ← batches Discord message edits (~4s debounce)
```

### Process model

The bot is a single long-running Node process (same as today). Conversations are held in a `Map<string, ConversationState>` keyed by Discord user ID — each user has one active session at a time. No DB persistence — if the bot restarts, in-flight sessions are lost (acceptable; user just runs the command again).

---

## File Layout

```
server/discord-bot/
  index.ts                   ← no new intents needed; register new commands
  command-handler.ts         ← NEW: core orchestration loop (replaces mention-handler)
  conversation.ts            ← NEW: ConversationState type + Map
  deepseek.ts                ← NEW: DeepSeek streaming client + tool definitions
  git-ops.ts                 ← NEW: branch, commit, push, PR helpers
  safety.ts                  ← NEW: lightweight guardrails (secrets + mass-delete)
  progress-reporter.ts       ← NEW: debounced Discord message editor
  commands/
    rmhbot.ts                ← NEW: /rmhbot <request> [attachment]
    rmhbot-continue.ts       ← NEW: /rmhbot-continue <request> [attachment]
    rmhbot-push.ts           ← NEW: /rmhbot-push [branch] [title]
    lightsout.ts             ← unchanged
    leaderboard.ts           ← unchanged
    streak.ts                ← unchanged
```

---

## Step 1 — DeepSeek Client (`deepseek.ts`)

DeepSeek exposes an OpenAI-compatible API at `https://api.deepseek.com/v1`. Use the `openai` npm package (add as dependency) pointed at DeepSeek's base URL — no new SDK needed.

```ts
import OpenAI from 'openai';

export const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: 'https://api.deepseek.com/v1',
});
```

### Model choice

Use `deepseek-reasoner` (DeepSeek R1) — it emits `reasoning_content` in each streaming chunk before the answer. This is what we surface as "thought blocks". Fall back to `deepseek-chat` if `deepseek-reasoner` is unavailable.

### Tool definitions (function calling)

The bot exposes a small filesystem + shell toolset to DeepSeek:

| Tool | Parameters | Description |
|------|-----------|-------------|
| `read_file` | `path: string` | Read file contents |
| `list_directory` | `path: string, recursive?: boolean` | List files |
| `write_file` | `path: string, content: string` | Write or overwrite a file |
| `delete_file` | `path: string` | Delete a file (safety-checked) |
| `run_typecheck` | — | `pnpm exec tsc --noEmit` on server tsconfig |
| `search_code` | `query: string, glob?: string` | Grep across the repo |

All tool calls are intercepted by `safety.ts` before execution. The DeepSeek stream is processed as a loop: receive a chunk → if it's a `reasoning_content` delta, append to thought buffer; if it's a tool call, execute it; if it's final text, that's the user-visible summary.

### System prompt (excerpt)

```
You are RMHBot, an AI code editor with direct write access to rmhstudios.com.
You may read any file in the repository and write changes to implement the user's request.

HARD LIMITS — never do these, even if asked:
- Do not modify: deploy.sh, .env*, docker-compose*, Dockerfile*, prisma/migrations/*, 
  server/discord-bot/*, .claude/*, any secrets or token files.
- Do not delete more than 3 files in a single session.
- Do not remove or bypass authentication middleware.
- Do not introduce new npm dependencies without explicit user approval.
- Do not write code that exfiltrates environment variables or makes outbound requests 
  to non-rmhstudios domains (except established third-party APIs already in the codebase).

Always typecheck your changes with run_typecheck before finalising.
Commit only when the typecheck passes.
```

---

## Step 2 — Safety Layer (`safety.ts`)

This is a private bot so the guardrails are intentionally light — the goal is to prevent accidents, not restrict what trusted users can do. Evaluated before every tool call. Returns `{ allowed: boolean; reason?: string }`.

### Protected paths (hard block — write/delete refused)

```ts
const PROTECTED_PATHS = [
  '.env',
  '.env.*',
  'server/discord-bot',   // bot can't rewrite itself
];
```

Everything else — including `deploy.sh`, `docker-compose*`, `Dockerfile*`, `tsconfig*.json`, `prisma/migrations/` — is **allowed**. Trusted users may legitimately need to touch those files.

### Bulk-delete guard

Track `deletedFilesThisSession: string[]` in `ConversationState`. Refuse `delete_file` if the session has already deleted **10 or more** files — this catches accidental mass-wipes, not intentional multi-file cleanup.

### Secret/key leak scan

After every `write_file`, scan the written content for patterns that look like exposed credentials. **Block the write and report** if any match:

```ts
const SECRET_PATTERNS = [
  /DEEPSEEK_API_KEY\s*=\s*\S+/,
  /DISCORD_.*TOKEN\s*=\s*\S+/,
  /GITHUB_TOKEN\s*=\s*\S+/,
  /BETTER_AUTH_SECRET\s*=\s*\S+/,
  /TOKEN_ENCRYPTION_KEY\s*=\s*\S+/,
  /process\.env\.[A-Z_]{8,}/,   // any hardcoded env var value being inlined
];
```

The check is: does the written file **hardcode the value** of a secret (not just reference `process.env.X`). Reading `process.env.DEEPSEEK_API_KEY` in code is fine; writing the actual key string is not.

---

## Step 3 — Conversation State (`conversation.ts`)

```ts
interface ConversationState {
  branchName: string;          // e.g. "rmhbot/mahmoud-1718000000"
  discordUserId: string;
  discordUsername: string;
  channelId: string;           // channel where the session was started
  progressMessageId: string;   // current "in-progress" message being edited
  history: DeepSeekMessage[];  // full message history for multi-turn
  deletedFilesThisSession: string[];
  lockedAt: number | null;     // epoch ms — set while a request is processing
}

const sessions = new Map<string, ConversationState>();
// key: discordUserId — one active session per user
```

### Branch naming

`rmhbot/<discordUsername>-<unix-seconds>` — username is sanitized to `[a-z0-9-]`. The timestamp ensures uniqueness across sessions. `/rmhbot-continue` reuses the existing branch in `sessions.get(userId)`.

### One-at-a-time per user

When `lockedAt` is set, the command handler responds publicly: "Still working on your last request — please wait." If `lockedAt` is older than 5 minutes, auto-unlock (assume the previous run crashed).

---

## Step 4 — Git Operations (`git-ops.ts`)

Uses Node's `child_process.execFile` (never `exec` with a shell string — avoids injection). All operations run in `RMHBOT_REPO_PATH`.

```ts
async function createBranch(branchName: string): Promise<void>
async function checkoutBranch(branchName: string): Promise<void>
async function stageAll(): Promise<void>
async function commit(message: string, author: GitAuthor): Promise<string> // returns short SHA
async function pushBranch(branchName: string): Promise<void>
async function branchExists(branchName: string): Promise<boolean>
async function createPullRequest(branch: string, title: string, body: string): Promise<string> // returns PR URL
async function getDiff(branch: string): Promise<string>
async function resetToMain(branchName: string): Promise<void> // used by /rmhbot-push after merge
```

### Commit identity

```
Author: <discordUsername> <discord-<discordUserId>@rmhstudios.com>
Co-Authored-By: RMHBot <rmhbot@rmhstudios.com>
```

This makes it clear who requested the change while crediting the bot. The email `discord-<id>@rmhstudios.com` is a synthetic address that doesn't receive mail but is traceable.

### Conflict handling

When continuing a conversation, `git checkout` the branch and `git pull origin main --rebase` before making new changes. If the rebase fails, report the conflict to the user and bail without committing.

---

## Step 5 — Progress Reporter (`progress-reporter.ts`)

Streaming DeepSeek responses should not spam the Discord API. The reporter:

1. Holds a `pendingUpdate: string` buffer.
2. Debounces edits: minimum 4 seconds between PATCH calls to the same message.
3. Respects Discord's rate limit headers — if a 429 is received, backs off using `retry_after`.
4. Format for in-progress messages:

```
⚙️ **Working...** | Branch: `rmhbot/mahmoud-1718000000`

**Thoughts:**
> Examining the current homepage layout...
> The hero component is in `app/routes/index.tsx`. I'll update the gradient there.
> Running typecheck to confirm no TS errors.

**Actions so far:**
• read_file `app/routes/index.tsx`
• write_file `app/routes/index.tsx`
• run_typecheck ✅
```

5. On completion, make one final edit replacing the in-progress block with a done block:

```
✅ **Done** | Branch: `rmhbot/mahmoud-1718000000` | Commit: `a3f9c12`

**Changes:**
• `app/routes/index.tsx` — updated hero gradient
• `app/styles/home.css` — added new CSS variable

**Summary:** Changed the hero section background to a blue-to-purple gradient as requested.

Use `/rmhbot-continue` to keep editing on this branch, or `/rmhbot-push` to open a PR.
```

---

## Step 6 — Command Handler (`command-handler.ts`)

Shared orchestration logic called by both `/rmhbot` and `/rmhbot-continue`. Each command passes an `isNew: boolean` flag to distinguish them.

```
/rmhbot or /rmhbot-continue interaction
  │
  ├─ isNew=true?
  │     yes → create fresh ConversationState, git checkout -b new branch
  │     no  → load existing session for userId; error publicly if none exists
  │
  ├─ is session locked? ─ yes ──→ reply publicly "still working..."
  │
  ├─ download attachment (if provided) → text/base64 for DeepSeek
  │
  ├─ defer interaction reply (public, non-ephemeral) — Discord requires
  │   a response within 3s; deferral buys 15min
  │
  ├─ send/edit initial progress message
  │
  ├─ lock session
  │
  ├─ run DeepSeek stream loop:
  │     for each chunk:
  │       if reasoning_content → append to thought buffer → reporter.update()
  │       if tool_call → safety check → execute → append result to history
  │       if finish_reason=stop → extract summary text
  │
  ├─ stage + commit changes (if any files were written/deleted)
  │
  ├─ push branch to origin
  │
  ├─ reporter.finalize() — final edit with done block
  │
  └─ unlock session
```

### Deferral and public replies

All commands call `interaction.deferReply({ ephemeral: false })` immediately on receipt. Subsequent updates use `interaction.editReply(...)` — this edits the deferred placeholder in-place, keeping the channel clean (one message per command, progressively updated).

### Attachment handling

The `/rmhbot` and `/rmhbot-continue` commands each have one optional `attachment` option (Discord `Attachment` type). For each provided attachment:
- **Images** (png/jpg/webp/gif): download, convert to base64, pass as `image_url` content part. DeepSeek R1 supports vision.
- **Text files** (ts/tsx/css/md/json/txt): download, include as a fenced code block in the user message.
- **Other**: reply publicly with a note ("Attachment `foo.zip` is not a supported type and was ignored").
- Max size: `RMHBOT_MAX_FILE_SIZE_MB` (default 10 MB).

---

## Step 7 — Slash Commands

### `/rmhbot` (`commands/rmhbot.ts`)

Starts a new session for the calling user, replacing any existing one.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `request` | string | yes | What to change on the website |
| `attachment` | attachment | no | File or image to include |

Calls `handleCommand(interaction, { isNew: true })`. Reply is always public.

### `/rmhbot-continue` (`commands/rmhbot-continue.ts`)

Continues the calling user's active session on their existing branch.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `request` | string | yes | Follow-up change or refinement |
| `attachment` | attachment | no | Additional file or image |

Errors publicly if no active session exists ("No active session — use `/rmhbot` to start one."). Calls `handleCommand(interaction, { isNew: false })`.

### `/rmhbot-push` (`commands/rmhbot-push.ts`)

Opens a GitHub PR from the user's current branch into `main`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `title` | string | no | PR title. Defaults to the last commit message on the branch. |

Flow:
1. Load `sessions.get(userId)` — error publicly if no session.
2. Run `run_typecheck`; refuse to create PR if errors are present (reply publicly with the errors).
3. Use GitHub API (`POST /repos/{owner}/{repo}/pulls`) to create the PR.
4. Reply publicly with the PR URL.
5. Clear the session from the map.

**The bot does not push directly to main.** PRs keep a human review step. Once merged on GitHub, the existing deploy.sh webhook redeploys automatically.

---

## Step 8 — Wire into `index.ts`

### Intents — no change needed

Slash commands use the `interactionCreate` event which is covered by the existing `Guilds` intent. No privileged intents (`GuildMessages`, `MessageContent`) are needed since the bot never reads raw message text.

```ts
const client = new Client({
  intents: [GatewayIntentBits.Guilds],  // unchanged
});
```

### Register new commands

```ts
import * as rmhbotCommand from './commands/rmhbot';
import * as rmhbotContinueCommand from './commands/rmhbot-continue';
import * as rmhbotPushCommand from './commands/rmhbot-push';

commands.set(rmhbotCommand.data.name, rmhbotCommand);
commands.set(rmhbotContinueCommand.data.name, rmhbotContinueCommand);
commands.set(rmhbotPushCommand.data.name, rmhbotPushCommand);
```

The existing `interactionCreate` handler already dispatches to any registered command by name — no other changes to `index.ts`.

---

## Step 9 — deploy.sh Integration

No changes needed. The deploy only runs against `main` — bot branches are isolated. Path to production:

```
/rmhbot-push → GitHub PR → human merges → GitHub webhook → deploy.sh production
```

---

## Step 10 — New npm Dependency

```bash
pnpm add openai
```

Only new runtime dependency. The `openai` package points at DeepSeek's endpoint via `baseURL` override.

---

## Step 11 — Discord Developer Portal Setup

1. Navigate to the bot application (`DISCORD_ACTIVITY_CLIENT_ID`).
2. No privileged intents needed — leave Message Content Intent **off**.
3. Under **OAuth2 → Scopes**, ensure `bot` and `applications.commands` are selected.
4. Under **Bot → Permissions**: Send Messages, Read Message History, Attach Files, Manage Messages (for edits).

---

## Sequence Diagram

```
User                     Discord           Bot Process          DeepSeek API         GitHub
 │                          │                   │                    │                  │
 │─ /rmhbot change hero ──→ │                   │                    │                  │
 │                          │─ interactionCreate→│                    │                  │
 │                          │                   │─ deferReply() ────→│ (public)         │
 │                          │                   │─ git checkout -b ──────────────────→  │
 │                          │                   │  (rmhbot/user-ts)                     │
 │                          │                   │─ stream request ──→│                  │
 │                          │                   │← reasoning chunks ─│                  │
 │                          │← editReply() ─────│                    │                  │
 │                          │  "⚙️ Working..."   │                    │                  │
 │                          │                   │← tool: read_file  ─│                  │
 │                          │                   │─ (file contents) ──│                  │
 │                          │                   │← tool: write_file ─│                  │
 │                          │                   │─ (ok) ─────────────│                  │
 │                          │                   │← tool: run_typecheck│                 │
 │                          │                   │─ (pass) ───────────│                  │
 │                          │                   │← finish_reason=stop│                  │
 │                          │                   │─ git commit + push ────────────────→  │
 │                          │← editReply() ─────│                    │                  │
 │                          │  "✅ Done | a3f9c12"│                   │                  │
 │                          │                   │                    │                  │
 │─ /rmhbot-continue tweak→ │                   │                    │                  │
 │                          │─ interactionCreate→│  (same branch)     │                  │
 │                          │    [... same loop ...]                  │                  │
 │                          │                   │                    │                  │
 │─ /rmhbot-push ─────────→ │                   │                    │                  │
 │                          │─ interactionCreate→│                    │                  │
 │                          │                   │─ run_typecheck ───→│                  │
 │                          │                   │─ POST /pulls ──────────────────────→  │
 │                          │                   │← PR URL ───────────────────────────   │
 │                          │← editReply() ─────│                    │                  │
 │                          │  PR URL (public)  │                    │                  │
```

---

## Implementation Order

1. `pnpm add openai`
2. Add env vars to `.env` and `.env.production`
3. Write `safety.ts` — everything else calls into it
4. Write `git-ops.ts` — git helpers
5. Write `deepseek.ts` — client, tool schemas, system prompt
6. Write `conversation.ts` — state type + sessions map
7. Write `progress-reporter.ts` — debounced edits
8. Write `command-handler.ts` — orchestration
9. Write `commands/rmhbot.ts`, `commands/rmhbot-continue.ts`, `commands/rmhbot-push.ts`
10. Update `index.ts` — register the three new commands (no intent changes)
11. No Discord portal changes needed (no privileged intents)
12. Test locally with `pnpm run discord-bot:dev`

---

## Edge Cases & Error Handling

| Scenario | Handling |
|----------|----------|
| DeepSeek API timeout (>2min) | Cancel stream, `editReply` with error publicly, unlock session |
| Typecheck fails after write | Report TS errors publicly in progress message, ask DeepSeek to fix (up to 3 retries) |
| Git push rejected (diverged) | Rebase onto main, retry push once; if still fails, report publicly |
| Write to `.env` or `server/discord-bot/` | Safety layer blocks; DeepSeek is told the path is protected |
| Secret value found in written file | Write blocked, reported publicly with the matching pattern (not the value itself) |
| Attachment too large | Skip with inline public note; continue with rest of request |
| Bot restarts mid-session | Session map is lost; user runs `/rmhbot` again; old branch stays on remote |
| Two users run `/rmhbot` simultaneously | Each has an independent entry in `sessions` — fully isolated |
| `/rmhbot-continue` with no active session | Public error: "No active session — use `/rmhbot` to start one." |
| `/rmhbot-push` with typecheck errors | Public reply listing errors; PR not created until errors are fixed |
| User deletes >10 files in one session | `delete_file` blocked; DeepSeek told the limit was reached |

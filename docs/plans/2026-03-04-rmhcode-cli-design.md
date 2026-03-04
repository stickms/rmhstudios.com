# rmhcode CLI — RMH Builds Integration

## Overview

Add 5 commands to the rmhcode CLI that connect to rmhstudios.com for managing User Builds. The existing Claude Code functionality is untouched — these commands are intercepted before Claude Code runs.

Commands: `login`, `whoami`, `push-build`, `list-builds`, `logout`.

## Architecture

```
cli/
├── package.json          # standalone package, bin: "rmhcode"
├── tsconfig.json
├── src/
│   ├── index.ts          # entry point — intercept RMH commands, else pass to Claude Code
│   ├── commands/
│   │   ├── login.ts      # rmhcode login [--token TOKEN]
│   │   ├── whoami.ts      # rmhcode whoami
│   │   ├── push-build.ts  # rmhcode push-build
│   │   ├── list-builds.ts # rmhcode list-builds
│   │   └── logout.ts      # rmhcode logout
│   └── lib/
│       ├── config.ts      # read/write ~/.rmhcode/config.json
│       ├── api.ts         # HTTP client wrapper (X-RMHCode-Token header)
│       └── output.ts      # colored terminal output helpers
```

## Token Storage

- Location: `~/.rmhcode/config.json`
- Format: `{ "token": "...", "user": { "id": "...", "name": "...", "username": "..." } }`
- File permissions: `0600` (owner-only)
- `login` writes it, `logout` deletes it, all other commands read it

## Commands

### `rmhcode login --token TOKEN`

1. Validate token via `POST /api/rmhcode/auth/validate` with `{ token }`
2. On success, write token + user info to `~/.rmhcode/config.json`
3. Print: `Logged in as {username}`

### `rmhcode login` (no token flag)

1. Generate a random session ID
2. Start a local HTTP server on a random port (localhost)
3. Open browser to `https://rmhstudios.com/rmhcode/auth?callback=http://localhost:PORT&session=SESSION_ID`
4. User authorizes in browser, site redirects back with token in query params
5. Store token + user info, shut down local server
6. Print: `Logged in as {username}`

### `rmhcode whoami`

1. Read config file
2. If no token: print "Not logged in" and exit
3. Validate token via API to confirm it's still active
4. Print user info (name, username, email)

### `rmhcode push-build`

1. Check auth (read config, fail if not logged in)
2. Interactive prompts via readline:
   - Title (required, 5-100 chars)
   - Description (required, 10-500 chars)
   - Repository URL (optional)
   - Demo URL (optional)
   - Technologies (comma-separated, optional)
   - Tags (comma-separated, optional)
   - Visibility: PUBLIC / UNLISTED / PRIVATE (default: PUBLIC)
   - Publish now? y/n (default: y)
3. `POST /api/user-builds` with `X-RMHCode-Token` header
4. Print build URL on success: `https://rmhstudios.com/user-builds/{slug}`

### `rmhcode list-builds`

1. Check auth
2. `GET /api/user-builds?userId={self}` with `X-RMHCode-Token` header
3. Print table: title, status, visibility, likes, views, date

### `rmhcode logout`

1. Delete `~/.rmhcode/config.json`
2. Print: "Logged out successfully"

## Server-Side Changes

### GET `/api/user-builds` — Add CLI token auth

Currently the GET handler only resolves `currentUserId` from session. Need to also check `X-RMHCode-Token` header so CLI `list-builds` can fetch the user's own builds (including drafts).

Change in `app/api/user-builds/route.ts`:
```typescript
// Before: session only
const session = await auth.api.getSession({ headers: await headers() });
currentUserId = session?.user?.id ?? null;

// After: session OR CLI token
const session = await auth.api.getSession({ headers: await headers() }).catch(() => null);
currentUserId = session?.user?.id ?? null;

if (!currentUserId) {
  const cliUser = await getAuthenticatedUser(req, null);
  if (cliUser) currentUserId = cliUser.id;
}
```

No other server-side changes needed — POST already supports dual auth.

## Dependencies

Zero external dependencies. Uses:
- Node.js built-in `process.argv` for arg parsing
- Node.js built-in `readline` for interactive prompts
- Node.js built-in `fetch` (Node 18+) for API calls
- Node.js built-in `http` for OAuth callback server
- Node.js built-in `fs` for config file
- Node.js built-in `crypto` for session ID generation
- `open` package for cross-platform browser opening (or platform-specific commands via execFile)

## Install

Existing install script at `github.com/ka1kqi/rmhcode` installs the CLI. The `cli/` directory compiles via `tsc` with `bin` field in `package.json` pointing to `dist/index.js`.

## API Base URL

Production: `https://rmhstudios.com`
Configurable via `RMHCODE_API_URL` env var for development.

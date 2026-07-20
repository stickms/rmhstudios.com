# rmhstudios.com

**A single social + gaming + apps platform**

rmhstudios.com is one large, high-performance web platform: a social feed
(RMHarks), ~20 browser games (several multiplayer/3D), a suite of full apps, a
blog/news/library system, a coin economy with Stripe memberships, and a scoped
developer API — served by a React SSR tier with Node realtime hubs and a Go
worker fleet behind it. It features a dynamic, animated UI (7 themes + accent
presets, 32 locales) alongside real-time multiplayer.

## Features

-   **Games Library**: ~20 original games ready to play directly in the browser:
    -   *Slice It!* (swipe-slicing arcade with custom song uploads)
    -   *RMHBox* (multiplayer party-minigame lobby — Rhyme Time, Emoji Cinema, Undercover Editor, and more)
    -   *Altair* (multiplayer strategy game)
    -   *VELUM 2099* (3D sci-fi action) · *Forest Explorer* (3D exploration) · *Void Breaker* (brick-breaker) · *Kowloon Knockout* (pixel fighter)
    -   *Synapse Storm* (multiplayer trivia) · *Dream Rift* (co-op bullet hell) · *RMH Farming Sim* (pixel farming)
    -   *Daily Puzzles* hub (Lights Out, Alibi, Chainlink, Impostor, Outcast, Spectrum) · *Strategies* (coalition meta-game)
    -   *Signal Forge*, *Cursed Logic*, *Project Vega* (hidden `/secret/` games), plus *Temple of Joy*, *Neon Driftway*, *House Always Wins*, *Laundry Sort*, *Cookgame*, *Versecraft*, and more
-   **Apps**: RMHTube (watch videos in sync), RMHMusic (Spotify listening rooms), RMHType (typing races), RMHStudy (synced Pomodoro rooms), RMHCode (installable coding CLI + tokens), RMHLadder (early-career job board), plus the RMHVibe / Creator Studio AI page builder.
-   **Social & Economy**: Social feed (RMHarks), messaging & group chats, communities, profiles, achievements/quests, a coin economy (wallet, shop, market, staking, battle pass, tips), tournaments/ranked/wager, and Stripe-backed memberships.
-   **Authentication (RMH Auth)**: Secure login powered by Better Auth — Discord, Google, and GitHub OAuth plus passkeys.
-   **Developer API**: A scoped, versioned public API (`/api/v1`) with in-app docs at `/developer/docs`.
-   **Modern UI/UX**: Built with **Tailwind CSS v4** and **Framer Motion** for smooth animations, complex transitions, and a premium aesthetic (`liquid-glass` is the default theme).
-   **Immersive Audio & 3D**: Games powered by `howler`/`tone` for audio and `@react-three/fiber` / `@react-three/rapier` for 3D physics.
-   **Blog / News / Library**: Blog, news, and a document library (DB-backed, covers served from R2).

## Tech Stack

-   **Framework**: [TanStack Start](https://tanstack.com/start) + [Vite](https://vite.dev/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
-   **Animations**: [Framer Motion](https://www.framer.com/motion/)
-   **SSR / Server**: [Nitro](https://nitro.build/) (server runtime), Socket.io (real-time WebSocket servers)
-   **Database**: PostgreSQL, [Prisma Client](https://www.prisma.io/)
-   **Authentication**: [Better Auth](https://better-auth.com/)
-   **WebGL / Audio**: React Three Fiber, Rapier Physics, Pixi.js, Howler.js
-   **State**: Zustand, TanStack React Query
-   **Backend services**: Go (`go-services/`) — built with [Bazel](https://bazel.build/) (+ gazelle)

## Service topology (Node + Go)

Production is a **hybrid runtime** (Docker Compose on a VPS behind
Apache/Cloudflare). **Node** runs the web SSR tier, every user-facing realtime
hub, and three background workers; **Go** runs the background-worker supervisor,
the status dashboard, and the asset streamer. All container ports bind to
`127.0.0.1`; Apache is the only front door. See
[`docs/architecture.md`](docs/architecture.md) for the full picture.

**Node services** (`server/`)

| Service | Port | Role |
|---|---|---|
| `web` (Nitro SSR) | 7005 (blue/green spare 7015) | React SSR app + API routes |
| `socket` | 7001 | Games realtime hub (Socket.IO); also hosts RMHMusic |
| `rmhbox` | 7676 | Party-game lobby hub (Socket.IO) |
| `rmhtube` | 7003 | Watch-together hub (Socket.IO) |
| `ladder-worker` | — | RMHLadder job-discovery cron (`node-cron`) |
| `homes-worker` | — | RMHHomes listings-scraper cron (`node-cron`) |
| `jobs` | — | Durable async backbone (pg-boss): progression, event reminders, weekly digest |

**Go services** (`go-services/`)

| Service | Port | Role |
|---|---|---|
| `supervisor` | 9090 (metrics) | Runs six background workers as goroutines: discord-bot, recap, doctrine-worker, vibe-worker, bot-worker, streak-saver |
| `status` | 7008 | Standalone health dashboard (`/`, `/api/status`); survives outages |
| `assets` | 7007 | Range-aware S3/R2 streaming for `/library` `/music` `/models` `/sprites` |

> The earlier full-Go realtime topology (a `gateway` fronting Go `gamehub` /
> `rmhbox` / `rmhtube` / `rmhmusic` hubs with a Redis backplane, plus its
> Helm/k3s charts) was **removed in the rewrite** — it never served production
> traffic and duplicated the Node hubs. Recover it from git history (tag
> `pre-rewrite-go-realtime`) if it is ever revived.

Build & test the Go fleet (from the repo root):

```bash
make gazelle        # regenerate Bazel BUILD files after adding Go files
make test           # bazel test //go-services/... (+ vitest)
make build          # bazel build //go-services/cmd/...
```

In production the Go binaries are compiled by the root `Dockerfile`'s
`go-builder` stage (plain `go build ./cmd/...`) into the `rmhstudios-app-full`
image — Bazel is the CI unit-test gate, not the production build. `docker-compose.yml`
runs everything from two images built off that one `Dockerfile` (`rmhstudios-app`
slim for the Node services, `rmhstudios-app-full` for the Go services +
Chromium/git). MinIO provides the S3-compatible bucket the `assets` service
streams from locally.

## Project Structure

```bash
├── app/                  # TanStack Start routes (file-based routing)
│   ├── routes/           # All page and API routes
│   │   ├── _site/        # Public site routes (home, news, blog, profiles, etc.)
│   │   ├── api/          # Server API routes
│   │   ├── rmhbox/       # RMHBox minigame routes
│   │   ├── altair/       # Altair game routes
│   │   └── ...           # Other game/app routes
│   └── globals.css       # Global styles and theme definitions
├── components/           # React components organized by feature (~860 files)
├── lib/                  # Utility functions, schemas, and shared logic (~950 files; *.server.ts = server-only)
├── server/               # Node service tier (Nitro plugins, WebSocket hubs, cron/async workers)
├── go-services/          # Go worker fleet: supervisor + status + assets (Bazel + gazelle)
├── stores/               # Zustand state management
├── hooks/                # Custom React hooks
├── prisma/               # Database schema (234 models) and migrations
├── data/                 # Static JSON (RMHBox content packs, library metadata)
├── scripts/              # Utility scripts (seeding, i18n pipeline, OG/icon gen, ladder/news pipelines)
├── public/               # Static assets (images, sprites, music)
├── deploy/               # Apache vhosts, blue/green hotswap, Postgres/backups, Terraform DNS, runbooks
├── testing/              # Vitest test files
├── docker-compose.yml    # Container topology (Node + Go services + Redis + MinIO)
└── deploy.sh             # Deployment script (blue/green web hotswap)
```

## Development Setup

### Prerequisites

-   **Node.js**: v20 or higher recommended.
-   **Package Manager**: `pnpm` (required).
-   **Database**: A running instance of PostgreSQL.

### Environment Variables (.env)

Create a `.env` file in the root of the project. See `.env.example` for all available variables. Minimum required:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/rmhstudios

# Better Auth Configuration
BETTER_AUTH_SECRET=generate_a_secure_random_string
BETTER_AUTH_URL=http://localhost:7005/

# Socket Server
VITE_SOCKET_URL=http://localhost:7001
SOCKET_CORS_ORIGIN=http://localhost:7005
```

### Installation & Running Locally

1.  Clone the repository and install dependencies:
    ```bash
    git clone https://github.com/stickms/rmhstudios.com.git
    cd rmhstudios.com
    pnpm install
    ```

2.  Setup the database:
    ```bash
    pnpm run db:push
    ```

3.  Run the development server (runs Vite plus the socket/rmhbox/rmhtube hubs and the ladder/homes/jobs workers concurrently):
    ```bash
    pnpm dev
    ```

4.  Open [http://localhost:7005](http://localhost:7005) in your browser.

## Build & Deployment

The application is deployed to a VPS with **Docker Compose** behind
Apache/Cloudflare. The web container deploys blue/green with a health-gated
port flip (`deploy/hotswap-web.sh`). Full pipeline details:
[`docs/architecture.md`](docs/architecture.md).

1.  **To create a production build:**
    ```bash
    pnpm build
    ```
    This compiles the Vite/Nitro app and bundles the WebSocket servers via esbuild.

2.  **Deployment:**
    Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds
    the two images on a native ARM64 runner, pushes them to GHCR, then POSTs
    an HMAC-signed request to the VPS webhook receiver (`webhook-server.cjs`).
    That runs `./deploy.sh production <sha>`, which pulls those images →
    prisma migrate → compose up → blue/green web hotswap. `deploy.sh` can
    also be run manually on the VPS. See
    [`deploy/README.md`](deploy/README.md) for setup.

## Documentation

- **Coding agents / contributors start here:** [`CLAUDE.md`](CLAUDE.md) (or [`AGENTS.md`](AGENTS.md)) — repo-wide conventions, plus per-directory guides in `app/`, `components/`, `lib/`, `server/`, and `go-services/`.
- **Docs index:** [`docs/README.md`](docs/README.md) — reference docs, runbooks, design docs, and known-stale docs.
- **Design language:** [`docs/design-language.md`](docs/design-language.md) · **Page consistency:** [`docs/page-consistency.md`](docs/page-consistency.md) · **Runtime & deploy:** [`docs/architecture.md`](docs/architecture.md)

# rmhstudios.com

**Digital Portfolio, Blog, & Gaming Studio Platform**

rmhstudios.com is a modern, high-performance web application designed to showcase a digital portfolio, devlogs, and a fully functional gaming platform. Built with the latest web technologies, it features a dynamic, animated user interface alongside real-time multiplayer gaming capabilities.

## Features

-   **Games Library**: A suite of original games ready to play directly in the browser:
    -   *Slice It!* (Interactive rhythm game with custom song uploads)
    -   *RMHBox* (Multiplayer minigame lobby — Rhyme Time, Emoji Cinema, Undercover Editor, and more)
    -   *Altair* (Multiplayer strategy game)
    -   *VELUM 2099* (3D cyberpunk game)
    -   *Forest Explorer* (3D exploration game)
    -   *Synapse Storm* (Multiplayer trivia)
    -   *Signal Forge*, *Temple of Joy*, *Neon Driftway*, *Kowloon Knockout*, *Lights Out*, *Cursed Logic*, *House Always Wins*, *Laundry Sort*, *Void Breaker*, and more
-   **Apps**: RMHTube (video platform), RMHMusic (collaborative listening rooms), RMHType (typing races), RMHStudy (study tools), RMHCode (code editor)
-   **Multiplayer & Social**: Real-time multiplayer lobbies, match results, leaderboards, social feed, messaging, and user profiles.
-   **Authentication (RMH Auth)**: Secure user login powered by Better Auth, including Discord, GitHub, and Google integration.
-   **Modern UI/UX**: Built with **Tailwind CSS v4** and **Framer Motion** for smooth animations, complex transitions, and premium aesthetic (20+ themes).
-   **Immersive Audio & 3D**: Games powered by `howler` for audio and `@react-three/fiber` / `@react-three/rapier` for 3D physics.
-   **Blog / Research**: Blog system with research papers and devlogs.

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

## Backend Services (Go)

The backend service layer has a Go implementation (`go-services/`). Production
today is a **hybrid**: the React SSR `web` tier and the realtime hubs
(socket-server, rmhbox, rmhtube) run Node, while the Go fleet runs the five
background workers (as one `supervisor` process), the `status` dashboard, and
the `assets` streamer. The full-Go topology (gateway + Go hubs) is deployable
via Helm/k3s but is not the production request path yet — see
[`docs/architecture.md`](docs/architecture.md) for what actually runs where.

| Service | Port | Role | In prod today? |
|---|---|---|---|
| `gateway` | 7005 | Edge / reverse-proxy in front of the hubs + assets | k3s topology only |
| `gamehub` (socket) | 7001 | Realtime games WebSocket hub | Node runs this |
| `rmhbox` | 7676 | Party-game WebSocket hub | Node runs this |
| `rmhtube` | 7003 | Watch-together WebSocket hub | Node runs this |
| `rmhmusic` | 7002 | Collaborative listening WebSocket hub | Node (inside socket-server) |
| `assets` | 7007 | Streams `/library` `/music` `/models` `/sprites` from S3 (Range-aware), replacing the Apache-off-disk CDN | ✅ Go |
| `status` | 7008 | Standalone health dashboard (`/`, `/api/status`); survives outages | ✅ Go |
| `supervisor` | 9090 | Runs the five background workers (discord-bot, recap, doctrine-worker, vibe-worker, bot-worker) as goroutines in one process | ✅ Go |

Build & test the Go services with Bazel:

```bash
cd go-services
bazel run //:gazelle                 # regenerate BUILD files after adding Go files
bazel test //go-services/...         # run all Go tests
bazel build //go-services/images/... # assemble the per-service OCI images
```

Locally, `docker-compose.yml` runs the Go services from two images built off the
same `Dockerfile` (`rmhstudios-app` slim for the Node services, `rmhstudios-app-full`
for the Go services + Chromium/git). MinIO provides the S3-compatible bucket the
`assets` service streams from.

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
├── components/           # React components organized by feature (594 files)
├── lib/                  # Utility functions, schemas, and shared logic (361 files)
├── server/               # Node service entrypoints (WebSocket servers, workers, status)
├── go-services/          # Go port of the backend services (hubs, gateway, status, assets, supervisor)
├── stores/               # Zustand state management
├── hooks/                # Custom React hooks
├── prisma/               # Database schema and migrations
├── data/                 # Game data (JSON)
├── scripts/              # Utility scripts (seeding, migrations, blog generation)
├── public/               # Static assets (images, sprites, music)
├── deploy/               # Helm charts, Docker bases, runbooks
├── testing/              # Vitest test files
├── docker-compose.yml    # Container topology (web + Go services + MinIO)
└── deploy.sh             # Deployment script
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
    git clone https://github.com/your-username/rmhstudios.com.git
    cd rmhstudios.com
    pnpm install
    ```

2.  Setup the database:
    ```bash
    pnpm run db:push
    ```

3.  Run the development server (runs Vite dev server & WebSocket servers concurrently):
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

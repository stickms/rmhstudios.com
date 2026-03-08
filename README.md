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
├── server/               # Real-time WebSocket servers (socket-server, rmhbox, rmhtube)
├── stores/               # Zustand state management
├── hooks/                # Custom React hooks
├── prisma/               # Database schema and migrations
├── data/                 # Game data (JSON)
├── scripts/              # Utility scripts (seeding, migrations, blog generation)
├── public/               # Static assets (images, sprites, music)
├── testing/              # Vitest test files
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

The application is deployed to a VPS using PM2 to manage the Nitro web server and standalone WebSocket servers.

1.  **To create a production build:**
    ```bash
    pnpm build
    ```
    This compiles the Vite/Nitro app and bundles the WebSocket servers via esbuild.

2.  **Deployment via Script:**
    The provided `deploy.sh` script automates pulling, building, migrating, and swapping the PM2 processes.

    ```bash
    ./deploy.sh
    ```
    *Note: A webhook server (`webhook-server.cjs`) can trigger `deploy.sh` automatically on GitHub push.*

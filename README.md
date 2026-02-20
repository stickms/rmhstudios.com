# rmhstudios.com

**Digital Portfolio, Blog, & Gaming Studio Platform**

rmhstudios.com is a modern, high-performance web application designed to showcase a digital portfolio, devlogs, and a fully functional gaming platform. Built with the latest web technologies, it features a dynamic, animated user interface alongside real-time multiplayer gaming capabilities.

## 🚀 Features

-   **Games Library**: A suite of original games ready to play directly in the browser:
    -   *Slice It!* (Interactive rhythm game with custom song uploads)
    -   *Cursed Logic*
    -   *House Always Wins*
    -   *Laundry Sort*
    -   *Echoes*
    -   *Signal Forge*
    -   *Vega*
-   **Multiplayer & Social**: Real-time multiplayer lobbies, match results, leaderboards, and user profiles.
-   **Authentication (RMH Auth)**: Secure user login powered by Better Auth, including Discord integration.
-   **Modern UI/UX**: Built with **Tailwind CSS v4** and **Framer Motion** for smooth animations, complex transitions, and premium aesthetic (Glitch/Neon effects).
-   **Immersive Audio & 3D**: Games powered by `howler` for audio and `@react-three/fiber` / `@react-three/rapier` for 3D physics.
-   **Blog / Devlog**: MDX-powered blog system allowing rich content authoring.

## 🛠 Tech Stack

-   **Frontend**: [Next.js 16 (App Router)](https://nextjs.org/)
-   **Language**: [TypeScript](https://www.typescriptlang.org/)
-   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
-   **Animations**: [Framer Motion](https://www.framer.com/motion/)
-   **Backend & Real-time**: Next.js API Routes, Socket.io Server (`server/socket-server.ts`), Webhooks.
-   **Database**: PostgreSQL, [Prisma Client](https://www.prisma.io/)
-   **Authentication**: [Better Auth](https://better-auth.com/)
-   **Web GL / Audio**: React Three Fiber, Rapier Physics, Howler.js

## 📂 Project Structure

```bash
├── app/                  # Next.js App Router (Games, Blog, Projects, Auth)
├── components/           # React components (UI primitives, Game HUDs, Homepage)
├── content/              # Markdown/MDX content files (Blog)
├── lib/                  # Utility functions and shared logic
├── prisma/               # Database schema and migrations
├── server/               # Real-time WebSocket server (socket-server.ts)
├── public/               # Static assets (images, fonts, custom songs)
└── deploy.sh             # Custom PM2 deployment script
```

## ⚡ Development Setup

### Prerequisites

-   **Node.js**: v18 or higher recommended.
-   **Package Manager**: `pnpm` (recommended).
-   **Database**: A running instance of PostgreSQL.

### Environment Variables (.env)

Create a `.env` file in the root of the project with the following configuration:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/rmhstudios

# Discord Integration (for auth or bot features)
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret

# Better Auth Configuration
BETTER_AUTH_SECRET=generate_a_secure_random_string
BETTER_AUTH_URL=http://localhost:3000/
NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000/
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

3.  Run the development server (runs Next.js & Socket server concurrently):
    ```bash
    pnpm dev
    ```

4.  Open [http://localhost:7000](http://localhost:7000) in your browser.

## 📦 Build & Deployment

The application is deployed to a VPS using PM2 to manage both the Next.js web application and the standalone WebSocket server.

1.  **To create a production build:**
    ```bash
    pnpm build
    ```
    This compiles the Next.js App and transpiles the Socket server via `tsconfig.server.json`.

2.  **Deployment via Script:**
    The provided `deploy.sh` script automates pulling, building, migrating, and swapping the PM2 processes (`rmhstudios-web` on port 7000, `rmhstudios-socket` on port 7001).

    ```bash
    ./deploy.sh
    ```
    *Note: A webhook server (`webhook-server.js`) can trigger `deploy.sh` automatically on GitHub push.*

## 📝 Content Management (Blog)

Blog posts are stored in `content/blog` as `.mdx` files with frontmatter describing the title, date, and description.

```markdown
---
title: "Your Post Title"
date: "2026-02-20"
description: "A brief summary of the post."
---
Your content goes here...
```

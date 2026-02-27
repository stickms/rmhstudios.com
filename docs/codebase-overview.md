Comprehensive Repository Overview: rmhstudios.com
1. Overall Project Structure
Next.js 16.1 Full-Stack Application with concurrent frontend and WebSocket server:

Frontend: Next.js 16 App Router (port 7000)
Backend: Node.js HTTP + Socket.io server (port 7001)
Database: PostgreSQL with Prisma ORM
Package Manager: pnpm workspaces
Scripts:
pnpm dev: Runs Next.js + Socket.io server concurrently
pnpm build: Compiles Next.js + TypeScript server code
pnpm socket-server: Standalone socket server with tsx
2. Game Routes & Structure (/app/)
Playable Games (8 currently):

Slice-It (/slice-it) - Rhythm game with custom songs
Signal Forge (/signal-forge) - Roguelike deck-building game
Temple of Joy (/temple-of-joy) - Incremental/progression game
Altair (/echoes) - 3D dungeon crawler with combat
Neon Driftway (/neon-driftway) - Racing game (multiplayer support)
Vega (/vega) - Loop-based roguelike
Laundry Sort (/laundry-sort) - Puzzle game
House Always Wins (/house-always-wins) - Text-based narrative game
Other Routes:

/ - Landing page with Hero, Projects, About, Testimonials, Blog, Merch sections
/games - Games hub/carousel
/blog - Blog listing
/blog/[slug] - MDX blog posts
/login - Auth login page
/roadmap - Game roadmap
3. WebSocket Server (/server/socket-server.ts)
Runs on port 7001 with CORS support Features:

Slice-It Multiplayer: Lobby system with host management, difficulty modifiers, real-time score/combo/health tracking, song selection

Events: join_lobby, select_song, start_game, player_loaded, score_update, player_finished, leave_lobby, toggle_ready, update_difficulty
Multi-track system with bombs, switching, sudden death, invisible, spin, strict timing modifiers
Neon Driftway Multiplayer: Racing game lobbies with ability system

Events: ndw:joinLobby, ndw:toggleReady, ndw:startGame, ndw:playerUpdate, ndw:scoreUpdate, ndw:abilityUsed, ndw:playerFinished, ndw:leaveLobby
Anti-cheat: Ability cooldown (5s), charge limits, position relay at 10Hz
Lobby Management: Sanitization of inputs, auto-host reassignment on disconnect, cleanup of empty lobbies

4. Authentication System (/lib/auth.ts + /app/api/auth/[...all]/route.ts)
Using Better Auth v1.4.18 with Prisma adapter:

Methods:
Email/password registration & login
Discord OAuth integration
Session-based authentication
User Model: Includes username, email, password, image, emailVerified
Client-side: authClient from better-auth/react
API Route: Catch-all route at /api/auth/[...all] handling all auth flows
5. Database Schema (/prisma/schema.prisma)
Auth Models:

User - Primary user with sessions/accounts
Session - Tokenized sessions with IP/User-Agent tracking
Account - OAuth providers (Discord)
Verification - Email verification tokens
Game Profile Models (all linked to User):

AltairPlayer - bestTime, totalKills, totalXP
LaundryPlayer - highScore, gamesPlayed
Player (Slice-It) - totalScore, gamesPlayed
VegaPlayer - highestLoop, highestLevel
SignalForgePlayer - highScore, floorReached, savedRunState (JSON)
TempleOfJoySave - Full game state as JSON
NeonDriftwayPlayer - highScore, bestDistance, bestTimeMs, bestLevel
Slice-It Music Library Models:

Song - Uploaded songs with analysisData (JSON beatmap), plays counter
SongLeaderboard - High scores per song with modifiers
SongPlay - Play count tracking per user
SongLike / SongRating - User engagement
SongComment - Community comments
Indexes on title, artist, uploadedBy for fast queries
6. Documentation (/docs/)
Game Design Docs:

temple-of-joy/ - Game design, implementation plan, patches 1-2, content expansion
signal-forge/ - Production spec, improvement plan, design docs
rmhbox/ - Minigame ideas
7. Specifications (/specs/)
Game Specifications:

slice-it.md - Detailed rhythm game spec
signal-forge.md - Deck-building roguelike spec
vega.md - Loop-based game spec
house-always-wins.md - Narrative game spec
neon-driftway.md + neon-driftway-update.md - Racing game specs
8. Component Organization (/components/)
Structure:

Code
/components/
  /ui/               - Reusable UI: button, card, dialog, slider, input, 
                      custom (NeonButton, GlitchText, FlipCard, PulsatingOrb, etc.)
  /site/             - Global: Navbar, Shell (layout wrapper)
  /homepage/         - HeroSection, ProjectsSection, AboutSection, 
                      TestimonialsSection, BlogSection, MerchSection, FooterSection
  /effects/          - ParticleField, FloatingShapes
  /blog/             - BlogList, MDXAnimations, ShareButton
  /[game-name]/      - Game-specific: AltairGame, SignalForgeGame, 
                      TempleOfJoyGame, NeonDriftwayGame, etc.
  /Providers.tsx     - Root context/provider setup
Game-Specific Components:

Slice-It: GameCanvas, HUD, SongLibrary, CalibrationScreen, MultiplayerSidebar, MiniTrack
Signal Forge: SignalForgeGame + 8 UI screens (Landing, Combat HUD, Pause Menu, Victory, CardModals, etc.) + canvas helpers
Temple of Joy: TempleOfJoyGame + 13 UI panels (Upgrades, Relics, Events, Achievements, Stats, etc.)
Altair: 3D/2D modes with GameCanvas3D, PlayerController, EnemyManager, DungeonGenerator, LeaderboardUI
Neon Driftway: NeonDriftwayGame + MultiplayerLobby
9. Public Assets (/public/)
Structure:

/images - Game graphics, merch photos (mug, tee, stickers)
/music - Audio tracks and soundscapes
/neon-driftway-sprites - Sprite assets for racing game
favicon.svg - Site favicon
10. Key Libraries (/lib/)
Utilities & Services:

auth.ts / auth-client.ts - Better Auth setup
prisma.ts - Prisma client singleton
rate-limit.ts - IP-based rate limiting for API endpoints
blog.ts - MDX blog post parsing
utils.ts - Common utilities
Game-specific:
/game/ - GameEngine, BeatMapGenerator, MultiplayerFactory, types
/slice-it/ - Slice-It specific logic
/signal-forge/ - Signal Forge specific logic
/temple-of-joy/ - Temple of Joy logic
/altair/, /neon-driftway/, /vega/, /cursed-logic/, /house-always-wins/ - Game logic
11. API Endpoints (/app/api/)
Game Scores:

POST /api/[game-name]/score - Submit score (rate-limited)
GET /api/[game-name]/leaderboard - Fetch leaderboard
Slice-It Specific (Music Library):

POST /api/slice-it/songs/upload - Upload song
GET /api/slice-it/songs - List songs
GET /api/slice-it/songs/[id] - Song details
GET /api/slice-it/songs/stream/[id] - Stream audio
POST /api/slice-it/songs/[id]/like - Like song
POST /api/slice-it/songs/[id]/comments - Add comment
POST /api/slice-it/songs/[id]/play - Track play
PATCH /api/slice-it/songs/[id]/patch-analysis - Update beatmap analysis
Signal Forge (Saves):

POST /api/signal-forge/save - Save game state
GET /api/signal-forge/load - Load game state
POST /api/signal-forge/abandon - Abandon run
Temple of Joy:

POST /api/temple-of-joy/save - Save game state
Auth:

[...all] /api/auth/* - Better Auth endpoints
12. Build & Deployment
Production Build:

Compiles Next.js app + TypeScript server code to dist-server/
Runs concurrent processes on ports 7000 (Next.js) and 7001 (Socket.io)
Database:

PostgreSQL with Prisma migrations
Commands: db:push, db:migrate, db:migrate:prod, db:reset
Key Dependencies:

React 19.2 + Next.js 16
Prisma 7.4 + PostgreSQL adapter
Socket.io 4.8 (realtime multiplayer)
Three.js + React Three Fiber + Rapier (3D games)
Zustand (state management)
Tailwind CSS 4 (styling)
Framer Motion (animations)
MDX Remote (blog)
Better Auth (authentication)
This is a sophisticated indie game studio platform with 8 playable games, real-time multiplayer support, persistent user accounts, social features (Discord OAuth, comments, ratings), and a blog system. The architecture cleanly separates game logic, UI, multiplayer sync, and persistent storage.

Summary of Patterns in rmhstudios.com Codebase
1. Design Documentation Structure
Signal Forge (docs/signal-forge/)

Files: 5 docs (signal-forge.md, signal-forge-production-spec.md, signal-forge-better.md, improvement-plan.md, web-game-design-idea.md)
Document Format: Comprehensive markdown with numbered sections (1-20+)
Starts with high-level overview (genre, session length, pillars)
Detailed systems breakdown (combat, progression, cards, relics, enemies)
Technical implementation notes (Canvas 2D, WebGL considerations, deterministic RNG)
MVP scope and risk mitigation
Metrics for success (player retention, session length targets)
Style: Implementation-ready, technical depth with tuning parameters
Temple of Joy (docs/temple-of-joy/)

Files: 5 docs (game-design.md, implementation-plan.md, patch-1.md, patch-2.md, content-expansion.md)
Document Format: Modular, iterative design with visual design specs
Detailed color palettes for light/dark modes (hex values)
Typography specs (serif for headings, sans-serif for numbers)
Philosophical framing (Hedonism doctrine)
Core loop diagrams with currency systems
Patch/update structure tracks evolution
2. Game Specifications Structure (specs/)
neon-driftway.md - Exhaustive implementation spec (950+ lines)

Format: 40+ numbered sections with extreme detail
Includes: quick summary, goals/non-goals, pillars, core loop
Technical architecture: state machine, input handling, physics
Data-driven obstacle definitions with pooling strategies
Hard requirements: "Impossible spawn" prevention algorithm
Deterministic debug mode spec (seed management, frame stepping)
Milestone breakdown: 4 phases from prototype to leaderboards
Cursor implementation instructions embedded
"Definition of Done" checklist (v1 release)
Other specs: slice-it.md, vega.md, house-always-wins.md — similar exhaustive approach

3. Authentication Setup
lib/auth.ts (Server-side)

Uses better-auth framework with Prisma adapter
PostgreSQL provider
Social auth: Discord (with clientId/clientSecret)
Email/password auth enabled
Custom user field: username (optional, input-enabled)
lib/auth-client.ts (Client-side)

React client from better-auth
Base URL: NEXT_PUBLIC_BETTER_AUTH_URL env var (fallback to localhost:3000)
Minimal—just initialization
app/login/page.tsx

'use client' directive (React component)
Supports dual auth: Discord OAuth + email/password
Form states: sign-up toggle, username/email/password fields
callbackURL parameter for post-login redirect
Error handling with visual feedback
Loading states on buttons
4. Auth Gating Pattern (Game Pages)
Game pages (slice-it/page.tsx, signal-forge/page.tsx, neon-driftway/page.tsx)

No explicit auth checks visible—pages are public
Architecture: Simple layout wrapper + game component
Structure:
Code
<main> (fixed inset-0)
  <header> (back button | title)
  <div> (game canvas/component)
</main>
Uses DarkModeWrapper for theme support
Suspense fallback for lazy-loaded GameCanvas
Pattern identified: Auth is optional/implicit—games run without login, but can use authClient for features (leaderboards, score submission).

Key Patterns Summary
Pattern	Location	Details
Doc Structure	docs/	Numbered sections, implementation-ready, technical depth
Auth	lib/auth*.ts	Better-auth + Prisma; Discord + email/password
Game Pages	app/[game]/page.tsx	Public routes; minimal layout wrapper; Suspense boundaries
Scoring	GameOver.tsx	Server submission; modifiers tracked; unranked filtering
State	lib/store/ (useGameStore)	Centralized game state (score, combo, multiplier, userName, modifiers)
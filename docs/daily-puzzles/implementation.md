# RMH Daily Puzzles — Design Document

**Project:** `rmhstudios.com/daily-puzzles`  
**Stack:** Vite + Nitro server routes, PostgreSQL (via Prisma), Better Auth  
**Author:** RMH Studios  
**Version:** 1.0  
**Date:** March 12, 2026

---

## Table of Contents

1. [Overview](#1-overview)
2. [Game Modes](#2-game-modes)
3. [Shareability System](#3-shareability-system)
4. [Puzzle Seeding & Determinism](#4-puzzle-seeding--determinism)
5. [Authentication & User Accounts](#5-authentication--user-accounts)
6. [Database Schema](#6-database-schema)
7. [Leaderboard System](#7-leaderboard-system)
8. [Past Puzzle Archive](#8-past-puzzle-archive)
9. [Technical Architecture](#9-technical-architecture)
10. [API Routes (Nitro)](#10-api-routes-nitro)
11. [Client State & Persistence](#11-client-state--persistence)
12. [UI/UX Design](#12-uiux-design)
13. [Dependencies & Libraries](#13-dependencies--libraries)
14. [Analytics & Metrics](#14-analytics--metrics)
15. [Roadmap](#15-roadmap)

---

## 1. Overview

Daily Puzzles is a suite of daily brain games at `rmhstudios.com/daily-puzzles`. Every day at **midnight EST**, new puzzles go live across all game modes. The core loop:

**Solve → See results → Copy share card → Paste into group chats → Check the leaderboard → Argue with friends**

### Core Principles

- **Deterministic.** Every player gets the exact same puzzle on the same day. Seeded by date.
- **Share-first.** Every mode produces a beautiful Unicode/emoji result string optimized for Discord, iMessage, Instagram DMs, and X/Twitter.
- **Competitive.** Global leaderboards per puzzle unlock after you submit your answer — no peeking.
- **Archival.** Logged-in users can browse and play any past puzzle. Scores for past puzzles are tracked separately and don't appear on the daily leaderboard.
- **Account-optional.** Anonymous play is supported via `localStorage`. Signing in via RMH account (Better Auth) enables leaderboards, history sync, and streaks.
- **Mobile-first.** All interactions are touch-native. No hover-dependent mechanics.
- **Lightweight.** Target < 80KB JS per game mode (code-split). No heavy UI framework overhead.

---

## 2. Game Modes

### 2.1 — Alibi 🔍

> *A short crime scenario. Four suspects. One contradiction. Find the liar.*

**Concept:** Players read a 3–4 sentence crime setup followed by four suspect alibis (2 sentences each). Exactly one alibi contains a logical contradiction with the scenario or with another suspect's statement.

**Rules:**
- **2 guesses** to find the liar.
- Wrong guess → suspect greyed out with "Cleared" badge.
- Post-solve → breakdown panel highlights the contradiction with animated connector lines between the conflicting phrases.
- Timer: starts on "Begin Reading" tap, stops on final guess.

**Scoring:**
| Result | Points |
|---|---|
| Correct on guess 1 | 100 pts + time bonus (max 50) |
| Correct on guess 2 | 50 pts + time bonus (max 25) |
| Failed (0/2) | 0 pts |

**Time bonus formula:** `max(0, bonusCap - floor(seconds / 3))` — rewards speed but doesn't punish slow readers harshly. Someone solving in under 30s gets full bonus; it decays ~1pt per 3 seconds after.

**Puzzle Schema:**

```ts
interface AlibiPuzzle {
  id: number;
  date: string;                 // "2026-03-12"
  scenario: string;             // crime setup (3-4 sentences)
  suspects: {
    name: string;
    emoji: string;              // avatar emoji: "👨‍🍳", "🧑‍💼", etc.
    alibi: string;              // exactly 2 sentences
    isGuilty: boolean;
  }[];
  contradiction: {
    explanation: string;        // shown post-solve
    highlights: {
      text: string;
      source: "scenario" | "suspect";
      suspectName?: string;     // which suspect said it
    }[];
  };
  difficulty: "simple" | "tricky" | "devious";
}
```

**Share Output (solved):**

```
🔍 RMH Alibi #142 — CASE CLOSED

🕵️ ██░░ Guess 1/2
⏱️ 1:34 | 🏆 127 pts
🧠 Tricky

"The alibi crumbled under pressure."

rmhstudios.com/daily-puzzles/alibi
```

**Share Output (failed):**

```
🔍 RMH Alibi #142 — COLD CASE

🕵️ ░░░░ 0/2
⏱️ 2:47 | 💀 0 pts

"The suspect walked free today."

rmhstudios.com/daily-puzzles/alibi
```

---

### 2.2 — Spectrum 🌈

> *Rank 5 items along a hidden scale. How precisely can you order them?*

**Concept:** Players see 5 items and a spectrum label (e.g., "Calories per serving: lowest → highest"). Drag to arrange in order. One shot — lock it in and see how you did.

**Rules:**
- Single attempt. Drag-and-drop (desktop) or tap-to-swap (mobile) to arrange.
- Hit "Lock In" when ready.
- Each item scores 0–2 based on positional accuracy: exact position = 2, off by one = 1, off by 2+ = 0.
- Max score: 10/10. After submit, items animate to true positions with real values revealed.

**Scoring:**
| Accuracy Score | Points |
|---|---|
| 10/10 (perfect) | 150 pts |
| 8–9/10 | 100 pts |
| 6–7/10 | 60 pts |
| 4–5/10 | 30 pts |
| 0–3/10 | 10 pts |

No time bonus — this is about precision, not speed.

**Puzzle Schema:**

```ts
interface SpectrumPuzzle {
  id: number;
  date: string;
  label: string;                // "Calories per serving: lowest → highest"
  items: {
    name: string;
    emoji: string;
    trueRank: number;           // 1-5 (hidden until solved)
    value: number;              // actual numeric value (hidden)
    displayValue: string;       // formatted: "142 cal", "1876"
  }[];
  funFact: string;              // shown post-solve
  category: "science" | "geography" | "food" | "history" | "pop-culture" | "sports";
}
```

**Share Output:**

```
🌈 RMH Spectrum #87 — 8/10

🟩🟩🟧🟩🟧
▰▰▰▰▰▰▰▰▱▱

Category: Calories per serving
🏆 100 pts

rmhstudios.com/daily-puzzles/spectrum
```

The 5-block bar maps each item: 🟩 = exact, 🟧 = off by 1, 🟥 = off by 2+. The lower bar is a filled progress bar out of 10.

---

### 2.3 — Outcast 🎭

> *Five rounds. Five items each. Four belong. One doesn't. Spot the outcast.*

**Concept:** Each round presents 5 items where 4 share a non-obvious trait and 1 is the outcast. The "obvious" grouping is always a red herring. Difficulty escalates across 5 rounds.

**Rules:**
- 5 rounds, one guess per round.
- Tap the item you think is the outcast.
- Correct → green highlight + explanation. Wrong → red highlight on your pick, gold highlight on real outcast + explanation.
- No going back. Rounds are sequential.

**Scoring:**
| Round | Base Points |
|---|---|
| Round 1 (easy) | 10 pts |
| Round 2 | 20 pts |
| Round 3 | 30 pts |
| Round 4 | 40 pts |
| Round 5 (hardest) | 50 pts |

Total possible: 150 pts. Streak bonus: +25 pts if all 5 correct.

**Puzzle Schema:**

```ts
interface OutcastPuzzle {
  id: number;
  date: string;
  rounds: {
    roundNumber: number;        // 1-5
    items: {
      name: string;
      emoji: string;
      isOutcast: boolean;
    }[];
    trait: string;              // "All were originally painted a different color"
    redHerring: string;        // "They're all European landmarks"
    difficulty: "easy" | "medium" | "hard" | "expert" | "nightmare";
  }[];
}
```

**Share Output:**

```
🎭 RMH Outcast #203

R1 ✅ R2 ✅ R3 ❌ R4 ✅ R5 ✅
🏆 125/175 pts

Fell for Round 3's trap 😤

rmhstudios.com/daily-puzzles/outcast
```

---

### 2.4 — Chainlink 🔗

> *Connect a start word to an end word through a chain of category jumps.*

**Concept:** Given a start word and end word, build a chain where each link changes category via association. E.g., `PIANO → black → CROW → murder → PODCAST`. Shortest valid chain wins. Everyone's chain is different, so sharing compares creativity and efficiency.

**Rules:**
- Type a linking word/phrase between each pair.
- Each link must represent a clear, defensible association (validated server-side via an LLM call or curated association graph).
- Maximum chain length: 8 links. If you can't do it in 8, you fail.
- Submit when done. Server validates each association.

**Scoring:**
| Chain Length | Points |
|---|---|
| 3 links | 150 pts (genius) |
| 4 links | 120 pts |
| 5 links | 90 pts |
| 6 links | 60 pts |
| 7 links | 30 pts |
| 8 links | 10 pts |
| Failed | 0 pts |

**Puzzle Schema:**

```ts
interface ChainlinkPuzzle {
  id: number;
  date: string;
  startWord: string;
  endWord: string;
  parLinks: number;             // expected "par" chain length
  exampleChain: string[];       // one valid solution for the reveal
  difficulty: "short" | "medium" | "long";
}
```

**Share Output:**

```
🔗 RMH Chainlink #44

OCEAN → ... → WALLET
🔗🔗🔗🔗 (4 links)
🏆 120 pts | Par: 5

"Made a connection most wouldn't see."

rmhstudios.com/daily-puzzles/chainlink
```

The actual chain is hidden — only the length is shown. Friends have to solve it themselves to compare paths.

---

### 2.5 — Impostor 🤥

> *Five "facts" about a topic. Two are lies. Find them both.*

**Concept:** Players see 5 statements about a topic (e.g., "The Human Heart"). Four are true, two are fabricated but extremely plausible. Identify the fakes.

**Rules:**
- Select the statement(s) you believe are fake.
- 2 guesses to find both impostors.
- Each guess you select 2 statements. If you get 1 right and 1 wrong, you're told "1/2 found" and go to guess 2 with the confirmed real one greyed out.

**Scoring:**
| Result | Points |
|---|---|
| Both found on guess 1 | 100 pts |
| Both found across 2 guesses | 50 pts |
| Only 1 found | 20 pts |
| None found | 0 pts |

**Puzzle Schema:**

```ts
interface ImpostorPuzzle {
  id: number;
  date: string;
  topic: string;                // "The Human Heart"
  topicEmoji: string;           // "❤️"
  statements: {
    text: string;
    isFake: boolean;
    explanation: string;        // why it's true/fake (shown post-solve)
  }[];
  category: "science" | "history" | "geography" | "language" | "pop-culture";
}
```

**Share Output:**

```
🤥 RMH Impostor #271

Topic: The Human Heart ❤️
🟩🟩🟥🟩🟥
Found both fakes on guess 1!
🏆 100 pts

"Trust nothing. Question everything."

rmhstudios.com/daily-puzzles/impostor
```

🟩 = correctly identified as real, 🟥 = correctly identified as fake, 🟧 = you thought it was fake but it was real.

---

## 3. Shareability System

### 3.1 — Share String Design Principles

Every share output follows this structure:

```
[emoji] RMH [GameName] #[puzzleNumber]

[visual result grid/bar — unique per game]
[score line]

"[flavor text — varies by result quality]"

rmhstudios.com/daily-puzzles/[game]
```

Design rules:
- **Max 6 lines.** Compact enough for a Discord message or iMessage that doesn't get collapsed.
- **No spoilers.** The share never reveals the answer, specific items, or the puzzle content. Only performance metrics.
- **Visual variety.** Each game mode uses a distinct visual language (bars, grids, emojis) so they're instantly recognizable in a chat feed.
- **Flavor text rotates.** Pool of ~20 result-quality-dependent quips per game mode. Seeded by `puzzleId + score` so the same performance always gives the same quip (people can't re-roll).
- **RMH branding.** Every share says "RMH" to build brand recognition in group chats. The URL always points back to the game.

### 3.2 — Share Mechanisms

**Copy to Clipboard:** Primary action. Big "Share Results" button post-solve calls `navigator.clipboard.writeText()`. Visual confirmation toast: "Copied! Now go brag."

**Native Share (mobile):** If `navigator.share` is available, offer it as a secondary option. Pass `text` only (no `url` separately — embed it in the text so the full block is shared as one message).

**Open Graph / Link Previews:** The URL `rmhstudios.com/daily-puzzles/alibi` should have dynamic OG meta tags:
- `og:title` → "RMH Alibi #142 — Can you crack today's case?"
- `og:description` → "4 suspects. 1 liar. 2 guesses. Play now."
- `og:image` → Auto-generated card image (see 3.3)

### 3.3 — OG Image Generation

Use **[`satori`](https://github.com/vercel/satori)** (works standalone with Nitro) to generate dynamic PNG share cards server-side. Rasterize SVG output to PNG with **[`@resvg/resvg-js`](https://github.com/nicolo-ribaudo/resvg-js)**.

Each game mode has a card template:
- Dark background (#0a0a0a) with the RMH logo.
- Game mode icon + puzzle number.
- "Play today's puzzle" CTA.
- Generated on-demand at `/api/og/[game]/[puzzleId].png`.

---

## 4. Puzzle Seeding & Determinism

### 4.1 — Same Puzzle for Everyone

Every puzzle is deterministic for a given day. Two approaches depending on game mode:

**Approach A — Pre-authored puzzles (Alibi, Impostor, Chainlink):**
These require careful narrative design and can't be procedurally generated well. They are hand-written, stored in the database, and mapped to dates.

```ts
// Nitro server route: /api/puzzles/alibi/today
const puzzle = await prisma.alibiPuzzle.findFirst({
  where: { date: getTodayEST() },
  select: { /* exclude isGuilty, contradiction for client payload */ }
});
```

Content is authored weeks in advance. A queue of unpublished puzzles is maintained; a Nitro scheduled task assigns the next unassigned puzzle to each new day at midnight EST.

**Approach B — Seeded generation (Spectrum, Outcast):**
These use curated item pools + a deterministic PRNG to select and arrange items.

```ts
// Using seedrandom: https://github.com/davidbau/seedrandom
import seedrandom from 'seedrandom';

function getDailyItems(game: string, date: string, pool: Item[], version = 'v1'): Item[] {
  const rng = seedrandom(`${game}-${date}-${version}`);
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 5);
}
```

The `version` suffix in the seed allows re-rolling a puzzle if there's an error without changing every future puzzle.

### 4.2 — Day Boundaries

- Day boundary: **midnight Eastern Time (EST/EDT).**
- Server always computes "today" as: `new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })` → `"2026-03-12"`.
- Client fetches the current puzzle date from the server to prevent timezone mismatch. The API response always includes `{ puzzleDate: "2026-03-12" }` and the client uses that as the canonical key.

### 4.3 — Puzzle Numbering

Puzzle #1 for each game mode starts on launch day. Number increments daily. The number is stored in the DB alongside the date so there's a single source of truth.

---

## 5. Authentication & User Accounts

### 5.1 — Better Auth Integration

The site already uses **[Better Auth](https://www.better-auth.com/)** ([GitHub](https://github.com/better-auth/better-auth)) for user accounts. Daily Puzzles hooks into the existing auth context.

**Auth states:**
| State | Capabilities |
|---|---|
| **Anonymous** | Play today's puzzle, see own results, copy share string, see aggregate stats. |
| **Logged in** | Everything above + global leaderboard access (after completing), streak tracking, past puzzle archive, cross-device sync. |

**Auth flow for leaderboard gate:**
1. User completes a puzzle.
2. Results screen shows score + share button + aggregate stats (visible to all).
3. "View Leaderboard" button appears:
   - If logged in → shows leaderboard immediately.
   - If anonymous → prompt: "Sign in to see how you rank" with a quick OAuth/email login flow. After auth, their just-completed score is submitted and the leaderboard appears.

### 5.2 — Anonymous-to-Authenticated Migration

When a previously anonymous user signs in, migrate their `localStorage` data:

```ts
// Client: on auth success
const localState = JSON.parse(localStorage.getItem('rmh-puzzles-state') || '{}');
if (localState.results && Object.keys(localState.results).length > 0) {
  await fetch('/api/puzzles/migrate', {
    method: 'POST',
    body: JSON.stringify({ results: localState.results }),
    headers: { 'Content-Type': 'application/json' }
  });
  localStorage.removeItem('rmh-puzzles-state');
}
```

Server validates each result (checks that the puzzle date exists, score is within valid range, uses **[`zod`](https://github.com/colinhacks/zod)** for schema validation) and inserts any that don't already exist for that user.

---

## 6. Database Schema

Using **[Prisma](https://www.prisma.io/docs)** ([GitHub](https://github.com/prisma/prisma)) with PostgreSQL. Extends the existing RMH schema.

```prisma
// ============================================
// PUZZLE CONTENT TABLES (one per game mode)
// ============================================

model AlibiPuzzle {
  id              Int       @id @default(autoincrement())
  puzzleNumber    Int       @unique
  date            DateTime? @unique @db.Date
  scenario        String    @db.Text
  suspectsJson    Json      // Suspect[] — name, emoji, alibi, isGuilty
  contradictionJson Json    // explanation + highlights
  difficulty      String    // "simple" | "tricky" | "devious"
  createdAt       DateTime  @default(now())
  submissions     PuzzleSubmission[]
}

model SpectrumPuzzle {
  id              Int       @id @default(autoincrement())
  puzzleNumber    Int       @unique
  date            DateTime? @unique @db.Date
  label           String    // "Calories per serving: lowest → highest"
  itemsJson       Json      // Item[] — name, emoji, trueRank, value, displayValue
  funFact         String    @db.Text
  category        String
  createdAt       DateTime  @default(now())
  submissions     PuzzleSubmission[]
}

model OutcastPuzzle {
  id              Int       @id @default(autoincrement())
  puzzleNumber    Int       @unique
  date            DateTime? @unique @db.Date
  roundsJson      Json      // Round[] — items, trait, redHerring, difficulty
  createdAt       DateTime  @default(now())
  submissions     PuzzleSubmission[]
}

model ChainlinkPuzzle {
  id              Int       @id @default(autoincrement())
  puzzleNumber    Int       @unique
  date            DateTime? @unique @db.Date
  startWord       String
  endWord         String
  parLinks        Int
  exampleChainJson Json     // string[]
  difficulty      String
  createdAt       DateTime  @default(now())
  submissions     PuzzleSubmission[]
}

model ImpostorPuzzle {
  id              Int       @id @default(autoincrement())
  puzzleNumber    Int       @unique
  date            DateTime? @unique @db.Date
  topic           String
  topicEmoji      String
  statementsJson  Json      // Statement[] — text, isFake, explanation
  category        String
  createdAt       DateTime  @default(now())
  submissions     PuzzleSubmission[]
}

// ============================================
// UNIFIED SUBMISSION / LEADERBOARD TABLE
// ============================================

model PuzzleSubmission {
  id              Int       @id @default(autoincrement())
  userId          String    // references Better Auth user.id
  user            User      @relation(fields: [userId], references: [id])
  gameMode        String    // "alibi" | "spectrum" | "outcast" | "chainlink" | "impostor"
  puzzleNumber    Int
  puzzleDate      DateTime  @db.Date
  score           Int       // final point total
  timeSeconds     Int?      // solve time (nullable for untimed modes)
  resultJson      Json      // game-specific result data for reconstruction
  isArchive       Boolean   @default(false) // true if played from archive (not today)
  createdAt       DateTime  @default(now())

  // Polymorphic relations (optional — for direct joins if needed)
  alibiPuzzle     AlibiPuzzle?     @relation(fields: [alibiPuzzleId], references: [id])
  alibiPuzzleId   Int?
  spectrumPuzzle  SpectrumPuzzle?  @relation(fields: [spectrumPuzzleId], references: [id])
  spectrumPuzzleId Int?
  outcastPuzzle   OutcastPuzzle?   @relation(fields: [outcastPuzzleId], references: [id])
  outcastPuzzleId Int?
  chainlinkPuzzle ChainlinkPuzzle? @relation(fields: [chainlinkPuzzleId], references: [id])
  chainlinkPuzzleId Int?
  impostorPuzzle  ImpostorPuzzle?  @relation(fields: [impostorPuzzleId], references: [id])
  impostorPuzzleId Int?

  @@unique([userId, gameMode, puzzleNumber]) // one submission per user per puzzle
  @@index([gameMode, puzzleDate, score])     // leaderboard query
  @@index([userId, gameMode])                // user history query
}

// ============================================
// STREAK TRACKING
// ============================================

model UserStreak {
  id              Int       @id @default(autoincrement())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  gameMode        String
  currentStreak   Int       @default(0)
  longestStreak   Int       @default(0)
  lastPlayedDate  DateTime  @db.Date

  @@unique([userId, gameMode])
}
```

### Key Design Decisions

- **One `PuzzleSubmission` table for all modes** — simplifies leaderboard queries. The `resultJson` stores mode-specific data (which suspects were picked, spectrum order submitted, etc.) for reconstructing the result screen.
- **`isArchive` flag** — separates daily competition from archive plays. Archive submissions are tracked for user history but excluded from daily leaderboards.
- **`@@unique([userId, gameMode, puzzleNumber])`** — one attempt per puzzle. No re-dos. The client enforces this too but the DB constraint is the source of truth.
- **Polymorphic optional FKs** — allows joining to the specific puzzle table when needed, but the unified table is the primary query surface.

---

## 7. Leaderboard System

### 7.1 — Leaderboard Rules

1. **Gate: must complete today's puzzle first.** The leaderboard for a given day's puzzle is only visible after you submit your answer. No previewing rankings before playing.
2. **Daily leaderboard per game mode.** Ranked by `score DESC, timeSeconds ASC` (higher score wins; ties broken by faster time).
3. **Archive plays are excluded** from the daily leaderboard. They appear in user history only.
4. **Display: top 50 + your rank.** If you're outside top 50, show your position separately ("You: #237 out of 1,402 players").
5. **Leaderboard is frozen at end of day.** Once a new day starts, the previous day's leaderboard is finalized and can be viewed from the archive.

### 7.2 — Leaderboard API

```
GET /api/leaderboard/:gameMode/:date
```

Query params: `?limit=50`

Response:

```ts
interface LeaderboardResponse {
  puzzleDate: string;
  puzzleNumber: number;
  gameMode: string;
  totalPlayers: number;
  entries: {
    rank: number;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    score: number;
    timeSeconds: number | null;
  }[];
  userEntry: {           // requesting user's position (null if hasn't played)
    rank: number;
    score: number;
    timeSeconds: number | null;
    percentile: number;  // e.g. 94 = top 6%
  } | null;
}
```

**SQL (via Prisma raw query for ranking):**

```sql
WITH ranked AS (
  SELECT
    ps."userId",
    u."name" AS "displayName",
    u."image" AS "avatarUrl",
    ps.score,
    ps."timeSeconds",
    RANK() OVER (ORDER BY ps.score DESC, ps."timeSeconds" ASC) AS rank,
    COUNT(*) OVER () AS total
  FROM "PuzzleSubmission" ps
  JOIN "User" u ON u.id = ps."userId"
  WHERE ps."gameMode" = $1
    AND ps."puzzleDate" = $2
    AND ps."isArchive" = false
)
SELECT * FROM ranked WHERE rank <= 50
UNION ALL
SELECT * FROM ranked WHERE "userId" = $3 AND rank > 50;
```

### 7.3 — Leaderboard UI

Post-solve flow:
1. Score reveal animation (numbers counting up).
2. Share button (prominent, primary CTA).
3. "See Leaderboard" slides up from bottom.
4. Leaderboard panel:
   - Your rank highlighted in accent color at the top if outside top 50.
   - Scrollable list of top 50 with rank, avatar, name, score, time.
   - Subtle "Played by X people today" counter at the bottom.
   - Tab bar to switch between game modes without leaving the leaderboard view.

### 7.4 — Global Stats (shown to everyone post-solve)

Even anonymous users see aggregate stats after solving:

```ts
interface PuzzleStats {
  totalPlays: number;
  averageScore: number;
  medianScore: number;
  scoreDistribution: { bucket: string; count: number }[];
  // Game-specific stats:
  // Alibi: % who got it on guess 1 vs guess 2 vs failed
  // Spectrum: average accuracy out of 10
  // Outcast: % correct per round
  modeSpecificStats: Record<string, number>;
}
```

These are shown as a small stats panel beneath the result card, visible to everyone. The full ranked leaderboard requires auth.

---

## 8. Past Puzzle Archive

### 8.1 — Archive Page

**Route:** `/daily-puzzles/archive`  
**Sub-routes:** `/daily-puzzles/archive/:game` and `/daily-puzzles/archive/:game/:number`

**Layout:**
- Calendar grid view (month-by-month) where each day that has a puzzle is a tappable cell.
- Cells show: puzzle number, difficulty badge, and a small indicator if the user has already played it (checkmark + their score).
- Filter tabs for each game mode across the top.
- "Today's Puzzle" always pinned at top as a highlighted card.

### 8.2 — Archive Play Rules

- **Anyone can browse** the archive page and see puzzle dates/numbers/difficulty.
- **Logged-in users can play** any past puzzle. Anonymous users are prompted to sign in.
- **One attempt per puzzle** — same as daily. If you've already played, you see your results instead of the puzzle.
- **Archive scores are tracked** in `PuzzleSubmission` with `isArchive: true`. They count toward personal stats (total puzzles solved, average score) but NOT daily leaderboards.
- **Archive puzzles show the historical leaderboard from that day** (frozen — no new entries from archive plays). This lets you see how your archive score would have compared.

### 8.3 — Archive API

```
GET /api/puzzles/:gameMode/archive?month=2026-03
```

Response:

```ts
interface ArchiveResponse {
  gameMode: string;
  month: string;
  puzzles: {
    date: string;
    puzzleNumber: number;
    difficulty: string;
    userPlayed: boolean;
    userScore: number | null;
  }[];
}
```

```
GET /api/puzzles/:gameMode/:puzzleNumber
```

Returns the full puzzle payload (answers stripped if user hasn't completed it yet, full data if they have).

---

## 9. Technical Architecture

### 9.1 — Project Structure

```
rmhstudios.com/
├── src/
│   ├── pages/
│   │   └── daily-puzzles/
│   │       ├── index.vue              # Hub — all game mode cards
│   │       ├── alibi.vue              # Alibi game
│   │       ├── spectrum.vue           # Spectrum game
│   │       ├── outcast.vue            # Outcast game
│   │       ├── chainlink.vue          # Chainlink game
│   │       ├── impostor.vue           # Impostor game
│   │       └── archive/
│   │           ├── index.vue          # Archive calendar hub
│   │           └── [game]/
│   │               └── [number].vue   # Archive: single past puzzle
│   ├── components/
│   │   └── puzzles/
│   │       ├── AlibiGame.vue
│   │       ├── SpectrumGame.vue
│   │       ├── OutcastGame.vue
│   │       ├── ChainlinkGame.vue
│   │       ├── ImpostorGame.vue
│   │       ├── ShareCard.vue          # Unified share button + copy logic
│   │       ├── Leaderboard.vue        # Reusable leaderboard panel
│   │       ├── PuzzleStats.vue        # Post-solve aggregate stats
│   │       ├── ArchiveCalendar.vue    # Month grid for browsing
│   │       └── StreakBadge.vue        # Flame icon + streak count
│   ├── composables/
│   │   ├── usePuzzle.ts              # Fetch puzzle, submit, state
│   │   ├── useLeaderboard.ts         # Fetch + display leaderboard
│   │   ├── useShare.ts               # Clipboard + native share
│   │   ├── useTimer.ts               # Stopwatch composable
│   │   └── useStreak.ts              # Streak calculation
│   └── lib/
│       ├── puzzleSeeder.ts           # Deterministic PRNG utilities
│       ├── scoring.ts                # Score calculation per game mode
│       └── shareStrings.ts           # Share text generation per mode
├── server/
│   ├── api/
│   │   ├── puzzles/
│   │   │   ├── [game]/
│   │   │   │   ├── today.get.ts      # GET today's puzzle (answers stripped)
│   │   │   │   ├── [number].get.ts   # GET specific puzzle by number
│   │   │   │   ├── archive.get.ts    # GET archive listing for a month
│   │   │   │   ├── submit.post.ts    # POST answer submission
│   │   │   │   └── stats.get.ts      # GET aggregate stats for a date
│   │   │   └── migrate.post.ts       # POST anonymous → auth migration
│   │   ├── leaderboard/
│   │   │   └── [game]/
│   │   │       └── [date].get.ts     # GET leaderboard (auth + completed)
│   │   ├── user/
│   │   │   └── puzzle-history.get.ts  # GET user's full puzzle history
│   │   └── og/
│   │       └── [game]/
│   │           └── [puzzleId].get.ts  # GET dynamic OG image (PNG)
│   ├── middleware/
│   │   └── puzzleAuth.ts             # Verify user completed puzzle
│   ├── utils/
│   │   ├── dateUtils.ts              # EST date handling
│   │   └── scoring.ts                # Server-side score validation
│   └── tasks/
│       └── assignDailyPuzzles.ts     # Cron: assign next puzzle to today
├── prisma/
│   └── schema.prisma                 # Extended with puzzle models above
└── public/
    └── daily-puzzles/
        └── assets/                   # Game mode icons
```

### 9.2 — Request Flow

```
User opens /daily-puzzles/alibi
  → Client calls GET /api/puzzles/alibi/today
    → Nitro checks today's date (EST), fetches puzzle from DB
    → Returns puzzle payload (suspects, scenario — isGuilty STRIPPED)
  → User plays, selects a suspect
  → Client calls POST /api/puzzles/alibi/submit
       Body: { puzzleNumber, guesses: ["Chef Marco"], timeSeconds: 94 }
    → Nitro server validates:
       1. Puzzle number matches today (or is a valid archive puzzle)
       2. User hasn't already submitted (@@unique constraint)
       3. Guesses are valid suspect names from this puzzle
       4. Computes score SERVER-SIDE (never trust client score)
       5. Inserts PuzzleSubmission row
       6. Updates UserStreak
       7. Returns: { correct, score, contradiction, stats, leaderboardUnlocked }
  → Client shows result screen + share card + stats panel
  → User taps "See Leaderboard"
  → Client calls GET /api/leaderboard/alibi/2026-03-12
    → Middleware: checks user has a submission for this puzzle
    → Returns ranked list + user's position
```

### 9.3 — Anti-Cheat

- **Answers never sent to client.** The `today.get.ts` endpoint strips all solution data (`isGuilty`, `isFake`, `trueRank`, etc.). The client sends guesses; the server evaluates.
- **Server-side scoring.** Client displays a score but the server computes and stores the canonical score.
- **Submission window.** Submissions only accepted for today's puzzle or explicitly flagged archive puzzles.
- **Rate limiting.** Max 1 submission per user per game per puzzle. Enforced by DB unique constraint + API-level check.
- **Time validation.** Server records timestamp at puzzle-fetch and at submission. If client `timeSeconds` is suspiciously lower than the server-measured gap, flag for review (don't reject — could be slow connection).

---

## 10. API Routes (Nitro)

### 10.1 — Route Summary

| Method | Route | Auth | Description |
|---|---|---|---|
| `GET` | `/api/puzzles/:game/today` | None | Today's puzzle (answers stripped) |
| `GET` | `/api/puzzles/:game/:number` | Optional | Specific puzzle. Answers stripped if unplayed. |
| `GET` | `/api/puzzles/:game/archive` | Optional | Archive listing with user completion status |
| `GET` | `/api/puzzles/:game/stats?date=` | None | Aggregate stats for a puzzle (post-solve) |
| `POST` | `/api/puzzles/:game/submit` | Required | Submit answer. Returns score + solution + stats. |
| `POST` | `/api/puzzles/migrate` | Required | Migrate localStorage results to DB |
| `GET` | `/api/leaderboard/:game/:date` | Required + Completed | Leaderboard. Requires submission for this puzzle. |
| `GET` | `/api/user/puzzle-history` | Required | User's full puzzle history + streaks |
| `GET` | `/api/og/:game/:puzzleId.png` | None | Dynamic OG share image |

### 10.2 — Leaderboard Middleware

```ts
// server/middleware/puzzleAuth.ts
export default defineEventHandler(async (event) => {
  // Only apply to leaderboard routes
  if (!event.path.startsWith('/api/leaderboard')) return;

  const session = await getSession(event); // Better Auth
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Sign in to view leaderboards' });
  }

  const { game, date } = getRouterParams(event);
  const submission = await prisma.puzzleSubmission.findFirst({
    where: {
      userId: session.user.id,
      gameMode: game,
      puzzleDate: new Date(date),
    },
  });

  if (!submission) {
    throw createError({
      statusCode: 403,
      message: 'Complete this puzzle first to see the leaderboard',
    });
  }

  event.context.user = session.user;
  event.context.submission = submission;
});
```

---

## 11. Client State & Persistence

### 11.1 — localStorage Schema (Anonymous)

```ts
interface LocalPuzzleState {
  version: 1;
  results: {
    [gameMode: string]: {
      [puzzleNumber: number]: {
        puzzleDate: string;
        score: number;
        timeSeconds: number | null;
        resultJson: any;
        completedAt: string;
      };
    };
  };
  streaks: {
    [gameMode: string]: {
      current: number;
      longest: number;
      lastPlayedDate: string;
    };
  };
}
// Key: "rmh-puzzles-state"
```

### 11.2 — In-Progress State

For multi-round games (Outcast) or games where tab might close:

```ts
// Key: "rmh-puzzles-progress-{gameMode}"
interface InProgressState {
  puzzleNumber: number;
  puzzleDate: string;
  startedAt: string;
  partialState: any; // Outcast: rounds completed; Alibi: suspects eliminated
}
```

On page load, check for in-progress state. If `puzzleDate` matches today, offer to resume. If stale, clear it.

### 11.3 — Authenticated Sync

When logged in, `localStorage` acts as a write-through cache. On page load:
1. Fetch submission status from `/api/puzzles/:game/today` (response includes `userCompleted: boolean`).
2. If DB says completed but localStorage doesn't have it → played on another device → populate local cache.
3. If localStorage has it but DB doesn't → lost sync → re-submit via migrate endpoint.

---

## 12. UI/UX Design

### 12.1 — Hub Page (`/daily-puzzles`)

All 5 game modes as cards in a responsive grid (2-col mobile, 3-col desktop).

Each card:
- Game mode emoji icon (large)
- Title + one-line description
- Today's difficulty badge
- Status: "New" / "In Progress" / "✓ 127 pts"
- If completed: small re-share icon

Below the grid:
- **Daily Streak** bar: "🔥 7-day streak in Alibi!"
- **"Browse Archive"** link → `/daily-puzzles/archive`

### 12.2 — Game Page Layout

Consistent shell across all modes:

```
┌──────────────────────────────────┐
│ ← Back    RMH Alibi #142    🔥7 │  Header
├──────────────────────────────────┤
│                                  │
│          [GAME CONTENT]          │  Mode-specific
│                                  │
├──────────────────────────────────┤
│      [ACTION / SUBMIT BTN]       │  Primary CTA
└──────────────────────────────────┘
```

Post-solve transition:

```
┌──────────────────────────────────┐
│          🔍 CASE CLOSED          │  Result header
│          🏆 127 pts              │  Score (animated count-up)
│                                  │
│   [Contradiction Breakdown]      │  Mode-specific reveal
│                                  │
│   ┌────────────────────────────┐ │
│   │   📊 Today's Stats         │ │  Aggregate stats (all users)
│   │   72% solved on guess 1    │ │
│   │   Avg time: 1:52           │ │
│   │   1,247 players today      │ │
│   └────────────────────────────┘ │
│                                  │
│   [ 📋 Share Results ]           │  Primary CTA
│   [ 🏆 See Leaderboard ]        │  Auth-gated
│   [ → Next: Spectrum 🌈 ]       │  Cross-promote
└──────────────────────────────────┘
```

### 12.3 — Leaderboard Panel

Slides up as a bottom sheet overlay:

```
┌──────────────────────────────────┐
│  🏆 Leaderboard — Alibi #142    │
│  ─────────────────────────────── │
│  👑 You: #12 of 1,247 (top 1%)  │  ← Highlighted if outside top 10
│  ─────────────────────────────── │
│  #1  🥇 SarahK       150 pts 0:48│
│  #2  🥈 DevonM       150 pts 1:02│
│  #3  🥉 ChrisR       127 pts 0:55│
│  #4     AlexT        127 pts 1:12│
│  ...                             │
│  #12 ★  You          127 pts 1:34│  ← Your row highlighted
│  ...                             │
│  #50    JamieL        50 pts 2:30│
│  ─────────────────────────────── │
│  [Alibi] [Spectrum] [Outcast]... │  ← Mode tabs
└──────────────────────────────────┘
```

### 12.4 — Archive Calendar

```
┌──────────────────────────────────┐
│  ← Mar 2026 →                    │
│  [Alibi] [Spectrum] [Outcast]... │
│  ─────────────────────────────── │
│  Mon Tue Wed Thu Fri Sat Sun     │
│                          1       │
│   2   3   4   5   6   7   8     │
│   ✓  ✓   ✓   ✓   ✓   ✓  ✓      │  ← checkmarks for played
│   9  10  11  12  13  14  15     │
│   ✓  ✓   ✓  🔵                  │  ← 🔵 = today (playable)
│  16  17  18  19  20  21  22     │
│                                  │  ← future dates greyed out
└──────────────────────────────────┘
```

Tapping a past date opens that puzzle (or shows results if already played).

### 12.5 — Animation & Interaction Libraries

- **Score count-up:** [`countup.js`](https://github.com/inorganik/countUp.js) (~2KB gzipped) — animated number tween from 0 to final score over 1.5s.
- **Drag-and-drop (Spectrum):** [`sortablejs`](https://github.com/SortableJS/Sortable) (~8KB gzipped, framework-agnostic) via [`vue-draggable-next`](https://github.com/anish2690/vue-draggable-next) for Vue 3 integration. Handles touch + pointer events natively. Docs: https://sortablejs.github.io/Sortable/
- **Reveal animations (Alibi):** [`animejs`](https://github.com/juliangarnier/anime) (~17KB) for SVG line-drawing effects between highlighted contradiction phrases, staggered fade-ins, and elastic easing on result badges.
- **Confetti (perfect scores):** [`canvas-confetti`](https://github.com/catdad/canvas-confetti) (~6KB) — burst on 150pt scores.
- **Leaderboard slide-up:** Pure CSS `transform: translateY()` with spring easing via `cubic-bezier(0.34, 1.56, 0.64, 1)`.
- **Haptic (mobile):** `navigator.vibrate(10)` on guess submission where supported.

---

## 13. Dependencies & Libraries

### 13.1 — Runtime Dependencies

| Package | Version | Size (gzip) | Purpose | Link |
|---|---|---|---|---|
| [`seedrandom`](https://github.com/davidbau/seedrandom) | ^3.0.5 | ~1.5KB | Deterministic PRNG for puzzle seeding | https://github.com/davidbau/seedrandom |
| [`sortablejs`](https://github.com/SortableJS/Sortable) | ^1.15.6 | ~8KB | Touch-friendly drag-and-drop | https://github.com/SortableJS/Sortable |
| [`vue-draggable-next`](https://github.com/anish2690/vue-draggable-next) | ^2.2.1 | ~3KB | Vue 3 wrapper for SortableJS | https://github.com/anish2690/vue-draggable-next |
| [`animejs`](https://github.com/juliangarnier/anime) | ^3.2.2 | ~7KB | Animation engine (reveals, transitions) | https://github.com/juliangarnier/anime |
| [`countup.js`](https://github.com/inorganik/countUp.js) | ^2.8.0 | ~2KB | Animated score counter | https://github.com/inorganik/countUp.js |
| [`canvas-confetti`](https://github.com/catdad/canvas-confetti) | ^1.9.3 | ~6KB | Confetti on perfect scores | https://github.com/catdad/canvas-confetti |
| [`satori`](https://github.com/vercel/satori) | ^0.10.14 | — | Server-side OG image generation | https://github.com/vercel/satori |
| [`@resvg/resvg-js`](https://github.com/nicolo-ribaudo/resvg-js) | ^2.6.2 | — | SVG → PNG rasterizer (server) | https://github.com/nicolo-ribaudo/resvg-js |
| [`date-fns`](https://github.com/date-fns/date-fns) | ^3.6.0 | tree-shakes | Date utilities | https://github.com/date-fns/date-fns |
| [`date-fns-tz`](https://github.com/marnusw/date-fns-tz) | ^3.1.3 | ~2KB | Timezone-aware dates (EST boundary) | https://github.com/marnusw/date-fns-tz |
| [`zod`](https://github.com/colinhacks/zod) | ^3.23 | ~13KB | Runtime schema validation (API inputs) | https://github.com/colinhacks/zod |

### 13.2 — Dev / Build Dependencies

| Package | Purpose | Link |
|---|---|---|
| [`prisma`](https://github.com/prisma/prisma) | ORM + migrations | https://www.prisma.io/docs |
| [`@prisma/client`](https://github.com/prisma/prisma) | Generated DB client | https://www.prisma.io/docs/orm/prisma-client |
| [`better-auth`](https://github.com/better-auth/better-auth) | Authentication (already in stack) | https://www.better-auth.com/docs |
| [`vite`](https://github.com/vitejs/vite) | Build tool + dev server (in stack) | https://vite.dev |
| [`nitro`](https://github.com/unjs/nitro) | Server engine / API routes (in stack) | https://nitro.build |
| [`vitest`](https://github.com/vitest-dev/vitest) | Unit tests | https://vitest.dev |
| [`@vue/test-utils`](https://github.com/vuejs/test-utils) | Component tests | https://test-utils.vuejs.org |

### 13.3 — Optional / Future

| Package | Purpose | Link |
|---|---|---|
| [`@tanstack/vue-query`](https://github.com/TanStack/query) | Server state caching for leaderboards | https://tanstack.com/query |
| [`chart.js`](https://github.com/chartjs/Chart.js) + [`vue-chartjs`](https://github.com/apertureless/vue-chartjs) | Score distribution histograms | https://www.chartjs.org |
| [`lottie-web`](https://github.com/airbnb/lottie-web) | Complex reveal animations | https://airbnb.io/lottie |
| [`howler.js`](https://github.com/goldfire/howler.js) | Sound effects (correct/wrong, confetti pop) | https://howlerjs.com |
| [`nuxt-og-image`](https://github.com/nuxt-modules/og-image) | Simplified OG gen if migrating to Nuxt | https://nuxtseo.com/og-image |

### 13.4 — CDN / External

- **Fonts:** `Inter` (UI) + `JetBrains Mono` (scores/numbers) via [Google Fonts](https://fonts.google.com)
- **Emoji:** Native system emoji — no Twemoji. Saves ~150KB and looks better in share strings.

---

## 14. Analytics & Metrics

### 14.1 — Key Metrics

| Metric | Query | Why |
|---|---|---|
| DAU per game mode | Unique submissions per day | Core engagement |
| Completion rate | Submissions / puzzle page loads | Bounce detection |
| Share rate | Share button clicks / completions | Virality signal |
| Leaderboard view rate | LB views / completions | Competition driving engagement? |
| Auth conversion | Sign-in accepted / prompted | Leaderboard gate working? |
| Score distribution | Histogram per puzzle | Difficulty calibration |
| Avg solve time | Per game mode per day | Pacing |
| Streak retention | Users with 7+ day streaks | Habit formation |
| Archive engagement | Archive plays / total plays | Long-tail value |
| Cross-mode play | Users playing 2+ modes/day | Suite stickiness |

### 14.2 — Implementation

Lightweight custom events via `POST /api/analytics/event` with `{ event, properties, timestamp }`. Avoid heavy third-party SDKs initially. Can pipe to PostHog or Plausible later if needed.

---

## 15. Roadmap

### Phase 1 — MVP (Weeks 1–3)
- [ ] Prisma schema + migrations for all puzzle tables + submissions
- [ ] Alibi: full loop (fetch → play → submit → results → share)
- [ ] Spectrum: full loop with drag-and-drop
- [ ] Server-side scoring + answer validation
- [ ] Share string generation + clipboard copy
- [ ] localStorage persistence for anonymous play
- [ ] Hub page (`/daily-puzzles`) with game mode cards
- [ ] Mobile-responsive layout

### Phase 2 — Competition (Weeks 4–5)
- [ ] Better Auth integration for submissions
- [ ] Leaderboard system (per game, per day, auth-gated post-completion)
- [ ] Global stats panel (visible to all post-solve)
- [ ] Anonymous → authenticated migration flow
- [ ] Streak tracking + StreakBadge component
- [ ] OG image generation (satori + resvg)

### Phase 3 — Expansion (Weeks 6–8)
- [ ] Outcast game mode
- [ ] Impostor game mode
- [ ] Chainlink game mode (+ server-side association validation)
- [ ] Past puzzle archive with calendar view
- [ ] Frozen historical leaderboards on archive puzzles
- [ ] Score distribution charts (chart.js)
- [ ] Sound effects toggle (howler.js)

### Phase 4 — Polish & Growth (Weeks 9+)
- [ ] Push notification opt-in ("New puzzles are live!")
- [ ] Weekly + monthly aggregate leaderboards
- [ ] "Challenge a friend" deep-link generation
- [ ] Admin panel for authoring Alibi/Impostor puzzles
- [ ] RMH Discord bot: auto-post daily puzzles to a channel
- [ ] Seasonal themes / special event puzzles
- [ ] TanStack Query for smarter client caching

---

## Appendix A — Share String Generation

All templates live in `src/lib/shareStrings.ts`.

```ts
// Alibi example
export function generateAlibiShare(result: AlibiResult): string {
  const bar = '█'.repeat(result.guessesUsed) + '░'.repeat(2 - result.guessesUsed);
  const status = result.solved ? 'CASE CLOSED' : 'COLD CASE';
  const quip = getQuip('alibi', result.puzzleId, result.score);
  const scoreLine = result.solved
    ? `⏱️ ${formatTime(result.timeSeconds)} | 🏆 ${result.score} pts`
    : `⏱️ ${formatTime(result.timeSeconds)} | 💀 0 pts`;

  return [
    `🔍 RMH Alibi #${result.puzzleNumber} — ${status}`,
    '',
    `🕵️ ${bar} ${result.solved ? `Guess ${result.guessesUsed}/2` : '0/2'}`,
    scoreLine,
    result.solved ? `🧠 ${result.difficulty}` : '',
    '',
    `"${quip}"`,
    '',
    'rmhstudios.com/daily-puzzles/alibi',
  ].filter(Boolean).join('\n');
}

// Deterministic quip selection (same score → same quip)
function getQuip(game: string, puzzleId: number, score: number): string {
  const pool = score > 0 ? SOLVED_QUIPS[game] : FAILED_QUIPS[game];
  return pool[(puzzleId * 7 + score * 13) % pool.length];
}
```

---

## Appendix B — Environment Variables

```env
# Database (existing)
DATABASE_URL="postgresql://user:pass@host:5432/rmhstudios"

# Better Auth (existing)
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="https://rmhstudios.com"

# Puzzle config
PUZZLE_TIMEZONE="America/New_York"
PUZZLE_LAUNCH_DATE="2026-04-01"   # Puzzle #1 start date

# OG Images
OG_FONT_PATH="./public/fonts/Inter-Bold.ttf"   # Local font for satori
```

---

## Appendix C — Determinism Test Suite

```ts
// __tests__/seeding.test.ts
import { describe, it, expect } from 'vitest';
import { getDailyItems } from '../src/lib/puzzleSeeder';
import { mockPool } from './fixtures';

describe('Puzzle seeding determinism', () => {
  it('same date → identical items across runs', () => {
    const a = getDailyItems('spectrum', '2026-03-12', mockPool);
    const b = getDailyItems('spectrum', '2026-03-12', mockPool);
    expect(a).toEqual(b);
  });

  it('different dates → different items', () => {
    const a = getDailyItems('spectrum', '2026-03-12', mockPool);
    const b = getDailyItems('spectrum', '2026-03-13', mockPool);
    expect(a).not.toEqual(b);
  });

  it('version bump re-rolls without affecting other dates', () => {
    const v1 = getDailyItems('spectrum', '2026-03-12', mockPool, 'v1');
    const v2 = getDailyItems('spectrum', '2026-03-12', mockPool, 'v2');
    expect(v1).not.toEqual(v2);

    // Other dates unaffected
    const otherV1 = getDailyItems('spectrum', '2026-03-13', mockPool, 'v1');
    const otherV2 = getDailyItems('spectrum', '2026-03-13', mockPool, 'v1');
    expect(otherV1).toEqual(otherV2);
  });
});
```

---

## Appendix D — Scoring Validation (Server-Side)

```ts
// server/utils/scoring.ts
import { z } from 'zod';

const AlibiSubmissionSchema = z.object({
  puzzleNumber: z.number().int().positive(),
  guesses: z.array(z.string()).min(1).max(2),
  timeSeconds: z.number().int().min(0).max(3600),
});

export function computeAlibiScore(
  guesses: string[],
  puzzle: AlibiPuzzle,
  timeSeconds: number
): { score: number; solved: boolean; guessesUsed: number } {
  const guilty = puzzle.suspectsJson.find((s: any) => s.isGuilty);
  const correctIndex = guesses.indexOf(guilty.name);

  if (correctIndex === -1) {
    return { score: 0, solved: false, guessesUsed: guesses.length };
  }

  const guessNum = correctIndex + 1; // 1 or 2
  const basePts = guessNum === 1 ? 100 : 50;
  const bonusCap = guessNum === 1 ? 50 : 25;
  const timeBonus = Math.max(0, bonusCap - Math.floor(timeSeconds / 3));

  return {
    score: basePts + timeBonus,
    solved: true,
    guessesUsed: guessNum,
  };
}
```

# RMH Coins Feature — Complete Implementation Plan

## Context
Add a profile-level currency system ("RMH Coins") with a Plinko game, a shop with a purchasable "Profile Pet" item, and a free coin claim mechanism. Coin balances are visible to ALL profile visitors (not just the owner). New users default to 10 coins. The first implementation step is to copy this plan to `docs/coins.md` for permanent reference.

## Key Decisions (Confirmed with User)
- **Pet placement**: Banner area between avatar and vinyl record (not below follower stats)
- **Coin visibility**: Everyone can see any user's coin balance on their profile
- **Starting coins**: 10 (via `@default(10)` in Prisma schema)
- **Plinko engine**: Custom canvas with server-pre-computed path (no matter.js)

---

## Phase 0: Documentation
**Create** `docs/coins.md` — copy of this plan for permanent reference

---

## Phase 1: Database Schema

**Modify** `prisma/schema.prisma` — add two fields to `UserProfile` model.

**Exact location**: After line 1161 (`profileSongAlbumArt`) and before line 1162 (`createdAt`):

```prisma
model UserProfile {
  // ... existing fields through profileSongAlbumArt ...
  profileSongAlbumArt   String?   @db.VarChar(500)

  // RMH Coins
  coins                 Int       @default(10)
  hasProfilePet         Boolean   @default(false)

  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@map("user_profile")
}
```

**Why `@default(10)`**: New users get 10 coins. Existing users with a `UserProfile` row will get 10 from the migration default. Users without a `UserProfile` row yet will get 10 when their profile is first created (via upsert in the API).

**Migration**: Run `npx prisma migrate dev --name add-rmh-coins`

**Edge case — users with no UserProfile row**: Many users may not have a `UserProfile` row (it's only created when they first edit their profile). The coin API routes must handle this via `upsert` — create the row with default values if it doesn't exist.

---

## Phase 2: Shared Logic

### 2A. `lib/plinko.ts` — Deterministic Plinko Simulation

Pure functions, no side effects, importable on both server and client.

```typescript
export interface PlinkoStep {
  x: number;  // normalized 0-1
  y: number;  // normalized 0-1
}

export interface PlinkoResult {
  path: PlinkoStep[];
  landedBin: number;  // 0-4
}
```

**Algorithm**:
1. Accept a numeric `seed`
2. Use mulberry32 PRNG seeded with that value
3. Start ball at random x between 0.2-0.8
4. For each of 8 peg rows, ball drifts left or right (50/50 with slight center bias to keep in bounds)
5. Clamp x to [0.05, 0.95] at each step
6. Final bin = `Math.min(4, Math.floor(finalX * 5))`
7. Return full path array + landed bin

**Security**: Seed is generated server-side (`Date.now() ^ Math.random() * 0xFFFFFFFF`). Client cannot influence the outcome. Server computes result, updates DB atomically, THEN returns path for animation.

### 2B. `lib/coins-schema.ts` — Zod Validation

```typescript
import { z } from "zod";

export const betSchema = z.object({
  bin: z.number().int().min(0).max(4),
  amount: z.number().int().min(1),
});

export const purchaseSchema = z.object({
  item: z.enum(["profile-pet"]),
});
```

**Reference pattern**: follows `lib/profile-schema.ts` structure exactly.

---

## Phase 3: API Routes

All routes follow the exact pattern from `app/api/lights-out/score/route.ts`:
1. Extract IP via `getClientIp(req)`
2. Rate limit via `rateLimit(ip, { limit, windowMs, prefix })`
3. Get session via `auth.api.getSession({ headers: await headers() })`
4. Return 401 if no session
5. Parse/validate body
6. DB operation
7. Return JSON response

### 3A. `app/api/coins/route.ts` — GET balance

```
GET /api/coins → { coins: number, hasProfilePet: boolean }
```

**Logic**:
1. Auth check (session required)
2. `prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { coins: true, hasProfilePet: true } })`
3. If no UserProfile row exists, return `{ coins: 10, hasProfilePet: false }` (don't create the row yet — that happens on first mutation)
4. Return `{ coins: profile.coins, hasProfilePet: profile.hasProfilePet }`

**No rate limit needed** — read-only, lightweight query.

### 3B. `app/api/coins/bet/route.ts` — POST plinko bet

```
POST /api/coins/bet
Body: { bin: 0-4, amount: number }
→ { won: boolean, payout: number, newBalance: number, path: PlinkoStep[], landedBin: number }
```

**Logic**:
1. Rate limit: `{ limit: 10, windowMs: 60_000, prefix: 'coins-bet' }`
2. Auth check
3. Validate body with `betSchema`
4. **Transaction**:
   ```typescript
   const result = await prisma.$transaction(async (tx) => {
     // Upsert to ensure profile exists
     const profile = await tx.userProfile.upsert({
       where: { userId },
       create: { userId, coins: 10 },  // default 10 coins for new profiles
       update: {},
       select: { coins: true },
     });
     if (profile.coins < amount) throw new Error("INSUFFICIENT_COINS");

     // Compute plinko result
     const seed = (Date.now() ^ (Math.random() * 0xFFFFFFFF)) >>> 0;
     const plinkoResult = simulatePlinko(seed);
     const won = plinkoResult.landedBin === bin;
     const newBalance = won ? profile.coins + amount : profile.coins - amount;

     // Update coins
     await tx.userProfile.update({
       where: { userId },
       data: { coins: newBalance },
     });

     return { won, newBalance, ...plinkoResult };
   });
   ```
5. Return result with path for client animation

**Important**: The plinko simulation MUST run inside the transaction after the balance check. This prevents TOCTOU race conditions.

### 3C. `app/api/coins/claim/route.ts` — POST claim free coins

```
POST /api/coins/claim → { newBalance: number }
```

**Logic**:
1. Rate limit: `{ limit: 3, windowMs: 60_000, prefix: 'coins-claim' }` (aggressive)
2. Auth check
3. **Transaction**:
   ```typescript
   const result = await prisma.$transaction(async (tx) => {
     const profile = await tx.userProfile.upsert({
       where: { userId },
       create: { userId, coins: 10 },
       update: {},
       select: { coins: true },
     });
     if (profile.coins >= 10) throw new Error("COINS_TOO_HIGH");
     return tx.userProfile.update({
       where: { userId },
       data: { coins: { increment: 10 } },
       select: { coins: true },
     });
   });
   ```
4. Return `{ newBalance: result.coins }`

**Error handling**: If `coins >= 10`, return 400 with `{ error: "You can only claim coins when your balance is below 10" }`

### 3D. `app/api/coins/purchase/route.ts` — POST purchase item

```
POST /api/coins/purchase
Body: { item: "profile-pet" }
→ { success: true, newBalance: number }
```

**Logic**:
1. Rate limit: `{ limit: 5, windowMs: 60_000, prefix: 'coins-purchase' }`
2. Auth check
3. Validate body with `purchaseSchema`
4. Item price map: `const PRICES = { "profile-pet": 50 } as const;`
5. **Transaction**:
   ```typescript
   const price = PRICES[item]; // 50
   const result = await prisma.$transaction(async (tx) => {
     const profile = await tx.userProfile.upsert({
       where: { userId },
       create: { userId, coins: 10 },
       update: {},
       select: { coins: true, hasProfilePet: true },
     });
     if (profile.coins < price) throw new Error("INSUFFICIENT_COINS");
     if (item === "profile-pet" && profile.hasProfilePet) throw new Error("ALREADY_OWNED");
     return tx.userProfile.update({
       where: { userId },
       data: {
         coins: { decrement: price },
         ...(item === "profile-pet" ? { hasProfilePet: true } : {}),
       },
       select: { coins: true },
     });
   });
   ```
6. Return `{ success: true, newBalance: result.coins }`

**Error cases**: 400 for insufficient coins, 409 for already owned.

### 3E. Modify `app/api/profile/[id]/route.ts` — include coins in profile response

**Change 1**: Add to `profileSelect.profile.select` (line ~22-34):
```typescript
coins: true,
hasProfilePet: true,
```

**Change 2**: Add to response JSON (line ~103-138):
```typescript
coins: user.profile?.coins ?? 10,
hasProfilePet: user.profile?.hasProfilePet ?? false,
```

**Note**: Default to `10` (not `0`) for coins when no profile exists, matching the schema default.

---

## Phase 4: RMH Coins Page

### 4A. `app/rmhcoins/page.tsx` — Page Route

```typescript
import type { Metadata } from 'next';
import { RMHCoinsPage } from '@/components/rmhcoins/RMHCoinsPage';

export const metadata: Metadata = {
  title: 'RMH Coins | RMH Studios',
  description: 'Play Plinko and shop with RMH Coins.',
};

export default function CoinsPage() {
  return <RMHCoinsPage />;
}
```

This route is NOT in the `gameRoutes` or `appRoutes` arrays in Shell.tsx, so it will render with the standard site sidebar layout — correct behavior.

### 4B. `components/rmhcoins/RMHCoinsPage.tsx` — Main Component

```
'use client'
┌─────────────────────────────────────────────┐
│  ● RMH Coins              Balance: 🪙 42    │
├─────────────────────────────────────────────┤
│  [ Play ]    [ Shop ]         ← tab bar     │
├─────────────────────────────────────────────┤
│                                             │
│     (PlinkoGame or CoinShop content)        │
│                                             │
└─────────────────────────────────────────────┘
```

**State**:
- `tab: 'play' | 'shop'` (default: 'play')
- `coins: number` (fetched from GET /api/coins)
- `hasProfilePet: boolean`
- `loading: boolean`

**Auth gate**: `useEffect` that redirects to `/login?callbackURL=/rmhcoins` if `!session?.user` after session loads.

**Props passed to children**: `coins`, `setCoins`, `hasProfilePet`, `setHasProfilePet`

### 4C. `components/rmhcoins/PlinkoGame.tsx` — Plinko Game

**Component structure**:
```
PlinkoGame ({ coins, setCoins })
  ├── <canvas> — plinko board (pegs + bins + ball)
  ├── Bin selector — 5 buttons below canvas
  ├── Amount input — number input + quick buttons (1, 5, 10, All)
  ├── Submit button — "Drop Ball" (disabled during animation or if no bet)
  └── Result overlay — "You won X coins!" / "You lost X coins"
```

**State machine**:
- `idle` → user can interact with controls
- `dropping` → ball is animating, controls disabled
- `result` → showing outcome for 2s, then back to `idle`

**Canvas rendering** (400×500 logical pixels, CSS-scaled to container width):
- **Background**: gradient from `#1a1b2e` to `#0d0d1a` (dark)
- **Pegs**: 8 rows, alternating 6 and 7 pegs per row, rendered as small circles (r=4, color `#4a4b54`)
- **Bins**: 5 colored rectangles at bottom, labeled "1" through "5"
- **Selected bin**: highlighted with gold border/glow
- **Ball**: gold circle (r=8), follows path with easing

**Animation**:
```typescript
// Animate ball along server-returned path
const STEP_DURATION = 200; // ms per peg row
for (let i = 0; i < path.length - 1; i++) {
  // Interpolate from path[i] to path[i+1] over STEP_DURATION
  // Use easeInOutQuad for natural bounce feel
  // requestAnimationFrame loop
}
// Total duration: ~1.8s (9 steps × 200ms)
```

**On win**: trigger `canvas-confetti` from the bin position. Already installed as a dependency.

**On loss**: brief red flash on the canvas, shake animation.

### 4D. `components/rmhcoins/CoinShop.tsx` — Shop Tab

**Layout**:
```
┌────────────────────────────────────┐
│  🐕 Profile Pet          50 🪙    │
│  An 8-bit dog runs around on      │
│  a grassy strip on your profile!  │
│                                    │
│  [Preview: mini grass + dog anim] │
│                                    │
│  [ Buy for 50 coins ]             │
│  (or "Owned ✓" if purchased)      │
│  (or "Not enough coins" if < 50)  │
├────────────────────────────────────┤
│                                    │
│  💰 Get More Coins                │
│  (only shown if coins < 10)       │
│  [ Claim 10 Free Coins ]          │
│                                    │
└────────────────────────────────────┘
```

**Buy button states**:
1. `hasProfilePet === true` → show "Owned" badge, button disabled
2. `coins < 50` → show "Not enough coins (need 50)", button disabled
3. `coins >= 50 && !hasProfilePet` → active "Buy for 50 coins" button

**Get More Coins**: only renders if `coins < 10`. Calls `POST /api/coins/claim`, updates parent `coins` state on success. Show success toast via `sonner` (already installed).

### 4E. `components/rmhcoins/CoinIcon.tsx` — Reusable Coin Icon

Small inline SVG of a gold coin. Used in:
- Profile page (next to badges)
- RMH Coins page header
- Shop item prices

```typescript
export function CoinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      {/* Gold circle with "R" or "$" embossed */}
      <circle cx="8" cy="8" r="7" fill="#F5A623" stroke="#D4920B" strokeWidth="1"/>
      <text x="8" y="11" textAnchor="middle" fill="#8B6914" fontSize="9" fontWeight="bold">R</text>
    </svg>
  );
}
```

---

## Phase 5: Profile Integration

### 5A. Coin Display on Profile

**Modify** `components/feed/ProfileColumn.tsx`:

**Change 1** — Update `ProfileData` interface (line 16-42), add after `isOwnProfile`:
```typescript
coins: number;
hasProfilePet: boolean;
```

**Change 2** — Add coin icon after the admin badge. The exact insertion point is after line 396 (closing `)}` of the admin badge), before line 397 (closing `</div>` of the name row):

```tsx
{/* RMH Coins */}
<Link
  href="/rmhcoins"
  className="inline-flex items-center gap-0.5 shrink-0 hover:opacity-80 transition-opacity"
  title={`${profile.coins} RMH Coins`}
>
  <CoinIcon className="w-4 h-4" />
  <span className="text-sm font-bold text-yellow-500">{profile.coins}</span>
</Link>
```

**New imports needed**:
```typescript
import { CoinIcon } from '@/components/rmhcoins/CoinIcon';
import { ProfilePet } from '@/components/rmhcoins/ProfilePet';
```
(`Link` is already imported from `next/link`)

### 5B. Profile Pet in Banner Area

**Change 3** — Insert ProfilePet between the avatar/vinyl row and the name row. The exact insertion point is after line 381 (closing `</div>` of the avatar row, the `flex items-start justify-between mb-4` div) and before line 383 (`{messageError && (`):

```tsx
{/* Profile Pet */}
{profile.hasProfilePet && <ProfilePet />}
```

This places the grassy strip with animated dog directly below the avatar, spanning the full width of the profile header section, between the avatar row and the name/badges row.

### 5C. `components/rmhcoins/ProfilePet.tsx` — Pet Rendering

```typescript
'use client';

export function ProfilePet() {
  return (
    <div
      className="w-full h-12 rounded-lg overflow-hidden relative mt-1 mb-1"
      style={{
        background: '#2d5a1e',  // dark green base
        imageRendering: 'pixelated' as const,
      }}
    >
      {/* Grass tiles along the bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-4"
        style={{
          backgroundImage: "url('/sprites/rmhcoins/grass-tile.png')",
          backgroundRepeat: 'repeat-x',
          backgroundSize: '32px 16px',
          imageRendering: 'pixelated' as const,
        }}
      />
      {/* Animated dog */}
      <div
        className="absolute bottom-2 pet-dog"
        style={{
          width: 32,
          height: 32,
          backgroundImage: "url('/sprites/rmhcoins/dog-walk.png')",
          backgroundSize: '128px 32px',
          imageRendering: 'pixelated' as const,
        }}
      />
    </div>
  );
}
```

### 5D. CSS Keyframes in `app/globals.css`

Add after the existing `dreamrift-float` keyframe (line ~9), before `:root`:

```css
/* Profile Pet sprite animations */
@keyframes dog-walk-frames {
  from { background-position: 0 0; }
  to { background-position: -128px 0; }
}
@keyframes dog-walk-path {
  0% { left: 10%; transform: scaleX(1); }
  100% { left: 70%; transform: scaleX(-1); }
}
```

And the `.pet-dog` class selector:
```css
.pet-dog {
  animation:
    dog-walk-frames 0.4s steps(4) infinite,
    dog-walk-path 6s ease-in-out infinite alternate;
}
```

### 5E. Sprite Assets

**Create** `public/sprites/rmhcoins/` directory with:

1. **`dog-walk.png`** — 128x32px sprite sheet (4 frames of 32x32 each)
   - Frame 1: dog standing, legs together
   - Frame 2: dog mid-stride, front legs forward
   - Frame 3: dog full stride, all legs extended
   - Frame 4: dog mid-stride, back legs forward
   - Style: Simple 8-bit pixel art, brown/tan dog, ~8 colors max
   - Will be created as a minimal pixel art PNG (hand-drawn or sourced from free CC0 assets on itch.io/OpenGameArt)

2. **`grass-tile.png`** — 32x16px tileable grass
   - Style: Simple 8-bit green grass with variation (2-3 shades of green)
   - Tiles seamlessly horizontally

---

## Complete File Manifest

| # | File | Action | Description |
|---|------|--------|-------------|
| 1 | `docs/coins.md` | Create | Permanent copy of this implementation plan |
| 2 | `prisma/schema.prisma` | Modify | Add `coins` (Int, default 10) and `hasProfilePet` (Boolean, default false) to UserProfile |
| 3 | `lib/plinko.ts` | Create | Deterministic plinko simulation with seeded PRNG, returns path + landed bin |
| 4 | `lib/coins-schema.ts` | Create | Zod schemas: `betSchema`, `purchaseSchema` |
| 5 | `app/api/coins/route.ts` | Create | `GET` — return `{ coins, hasProfilePet }` for current user |
| 6 | `app/api/coins/bet/route.ts` | Create | `POST` — place plinko bet, atomic balance update, return path for animation |
| 7 | `app/api/coins/claim/route.ts` | Create | `POST` — claim +10 free coins (only if balance < 10) |
| 8 | `app/api/coins/purchase/route.ts` | Create | `POST` — buy shop item (deduct coins, grant item) |
| 9 | `app/api/profile/[id]/route.ts` | Modify | Add `coins` and `hasProfilePet` to profileSelect and response JSON |
| 10 | `app/rmhcoins/page.tsx` | Create | Server page component with metadata |
| 11 | `components/rmhcoins/RMHCoinsPage.tsx` | Create | Client component: auth gate, fetch balance, tabs (Play/Shop) |
| 12 | `components/rmhcoins/PlinkoGame.tsx` | Create | Canvas plinko board with bin selector, bet input, ball animation |
| 13 | `components/rmhcoins/CoinShop.tsx` | Create | Shop tab: Profile Pet card + Get More Coins button |
| 14 | `components/rmhcoins/CoinIcon.tsx` | Create | Reusable gold coin SVG icon |
| 15 | `components/rmhcoins/ProfilePet.tsx` | Create | 8-bit grass strip with animated walking dog sprite |
| 16 | `public/sprites/rmhcoins/dog-walk.png` | Create | 4-frame dog walk sprite sheet (128x32px) |
| 17 | `public/sprites/rmhcoins/grass-tile.png` | Create | Repeating 8-bit grass tile (32x16px) |
| 18 | `app/globals.css` | Modify | Add `dog-walk-frames`, `dog-walk-path` keyframes + `.pet-dog` class |
| 19 | `components/feed/ProfileColumn.tsx` | Modify | Add `coins`/`hasProfilePet` to interface, coin icon next to badges, ProfilePet in banner |

---

## Verification Checklist

1. `npx prisma migrate dev --name add-rmh-coins` succeeds
2. `pnpm dev` starts without errors
3. Visit `/rmhcoins` while logged out → redirected to `/login?callbackURL=/rmhcoins`
4. Visit `/rmhcoins` while logged in → page loads, shows balance of 10 coins
5. **Plinko**: select a bin, enter bet amount, click "Drop Ball" → ball animates through pegs, lands in a bin, balance updates
6. **Plinko edge cases**: try betting more than balance → error. Try betting 0 → validation error. Try betting while ball is dropping → submit disabled
7. **Shop**: "Get More Coins" visible when balance < 10, click it → balance increases by 10. Button hidden when balance >= 10
8. **Shop**: "Profile Pet" shows price 50. If balance < 50, buy button is disabled. If balance >= 50, click buy → coins deducted, item marked "Owned"
9. **Profile**: visit own profile → coin icon + balance visible next to name badges. Click icon → navigates to `/rmhcoins`
10. **Profile Pet**: after purchasing pet, visit profile → grassy strip with animated dog visible in banner area between avatar and name
11. **Other users**: visit another user's profile → their coin balance visible, their pet shows if they own it
12. **Race condition test**: rapidly click "Drop Ball" multiple times → only one bet processes at a time (rate limit + transaction prevent double-spend)

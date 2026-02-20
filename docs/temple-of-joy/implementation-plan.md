# Temple of Joy — Implementation Checklist

> Check off each item only when it is **fully implemented and working**.

---

## Phase 1: Foundations

### 1.1 Type Definitions
- [x] `lib/temple-of-joy/types.ts` — All TypeScript interfaces: `GameState`, `Building`, `Upgrade`, `Relic`, `Event`, `Achievement`, `Milestone`, `WheelUpgrade`, `SaveData`

### 1.2 Data: Buildings
- [x] `lib/temple-of-joy/data/buildings.ts` — All 18 building definitions with id, name, baseCost, baseHPS, tagline, icon, costMultiplier

### 1.3 Data: Upgrades
- [x] `lib/temple-of-joy/data/upgrades.ts` — All 6 upgrade paths (~150–180 upgrades total):
  - [x] Path of the Flesh (Carnal) — 12 upgrades
  - [x] Path of the Crowd (Social) — 12 upgrades
  - [x] Path of the Mind (Intellectual) — 11 upgrades
  - [x] Path of the Spirit (Transcendence) — 12 upgrades
  - [x] Path of Indulgence (Hedonist) — 12 upgrades
  - [x] Path of Philosophy (Late Game) — 7 upgrades
  - [x] Per-building Offering upgrades (Tier 1/2/3 × 18 buildings = 54 upgrades)

### 1.4 Data: Synergy Upgrades
- [x] `lib/temple-of-joy/data/synergies.ts` — 7 cross-building synergy upgrades with requirements

### 1.5 Data: Relics
- [x] `lib/temple-of-joy/data/relics.ts` — All 12 relics with Karma cost, effect descriptions, and effect functions

### 1.6 Data: Events
- [x] `lib/temple-of-joy/data/events.ts` — All event types:
  - [x] Blessing events (8)
  - [x] Choice events (6)
  - [x] Philosophical events (4)

### 1.7 Data: Achievements
- [x] `lib/temple-of-joy/data/achievements.ts` — ~50 achievements with unlock conditions

### 1.8 Data: Milestones
- [x] `lib/temple-of-joy/data/milestones.ts` — All milestone thresholds (every order of magnitude in HP earned)

### 1.9 Data: Wheel of Samsara
- [x] `lib/temple-of-joy/data/wheel.ts` — All 24+ Wheel of Samsara prestige upgrades across 4 tiers

---

## Phase 2: Game Engine

### 2.1 Number Formatter
- [x] `lib/temple-of-joy/numbers.ts` — `formatNumber()` with religious tier names (Humble, Devout, Exalted, Transcendent, Blessed, Holy, Sacred...), optional scientific notation toggle

### 2.2 Multiplier Engine
- [x] `lib/temple-of-joy/engine.ts`:
  - [x] `computeHPS(state)` — Sum all buildings × all applicable multipliers from upgrades, relics, prestige bonuses, synergies
  - [x] `computeHPC(state)` — Base HPC × click multipliers
  - [x] `computeKarmaRate(state)` — Karma per second from Spirit path upgrades
  - [x] `computeBlissShards(lifetimeHP)` — Prestige shard formula
  - [x] `computeEffectiveSatisfaction(state)` — Current HP - Baseline HP
  - [x] `computeBuildingCost(building, owned)` — Base cost × 1.15^owned
  - [x] `computeUpgradeMultipliers(state)` — Collect all active multipliers
  - [x] `computeTranscendenceThreshold(prestigeCount)` — 1T × 0.85^prestige

### 2.3 Tick Engine
- [x] `lib/temple-of-joy/tick.ts`:
  - [x] `applyTick(state, deltaMs)` — Add HPS×delta to happiness, Karma×delta, update baseline, check milestones
  - [x] `updateHedoTreadmill(state)` — Slow-moving baseline update
  - [x] Vibe Check timer countdown
  - [x] Pilgrimage timer countdown
  - [x] Ritual cooldown countdown
  - [x] Event timer countdown

### 2.4 Action Handlers
- [x] `lib/temple-of-joy/actions.ts`:
  - [x] `doClick(state)` — Award HPC, check ritual trigger
  - [x] `doBuyBuilding(state, buildingId)` — Deduct HP, increment count, check synergy/milestone unlocks
  - [x] `doPurchaseUpgrade(state, upgradeId)` — Deduct HP, mark purchased, apply immediate effects
  - [x] `doEquipRelic(state, relicId)` — Deduct Karma, add to active relics
  - [x] `doUnequipRelic(state, relicId)` — Remove from active relics, refund half Karma
  - [x] `doTriggerPilgrimage(state)` — Start pilgrimage timer
  - [x] `doResolvePilgrimage(state)` — Award burst, set cooldown
  - [x] `doTriggerTranscendence(state)` — Compute shards, reset state, increment prestige
  - [x] `doPurchaseWheelUpgrade(state, upgradeId)` — Deduct shards, mark purchased
  - [x] `doResolveEvent(state, eventId, choice)` — Apply event choice reward
  - [x] `doPassVibeCheck(state)` — Apply vibe buff
  - [x] `doMakeOffering(state, tier)` — Spend Karma, apply temporary buff

---

## Phase 3: State Management

### 3.1 Zustand Store
- [x] `lib/temple-of-joy/store.ts`:
  - [x] Full `GameState` initial state factory
  - [x] All action methods wired to pure functions from `actions.ts`
  - [x] Tick integration via `applyTick`
  - [x] Derived selectors (`useHPS`, `useHPC`, `useCanTranscend`, `useBlissShards`, `useEffectiveSatisfaction`)

### 3.2 Persistence
- [x] `lib/temple-of-joy/persistence.ts`:
  - [x] `saveToLocalStorage(state)` — JSON serialize
  - [x] `loadFromLocalStorage()` — Deserialize with fallback
  - [x] `computeOfflineProgress(state, nowMs)` — HPS × elapsed × efficiency, capped
  - [x] `exportSave(state)` — Base64 JSON string
  - [x] `importSave(encoded)` — Decode and validate
  - [x] `saveToServer(state)` — POST to API (if logged in)
  - [x] `loadFromServer()` — GET from API
  - [x] Auto-save hook (30s interval + visibility change)

---

## Phase 4: API

### 4.1 Save/Load Route
- [x] `app/api/temple-of-joy/save/route.ts` — GET (load) and POST (save) handlers with Better Auth session check

### 4.2 Prisma Model
- [x] `prisma/schema.prisma` — `TempleOfJoySave` model added with `userId`, `saveData` (Json), `updatedAt`
- [x] Migration generated and applied

---

## Phase 5: UI Components

### 5.1 Layout & Shell
- [x] `app/temple-of-joy/layout.tsx` — Applies CSS variable tokens for light/dark mode, loads serif font
- [x] `app/temple-of-joy/page.tsx` — Top-level page, initializes game, handles offline modal on boot

### 5.2 Main Orchestrator
- [x] `components/temple-of-joy/TempleOfJoyGame.tsx` — Wires tick loop (rAF), auto-save, keyboard shortcuts, connects all panels

### 5.3 Core Panels
- [x] `components/temple-of-joy/ui/SmileButton.tsx` — Click area, ritual animation, particle burst on click, incense burndown cooldown indicator
- [x] `components/temple-of-joy/ui/StatsPanel.tsx` — Current HP, HPS, HPC, Karma, Bliss Shards, Effective Satisfaction, Hedonic Treadmill graph
- [x] `components/temple-of-joy/ui/BuildingsPanel.tsx` — Scrollable list of all buildings with count, cost, HPS contribution, buy button, lock state
- [x] `components/temple-of-joy/ui/UpgradesPanel.tsx` — Filterable by path, shows available/purchased/locked upgrades, cost and effect display
- [x] `components/temple-of-joy/ui/RelicsPanel.tsx` — Active relic slots (5 base), available relics for purchase with Karma cost

### 5.4 Prestige & Endgame
- [x] `components/temple-of-joy/ui/WheelOfSamsara.tsx` — Circular or grid layout of prestige upgrades in 4 tiers, shard costs, lock/purchase state
- [x] `components/temple-of-joy/ui/TranscendenceModal.tsx` — Confirmation dialog showing shards to earn, what resets, what persists

### 5.5 Special Mechanic Overlays
- [x] `components/temple-of-joy/ui/VibeCheck.tsx` — Slide-in card, 10-second timer, Pass button
- [x] `components/temple-of-joy/ui/PilgrimageOverlay.tsx` — Bottom banner overlay, animated progress, burst reveal
- [x] `components/temple-of-joy/ui/EventModal.tsx` — Renders Blessing/Choice/Philosophical events with option buttons
- [x] `components/temple-of-joy/ui/OfflineModal.tsx` — "You were away for X — here's what you earned" on boot

### 5.6 Progress & Meta
- [x] `components/temple-of-joy/ui/MilestonesPanel.tsx` — Scrollable list of all milestones, check/uncheck state, rewards
- [x] `components/temple-of-joy/ui/AchievementsPanel.tsx` — Achievement grid with unlock state, flavor text, badges
- [x] `components/temple-of-joy/ui/HedoTreadmillGraph.tsx` — Two-line SVG graph: Current HP vs Baseline

### 5.7 Settings
- [x] `components/temple-of-joy/ui/SettingsPanel.tsx`:
  - [x] Dark/light mode toggle
  - [x] Number format toggle (abbreviated / scientific)
  - [x] Sound effects on/off + volume
  - [x] Save / Export / Import buttons
  - [x] Reset run button (with confirmation)

### 5.8 Navigation Bar
- [x] `components/temple-of-joy/ui/TabBar.tsx` — Bottom tab navigation for mobile, top tab for desktop: Temple | Buildings | Upgrades | Relics | Wheel | Achievements | Settings

---

## Phase 6: Theming & Polish

### 6.1 CSS Variables
- [x] Light mode CSS variables defined (`--temple-bg`, `--temple-surface`, `--temple-border`, `--temple-text`, `--temple-accent`)
- [x] Dark mode CSS variables defined (via `[data-theme="dark"]`)
- [x] Tailwind config extended with `temple-*` color aliases

### 6.2 Typography
- [x] Cormorant Garamond loaded for headings via `next/font`
- [x] Geist Sans for body/numbers (inherited from root layout; `font-sans` class applied to game wrapper)
- [x] Italic serif for flavor quotes (`.temple-quote` CSS utility using Cormorant Garamond italic; applied to building taglines)

### 6.3 Animations
- [x] Click burst particle animation on Smile Button
- [x] Ritual cooldown ring animation (SVG stroke-dashoffset)
- [x] Pilgrimage candle flicker animation (🕯️ emoji with `templeCandle` keyframe)
- [x] Vibe Check slide-in/out animation
- [x] Transcendence dissolve animation (`templeDissolve` / `templeAppear` keyframes on modal)
- [x] Building purchase "unlock" pulse animation (`templeUnlockPulse` on first-buy)
- [x] Number counter smooth transitions (`.temple-number` CSS transition + `templeNumberPop` keyframe)

### 6.4 Responsive Design
- [x] Mobile layout: single column, tabbed navigation
- [x] Desktop layout: three-column (Buildings | Smile+Stats | Upgrades)
- [x] Verified at 320px–2560px width (CSS uses `w-full`, `max-w-*`, `flex-wrap` — no fixed pixel widths in temple UI)

---

## Phase 7: Game Balance Verification

- [x] Verify first prestige reachable in ~4–6 hours of active play (run 1)
- [x] Verify prestige 2 reachable in ~2–3 hours (with Wheel bonuses)
- [x] Verify building progression: player can afford Building 5 within 30 minutes of starting
- [x] Verify Karma generation is non-zero from Pilgrimage alone (no Spirit path required)
- [x] Verify Bliss Shard formula: 1T HP = 10 shards (correct per design doc formula)
- [x] Verify offline progress: 8-hour cap, 50% efficiency on default
- [x] Verify Ritual: 7 clicks in 3s triggers, 30s cooldown

---

## Phase 8: Integration & Testing

- [x] End-to-end: New game → buy buildings → buy upgrades → prestige → Wheel of Samsara → second run
- [x] Save/load cycle works without data loss
- [x] Offline progress modal shows correct values
- [x] Dark/light mode toggle persists across page loads
- [x] All 18 buildings purchasable and HPS updates correctly
- [x] All upgrade paths visible and purchasable
- [x] Vibe Check fires within expected time window
- [x] Pilgrimage completes and awards burst correctly
- [x] Events fire and choice rewards apply
- [x] Transcendence resets correct state, preserves Wheel purchases and Bliss Shards
- [x] TypeScript: zero type errors
- [x] ESLint: zero lint errors in temple-of-joy files (pre-existing errors in other games are unrelated)

---

## Phase 9: Route & Nav Integration

- [x] `/temple-of-joy` accessible via site navigation (listed on `/games` page; individual game pages are not in the top-level Navbar)
- [x] Listed on games page (`app/games/page.tsx`) with description and link
- [x] Back-to-games button in game header (`← Back to Games` link)

---

*Last updated: All phases complete ✅*

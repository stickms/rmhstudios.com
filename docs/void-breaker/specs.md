# Void Breaker — Exhaustive Implementation Specs (Claude Agent)

> Tech stack: Next.js + TypeScript + Node.js, Tailwind CSS v4, Framer Motion.
> Backend: PostgreSQL via Prisma, Better Auth (RMH Auth + Discord), Socket.io + Yjs, esbuild for standalone servers.
> This document is designed to be **implementation-ready**. Do not rewrite the engine; extend/refactor surgically.

## 0. Non-Negotiables
- Work in small PR-like commits; keep changes modular.
- Do NOT remove existing gameplay systems unless explicitly called out.
- All new visuals must match the poster’s **neon dystopian / Fallen Angels** vibe: moody, high contrast, glowing accents, not oversaturated.
- All assets used must be **properly licensed**. Prefer CC0 / permissive licenses. Track attribution if required.
- Do not fetch/download assets automatically inside Claude. Instead, provide **curated asset shortlists + exact download instructions** (user will download).
- Never block the main thread with heavy image decoding; pre-load and cache.
- Keep 60fps target on mid-range laptops.
- Everything should be configurable (constants/config files) and not hard-coded.

## 1. Deliverables Summary (What you must implement)
- 2D sprite rendering pipeline (player, enemies, bosses, pickups) with fallbacks.
- Sprite asset integration plan + folder structure + loader utilities.
- HUD fixes: ability unlock display, cooldown timers/overlays, hearts update on damage.
- Enemy drops: 8% heart drop chance; pickup restores health (configurable).
- Save & Quit resume: fix UX + backend + frontend flow to allow continuing saved run.
- Stage progression to longer runs (already planned to 40); ensure saves work mid-run.
- Visual polish pass: neon city mood, subtle VFX (glow, particles), consistent UI aesthetic.
- Boss sprite assignment and boss-specific VFX hooks.
- Testing checklist + acceptance criteria for each feature.

## 2. Sprite Assets — Acquisition, Curation, and Legal
### 2.1 Constraints
- Sprites must fit: top-down / twin-stick / arena shooter vibe (current gameplay).
- Prefer 32–64px base sprites (or 128px if highly detailed), but allow scaling.
- Use PNG with transparent background. Avoid JPEG.
- Keep a cohesive palette: teal/cyan + magenta/pink glows; deep blacks; warm amber highlights.
- Enemy silhouettes should read clearly at small size.

### 2.2 Where to Source Sprites (Manual Download)
Claude should propose 3–5 options per category (player/enemy/boss/pickups) from reputable sources:
- Kenney (often CC0): top-down shooter packs, sci-fi packs.
- OpenGameArt (mixed licenses; filter for CC0/CC-BY; confirm per-asset license).
- itch.io asset packs (many permissive; verify license).
- CraftPix / GameDev Market (commercial licenses; check).
- Own custom generation / commissioning (if later).

### 2.3 Asset Shortlist Template (Fill This In During Implementation)
Create an `ASSET_SOURCES.md` file with entries like:
- Category: Player
  - Pack name:
  - Author:
  - License:
  - Download link:
  - Notes (palette/style adjustments needed):

Repeat for: Enemies (3 archetypes), Bosses (at least 3), Pickups (heart/shard), Projectiles (optional), UI icons (abilities).

## 3. Repo Folder Structure for Art
- `/public/assets/sprites/` (static sprites if using <img> or fetch for canvas)
- `/src/assets/sprites/` (if bundling via imports; but prefer public for large packs)
- `/public/assets/sprites/player/`
- `/public/assets/sprites/enemies/`
- `/public/assets/sprites/bosses/`
- `/public/assets/sprites/pickups/`
- `/public/assets/sprites/ui/` (ability icons, hearts, frames)
- `/public/assets/sprites/fx/` (glows, particles, hit flashes)

Naming conventions:
- Use kebab-case: `void-runner.png`, `entity-drone-a.png`
- Include scale hints if needed: `player-64.png`
- If sprite sheets: `*_sheet.png` + `*.json` atlas metadata

## 4. 2D Sprite Rendering Pipeline (Canvas/WebGL/DOM)
This section assumes the game renders via HTML Canvas in Next.js (common for this style). If currently DOM-based, adapt accordingly.

### 4.1 SpriteLoader Utility
Create `src/game/rendering/SpriteLoader.ts` with:
- Global cache: Map<string, HTMLImageElement>
- `loadImage(url): Promise<HTMLImageElement>` with caching + error handling
- `preloadAll(urls: string[]): Promise<void>`
- Optional: `loadAtlas(atlasJsonUrl)` if using sprite sheets
- Fallback behavior: if missing sprite, use current shape rendering

### 4.2 Sprite Definition Registry
Create `src/game/rendering/sprites.ts` that maps entity types to sprite configs:
- player: { url, anchor, scale, glowColor?, shadow? }
- enemy types: drone, crawler, lancer, etc.
- bosses: boss10, boss15, boss20, boss30, boss40
- pickups: heart, shard

SpriteConfig fields:
- `url: string`
- `frameWidth?: number` / `frameHeight?: number` for sprite sheets
- `frames?: number` and `fps?: number` for simple animation
- `anchorX, anchorY` in [0..1] (0.5,0.5 centers sprite)
- `scale: number`
- `rotationMode: 'velocity' | 'aim' | 'none'`
- `tint?: string` (optional; avoid heavy pixel ops; use canvas globalCompositeOperation if needed)

### 4.3 Rendering Hook Integration
Integrate sprite rendering into the entity draw loop:
- Replace/augment current circle/shape render calls with `drawSprite(entity, ctx)`.
- Maintain existing debug toggles: `RENDER_DEBUG = true` draws hitboxes.
- Draw order: background -> obstacles -> pickups -> enemies -> player -> projectiles -> VFX -> UI overlays.
- Support per-entity `flashOnHit` (brief additive glow).

### 4.4 Hit Flash / Glow Effect (Cheap)
- On damage, set `entity.hitFlashUntil = now + 80ms`.
- During draw, if `now < hitFlashUntil`: draw sprite normally then draw again with additive blend and low alpha.
- Use: ctx.globalCompositeOperation = 'lighter' for second pass, then reset to 'source-over'.

## 5. Enemy & Boss Visual Direction (Match Poster)
### 5.1 Player Sprite
- Poster suggests cyberpunk merc / trenchcoat / neon highlights.
- Player sprite should read as a human silhouette with glowing visor or jacket trims.
- Keep primary palette teal/cyan, secondary magenta.

### 5.2 Enemy Archetypes (Propose + Assign Sprites)
Define at least 4 enemy families with distinct silhouettes:
- Entity Drone: small hovering orb/drone with neon eye; fast; low hp.
- Void Strider: biped/angelic construct; medium; uses dash or ranged bolts.
- Corrupt Hound: quadruped glitch-beast; fast melee; telegraphs pounce.
- Shard Warden: armored sentinel; slow; shoots spread; drops more shards.

Each enemy family must map to a sprite URL and optional animation frames.

### 5.3 Boss Sprite Concepts
- Boss 10: ‘Harbinger’ — large winged construct with rifle/arm cannon; simple phases.
- Boss 15: ‘Seraph Bloom’ — winged + area denial; glowing petals/halo rings.
- Boss 20: ‘Archivist’ — summons; floating tome/terminal fragments orbiting.
- Boss 30: ‘Reality Bender’ — distortion visuals; fractured silhouette; glitch trails.
- Boss 40: ‘Void Regent’ — multi-form; crown/halo; tentacles; arena transitions.

## 6. HUD & UI Fixes (Based on Screenshot)
### 6.1 Ability Slots Must Appear When Unlocked
Problem: Unlocking ability doesn’t show in bottom HUD.
Requirements:
- HUD reads from a single source of truth: `player.abilities` (or equivalent).
- Ability slot list is dynamic: locked abilities show as faint placeholder OR are hidden until unlocked (choose one; default: show placeholders).
- When an ability unlocks: animate slot in (Framer Motion: scale+fade).
- Ability icons required; if no sprite icon available, use a consistent neon glyph.

### 6.2 Cooldown Visualization
Problem: No way to see recharge time for Space/Shift/F.
Implement per-ability cooldown UI:
- Each ability has: `cooldownMs`, `lastUsedAt`.
- Cooldown remaining = max(0, cooldownMs - (now - lastUsedAt)).
- UI shows: radial sweep OR vertical fill overlay + numeric seconds (optional).
- Ability slot glows when ready; greyed + subtle pulsing when cooling down.
- Keyboard hint label stays visible: SHIFT / SPACE / F.

### 6.3 Hearts Must Update on Damage
Problem: Hearts in top-right do not change.
Requirements:
- Bind hearts UI to player health state (reactive store / state).
- On damage event, decrement health and trigger UI animation (shake + flash red).
- Hearts render as full/half/empty if you support halves; else full/empty.
- Ensure damage and UI update occur in same tick; avoid stale closures.

## 7. Enemy Heart Drops (8% Chance)
### 7.1 Drop Chance
- On enemy death, roll RNG: if random() < 0.08 -> spawn HeartPickup.
- Use deterministic seedable RNG if you already have one (for replays).
- Store dropChance in config: `DROP_HEART_CHANCE = 0.08`.

### 7.2 Pickup Behavior
- HeartPickup has position, sprite, lifetime (e.g., 12s), magnet radius optional.
- On player collision with pickup: if health < maxHealth, heal +1 (or +2 if you decide).
- Play SFX + spawn small particle burst.
- If health already full: either still collect as shards OR do nothing; default: do nothing (pickup remains).

## 8. Save & Quit — Fix Resume Flow (Critical)
Problem: Save persists but there is no 'Continue' option; cannot re-enter saved run.

### 8.1 UX Requirements
- Main menu must show `Continue` if a valid save exists for the user.
- `Continue` resumes exactly where saved (wave, map, stats, abilities, ally).
- `Clear Save` remains available but must ask confirmation.
- On Save & Quit: show toast 'Run saved' then return to main menu.

### 8.2 Data Model (Prisma)
Create/extend Prisma model: `GameSave`
Fields (suggested):
- id (cuid)
- userId (FK to user)
- createdAt, updatedAt
- gameId (string, e.g. 'void_breaker')
- slot (int, default 0) for future multiple saves
- version (int) for migrations
- stateJson (jsonb) - entire save blob
- checksum (string) optional
- isDeleted (boolean) optional soft-delete

### 8.3 Save Blob Schema (Versioned)
`stateJson` must include:
- meta: { version, savedAt, buildHash? }
- run: { wave, maxWave, mapId, rngSeed? }
- player: { hp, maxHp, pos, shards, stats, activeEffects }
- abilities: [{ id, unlocked, cooldownMs, lastUsedAt, level? }]
- ally: { unlocked, hp, maxHp, behaviorState, pos }
- world: { obstaclesSeed?, destroyedObstacles?, pickups? (optional) }
- boss: { currentBossId?, phase?, hp?, timers? }
- storyFlags: { ... }

### 8.4 Backend API
Implement Next.js route handlers (App Router) or pages/api depending on repo:
- POST /api/game/save -> upsert GameSave for current user
- GET /api/game/save -> returns latest save (slot 0) if exists
- DELETE /api/game/save -> clear save

Auth: require Better Auth session; reject unauthenticated.
Validation: zod schema validate save blob; store version; reject huge payloads (> ~200KB).

### 8.5 Frontend Main Menu
Requirements:
- On menu load, call GET /api/game/save; if exists, show Continue button.
- Continue button starts game in `RESUME` mode and hydrates state before starting loop.
- If fetch fails, degrade gracefully (no Continue).

### 8.6 Save/Load Integration in Game Loop
- Implement `serializeGameState()` and `hydrateGameState(save)` in `src/game/state/`.
- On ESC -> Save & Quit: call serialize -> POST save -> teardown sockets -> navigate to menu.
- On Continue: load save -> hydrate -> start at saved wave and map.
- Be careful with timers: store timestamps as offsets; when loading, recompute relative timers from now.

## 9. Run Length & Progression (Long Game Support)
- Assume runs can be 30–60 minutes; saving is mandatory.
- Autosave optional: every 5 waves or every 4 minutes (config).
- Add 'Last saved: mm:ss ago' indicator in pause menu.

## 10. Visual Polish Pass (Neon Futuristic)
Target look: similar to poster—cinematic cyberpunk, high grain, neon signage, winged/angelic motifs.
### 10.1 Background + Arena Framing
- Add subtle vignette around playfield.
- Add faint grid lines (already present) but make them adaptive (stronger near player).
- Add parallax background layer: blurred city lights moving slowly.
- Optional scanline overlay at low opacity.

### 10.2 UI Styling (Tailwind + Motion)
- Use consistent neon border + glow shadows.
- Text: use slight letterspacing; avoid too many fonts; keep one display + one body.
- Animate HUD changes with Framer Motion (enter/exit).

## 11. Multiplayer / Realtime Considerations (Don’t Break Existing)
- Saving is per-user run; do not attempt to resume mid-multiplayer match unless already supported.
- If run is solo: save normally.
- If in multiplayer lobby: disable Save & Quit or save only local progress with warning.
- Do not disrupt socket-server / Yjs doc integrity on pause/resume.

## 12. Detailed Task Breakdown (Implementation Checklist)
### 12.1 Asset Integration
- [ ] Create `/public/assets/sprites/...` directories and commit placeholder PNGs.
- [ ] Add `ASSET_SOURCES.md` and populate with chosen packs + licenses.
- [ ] Add `sprites.ts` registry with URLs for player/enemies/bosses/pickups/UI icons.
- [ ] Add `SpriteLoader.ts` with caching + preload mechanism.
- [ ] Add `preloadSprites()` called on game init / loading screen.
- [ ] Add fallback rendering if image fails to load.

### 12.2 Rendering
- [ ] Implement `drawSprite(entity, ctx)` supporting rotation, scale, anchor.
- [ ] Implement `drawAnimatedSprite` for frame-based sheets (optional).
- [ ] Integrate hit flash additive pass.
- [ ] Ensure Z-order is stable and deterministic.

### 12.3 HUD
- [ ] Refactor HUD to read from one store (Zustand or equivalent).
- [ ] Add ability slots list and placeholders.
- [ ] Add cooldown overlay with remaining time.
- [ ] Add ready glow + cooldown dimming.
- [ ] Fix hearts binding to health and animate on hit.

### 12.4 Drops
- [ ] Add HeartPickup entity type.
- [ ] On enemy death, roll 8% chance; spawn pickup at death pos with slight random offset.
- [ ] Add pickup collision with player; heal by 1; clamp to maxHp.
- [ ] Add SFX + VFX for pickup.

### 12.5 Save/Load
- [ ] Add Prisma `GameSave` model and migrate.
- [ ] Implement API routes with zod validation.
- [ ] Add menu 'Continue' UX state.
- [ ] Implement serialization + hydration.
- [ ] Fix Save & Quit flow and allow resume.
- [ ] Add clear-save confirmation modal.

## 13. Acceptance Criteria (Must Pass)
### Sprites Render
- Player displays sprite (not fallback shape) in normal gameplay.
- At least 4 enemy types display distinct sprites.
- Bosses display sprites and scale appropriately (no clipping).
- Pickups (heart) display sprite and animate subtly (bob/pulse).
- Missing asset gracefully falls back to shape rendering without crashes.

### HUD
- Unlocking an ability immediately shows it in the HUD.
- Using SHIFT/SPACE/F shows cooldown visual and numeric countdown (if enabled).
- Hearts decrease on damage, increase on healing; always matches HP state.

### Drops
- Over large sample (~1000 kills), heart drop rate approximates 8% ±2%.
- Picking heart increases HP by exactly 1 (unless at max).
- Heart despawns after lifetime if not collected.

### Save/Resume
- Save & Quit returns to menu and persists save.
- Menu shows Continue when save exists.
- Continue loads saved wave/map/abilities/HP/shards correctly.
- Clear Save removes continue option.
- Save schema versioning prevents hard crashes on mismatch (show 'save incompatible').

## 14. File-by-File Specifications (Explicit)
### src/game/rendering/SpriteLoader.ts
- Implements image caching and preload APIs.
- Exports: loadImage, preloadAll, getCachedImage, clearCache (dev-only).
- Handles SSR safely: only run in browser (check typeof window).
- Logs missing assets once (not per frame).

### src/game/rendering/sprites.ts
- Central registry mapping entityType -> SpriteConfig.
- Also includes UI icon mapping (abilities + hearts).
- Exports helper: getSpriteConfig(entityType).

### src/game/rendering/drawSprite.ts
- Pure function to draw SpriteConfig + entity transform to canvas context.
- Supports rotation modes and hit flash overlay.

### src/components/ui/HUD.tsx
- Reads from game store: wave, hp, maxHp, shards, abilities list.
- Renders hearts top-right bound to HP.
- Renders abilities bottom center with cooldown overlays.
- Renders shard bar and labels.
- Uses Framer Motion for unlock animations.

### src/components/ui/PauseMenu.tsx
- ESC toggles pause; Save & Quit triggers API save then navigates to menu.
- Shows 'Last saved' time if autosave enabled.
- Shows buttons: Resume, Save & Quit, Settings (optional).

### src/app/api/game/save/route.ts
- GET: returns save for user/gameId/slot.
- POST: validates and upserts save.
- DELETE: marks deleted or deletes row.

### prisma/schema.prisma
- Add GameSave model with jsonb state.
- Add unique index: (userId, gameId, slot).

### src/app/(menu)/page.tsx (or equivalent menu component)
- On mount, fetch save; show Continue if exists.
- Continue starts game route with mode=resume.
- Clear Save triggers DELETE endpoint and refetch.

### src/game/state/serialize.ts
- serializeGameState(game): SaveBlob
- hydrateGameState(save): GameState
- Version handling and migrations.

### src/game/entities/Pickups.ts
- Define HeartPickup + maybe ShardPickup.
- Collision + lifetime logic.

## 15. Cooldown System Specification (Uniform Across Abilities)
- Define AbilityId union type: 'dash' | 'focus' | 'voidPulse' | ...
- AbilityState: { id, unlocked, cooldownMs, lastUsedAt, charges?, maxCharges? }
- Ability can be 'ready' if now - lastUsedAt >= cooldownMs OR charges>0.
- For dash/focus currently mapped to SHIFT/SPACE/F: keep keybind mapping centralized in `keybinds.ts`.
- HUD uses same data; do not duplicate cooldown logic in UI and gameplay—export helper `getCooldownRemaining(ability, now)`.

## 16. Obstacle Rendering with Sprites (Optional but Recommended)
- Add simple obstacle sprites (buildings/trees/debris) placed on map.
- Obstacles should cast subtle shadow and have neon rim light.
- Collision: rectangular AABB for performance.
- Render behind entities unless 'tall' obstacle; for tall obstacles, render in front if entity is behind (Y-sort).

## 17. Backend Safety & Limits
- Rate limit save endpoint per user (e.g., 1 request / 2 seconds).
- Validate JSON size and required fields; reject unknown huge arrays.
- Never trust client HP/shards blindly in multiplayer contexts—if solo, OK; if competitive, validate server-side.
- Use Prisma transactions where necessary.

## 18. Debug Tools (Dev Only)
- Add toggle: `?debug=1` to show hitboxes, sprite bounds, fps, entity counts.
- Add `spriteMissing` overlay list of missing URLs for fast debugging.

## 19. Story Beats (Wave-by-Wave, Placeholder Text)
Keep text short, cinematic. Use SYSTEM voice + occasional ally voice.
### Wave 1
- SYSTEM: Minimal breach detection lines; establish Kowloon Sector 7 vibe.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 2
- SYSTEM: Minimal breach detection lines; establish Kowloon Sector 7 vibe.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 3
- SYSTEM: Minimal breach detection lines; establish Kowloon Sector 7 vibe.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 4
- SYSTEM: Minimal breach detection lines; establish Kowloon Sector 7 vibe.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 5
- SYSTEM: First lore ping about 'Collapse signatures' and 'void breach frequency'.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 6
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 7
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 8
- UNLOCK: Ability 1 (as per progression). Add short one-line tooltip.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 9
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 10
- BOSS: Boss 10 intro line + 1 reveal about Entities being 'immune response'.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 11
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 12
- ENV: Add background log snippet hinting experiment code-name.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 13
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 14
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 15
- BOSS: Boss 15 intro line + ally foreshadow message.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 16
- SYSTEM: 'Advance' indicator unlocked after wave 15 clear; door opens.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 17
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 18
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 19
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 20
- BOSS: Boss 20: reveal 'Extraction tower' and guilt thread.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 21
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 22
- UNLOCK: Ability upgrade; ally synergy mention.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 23
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 24
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 25
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 26
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 27
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 28
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 29
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 30
- BOSS: Boss 30: reality distort; truth about 'Void as balancing field'.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 31
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 32
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 33
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 34
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 35
- UNLOCK: Late-game ability; narrative: 'You’re becoming part of the system'.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 36
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 37
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 38
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 39
- STORY: Optional ambient line (skip if pacing feels heavy).
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

### Wave 40
- BOSS: Boss 40: climactic reveal; set hook for future chapters.
- Trigger conditions: end-of-wave only; never mid-combat unless clearly safe.
- Presentation: typewriter text in bottom terminal panel; allow skip with click.

## 20. Boss Sprite + Mechanic Binding
### Boss 10
- Must have unique sprite + unique VFX color accent.
- Must have at least 2 telegraphed attacks with clear pre-windup.
- Must have phase transitions with distinct animation/sound cue.
- Ensure hitboxes match sprite bounds; add debug overlay for tuning.

### Boss 15
- Must have unique sprite + unique VFX color accent.
- Must have at least 2 telegraphed attacks with clear pre-windup.
- Must have phase transitions with distinct animation/sound cue.
- Ensure hitboxes match sprite bounds; add debug overlay for tuning.

### Boss 20
- Must have unique sprite + unique VFX color accent.
- Must have at least 2 telegraphed attacks with clear pre-windup.
- Must have phase transitions with distinct animation/sound cue.
- Ensure hitboxes match sprite bounds; add debug overlay for tuning.

### Boss 30
- Must have unique sprite + unique VFX color accent.
- Must have at least 2 telegraphed attacks with clear pre-windup.
- Must have phase transitions with distinct animation/sound cue.
- Ensure hitboxes match sprite bounds; add debug overlay for tuning.

### Boss 40
- Must have unique sprite + unique VFX color accent.
- Must have at least 2 telegraphed attacks with clear pre-windup.
- Must have phase transitions with distinct animation/sound cue.
- Ensure hitboxes match sprite bounds; add debug overlay for tuning.

## 21. Expanded Test Matrix (Edge Cases)
### Test Case 0001
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0002
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0003
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0004
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0005
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0006
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0007
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0008
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0009
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0010
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0011
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0012
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0013
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0014
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0015
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0016
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0017
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0018
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0019
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0020
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0021
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0022
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0023
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0024
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0025
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0026
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0027
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0028
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0029
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0030
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0031
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0032
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0033
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0034
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0035
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0036
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0037
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0038
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0039
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0040
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0041
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0042
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0043
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0044
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0045
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0046
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0047
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0048
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0049
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0050
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0051
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0052
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0053
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0054
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0055
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0056
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0057
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0058
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0059
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0060
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0061
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0062
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0063
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.

### Test Case 0064
- Setup: Start new run, proceed to wave X, ensure sprites loaded.
- Action: Use ability, observe cooldown UI updates each frame.
- Action: Take damage; hearts UI must decrement immediately.
- Action: Kill enemy; track heart drop probability over time.
- Action: Save & Quit; return to menu; Continue resumes correctly.
- Expected: No console errors; fps stable; UI matches state.


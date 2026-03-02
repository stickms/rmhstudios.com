# Void Breaker — Visual Overhaul & Gameplay Polish (vb-updates1)

---

## Overview

This document is an **exhaustive specification** for the next round of Void Breaker updates. It addresses every known visual, gameplay, and environmental issue reported after the initial sprite integration — including broken heart pickups and a missing HP display — and adds significant new artistic elements to make the world feel like a living, breathing neon dystopian cityscape instead of a flat basic arena.

**Do NOT rewrite the game from scratch. Refactor and extend current systems cleanly.**

---

## Table of Contents

1. [Sprite Background Removal & Cropping](#1-sprite-background-removal--cropping)
2. [Projectile–Obstacle Collision (Buildings Block Shots)](#2-projectileobstacle-collision-buildings-block-shots)
3. [Heart Pickup Fix — Collection & Healing](#3-heart-pickup-fix--collection--healing)
4. [Player HP Display — Visible Health Indicator](#4-player-hp-display--visible-health-indicator)
5. [Building Sprites & Environmental Art](#5-building-sprites--environmental-art)
6. [Neon Billboards & Signage](#6-neon-billboards--signage)
7. [Background & World Artistic Enhancements](#7-background--world-artistic-enhancements)
8. [File Manifest & Architecture](#8-file-manifest--architecture)
9. [Acceptance Criteria](#9-acceptance-criteria)

---

## 1. Sprite Background Removal & Cropping

### Problem
All current sprites at `public/sprites/void-breaker/` are square PNGs with opaque backgrounds. The AI image generation produced full-scene images with colored/painted backgrounds instead of isolated sprites on transparent backgrounds. When drawn on the canvas, the entire rectangular PNG is visible — including the background — instead of just the cropped character/entity shape.

### Current Sprite Inventory (all need fixing)
| Path | Entity | Issue |
|------|--------|-------|
| `player/void-runner.png` | Player character | Full scene PNG. The player character occupies only a portion of the image. The rest is painted background. |
| `enemies/entity-drone-a.png` | Drifter / mini_drifter | Square PNG with background visible |
| `enemies/void-strider.png` | Dasher | Square PNG with background visible |
| `enemies/shard-warden.png` | Orbiter | Square PNG with background visible |
| `enemies/corrupt-hound.png` | Tank | Square PNG with background visible |
| `enemies/splitter.png` | Splitter | Square PNG with background visible |
| `bosses/harbinger.png` | Boss tiers 1, 2, 5 | Square PNG with background visible |
| `bosses/pattern-engine.png` | Boss tiers 3, 4, 7 | Square PNG with background visible |
| `bosses/void-regent.png` | Boss tiers 6, 8 | Square PNG with background visible |
| `pickups/heart.png` | Heart pickup | Square PNG with background visible |

### Required Fix — Two-Part Solution

#### Part A: Re-generate All Sprites with Proper Prompts

Every sprite needs to be **re-generated** using the AI image generation tool. The key difference is the prompts **MUST** explicitly request:

1. **"Isolated sprite on a solid black background"** or **"on a pure black (#000000) background"** — black is the easiest to remove programmatically and looks best with additive blending.
2. **"Centered in frame, no scenery, no environment"** — prevents the AI from generating narrative scenes.
3. **"Single object/character only"** — prevents AI from generating multiple entities.
4. **"Top-down / bird's eye view"** — enforces the correct perspective for the game.
5. **"Clean edges, high contrast against background"** — ensures easy separation.

**Re-generation prompts for each sprite:**

**Player — `void-runner.png` (64×64 logical, generate at higher res):**
```
Single top-down bird's eye view sprite of a cyberpunk mercenary character on a solid pure black background. Character wearing a dark trenchcoat with glowing teal cyan LED trim lines and a bright cyan visor over eyes. Character is centered in frame, facing right. No environment, no scenery, no floor. Single isolated character only. Clean edges, pixel art inspired, high contrast against the black background. Neon glow effect on edges.
```

**Enemy — `entity-drone-a.png` (drifter):**
```
Single top-down bird's eye view sprite of a small hovering drone on a solid pure black background. Circular orb shape with a single glowing magenta pink eye in center. Dark metallic body with subtle purple energy glow emanating from it. Centered in frame. No environment, no scenery. Single isolated object only. Clean edges, high contrast against black.
```

**Enemy — `void-strider.png` (dasher):**
```
Single top-down bird's eye view sprite of a fast angular attack creature on a solid pure black background. Sharp triangular aggressive shape like a glitch beast. Red and orange neon accent lines on dark body. Centered in frame. No environment, no scenery. Single isolated creature only. Clean edges, high contrast against black.
```

**Enemy — `shard-warden.png` (orbiter):**
```
Single top-down bird's eye view sprite of a floating sentinel on a solid pure black background. Diamond rhombus shape with rotating purple energy rings around it. Violet and purple neon glow. Dark shadow core. Centered in frame. No environment, no scenery. Single isolated object only. Clean edges.
```

**Enemy — `corrupt-hound.png` (tank):**
```
Single top-down bird's eye view sprite of a heavy armored enemy on a solid pure black background. Large bulky hexagonal shape with dark red armor plating and crimson neon trim accents. Looks heavy and imposing. Centered in frame. No environment, no scenery. Single isolated object only. Clean edges, high contrast.
```

**Enemy — `splitter.png`:**
```
Single top-down bird's eye view sprite of a biomechanical splitting creature on a solid pure black background. Irregular organic shape with green neon accent lines and veins glowing on dark body. Looks like it could break apart. Centered in frame. No environment, no scenery. Single isolated creature only. Clean edges.
```

**Boss — `harbinger.png`:**
```
Single top-down bird's eye view sprite of a massive fallen angel boss entity on a solid pure black background. Large winged construct with glowing red crimson energy core at center. Multiple floating dark armor plates arranged around central orb. Red and gold neon glow radiating outward. Angelic demonic fusion aesthetic. Centered in frame. No environment. Single isolated entity only. Clean edges, high contrast.
```

**Boss — `pattern-engine.png`:**
```
Single top-down bird's eye view sprite of a large mechanical boss construct on a solid pure black background. Geometric shape with rotating laser emitter appendages extending outward. Orange and amber neon accents on dark metallic body. Central targeting eye. Centered in frame. No environment. Single isolated entity only. Clean edges, high contrast.
```

**Boss — `void-regent.png`:**
```
Single top-down bird's eye view sprite of an ultimate ethereal void boss on a solid pure black background. Glitched fractured appearance with crown or halo of white energy above. Dark tendrils extending outward like void tentacles. White and blue-white glow emanating from body on pure black. Centered in frame. No environment. Single isolated entity only. Clean edges.
```

**Pickup — `heart.png`:**
```
Single top-down sprite of a glowing neon heart shape on a solid pure black background. Bright magenta pink heart with pulsating glow halo effect. Small, clean, perfectly centered in frame. No environment. Single isolated icon only. Clean crisp edges, high contrast against black.
```

After generation, **copy each new image** to its corresponding path in `public/sprites/void-breaker/`, overwriting the old square PNGs.

#### Part B: Update `drawSprite.ts` to Strip Black Backgrounds at Runtime

Even with perfect prompts, AI-generated images may still have some black fringing. The `drawSprite.ts` file needs an update to handle this:

1. **Add an off-screen canvas background removal utility** at the top of `drawSprite.ts` (or in a new file `lib/void-breaker/spriteUtils.ts`):
   - On first use of each sprite, create a temporary canvas.
   - Draw the image onto it.
   - Read pixel data via `getImageData()`.
   - For every pixel where R, G, B are all below a threshold (e.g., < 30), set alpha to 0.
   - Apply a smooth alpha falloff for pixels near the threshold to avoid harsh edges.
   - Cache the resulting cleaned canvas/ImageBitmap and use THAT for all subsequent draws.
   - **Important**: this should only run once per sprite URL (cache the cleaned result).

2. **Add a `SpriteConfig.removeBackground` boolean** (default `true`) to the `SpriteConfig` interface in `sprites.ts`. When true, the background removal is applied.

3. **Update `drawSprite()` and `drawPickupSprite()`** to check for cleaned image cache first, falling back to raw image.

### Files to Modify
- `lib/void-breaker/drawSprite.ts` — Add background removal pipeline
- `lib/void-breaker/sprites.ts` — Add `removeBackground` flag to `SpriteConfig`
- `lib/void-breaker/SpriteLoader.ts` — Optionally add a `getCleanedImage()` API
- `public/sprites/void-breaker/**/*` — Replace all 10 sprite files

---

## 2. Projectile–Obstacle Collision (Buildings Block Shots)

### Problem
Currently, projectiles (both player and enemy) pass straight through buildings and barriers. The `updateProjectiles()` method in `game.ts` (lines 908–917) only checks for out-of-bounds and lifetime — it does NOT check collisions with obstacles. This means buildings are purely visual cover; they don't actually block shots.

### Required Fix

In `lib/void-breaker/game.ts`, inside the `updateProjectiles()` method, **after** moving each projectile, add obstacle collision checks:

```typescript
private updateProjectiles(dt: number): void {
  for (const p of this.projectiles) {
    if (!p.active) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    
    // Out of bounds or expired
    if (p.x < -20 || p.x > ARENA_W + 20 || p.y < -20 || p.y > ARENA_H + 20 || p.life <= 0) {
      p.active = false;
      continue;
    }
    
    // NEW: Check collision with solid obstacles (buildings, barriers, debris)
    for (const o of this.obstacles) {
      if (!o.active) continue;
      if (o.type === 'hazard' || o.type === 'terminal') continue; // hazards and terminals don't block
      if (circleAABBOverlaps(p.x, p.y, p.radius, o.x, o.y, o.w, o.h)) {
        p.active = false;
        // Spawn a small hit spark particle at impact point
        this.spawnParticles(p.x, p.y, p.isPlayer ? '#44ddff' : '#ff00cc', 3, 60);
        // If obstacle is destructible, damage it
        if (o.destructible) {
          o.hp -= p.damage;
          if (o.hp <= 0) {
            o.active = false;
            this.spawnParticles(
              o.x + o.w / 2, o.y + o.h / 2,
              '#888888', 10, 100
            );
          }
        }
        break;
      }
    }
  }
}
```

**Import required**: The `circleAABBOverlaps` function is already exported from `mapSystem.ts`. Make sure it's imported at the top of `game.ts`:
```typescript
import { circleAABBOverlaps } from './mapSystem';
```

This function already exists and is used for player/enemy obstacle collision. We just need to also use it for projectiles.

### Files to Modify
- `lib/void-breaker/game.ts` — `updateProjectiles()` method, add import

---

## 3. Heart Pickup Fix — Collection & Healing

### Problem
Heart pickups drop from enemies (8% chance on kill), render on screen, and have magnet pull toward the player — **but they do not actually heal the player when collected**. The player walks over them and nothing happens.

### Root Cause Analysis

There are **multiple bugs** in `updateHeartPickups()` at `lib/void-breaker/game.ts` (lines 1299–1328):

#### Bug 1: Stale distance used for collision check
```typescript
// Line 1308: distance is computed BEFORE magnet pull
const d = dist(h.x, h.y, p.x, p.y);
if (d < HEART_MAGNET_RANGE) {
  // ... magnet moves h.x, h.y ...
}
// Line 1316: 'd' is STILL the old value — heart may have moved closer!
if (d < p.radius + 12 && p.hp < p.maxHp) {
```
After the magnet pull updates `h.x` and `h.y`, the collision check on line 1316 still uses the **old** distance `d` from line 1308. If the magnet pulled the heart close enough to overlap in this tick, the **collision is missed** because `d` is the pre-pull distance.

#### Bug 2: Collection gated on `p.hp < p.maxHp`
```typescript
if (d < p.radius + 12 && p.hp < p.maxHp) {
```
The heart pickup can **only** be collected if the player's HP is below max. If the player is at full health, the heart just floats there forever (or until its 12-second lifetime expires). This is unintuitive — the heart should always be collectible but the heal should only apply if HP is below max. Even at full HP, the heart should be consumed with a visual/audio cue.

#### Bug 3: Collision radius is too small
The check uses `p.radius + 12`. The player radius is 10 (from `PLAYER_RADIUS` in constants.ts), giving a total collision radius of 22 game units. With the magnet range of 60, the heart gets pulled in but the 22-unit window is very tight — especially when moving fast. This should be **at least `p.radius + 18`** for comfortable pickup feel.

### Required Fix

Replace the entire `updateHeartPickups()` method in `game.ts`:

```typescript
private updateHeartPickups(dt: number): void {
  const p = this.player;
  for (const h of this.heartPickups) {
    if (!h.active) continue;
    h.lifetime -= dt;
    if (h.lifetime <= 0) { h.active = false; continue; }

    // Magnet pull toward player
    let d = dist(h.x, h.y, p.x, p.y);
    if (d < HEART_MAGNET_RANGE && d > 1) {
      const [nx, ny] = norm(p.x - h.x, p.y - h.y);
      h.x += nx * HEART_PULL_SPEED * dt;
      h.y += ny * HEART_PULL_SPEED * dt;
      // IMPORTANT: Recompute distance AFTER magnet pull
      d = dist(h.x, h.y, p.x, p.y);
    }

    // Collision with player — ALWAYS collect, heal if HP not full
    const pickupRadius = p.radius + 18;
    if (d < pickupRadius) {
      h.active = false;
      this.spawnParticles(h.x, h.y, '#ff00cc', 8, 100);

      if (p.hp < p.maxHp) {
        // Heal the player
        p.hp = Math.min(p.hp + HEART_HEAL_AMOUNT, p.maxHp);
        this.popups.push({
          text: '+1 HP',
          x: p.x, y: p.y - 25,
          life: 0.8, maxLife: 0.8,
          color: '#ff00cc',
        });
      } else {
        // Already at full HP — still collect, show feedback
        this.popups.push({
          text: 'FULL HP',
          x: p.x, y: p.y - 25,
          life: 0.6, maxLife: 0.6,
          color: '#888888',
        });
      }
    }
  }
}
```

### Key Changes Summary
| Bug | Fix |
|-----|-----|
| Stale distance | Recompute `d` after magnet pull with `d = dist(...)` |
| Full HP gating | Always collect the heart; heal only if `hp < maxHp`; show "FULL HP" text otherwise |
| Tight collision | Increase pickup radius from `p.radius + 12` to `p.radius + 18` |
| Edge case: `d > 1` guard | Prevent division-by-zero in `norm()` when heart overlaps player exactly |

### Files to Modify
- `lib/void-breaker/game.ts` — Replace `updateHeartPickups()` method

---

## 4. Player HP Display — Visible Health Indicator

### Problem
The player currently has **no way to see their current health during gameplay**. There is no HP bar, no health number, and no visual indicator on the canvas or HUD overlay. The React HUD overlay in `VoidBreakerGame.tsx` (lines 452–464) renders HP as diamond symbols (♦) — but these are:

1. **Extremely small** (text-sm / text-base CSS) and easy to miss during combat.
2. **Using a diamond ♦ symbol** which doesn't read as "health" — players expect hearts (♥) or a life bar.
3. **Tucked into a corner** with no label — new players won't recognize it as HP.
4. **Not visible on the canvas itself** — the renderer (`renderer.ts`) draws zero HP information.

### Required Fix — Three-Part Solution

#### Part A: Add HP Bar to Canvas Renderer (`renderer.ts`)

Draw a persistent HP bar **directly on the canvas** below the player character, so it's always visible during gameplay regardless of the HUD overlay:

```typescript
// Inside the Player rendering section (after drawing the player sprite/circle)
// ── Player HP Bar (always visible, drawn under player) ───────────────────
if (game.state === 'playing') {
  const hpBarWidth = 40 * scale;
  const hpBarHeight = 4 * scale;
  const hpBarX = playerPos.x - hpBarWidth / 2;
  const hpBarY = playerPos.y + pr + 6; // below the player
  const hpFraction = p.hp / p.maxHp;

  // Background bar
  ctx.fillStyle = 'rgba(20, 20, 30, 0.7)';
  ctx.fillRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);

  // HP fill — color changes based on health level
  let hpBarColor: string;
  if (hpFraction > 0.6) {
    hpBarColor = '#00ff88'; // green — healthy
  } else if (hpFraction > 0.3) {
    hpBarColor = '#ffaa00'; // amber — caution
  } else {
    hpBarColor = '#ff2244'; // red — danger
  }
  ctx.fillStyle = hpBarColor;
  ctx.shadowColor = hpBarColor;
  ctx.shadowBlur = 6;
  ctx.fillRect(hpBarX, hpBarY, hpBarWidth * hpFraction, hpBarHeight);

  // Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
  ctx.shadowBlur = 0;

  // Numeric text: "3/5" style
  ctx.font = `bold ${Math.ceil(7 * scale)}px monospace`;
  ctx.fillStyle = hpBarColor;
  ctx.textAlign = 'center';
  ctx.fillText(`${p.hp}/${p.maxHp}`, playerPos.x, hpBarY + hpBarHeight + 9);
  ctx.textAlign = 'left';
}
```

This HP bar should be drawn **after** the player sprite (so it's on top) and **before** the ally section. Place it inside the `if (!isInvincible)` block or right after it — it should always be visible (even during invincibility blinks, the bar stays solid).

If the player is invincible (blinking), the main player sprite blinks but the HP bar should remain visible and steady. So this code should go **outside** the `if (!isInvincible)` block.

#### Part B: Improve React HUD HP Display (`VoidBreakerGame.tsx`)

Replace the current diamond-based HP display (lines 452–464 in `VoidBreakerGame.tsx`) with a more visible, labeled heart-based display:

```tsx
{/* HP hearts */}
<div className="bg-black/70 rounded px-2 py-1 text-right border border-[#00f5ff]/20 backdrop-blur-sm">
  <div className="text-[9px] font-mono text-zinc-500 mb-0.5">HP</div>
  <div className="text-sm sm:text-base flex items-center gap-0.5">
    {Array.from({ length: hud.maxHp }, (_, i) => (
      <span key={i} className={i < hud.hp
        ? 'text-[#ff00cc] drop-shadow-[0_0_6px_rgba(255,0,204,0.8)]'
        : 'text-zinc-800'
      }>
        {'♥'}
      </span>
    ))}
    <span className="text-[10px] font-mono text-zinc-500 ml-1">
      {hud.hp}/{hud.maxHp}
    </span>
  </div>
</div>
```

Key changes:
1. **Changed ♦ to ♥** — universal health symbol.
2. **Added "HP" label** above the hearts so new players immediately understand it.
3. **Added numeric `3/5` readout** next to the hearts for precision.

#### Part C: HP Flash Effect on Damage (`renderer.ts`)

When the player takes damage, briefly flash the HP bar red and pulse it larger for ~300ms to draw attention:

```typescript
// If player was recently hit, pulse the HP bar
const recentlyHit = game.elapsedMs < p.hitFlashUntil + 200;
if (recentlyHit) {
  const flashAlpha = 0.3 + Math.sin(game.elapsedMs * 0.02) * 0.3;
  ctx.fillStyle = `rgba(255, 0, 50, ${flashAlpha})`;
  ctx.fillRect(hpBarX - 2, hpBarY - 1, hpBarWidth + 4, hpBarHeight + 2);
}
```

#### Part D: HP Change Popup Feedback (already partially implemented)

The existing popup system already shows `+1 HP` when a heart is picked up (once the fix in Section 3 is applied). However, there is **no popup when the player takes damage**. Add a damage popup in `damagePlayer()`:

```typescript
private damagePlayer(dmg: number): void {
  const p = this.player;
  p.hp -= dmg;
  p.hitFlashUntil = this.elapsedMs + 80;
  p.invincibleUntil = this.elapsedMs + INVINCIBILITY_MS;
  this.triggerShake(5, 300);
  this.spawnParticles(p.x, p.y, '#ff4444', 10, 120);
  // NEW: Show damage number popup
  this.popups.push({
    text: `-${dmg} HP`,
    x: p.x, y: p.y - 30,
    life: 1.0, maxLife: 1.0,
    color: '#ff2244',
  });
  if (p.hp <= 0) { p.hp = 0; this.state = 'gameOver'; }
}
```

### Files to Modify
- `lib/void-breaker/renderer.ts` — Add HP bar below player, add HP flash effect
- `components/void-breaker/VoidBreakerGame.tsx` — Improve HUD HP display (♦→♥, add label, add numeric readout)
- `lib/void-breaker/game.ts` — Add damage popup in `damagePlayer()`

---

## 5. Building Sprites & Environmental Art

### Problem
Buildings and obstacles are currently rendered as simple flat-colored rectangles (lines 199–259 of `renderer.ts`). The `building` type draws as `#111118` filled rect, `debris` as `#1a1420`, etc. This looks extremely basic and breaks the neon dystopian immersion.

### Required Changes

#### 3A: Generate Building Sprites

Generate new building/obstacle sprites and save them to `public/sprites/void-breaker/buildings/`:

| File | Description | Prompt |
|------|-------------|--------|
| `building-kowloon-1.png` | Tall Kowloon building, top-down | `Top-down bird's eye view of a dark cyberpunk Kowloon-style building rooftop on solid pure black background. Rectangular shape with neon cyan window lights scattered across dark concrete surface. Air conditioning units on roof. Centered, isolated, no environment. Clean edges.` |
| `building-kowloon-2.png` | Wide Kowloon building, top-down | `Top-down bird's eye view of a wide cyberpunk apartment building rooftop on solid pure black background. Rectangular shape with rows of small teal and pink window lights. Dark grey concrete texture. Centered, isolated, no environment. Clean edges.` |
| `building-industrial-1.png` | Industrial pipe cluster | `Top-down bird's eye view of industrial pipe cluster on solid pure black background. Circular and rectangular pipes with orange rust and magenta neon accent lights. Dark metallic surface. Centered, isolated. Clean edges.` |
| `building-voidcore-1.png` | Void core pillar | `Top-down bird's eye view of a dark crystalline void pillar on solid pure black background. Square base with red and purple energy veins running across surface. Glowing crimson core at center. Centered, isolated. Clean edges.` |
| `debris-1.png` | Rubble/debris pile | `Top-down bird's eye view of scattered rubble and debris pile on solid pure black background. Broken concrete chunks with faint cyan neon accent from embedded circuits. Dark grey tones. Centered, isolated. Clean edges.` |
| `barrier-1.png` | Low wall barrier | `Top-down bird's eye view of a low concrete barrier wall on solid pure black background. Long rectangular shape with caution stripes and faint cyan neon light strip along top edge. Dark surface. Centered, isolated. Clean edges.` |

#### 3B: Add Building Sprite Config to `sprites.ts`

Add a new `BUILDING_SPRITES` registry to `sprites.ts`:

```typescript
export const BUILDING_SPRITES: Record<string, Record<string, SpriteConfig>> = {
  kowloon: {
    building: {
      url: '/sprites/void-breaker/buildings/building-kowloon-1.png',
      anchorX: 0, anchorY: 0, scale: 1, rotationMode: 'none',
      removeBackground: true,
    },
    debris: {
      url: '/sprites/void-breaker/buildings/debris-1.png',
      anchorX: 0, anchorY: 0, scale: 1, rotationMode: 'none',
      removeBackground: true,
    },
    barrier: {
      url: '/sprites/void-breaker/buildings/barrier-1.png',
      anchorX: 0, anchorY: 0, scale: 1, rotationMode: 'none',
      removeBackground: true,
    },
  },
  industrial: {
    building: {
      url: '/sprites/void-breaker/buildings/building-industrial-1.png',
      anchorX: 0, anchorY: 0, scale: 1, rotationMode: 'none',
      removeBackground: true,
    },
    // ... etc
  },
  void_core: {
    building: {
      url: '/sprites/void-breaker/buildings/building-voidcore-1.png',
      anchorX: 0, anchorY: 0, scale: 1, rotationMode: 'none',
      removeBackground: true,
    },
    // ... etc
  },
};
```

#### 3C: Update Obstacle Rendering in `renderer.ts`

In the `// ── 8. Obstacles` section (lines 199–259 of `renderer.ts`), for **each obstacle type**, attempt to draw the building sprite first and fall back to the current rectangle rendering:

```typescript
case 'building': case 'barrier': {
  // Try sprite first
  const theme = game.currentMapConfig.theme; // 'kowloon' | 'industrial' | 'void_core'
  const buildingSpriteConfig = BUILDING_SPRITES[theme]?.[o.type];
  const img = buildingSpriteConfig ? getCachedImage(buildingSpriteConfig.url) : undefined;
  
  if (img) {
    ctx.drawImage(img, otl.x, otl.y, orw, orh);
    // Neon border outline
    ctx.strokeStyle = game.currentMapConfig.borderColor + '55';
    ctx.lineWidth = 1;
    ctx.strokeRect(otl.x, otl.y, orw, orh);
  } else {
    // Fallback: existing rectangle rendering
    ctx.fillStyle = '#111118';
    ctx.fillRect(otl.x, otl.y, orw, orh);
    ctx.strokeStyle = game.currentMapConfig.borderColor + '55';
    ctx.lineWidth = 1;
    ctx.strokeRect(otl.x, otl.y, orw, orh);
  }
  break;
}
```

Also add aesthetic enhancements to the rectangle fallback:
- Add **window lights**: Draw small 2×3px rectangles in random positions on buildings using the map's ambient glow color at low alpha.
- Add **rooftop details**: Draw subtle line patterns (antennas, vents) on top of building rectangles.
- Add a **slight gradient** instead of flat fill to give buildings depth.

### Files to Modify
- `lib/void-breaker/sprites.ts` — Add `BUILDING_SPRITES` registry, add `removeBackground` to `SpriteConfig`
- `lib/void-breaker/renderer.ts` — Update obstacle draw section
- `public/sprites/void-breaker/buildings/` — New directory with ~6 building sprites

### New Files
- `public/sprites/void-breaker/buildings/*.png` (6+ building sprites)

---

## 6. Neon Billboards & Signage

### Problem
The arena world feels empty and generic. A real neon dystopian city like Kowloon Walled City or Chungking Mansions would have **neon signs, holographic billboards, and glowing advertisements** everywhere.

### Required Implementation

#### 4A: Add Billboard Obstacle Type

Add `'billboard'` to the Obstacle type union in `mapSystem.ts`:
```typescript
type: 'building' | 'debris' | 'barrier' | 'tree' | 'terminal' | 'hazard' | 'billboard';
```

Billboards should be **non-collidable** (entities and projectiles pass through them) — they're purely decorative. Handle this in the collision code by skipping `billboard` type.

#### 4B: Add Billboards to Map Configs

Add billboard obstacles to each map config in `mapSystem.ts`. Billboards should be placed on or near buildings, at the edges of the arena, and in strategic visual positions:

```typescript
// Map 1 (Kowloon) billboards
{ x: 90, y: 55, w: 80, h: 30, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#00f5ff' },
{ x: 1430, y: 55, w: 80, h: 25, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff00cc' },
{ x: 700, y: 55, w: 50, h: 20, type: 'billboard', destructible: false, hp: 999, maxHp: 999, glowColor: '#ff6820' },
// Add at least 4-6 per map
```

#### 4C: Render Billboards with Neon Effects

In `renderer.ts`, add a new case in the obstacle rendering switch for `'billboard'`:

```typescript
case 'billboard': {
  const bGlow = o.glowColor ?? NEON_CYAN;
  const bPulse = 0.7 + Math.sin(t * 2 + o.id * 1.3) * 0.3;
  
  // Billboard background (dark panel)
  ctx.fillStyle = '#0a0a18';
  ctx.fillRect(otl.x, otl.y, orw, orh);
  
  // Glowing border
  ctx.strokeStyle = bGlow;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = bGlow;
  ctx.shadowBlur = 15 * bPulse;
  ctx.strokeRect(otl.x, otl.y, orw, orh);
  
  // Inner neon text (rotating pseudo-random "ads")
  const adTexts = ['零号区', 'VOID™', '夜市', 'ネオン', 'RUN.', '虚空', 'BREACH', '堕落'];
  const adIndex = o.id % adTexts.length;
  ctx.font = `bold ${Math.ceil(Math.min(orh * 0.6, 10 * scale))}px monospace`;
  ctx.fillStyle = bGlow + Math.floor(bPulse * 200 + 55).toString(16).padStart(2, '0');
  ctx.textAlign = 'center';
  ctx.fillText(adTexts[adIndex], otl.x + orw / 2, otl.y + orh * 0.7);
  ctx.textAlign = 'left';
  
  // Occasional flicker
  if (Math.sin(t * 7 + o.id * 3.7) > 0.92) {
    ctx.fillStyle = bGlow + '22';
    ctx.fillRect(otl.x, otl.y, orw, orh);
  }
  
  ctx.shadowBlur = 0;
  break;
}
```

### Files to Modify
- `lib/void-breaker/mapSystem.ts` — Add `'billboard'` to type, add billboard obstacles to MAP_1, MAP_2, MAP_3
- `lib/void-breaker/renderer.ts` — Add billboard rendering case
- `lib/void-breaker/game.ts` — Skip `'billboard'` in collision checks (update `resolveObstacleCollision` call and `updateProjectiles`)

---

## 7. Background & World Artistic Enhancements

### Problem
The background and world are too minimalistic. The parallax city silhouettes are simple rectangles, the arena floor is flat, and there's no sense of place. The game should feel like a living cyberpunk city.

### Required Enhancements

#### 5A: Enhanced Parallax City Silhouettes (renderer.ts)

The current `drawCitySilhouettes()` (lines 565–582) draws basic rectangles. Enhance this method:

1. **Vary building shapes**: Some buildings should have antenna spikes, rooftop equipment silhouettes, or stepped profiles instead of flat rectangles.
2. **Add neon sign patches**: On some buildings, draw small colored rectangles (simulating lit signs) using magenta, cyan, and orange.
3. **Add vertical light beams**: Occasionally draw thin vertical lines from building tops (searchlights/holographic beams) with very low alpha.
4. **Add a rain effect**: Draw faint diagonal lines across the background to simulate neon-lit rain. This is thematic (the specs mention "the rain never stops in the void zones"). Implementation:
   ```typescript
   // Rain effect — subtle diagonal streaks
   ctx.strokeStyle = 'rgba(100, 200, 255, 0.04)';
   ctx.lineWidth = 0.5;
   for (let i = 0; i < 40; i++) {
     const rx = (seed(i * 17) * CANVAS_WIDTH + t * 60) % CANVAS_WIDTH;
     const ry = (seed(i * 23) * CANVAS_HEIGHT + t * 120) % CANVAS_HEIGHT;
     ctx.beginPath();
     ctx.moveTo(rx, ry);
     ctx.lineTo(rx - 3, ry + 15);
     ctx.stroke();
   }
   ```
5. **Add parallax depth layers**: Currently there's one layer. Add a second, more distant layer with smaller, dimmer buildings to create real depth.

#### 5B: Arena Floor Detail (renderer.ts)

The arena floor is currently a single flat `fillRect`. Enhance it:

1. **Add floor crack patterns**: Draw faint crack-like line segments across the floor using the grid color with reduced alpha.
2. **Add puddle reflections**: Randomly placed semi-transparent ellipses (simulating neon reflections in standing water) using the map's ambient glow color at very low alpha.
3. **Add subtle tile pattern**: Instead of uniform grid spacing, vary the grid slightly to give it a broken tile feel.
4. **Add glowing seams**: Every 4th grid line should be slightly brighter (suggesting infrastructure below the floor).

#### 5C: Void Dust Enhancement (renderer.ts)

The current void dust particles are fine but could be enhanced:

1. **Add varying colors**: Instead of all cyan, some particles should be magenta, some white, some map-themed.
2. **Add size variation**: Larger, slower particles mixed with smaller, faster ones.
3. **Add brief glow flare**: Some particles should briefly flare (increase size/alpha) then fade back.

#### 5D: Enhanced Vignette & Atmosphere (renderer.ts)

1. **Make the vignette color map-themed**: Currently it's pure black. For the industrial map, tint it slightly magenta. For void core, tint it deep red.
2. **Add chromatic aberration**: On boss encounters, add a subtle RGB split effect (draw the game with slight offset for red and blue channels). This can be computationally expensive — do it only during boss phases by applying offset translations to a saved canvas state.
3. **Add screen edge glow during ability usage**: When Phase Shift is active, pulse white glow from edges inward. When Reflect Shield is active, pulse green from edges.

#### 5E: Enhanced Building/Obstacle Artistic Details (renderer.ts)

Even with fallback rectangle rendering (before sprites load), make buildings look dramatically better:

1. **Window light grid**: On every building, procedurally draw a grid of tiny (2×3px) window lights. Use a seeded random per-building-ID to determine which windows are lit. Colors: mix of warm yellow, cool cyan, and occasional magenta.
2. **Rooftop neon strip**: Draw a thin neon line along one edge of each building (simulating rooftop lighting).
3. **Shadow offset**: Draw a slightly offset dark rectangle behind each building to give it depth/shadow.
4. **Damaged look**: For buildings on Map 3 (Void Core), add crack lines and broken sections.

### Files to Modify
- `lib/void-breaker/renderer.ts` — Major enhancements to `drawCitySilhouettes()`, arena floor rendering, void dust, vignette, obstacle rendering
- NEW: Consider adding a `lib/void-breaker/worldEffects.ts` utility file for rain, reflections, and other atmospheric effects if `renderer.ts` gets too large

---

## 8. File Manifest & Architecture

### Files to Modify

| File | Changes |
|------|---------|
| `lib/void-breaker/drawSprite.ts` | Add runtime background removal pipeline using off-screen canvas + pixel manipulation |
| `lib/void-breaker/sprites.ts` | Add `removeBackground` to `SpriteConfig`, add `BUILDING_SPRITES` registry |
| `lib/void-breaker/SpriteLoader.ts` | Add `getCleanedImage()` cache layer (optional) |
| `lib/void-breaker/renderer.ts` | Enhanced obstacle rendering with sprites, billboard rendering, improved city silhouettes, floor details, rain effect, better vignette, window lights, **player HP bar on canvas**, HP flash on damage |
| `lib/void-breaker/game.ts` | Add obstacle collision to `updateProjectiles()`, import `circleAABBOverlaps`, skip `billboard` type in all collision checks, **fix `updateHeartPickups()` distance + gating bugs**, **add damage popup in `damagePlayer()`** |
| `lib/void-breaker/mapSystem.ts` | Add `'billboard'` to Obstacle type union, add billboard obstacles to all 3 maps, add additional building variety |
| `components/void-breaker/VoidBreakerGame.tsx` | **Improve HUD HP display: ♦→♥, add "HP" label, add numeric readout** |

### New Files

| File | Purpose |
|------|---------|
| `public/sprites/void-breaker/buildings/building-kowloon-1.png` | Building sprite for Kowloon theme |
| `public/sprites/void-breaker/buildings/building-kowloon-2.png` | Building sprite variant |
| `public/sprites/void-breaker/buildings/building-industrial-1.png` | Building sprite for Industrial theme |
| `public/sprites/void-breaker/buildings/building-voidcore-1.png` | Building sprite for Void Core theme |
| `public/sprites/void-breaker/buildings/debris-1.png` | Debris pile sprite |
| `public/sprites/void-breaker/buildings/barrier-1.png` | Barrier wall sprite |

### Overwritten Files (re-generated with proper prompts)

| File | Notes |
|------|-------|
| `public/sprites/void-breaker/player/void-runner.png` | Re-generate with black bg, crop prompt |
| `public/sprites/void-breaker/enemies/entity-drone-a.png` | Re-generate |
| `public/sprites/void-breaker/enemies/void-strider.png` | Re-generate |
| `public/sprites/void-breaker/enemies/shard-warden.png` | Re-generate |
| `public/sprites/void-breaker/enemies/corrupt-hound.png` | Re-generate |
| `public/sprites/void-breaker/enemies/splitter.png` | Re-generate |
| `public/sprites/void-breaker/bosses/harbinger.png` | Re-generate |
| `public/sprites/void-breaker/bosses/pattern-engine.png` | Re-generate |
| `public/sprites/void-breaker/bosses/void-regent.png` | Re-generate |
| `public/sprites/void-breaker/pickups/heart.png` | Re-generate |

---

## 9. Acceptance Criteria

### Sprites
- [ ] All entity sprites render without any visible square background
- [ ] Player sprite shows only the cropped character shape with transparent/removed background
- [ ] Enemy sprites show only the entity shape, not the full PNG rectangle
- [ ] Boss sprites show only the boss shape with glow, not a square PNG
- [ ] Heart pickup renders as just the heart shape with neon glow
- [ ] Background removal works at runtime even if AI produces slight fringing

### Heart Pickups
- [ ] Heart pickups actually heal the player on collection (the core bug is fixed)
- [ ] Hearts are collectible even when player is at full HP (shows "FULL HP" text)
- [ ] Magnet pull correctly draws hearts toward the player within 60 game units
- [ ] Collision radius is generous enough that hearts don't pass through the player
- [ ] Distance is recomputed after magnet pull so same-frame collection works
- [ ] Pick-up produces magenta particle burst + "+1 HP" popup text
- [ ] Hearts despawn after 12 seconds with a visible alpha fade

### Player HP Display
- [ ] Player HP bar is visible on the **canvas** directly below the player character at all times during gameplay
- [ ] HP bar color changes dynamically: green (>60%), amber (30–60%), red (<30%)
- [ ] Numeric HP readout (e.g. "3/5") is displayed below the HP bar on canvas
- [ ] HP bar stays visible and steady even during invincibility blinks
- [ ] React HUD overlay uses ♥ hearts instead of ♦ diamonds
- [ ] React HUD has an "HP" label above the hearts
- [ ] React HUD shows numeric HP readout (e.g. "3/5") next to hearts
- [ ] HP bar flashes red briefly when player takes damage
- [ ] A red damage popup (e.g. "-1 HP") appears above the player when hit

### Projectile Collision
- [ ] Player projectiles hitting a building/barrier/debris obstacle → projectile destroyed + spark particles
- [ ] Enemy projectiles hitting a building/barrier/debris obstacle → projectile destroyed + spark particles
- [ ] Destructible obstacles (trees, some debris) take damage from projectiles and can be destroyed
- [ ] Billboards do NOT block projectiles (pass-through)
- [ ] Hazards do NOT block projectiles (pass-through)
- [ ] Terminals do NOT block projectiles (pass-through)

### Building Sprites
- [ ] Buildings render with sprites instead of flat rectangles (when sprite loaded)
- [ ] Fallback rectangle rendering has window lights, gradients, and rooftop details
- [ ] Different building sprites for different map themes (Kowloon, Industrial, Void Core)
- [ ] Building sprites have transparent/removed backgrounds

### Billboards
- [ ] At least 4 neon billboards visible per map
- [ ] Billboards display rotating Chinese/Japanese/English text
- [ ] Billboards have neon glow pulsing effect
- [ ] Billboards occasionally flicker
- [ ] Billboards are non-collidable (decorative only)

### World Art
- [ ] Parallax city silhouettes have varied shapes (not all flat rectangles)
- [ ] Some silhouette buildings have neon sign patches
- [ ] Rain effect visible in background (subtle diagonal streaks)
- [ ] Arena floor has crack patterns and/or puddle reflections
- [ ] Void dust particles have color variety
- [ ] Vignette tint matches current map theme
- [ ] Overall visual impression is "living cyberpunk city" not "flat arena"

### Performance
- [ ] All background removal only runs once per sprite (cached)
- [ ] No frame rate drops below 50 FPS during normal gameplay
- [ ] Rain and atmospheric effects use minimal draw calls
- [ ] Building window lights use seeded random (not Math.random per frame — would cause flickering)

---

## Implementation Order

1. **Fix heart pickup bugs** in `game.ts` → fix distance recomputation, remove full-HP gate, increase pickup radius
2. **Add player HP display** → canvas HP bar in `renderer.ts`, improve React HUD HP in `VoidBreakerGame.tsx`, add damage popup
3. **Re-generate all 10 entity/pickup sprites** with proper black-background prompts → copy to `public/sprites/void-breaker/`
4. **Implement runtime background removal** in `drawSprite.ts` → verify sprites render without square backgrounds
5. **Add projectile–obstacle collision** in `game.ts` → verify projectiles are blocked by buildings
6. **Generate building sprites** → copy to `public/sprites/void-breaker/buildings/`
7. **Add billboard type** to `mapSystem.ts` → add billboard obstacles to all maps
8. **Update obstacle rendering** in `renderer.ts` → sprite buildings, billboard rendering, window lights
9. **Enhance background art** → city silhouettes, rain, floor details, vignette
10. **Polish and test** → verify all acceptance criteria

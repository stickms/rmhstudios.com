# Dream Rift — Game Design Document

**Genre:** 2D Touhou-style Bullet Hell
**Visual Style:** Anime pixel art (16x16 / 32x32 sprites)
**Engine:** PixiJS (WebGL-accelerated 2D renderer)
**Route:** `/app/dream-rift/`
**Date:** 2026-03-02

---

## 1. Game Identity

**Dream Rift** is a classic 6-stage Touhou-style bullet hell set during a dream world invasion. A rift has opened between the waking world and the Dream Realm, and nightmares are manifesting as hostile entities. Two protagonists — Rei and Yume — must fight through six dream-themed stages to reach the Rift Core and seal it before both worlds collapse.

**Story Tool:** UNO-MCP (Unified Narrative Operator) installed as an MCP plugin for narrative enhancement and script writing.

---

## 2. Core Architecture

```
PixiJS Renderer (WebGL)
    └── Game Loop (fixed timestep 60fps)
        ├── Input System (keyboard polling)
        ├── Entity Manager (player, enemies, bullets, items)
        ├── Collision System (circle-circle for bullets, AABB for pickups)
        ├── Stage Manager (stage progression, wave spawning)
        ├── Bullet Pattern System (data-driven danmaku definitions)
        ├── UI Layer (HUD, dialogue, menus)
        └── Audio Manager (Howler.js)
```

**Key Design Decisions:**
- Fixed timestep game loop at 60fps with interpolation for rendering
- Entity-Component pattern (lightweight, not full ECS)
- Object pooling for bullets — pre-allocate ~10,000 bullet objects to avoid GC stalls
- Data-driven bullet patterns defined in TypeScript config files
- Playfield: 384x448 pixels (classic Touhou ratio), with sidebar for score/lives/power/spell cards

---

## 3. Controls

| Key | Action | Details |
|-----|--------|---------|
| Arrow keys | Move | 8-directional, hold Shift for focused (slow) movement — shows hitbox |
| Z | Melee | Close-range attack, higher damage, small invuln window |
| X | Danmaku (Shot) | Primary ranged attack, hold for auto-fire |
| C | Special | Character-unique ability (cooldown-based) |
| A | Dash/Flight | Quick dodge with brief invincibility frames |
| S | Spell Card | Screen-clearing bomb, limited stock, deathbomb within ~10 frames of hit |
| Shift | Focus | Slow movement, tighter shot pattern, visible hitbox |
| Esc | Pause | Pause menu |

---

## 4. Player Stats

- **Power:** 0-128 scale. Increases shot strength, gained from red power items. Death drops some power.
- **Lives:** Start with 3, max 8. Extra lives from score thresholds and life items.
- **Spell Cards (Bombs):** Start with 3, max 8. Replenished by bomb items, +1 on death.
- **Graze Counter:** Bullets passing near the player's hitbox increment graze, awarding score.
- **Hitbox:** 2px radius (tiny, true to Touhou). Displayed as a glowing dot during focused movement.

---

## 5. Two Protagonists

| | Rei | Yume |
|---|---|---|
| **Playstyle** | Power-focused | Speed/technique-focused |
| **Shot type** | Wide spread, high damage | Homing needles, moderate damage |
| **Melee (Z)** | Sword slash — wide arc, high damage | Fan strike — narrow but stuns enemies |
| **Special (C)** | Barrier — absorbs bullets for 2 sec, converts to power | Phase shift — brief intangibility + teleport short distance |
| **Spell cards** | Offensive (damage burst + clear) | Defensive (time slow + clear) |
| **Movement** | Slightly slower, smaller hitbox | Faster, slightly larger hitbox |
| **Story route** | Confrontational, direct | Investigative, diplomatic |

---

## 6. Stage Design

| Stage | Dream Theme | Setting | Mid-Boss | Boss |
|-------|-------------|---------|----------|------|
| 1 | **Lucid Meadow** | Ethereal flower fields, floating lanterns | Dream Sprite | Keeper of the Gate |
| 2 | **Drowning Library** | Infinite library, pages as bullets, ink rivers | Ink Phantom | The Archivist |
| 3 | **Clockwork Abyss** | Frozen/reversed time, gears and pendulums | Time Fragment | The Chronophage |
| 4 | **Mirror Palace** | Reflections that fight back, symmetrical patterns | Doppelganger (mirror of player) | The Narcissist |
| 5 | **Burning Carnival** | Nightmare carnival on fire, chaotic patterns | Ring Master's Shadow | The Jester of Ruin |
| 6 | **The Rift Core** | Abstract void — stunningly beautiful: crystalline fractures in spacetime, aurora-like color cascades, floating geometric shards reflecting starlight. The beauty contrasts with the intensity of the final battle. | All previous mid-bosses (gauntlet) | The Dreamer (5 phases) |

**Stage Flow:**
1. Stage intro (dialogue + title card)
2. Wave section 1 (3-4 enemy waves)
3. Mid-boss encounter (2 spell cards)
4. Wave section 2 (3-4 harder waves)
5. Boss encounter (3-5 spell cards, escalating)
6. Stage clear screen (score tally)

---

## 7. Bullet Pattern System

**Pattern Types:**
- Radial, Aimed, Stream, Spiral, Wall, Laser, Spawn (splitting)

**Pattern Definition Format:**
```typescript
interface BulletPattern {
  type: 'radial' | 'aimed' | 'stream' | 'spiral' | 'wall' | 'laser' | 'spawn';
  bulletSprite: string;
  count: number;
  speed: number;
  angle: number;
  spread: number;
  interval: number;
  duration: number;
  modifiers?: PatternModifier[];
}
```

**Spell Card System:** Named boss attack phases with unique patterns, time limits, and capture bonuses.

---

## 8. Difficulty Scaling

4 difficulties: Easy, Normal, Hard, Lunatic

| Parameter | Easy | Normal | Hard | Lunatic |
|-----------|------|--------|------|---------|
| Bullet count multiplier | 0.5x | 1x | 1.5x | 2x |
| Bullet speed multiplier | 0.7x | 1x | 1.2x | 1.5x |
| Boss HP multiplier | 0.6x | 1x | 1.4x | 2x |
| Spell card count | 2-3 | 3-4 | 4-5 | 5-6 |
| Enemy wave density | Low | Medium | High | Extreme |
| Graze window | Larger | Normal | Smaller | Tiny |

---

## 9. UI Layout

```
┌─────────────────────────────────────────┐
│  GAME AREA (384x448)  │   SIDEBAR       │
│                        │   Score: XXX    │
│                        │   Hi-Score: XXX │
│                        │   Player: ★★★   │
│  [Playfield with       │   Power: ██░░   │
│   bullets, enemies,    │   Graze: 1234   │
│   player]              │   Spell: ♦♦♦    │
│                        │   Stage 3       │
│                        │                 │
└─────────────────────────────────────────┘
```

**Menu Screens:**
- Title screen: Animated background, Start / Extra / Practice / Replay / Options
- Character select: Side-by-side portraits with stat comparison
- Stage results: Score breakdown, spell card capture rate, graze total
- Game over / Continue: Limited continues on higher difficulties

---

## 10. Audio

Using Howler.js (already in the stack):
- BGM per stage (looping) with boss theme override
- SFX: shot, hit, graze, item collect, spell card activation, death, 1-up

---

## 11. Pixel Art Style

- 16x16 or 32x32 character/enemy sprites
- 8x8 to 16x16 bullet sprites with glow effects (PixiJS filters)
- Parallax scrolling backgrounds per stage
- Spell card declaration: full-screen name card overlay with dramatic effect

---

## 12. Integration with rmhstudios

- **Auth:** Optional — guest play allowed, auth required for leaderboard submission
- **Database:** New `DreamRiftPlayer` Prisma model (high scores per difficulty, unlocked stages, character progress)
- **Leaderboard:** Per-stage, per-difficulty, per-character score boards
- **Story Writing:** UNO-MCP plugin for narrative enhancement, dedicated agent for script writing runs in parallel with engine development

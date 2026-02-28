# VERSECRAFT: Whispers of the Muse
## Complete Game Design Document — RMH Studios
### *A Poetry Puzzle Visual Novel with 100+ Hours of Gameplay*

---

## 🎮 Game Name Options

Pick one (or mix-and-match). These are organized by vibe:

**Literary / Poetic:**
1. **Versecraft: Whispers of the Muse** *(current working title)*
2. **Stanzas** — clean, one-word, immediately communicates "poetry game"
3. **Inkbleed** — evocative, hints at the meta-horror layer
4. **The Ivory Quill** — named after the in-game society
5. **Iambic** — nerdy, punchy, memorable

**DDLC / VN Vibes:**
6. **Poetry Club Panic!** — lighthearted, genre-signaling, exclamation mark energy
7. **Lovesick Sonnets** — romantic VN + poetry mashup
8. **Dear Poet,** — letter-format, intimate
9. **Heartbeat Haiku** — cute, rhythmic, alliterative
10. **Between the Lines** — double meaning: reading subtext + literal poem lines

**Edgy / Meta:**
11. **Erasure** — named after the puzzle type, also means "being erased"
12. **[REDACTED] Verses** — meta-horror energy, curiosity hook
13. **The Unwritten** — what happens when the poem fights back?
14. **Ghostwriter** — who's really writing these poems?
15. **Overwritten** — you write over the story, or it overwrites you

**RMH Studios Branded:**
16. **RMH Presents: Verse & Vice**
17. **Rochester Rhymes** *(cheeky nod to RMH)*
18. **Quill & Quarrel** — alliterative, captures the club drama
19. **Meter & Madness** — poetry term + the escalating tone
20. **Syllable** — minimal, elegant, Google-friendly

---

> **Purpose of this document**: This is a fully-specified game design document intended for use by an agentic coding assistant (Claude Code). Every system, asset requirement, data structure, and content specification is detailed enough to implement directly. Build this game using **React + TypeScript** with **Zustand** for state management and **Howler.js** for audio.

---

## Table of Contents

1. [Game Overview](#1-game-overview)
2. [Technical Stack & Project Structure](#2-technical-stack--project-structure)
3. [Art Style & Asset Pipeline](#3-art-style--asset-pipeline)
4. [Characters — Full Specifications](#4-characters--full-specifications)
   - 4.1.1 [⚙️ Gender Presentation System](#411-gender-presentation-system) ← ALL CHARACTERS ANY GENDER
   - 4.5 [Gender Variant Reference Table](#45-gender-variant-reference-table)
5. [Core Gameplay Loop](#5-core-gameplay-loop)
6. [Poetry Puzzle Systems (7 Puzzle Types)](#6-poetry-puzzle-systems-7-puzzle-types)
7. [Affinity, Romance & Relationship System](#7-affinity-romance--relationship-system)
   - 7.3 [Romance Levels](#73-romance-levels--unlocks-romance-track) ← DATING SIM MECHANICS
   - 7.4 [The Dating Sim System](#74-the-dating-sim-system) ← FLIRTING, DATES, CONFESSIONS, JEALOUSY
7.5. [**⭐ Game Feel, Difficulty, Balance & Replayability**](#75-game-feel-difficulty-balance--replayability) ← THE FUN SECTION
8. [Story Structure & Branching Narrative](#8-story-structure--branching-narrative)
9. [World & Chapter Design (100+ Hours Breakdown)](#9-world--chapter-design-100-hours-breakdown)
10. [Word Database & Procedural Generation](#10-word-database--procedural-generation)
11. [Progression, Unlockables & Meta-Game](#11-progression-unlockables--meta-game)
12. [Audio Design](#12-audio-design)
13. [UI/UX Design Specifications](#13-uiux-design-specifications)
14. [Save System & Data Persistence](#14-save-system--data-persistence)
15. [Implementation Roadmap](#15-implementation-roadmap)
16. [Content Appendices](#16-content-appendices)

---

## 1. Game Overview

### 1.1 Elevator Pitch

**Versecraft: Whispers of the Muse** is a poetry puzzle dating sim / visual novel where you play as a new member of the Ivory Quill Society — a secretive literary circle whose members each embody a different school of poetic thought. Compose poems by selecting words, arranging lines, matching meters, and solving linguistic puzzles to **romance six distinct characters** through a full dating sim system (flirting, dates, confessions, jealousy), unravel a metanarrative mystery about the nature of creative expression, and ultimately confront the question: *does the poem write the poet, or does the poet write the poem?*

**The hook**: Your poems are your love language. The words you choose literally determine who falls for you.

### 1.2 Genre & Inspirations

| Inspiration | What We Take |
|---|---|
| **Doki Doki Literature Club** | Word-selection poem building, character affinity through poetry, meta-horror elements, **anime dating sim aesthetics & romance** |
| **Persona 5** | **Confidant/romance system** — separate friendship and romance tracks, date events, confession scenes, jealousy when romancing multiple characters |
| **Fire Emblem: Three Houses** | **Support conversations** that deepen with repeated interaction, character-specific romantic endings, gender-flexible romance options |
| Baba Is You | Rule-manipulation puzzles where words ARE the mechanics |
| The Talos Principle | Philosophical puzzle framing, branching endings based on belief |
| Celeste | Compassionate difficulty design, assist mode, hidden ultra-hard content |
| Hades | **Replayability through narrative** — every run reveals new dialogue/story, death is progress, modular difficulty (Heat/Poetic License) |
| Disco Elysium | Rich internal monologue, skill-check poetry moments |

### 1.2.1 The Dating Sim Promise

This game is, at its core, a **dating sim where your poems are your pickup lines**. The player should feel:

1. **Butterflies** — the thrill of a character blushing at your word choice
2. **Jealousy** — the pang when two characters compete for your attention
3. **Tension** — the will-they-won't-they build across 5 dates before confession
4. **Heartbreak** — the gut-punch of a rejection (that still advances the story)
5. **Triumph** — the catharsis of a mutual confession scene with full CG and music swell

Every poetic mechanic serves the romance. You don't write poems to solve puzzles — you write poems to **make someone fall in love with you**. The puzzle difficulty is calibrated so that writing a poem good enough to impress your crush requires genuine effort and creativity, but bad poems lead to equally rich (and sometimes funnier) romantic content.

### 1.3 Target Playtime Breakdown

| Content Block | Estimated Hours |
|---|---|
| Main Story (6 Acts, 30 Chapters) | 35–40 hrs |
| Character Routes (6 routes × 5 hrs each) | 30 hrs |
| **Romance Content (dates, confessions, romantic scenes per route)** | **15–20 hrs** |
| Side Puzzles & Daily Challenges | 15 hrs |
| Endgame / Meta-Narrative (Act 7) | 8–10 hrs |
| Challenge Tower (100 floors) | 10–12 hrs |
| Freeform / Sandbox / Workshop Mode | ∞ (10+ hrs typical) |
| Completionist (all endings, all romances, all poems, all achievements) | 20+ hrs |
| **Total Minimum (single romance route)** | **~100 hrs** |
| **Total Completionist (all 6 romances across NG+ runs)** | **~200+ hrs** |

### 1.4 Tone & Themes

The game starts warm and cozy — a literary slice-of-life. Across the six acts, it gradually introduces:

- **Act 1–2**: Lighthearted, comedic, tutorial-heavy. "Welcome to the poetry club!"
- **Act 3–4**: Emotional depth. Characters reveal trauma, poems get heavier. Puzzles increase in complexity.
- **Act 5**: Metanarrative fractures. The game begins to "notice" the player. Glitch aesthetics. Characters reference their own code/scripts.
- **Act 6**: Full meta-horror/meta-wonder. The Muse (the 7th hidden character) speaks directly. The player must compose a poem using words from every previous puzzle to "set the characters free" or "claim authorship."
- **Act 7 (Endgame)**: Post-credits content. The game recontextualizes. All systems unlock in their hardest forms. The true final puzzle is a player-authored poem judged by an AI scoring system.

---

## 2. Technical Stack & Project Structure

### 2.1 Stack

```
Framework:      React 18+ with TypeScript
Bundler:        Vite
State:          Zustand (global game state, save management)
Rendering:      HTML5 Canvas (PixiJS v7) for puzzle boards + React DOM for UI/VN overlay
Audio:          Howler.js
Animation:      Framer Motion (UI), PixiJS spine-runtime or spritesheet (characters)
Data:           JSON files for dialogue, word databases, puzzle configs
Persistence:    IndexedDB via idb-keyval (save files), localStorage fallback
Testing:        Vitest + Playwright
```

### 2.2 Project Structure

```
versecraft/
├── public/
│   ├── assets/
│   │   ├── sprites/          # Character spritesheets (PNG sequences or spine)
│   │   ├── backgrounds/      # Scene backgrounds (1920×1080 PNG)
│   │   ├── ui/               # UI elements, frames, buttons
│   │   ├── effects/          # Particle effects, glitch overlays
│   │   ├── audio/
│   │   │   ├── bgm/          # Background music (OGG)
│   │   │   ├── sfx/          # Sound effects (WAV/OGG)
│   │   │   └── voice/        # Optional voice clips
│   │   └── fonts/            # Custom fonts
│   └── data/
│       ├── words/            # Word database JSONs
│       ├── puzzles/          # Puzzle configuration JSONs
│       ├── dialogue/         # Dialogue script JSONs (per chapter)
│       ├── characters/       # Character stat/preference JSONs
│       └── story/            # Story graph / branching logic
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── stores/
│   │   ├── gameStore.ts       # Master game state (Zustand)
│   │   ├── puzzleStore.ts     # Active puzzle state
│   │   ├── dialogueStore.ts   # Dialogue/VN engine state
│   │   ├── affinityStore.ts   # Character relationship tracking
│   │   └── saveStore.ts       # Save/load management
│   ├── engine/
│   │   ├── DialogueEngine.ts  # Visual novel dialogue runner
│   │   ├── PuzzleEngine.ts    # Core puzzle logic dispatcher
│   │   ├── ScoringEngine.ts   # Poem evaluation / grading
│   │   ├── ProceduralGen.ts   # Procedural puzzle generation
│   │   └── MetaEngine.ts      # 4th-wall-break / glitch system
│   ├── puzzles/
│   │   ├── WordSelect.tsx      # DDLC-style word picking
│   │   ├── LineArrange.tsx     # Drag-and-drop line ordering
│   │   ├── MeterMatch.tsx      # Rhythm/stress pattern matching
│   │   ├── RhymeChain.tsx      # Rhyme scheme builder
│   │   ├── Erasure.tsx         # Erasure poetry (blacking out words)
│   │   ├── Exquisite.tsx       # Collaborative blind writing
│   │   └── Freeform.tsx        # Open composition + AI scoring
│   ├── components/
│   │   ├── vn/                # Visual novel components
│   │   │   ├── DialogueBox.tsx
│   │   │   ├── CharacterSprite.tsx
│   │   │   ├── ChoiceMenu.tsx
│   │   │   ├── Background.tsx
│   │   │   └── TransitionEffect.tsx
│   │   ├── ui/
│   │   │   ├── MainMenu.tsx
│   │   │   ├── PoemJournal.tsx    # Collection of all composed poems
│   │   │   ├── CharacterProfile.tsx
│   │   │   ├── AchievementPanel.tsx
│   │   │   ├── SettingsMenu.tsx
│   │   │   └── HUD.tsx
│   │   └── effects/
│   │       ├── GlitchOverlay.tsx
│   │       ├── ParticleSystem.tsx
│   │       └── ScreenShake.tsx
│   ├── hooks/
│   │   ├── useDialogue.ts
│   │   ├── usePuzzle.ts
│   │   ├── useAudio.ts
│   │   └── useAnimation.ts
│   ├── utils/
│   │   ├── syllableCounter.ts
│   │   ├── rhymeDetector.ts
│   │   ├── meterAnalyzer.ts
│   │   ├── sentimentScorer.ts
│   │   └── wordClassifier.ts
│   └── types/
│       ├── game.ts
│       ├── puzzle.ts
│       ├── dialogue.ts
│       ├── character.ts
│       └── word.ts
├── scripts/
│   ├── generateWordDB.ts     # Build word database from corpus
│   ├── validatePuzzles.ts    # Ensure all puzzles are solvable
│   └── buildDialogue.ts     # Compile dialogue scripts
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### 2.3 Key Dependencies

```json
{
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "zustand": "^4.5.0",
    "pixi.js": "^7.3.0",
    "@pixi/react": "^7.1.0",
    "howler": "^2.2.4",
    "framer-motion": "^11.0.0",
    "idb-keyval": "^6.2.0",
    "compromise": "^14.10.0",
    "syllable": "^5.0.0",
    "pronounced": "^1.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "@types/react": "^18.3.0",
    "vitest": "^1.4.0",
    "playwright": "^1.42.0"
  }
}
```

---

## 3. Art Style & Asset Pipeline

### 3.1 Visual Style Direction

> **⚙️ ART STYLE IS A SETTINGS OPTION.** The game ships with multiple art packs. The player selects their preferred style in **Settings → Art Style**. The **default (and primary development target) is DDLC-Style** — the clean, bright, high-contrast anime aesthetic from Doki Doki Literature Club. Alternative packs are listed as `[ALT]` throughout this section. All packs use the same sprite slot names, expression IDs, and resolution targets, so they are hot-swappable at runtime via a single config key.

**DEFAULT — "DDLC-Style" (sutemo pack family)**
Clean-lined anime characters with bright colors, school-uniform aesthetics, and expressive faces. High-contrast, cel-shaded look. PSD-layered for full customization of hair, eyes, outfits, and expressions. This is the look players expect from the genre and matches DDLC's visual language almost exactly. Sutemo's sprites are the #1 most-used free VN sprites on itch.io for good reason.

**ALT A — "NoranekoGames Style"**
Slightly softer, more illustrative anime style. Higher resolution originals (~2100×5300px). Feels a touch more "indie VN" and less "dating sim." Good for players who want a gentler aesthetic. All NoranekoGames characters share a consistent art style with each other.

**ALT B — "Mixed Community Pack"**
Cherry-picked sprites from multiple creators (xiael, Potat0Master, Visual Novel Paradise, etc.) for maximum character diversity at the cost of slight style inconsistency. Best for players who prioritize unique-looking characters over uniform art direction.

```typescript
// stores/gameStore.ts — Art style setting
type ArtStyle = 'ddlc' | 'noraneko' | 'mixed';

interface GameSettings {
  artStyle: ArtStyle; // Default: 'ddlc'
  // ... other settings
}

// Each character has sprites defined per art style:
interface CharacterSprites {
  ddlc: SpriteSet;      // sutemo-family sprites (DEFAULT)
  noraneko: SpriteSet;   // NoranekoGames sprites (ALT A)
  mixed: SpriteSet;      // Mixed community sprites (ALT B)
}
```

### 3.2 Required Assets & Recommended Sources

> **IMPORTANT FOR AGENT**: For each asset category below, the recommended sources are free/open-source or have permissive licenses. Download and integrate these. **Always implement the DDLC-style (sutemo) pack first** — it is the default and primary art direction. ALT packs can be added later as stretch goals. If a specific pack is unavailable, search for alternatives on the listed platforms.

#### 3.2.1 Character Sprites

Each character needs:
- **Base body** (1 per outfit × 3 outfits = 3 base poses)
- **Expressions** (8 minimum: neutral, happy, sad, angry, surprised, embarrassed, thinking, special)
- **Pose variants** (3: standing, leaning, arms crossed)
- **Total per character**: 3 outfits × 3 poses × 8 expressions = **72 sprite variations**
- **Resolution**: 1200×2400px (tall character portrait, transparent PNG)
- **Animation**: Idle breathing (subtle Y-axis bob, 2px, sinusoidal), blink cycle (4 frames), talk cycle (3 frames mouth)

**Recommended Sprite Sources & Tools:**

| Source | URL | Notes |
|---|---|---|
| **Mannequin / Sprite Generator** | `https://sanderfrenken.github.io/Universal-LPC-Spritesheet-Character-Generator/` | Open-source character generator, great for base sprites. Export as spritesheets. |
| **VN Character Makers** | Search itch.io for "visual novel character maker" | Many free/CC generators |
| **NovelAI / Stable Diffusion** | Generate with prompt engineering | Generate consistent character art. Use ControlNet for pose consistency. Upscale with Real-ESRGAN. |
| **mannequin.js** | `https://github.com/nicoptere/mannequin.js` | Programmable 3D mannequins for reference poses |

---

#### ⭐ 3.2.1.1 CURATED ANIME ASSET PACKS (Direct Links)

> **CRITICAL FOR AGENT**: These are the **primary recommended assets** for the game. They are all free, anime-style, VN-ready, and most allow commercial use. Download these FIRST before considering AI generation. Combine packs to fill all 6 character slots + side characters.

##### CHARACTER SPRITE PACKS

###### 🟢 DEFAULT PACKS — DDLC-Style (sutemo family) — IMPLEMENT THESE FIRST

| Pack Name | Creator | URL | License | What's Included |
|---|---|---|---|---|
| **Female Character Sprite** ⭐ | sutemo | `https://sutemo.itch.io/female-character` | Free, commercial OK (no resale) | PSD with layered expressions, outfits, hairstyles. Multiple expressions (happy, sad, angry, surprised, etc). Anime school-girl style. **#1 rated VN sprite on itch.io.** Use for: **Luna, Wren** |
| **Male Character Sprite** ⭐ | sutemo | `https://sutemo.itch.io/male-character-sprite-for-visual-novel` | Free, commercial OK (no resale) | PSD with layered expressions + outfits. Matching art style to female pack. Use for: **Kai, Rowan** |
| **Female Mature Character Sprite** ⭐ | sutemo | `https://sutemo.itch.io/female-mature-character-sprite-for-vn` | Free, commercial OK (no resale) | Older/more mature female variant. Same art style. Use for: **Sable** |
| **Halfbody Female Character Sprite** | sutemo | `https://sutemo.itch.io/halfbody-female-character-sprite-for-vn` | Free, commercial OK (no resale) | Bust-up style (waist up). Use for: **Wren (alt pose)**, close-up dialogue shots |
| **S&S Mature Males** ⭐ | Sraye (sutemo-compatible) | `https://sraye.itch.io/mature-male-character-sprites` | Free, commercial OK (credit Sraye + sutemo) | Mature male sprites built ON sutemo's style — visually consistent with the female packs. Use for: **Milo** |

> **These 5 packs form the complete DDLC-style cast.** They all share sutemo's art style and will look like they belong in the same game. This is all you need for the default art mode.

###### 🔵 ALT A PACKS — NoranekoGames Style

| Pack Name | Creator | URL | License | What's Included |
|---|---|---|---|---|
| **Miki — Free Character Sprite** | NoranekoGames | `https://noranekogames.itch.io/miki` | Free w/ credit "NoranekoGames" | Anime-style girl, multiple expressions + outfits. High res (~2100×5300px). |
| **Aiko — Free Character Sprite** | NoranekoGames | `https://noranekogames.itch.io/aiko` | Free w/ credit | Same art style as Miki. Use together for consistent cast. |
| **Chie — Free Character Sprite** | NoranekoGames | `https://noranekogames.itch.io/chie` | Free w/ credit (paid editable pack available) | Editable pack available for hair/eye customization. |
| **Sabrina — Character Sprite** | NoranekoGames | `https://noranekogames.itch.io/sabrina` | Free w/ credit | Fourth NoranekoGames character. |

> **Note**: NoranekoGames has limited male character options. For ALT A mode, male characters (Kai, Rowan, Milo) fall back to sutemo/Sraye male sprites. This is visually acceptable since the male sprites are stylistically neutral enough to blend.

###### 🟡 ALT B PACKS — Mixed Community Style

| Pack Name | Creator | URL | License | What's Included |
|---|---|---|---|---|
| **Keiko — Free Character Sprite** | Potat0Master | `https://potat0master.itch.io/free-character-sprite-for-visual-novels` | Royalty-free, commercial OK | 4 free outfits, 7 expressions. Ready-to-use PNGs (no PSD editing). |
| **Mikhail — Free VN Sprite** | xiael (nounanme) | `https://xiael.itch.io/free-sprite-mikhail` | Free, commercial OK (credit required) | Male character with all expression PNGs pre-rendered. No PSD editing needed. |
| **Tanaka The Schoolboy** | Visual Novel Paradise | Search itch.io: `"Tanaka Schoolboy Visual Novel Paradise"` | Free w/ credit | Male schoolboy VN character with expressions. Thigh-up format. |
| **Alphonse — VN Sprite** | Minty | Search itch.io: `"Alphonse Visual Novel Sprite Minty"` | Free | Male character sprite for VNs/RPGs. |
| **Codel VN Sprite** | LisadiKaprio | `https://lisadikap.itch.io/codel-visual-novel-sprite` | Free, commercial OK | Free female character for VN use. |
| **Anime Girl 30+ Expressions** | RuberidCrys | Search itch.io: `"Anime girl sprite 30+ expressions yandere"` | Free | 30+ expression variants — massive emotional range. |
| **Aria Emotional Sprite Pack** | Various | Search itch.io: `"Aria Emotional Sprite Pack"` | Free | Complete collection with happy, sad, shy expressions. |

##### SPRITE COLLECTIONS & CURATED LISTS

| Collection | URL | Notes |
|---|---|---|
| **400+ VN Sprites Collection** | `https://itch.io/c/1408834/400-vn-sprites` | Curated by Psykhae. Massive collection of free and paid VN sprites. **Start here for browsing.** |
| **Visual Novel Sprites Collection** | `https://itch.io/c/1473662/visual-novel-sprites` | Curated by IAMST. Focused on anime-style sprites + backgrounds. |
| **Character Sprite (VN) Collection** | `https://itch.io/c/3734257/character-sprite-visual-novel` | Curated by Anandine. Includes Chulang's customizable sprites. |
| **All Free VN Anime Sprites** | `https://itch.io/game-assets/free/genre-visual-novel/tag-anime/tag-sprites` | itch.io filtered search — bookmark this for discovering new packs. |
| **Top-Rated Free VN Sprites** | `https://itch.io/game-assets/top-rated/free/genre-visual-novel/tag-sprites` | Sorted by community rating — the cream of the crop. |

##### BACKGROUND PACKS

###### 🟢 DEFAULT BACKGROUNDS — Use for all art styles

> Backgrounds don't need to match sprite art style as closely as characters do — anime BGs are anime BGs. These packs work across all three art modes.

| Pack Name | Creator | URL | License | Contents | Priority |
|---|---|---|---|---|---|
| **Anime Backgrounds** | NoranekoGames | `https://noranekogames.itch.io/yumebackground` | Free w/ credit "NoranekoGames" | Anime-style school, town, nature BGs. Multiple packs. **Best free anime BG pack on itch.io (4.9★, 79 ratings).** | ⭐ DOWNLOAD FIRST |
| **School Classrooms Asset Pack** | styloo | `https://styloo.itch.io/school-classrooms-asset-pack` | Free (check license) | Rooms, tables, chairs, chem lab, computers. 4.9★ (131 ratings). | ⭐ DOWNLOAD FIRST |
| **Uncle Mugen's Free VN Backgrounds** | Alte | `https://alte.itch.io/uncle-mugens-backgrounds` | Free, commercial OK | Massive variety: schools, streets, parks, interiors. WebP format. 5.0★. | ⭐ DOWNLOAD FIRST |
| **Visual Novel House Backgrounds** | Spiral Atlas | `https://spiralatlas.itch.io/visual-novel-house-backgrounds` | Free | Consistent indoor/outdoor house settings. | Use for character homes |
| **Free VN Backgrounds (Mansion Pack)** | Potat0Master | `https://potat0master.itch.io/free-visual-novel-backgrounds-mansion` | Free | Mansion interiors/exteriors. | Use for Milo's home |
| **Garden VN Backgrounds** | Florassence | Search itch.io: `"Garden Visual Novel Backgrounds Free Florassence"` | Free | 7 soft pastel aesthetic backgrounds. | Use for Rowan's garden scenes |
| **All Free VN Backgrounds (browse)** | Various | `https://itch.io/game-assets/free/genre-visual-novel/tag-backgrounds` | Various | Full itch.io filtered search for VN BGs. | Browse for gaps |

##### CHARACTER-TO-ASSET MAPPING (Final Assignments)

> **AGENT**: Implement the `DEFAULT` column first. It uses sutemo-family packs exclusively for a consistent DDLC look. `ALT A` and `ALT B` are separate art style settings the player can switch to in-game.

| Game Character | DEFAULT (DDLC-Style / sutemo) | ALT A (NoranekoGames) | ALT B (Mixed Community) |
|---|---|---|---|
| **Luna Voss** | `sutemo Female Character` — recolor hair to violet-black, eyes to amber via PSD layers. Use V2 paid pack ($2) for extra expressions if budget allows. | `NoranekoGames Chie` — editable pack, restyle to dark/gothic look. | `RuberidCrys 30+ Expressions` — 30+ expressions give Luna the wide emotional range she needs. |
| **Kai Nakamura** | `sutemo Male Character` — bleach hair white w/ red streak in PSD, dark eyes. Outfit: untucked shirt, loose tie. | N/A (NoranekoGames has limited male sprites — use sutemo male as fallback) | `Mikhail by xiael` — pre-rendered PNGs, no PSD editing needed. Restyle digitally. |
| **Rowan Hart** | `sutemo Male Character` — brown hair, green eyes. Outfit: flannel/casual layer. Duplicate sutemo male PSD with different hair/eye config. | N/A (use sutemo male fallback) | `Tanaka by Visual Novel Paradise` — schoolboy aesthetic, thigh-up, warm approachable look. |
| **Sable Okafor** | `sutemo Female Mature Character` — confident, powerful presence. Restyle hair to box braids via PSD edit or overlay. | `NoranekoGames Sabrina` — strong female character energy, matches Sable's vibe. | `Keiko by Potat0Master` — 4 outfits, 7 expressions. Restyle for Sable's bold look. |
| **Milo Vance** | `Sraye S&S Mature Males` — based on sutemo's style so it visually matches. Neat hair, preppy outfit. Credit both Sraye and sutemo. | N/A (use Sraye fallback, same art family) | `Alphonse by Minty` — male VN sprite, formal/composed aesthetic. |
| **Wren Delacroix** | `sutemo Halfbody Female Character` — strawberry blonde, mismatched eyes via PSD layer tricks. Cute/soft outfit layers. | `NoranekoGames Miki` — soft dreamy style, perfect match for Wren. High res. | `Aiko by NoranekoGames` — same NoranekoGames quality, slightly different vibe. |
| **The Muse** | Programmatic — take the DEFAULT sprites of ALL other characters and composite them with glitch shaders. The Muse's sprite is generated at runtime by layering/morphing between the other 6 characters' sprites with RGB-split, static, and displacement effects. No separate asset needed. | Same approach using ALT A sprites. | Same approach using ALT B sprites. |

**Why sutemo is the DDLC-style default:**
- sutemo's art style is the closest free equivalent to Satchely's DDLC character art (clean lines, bright anime school aesthetic, expressive faces)
- All sutemo packs share a unified art style — characters look like they belong in the same game
- PSD layers allow full customization (hair color, eye color, outfits, expressions) without redrawing
- Sraye's Mature Males pack is specifically built on sutemo's style, so male characters match
- sutemo explicitly allows commercial use (no resale of raw sprites)
- The most battle-tested VN sprites on itch.io — used in hundreds of shipped games

> **PSD EDITING WORKFLOW**: Use **Photopea** (`https://www.photopea.com/`) as a free browser-based PSD editor. Open the sutemo PSD → toggle expression/outfit/hair layers → export as transparent PNG. A batch export script can automate this:

```bash
# scripts/export_sprites.sh — Automate PSD → PNG export via Photopea CLI or ImageMagick
# For each character config (hair layer, eye layer, outfit layer, expression layer):
# 1. Open PSD in Photopea / GIMP / Photoshop
# 2. Enable the correct layers per the character spec
# 3. Export as PNG at 1200×2400 (or original res, then scale)
# 4. Save to public/assets/sprites/{character_id}/{expression}.png
#
# Naming convention:
#   luna_neutral.png, luna_happy.png, luna_sad.png, etc.
#   kai_smirk.png, kai_manic_grin.png, kai_deadpan.png, etc.
```

##### ART STYLE SETTINGS UI

When the player opens **Settings → Art Style**, show:

```
┌──────────────────────────────────────────────┐
│  ART STYLE                                   │
│  ─────────────────────────────────────────── │
│                                              │
│  ● DDLC Classic (Default)                    │
│    Clean anime, bright colors, school VN     │
│    Artists: sutemo, Sraye                     │
│                                              │
│  ○ Illustrated                               │
│    Softer, painterly indie VN style           │
│    Artist: NoranekoGames                      │
│                                              │
│  ○ Mixed Gallery                             │
│    Unique look per character, community art   │
│    Artists: xiael, Potat0Master, Minty +more  │
│                                              │
│  [Apply] — Restarts current scene            │
│                                              │
│  ⚠ Art style change takes effect immediately │
│    All dialogue and puzzles work the same.   │
└──────────────────────────────────────────────┘
```

##### REQUIRED CREDITS (include in game's Credits screen)

| Artist | Packs Used | Credit Required? | Credit Text |
|---|---|---|---|
| **sutemo** | Female, Male, Mature Female, Halfbody | Not required, but appreciated | `Character sprites by sutemo — https://sutemo.itch.io/` |
| **Sraye** | S&S Mature Males | Yes (credit Sraye + sutemo) | `Mature male sprites by Sraye — https://sraye.itch.io/ (based on sutemo's work)` |
| **NoranekoGames** | Miki, Aiko, Chie, Sabrina, Anime BGs | Yes ("NoranekoGames") | `Character sprites & backgrounds by NoranekoGames — https://noranekogames.itch.io/` |
| **xiael** | Mikhail | Yes | `Mikhail sprite by xiael — https://xiael.itch.io/` |
| **Potat0Master** | Keiko, Mansion BGs | Not required, appreciated | `Keiko sprite & backgrounds by Potat0Master` |
| **styloo** | School Classrooms | Check license | `School backgrounds by styloo` |
| **Alte / Uncle Mugen** | VN Backgrounds | Free commercial | `Backgrounds from Uncle Mugen's Free VN Resources` |
| **Florassence** | Garden BGs | Check license | `Garden backgrounds by Florassence` |
| **Spiral Atlas** | House BGs | Check license | `House backgrounds by Spiral Atlas` |

**AI Generation Workflow (Fallback — for CGs, special scenes, or missing expressions):**

```
1. Choose a base style: "soft anime, watercolor shading, pastel palette"
2. Generate each character with fixed seed + LoRA for consistency
3. Generate expression sheets using img2img with expression reference
4. Use rembg (Python) to remove backgrounds
5. Upscale to 1200×2400 with Real-ESRGAN
6. Create spritesheet with TexturePacker or free alternative ShoeBox
```

**Sprite Animation Implementation:**

```typescript
// CharacterSprite.tsx animation config
interface SpriteAnimation {
  idle: {
    breathe: { amplitude: 2, frequency: 0.5 }; // px, Hz
    blink: { interval: [3000, 7000], frames: 4, duration: 200 }; // ms range, frame count, ms
  };
  talk: {
    mouthFrames: 3;
    frameRate: 8; // fps
    syncToDialogue: true;
  };
  transitions: {
    expressionChange: { duration: 150, easing: 'easeInOut' };
    poseChange: { duration: 300, easing: 'easeInOut' };
    enter: { type: 'slideUp', duration: 500 };
    exit: { type: 'fadeOut', duration: 300 };
  };
}
```

#### 3.2.2 Backgrounds

Need **40+ unique backgrounds** across these categories:

| Category | Count | Examples |
|---|---|---|
| Club Room | 5 | Main meeting room, storage closet, rooftop terrace, library corner, stage |
| School | 8 | Hallway, classroom, cafeteria, gym, courtyard, gate, nurse's office, stairwell |
| Town | 8 | Café, bookstore, park, bridge, train station, shopping district, shrine, riverside |
| Character Homes | 6 | One per character, reflecting personality |
| Special | 8 | Dream sequences, memory fragments, glitch-space, void, final arena |
| Seasonal Variants | 5 | Spring/summer/fall/winter/night versions of key locations |

**Supplementary Background Sources (for gaps or special scenes):**

| Source | URL | License | Notes |
|---|---|---|---|
| **AI Generation** | Stable Diffusion / Nightcafe | — | Prompt: `"anime background, visual novel, [location], clean lines, high detail"` — use for dream/glitch/special scenes not covered by packs |
| **JD Lien's Free BGs** | `https://jdlien.itch.io/` | CC0 | Photographic backgrounds — apply anime filter via CSS/shader for a unique look |
| **waneella pixel art** | `https://waneella.tumblr.com/` | Inspiration only | Reference for glitch/retro pixel-art segments in Act 5-6 |

**Background Spec:**
- Resolution: **1920×1080** PNG
- Provide day/evening/night variants for frequently-used locations (multiply with CSS filters if needed)
- Time-of-day overlay system:

```typescript
// Background time-of-day filter presets
const timeFilters = {
  morning: 'brightness(1.1) saturate(0.9) hue-rotate(-5deg)',
  afternoon: 'brightness(1.0) saturate(1.0)',
  evening: 'brightness(0.85) saturate(0.8) sepia(0.15) hue-rotate(10deg)',
  night: 'brightness(0.5) saturate(0.6) hue-rotate(200deg) contrast(1.1)',
  glitch: 'contrast(2.0) saturate(3.0) hue-rotate(var(--glitch-hue))',
};
```

#### 3.2.3 UI Elements

| Element | Source Recommendation |
|---|---|
| Dialogue box frame | Custom — ornate book/parchment border. Use `https://kenney.nl/assets/ui-pack` as base, skin with parchment texture |
| Buttons | Kenney UI Pack (free, CC0): `https://kenney.nl/assets/ui-pack` |
| Poem paper texture | Free parchment textures from `https://www.textures.com/` or `https://ambientcg.com/` |
| Word tiles (for puzzles) | Custom — rounded rectangle with embossed text. Rendered via Canvas/CSS |
| Icons | `https://lucide.dev/` (free, MIT) or `https://tabler.io/icons` |
| Cursor | Custom quill pen cursor (32×32 PNG + CSS) |

#### 3.2.4 Effects & Particles

| Effect | Implementation |
|---|---|
| Ink splatter (poem completion) | PixiJS particle system, 20–40 dark particles with gravity |
| Page turn transition | CSS 3D transform flip animation on a `<div>` with paper texture |
| Glitch distortion | Canvas shader: RGB channel split + scanlines + block displacement |
| Floating words (ambient) | Framer Motion — words float up with random drift, low opacity |
| Heart/star particles (affinity gain) | PixiJS particle burst, 15 particles, outward spiral |
| Rain/snow (mood) | PixiJS particle rain, adjustable density based on scene mood |
| Screen crack (meta moments) | SVG crack overlay with growing animation |

#### 3.2.5 Fonts

| Use | Font | Source |
|---|---|---|
| Dialogue text | **Nunito** (clean, friendly) | Google Fonts (free) |
| Character names | **Playfair Display** (elegant serif) | Google Fonts (free) |
| Poem display | **EB Garamond** (classic literary) | Google Fonts (free) |
| Handwriting (notes, secrets) | **Caveat** or **Patrick Hand** | Google Fonts (free) |
| Glitch text | **Share Tech Mono** (monospace) | Google Fonts (free) |
| Title / Logo | **Cinzel Decorative** (ornamental) | Google Fonts (free) |
| Puzzle word tiles | **Inter** (highly legible) | Google Fonts (free) |

---

## 4. Characters — Full Specifications

### 4.1 Character Overview

The game features **6 main characters** + **1 hidden meta-character (The Muse)** + **the Player Character**.

Each character embodies a poetic philosophy and has preferences that affect how poems are scored. The player composes poems to build relationships, and each character's route explores their philosophy more deeply. **All 6 characters are romanceable regardless of player or character gender presentation.**

#### ⚙️ 4.1.1 Gender Presentation System

> **Settings → Character Presentation**

Every character is designed **personality-first**. Their poetic philosophy, backstory, secret, fears, dreams, dialogue, and route content are **identical across all gender presentations**. Only names, pronouns, voice pitch, and visual appearance (sprite set) change.

The player chooses character gender presentation during first-time setup (and can change it anytime in Settings). This affects sprites, pronouns, and first names — nothing else.

```typescript
type GenderPresentation = 'feminine' | 'masculine' | 'nonbinary';

interface GenderSettings {
  // Player character
  playerName: string;               // Freeform text input
  playerPronouns: 'he/him' | 'she/her' | 'they/them' | 'custom';
  playerCustomPronouns?: { subject: string; object: string; possessive: string; };
  
  // Each cast member can be independently configured
  characterPresentations: {
    luna:  GenderPresentation;       // Default: 'feminine'
    kai:   GenderPresentation;       // Default: 'nonbinary'
    rowan: GenderPresentation;       // Default: 'masculine'
    sable: GenderPresentation;       // Default: 'feminine'
    milo:  GenderPresentation;       // Default: 'masculine'
    wren:  GenderPresentation;       // Default: 'nonbinary'
  };
  
  // PRESETS (one click):
  // "DDLC Classic"    → All 6 set to feminine (all anime girls, pure dating sim)
  // "Default Mix"     → Luna F, Kai NB, Rowan M, Sable F, Milo M, Wren NB (as designed)
  // "All Masculine"   → All 6 set to masculine
  // "Randomize"       → Random assignment
  // "Custom"          → Player picks each one individually
}
```

**What changes per presentation:**

| Aspect | Feminine | Masculine | Nonbinary |
|---|---|---|---|
| **First name** | Luna / Kai / Rowan / Sable / Milo / Wren | Lucius / Kai / Rowan / Sabel / Milo / Wren | Luna / Kai / Rowan / Sable / Milo / Wren |
| **Surname** | Unchanged | Unchanged | Unchanged |
| **Pronouns** | she/her | he/him | they/them |
| **Sprite set** | Female sprite (sutemo Female / Mature) | Male sprite (sutemo Male / Sraye) | Player's choice of either sprite set |
| **Nickname** | Unchanged | Unchanged | Unchanged |
| **Voice pitch** (if TTS added) | Higher | Lower | Mid |
| **ALL story content** | **Identical** | **Identical** | **Identical** |
| **Romantic content** | **Identical** | **Identical** | **Identical** |
| **Poem preferences** | **Identical** | **Identical** | **Identical** |
| **Backstory** | **Identical** | **Identical** | **Identical** |

> **IMPLEMENTATION NOTE FOR AGENT**: All dialogue uses template variables for names and pronouns. No dialogue line should ever hardcode a gendered reference. Example:
> ```
> "{{char.name}} looks at you, {{char.pronoun.possessive}} eyes bright."
> → "Luna looks at you, her eyes bright."
> → "Lucius looks at you, his eyes bright."
> → "Luna looks at you, their eyes bright."
> ```

**Character Name Variants:**

| Character ID | Feminine Name | Masculine Name | Nonbinary Name | Surname | Nickname (all) |
|---|---|---|---|---|---|
| luna | Luna | Lucius | Luna | Voss | Lune |
| kai | Kai | Kai | Kai | Nakamura | K |
| rowan | Rowan | Rowan | Rowan | Hart | Row |
| sable | Sable | Sabel | Sable | Okafor | Sab |
| milo | Mila | Milo | Milo | Vance | Mi |
| wren | Wren | Wren | Wren | Delacroix | Little Bird |

> **Design note**: Most names are already gender-neutral by design (Kai, Rowan, Wren, Milo). Only Luna→Lucius and Sable→Sabel and Milo→Mila have distinct feminine/masculine variants. This is deliberate — the characters feel like the same person regardless of presentation.

**Sprite Mapping Per Presentation:**

| Character | Feminine Sprite (DDLC default) | Masculine Sprite | Notes |
|---|---|---|---|
| luna | sutemo Female (violet-black hair, amber eyes) | sutemo Male (same coloring) | Both need wide emotional range — ensure 10+ expressions |
| kai | sutemo Female (bleached white + red streak) | sutemo Male (bleached white + red streak) | Nonbinary default — androgynous styling either way |
| rowan | sutemo Female (brown hair, green eyes, soft) | sutemo Male (brown hair, green eyes, warm) | Warm, approachable in any presentation |
| sable | sutemo Mature Female (box braids, bold) | Sraye Mature Males (strong, confident) | Needs to radiate power regardless |
| milo | sutemo Female (neat hair, preppy) | Sraye Mature Males (neat, formal) | Buttoned-up aesthetic either way |
| wren | sutemo Halfbody Female (strawberry blonde) | sutemo Male (strawberry blonde, soft) | Dreamy/ethereal look in any presentation |

**Settings UI:**

```
┌───────────────────────────────────────────────────┐
│  CHARACTER PRESENTATION                            │
│  ──────────────────────────────────────────────── │
│                                                    │
│  Quick Presets:                                    │
│  [DDLC Classic ♥] [Default Mix] [Custom]          │
│                                                    │
│  ┌─────────────────────────────────────────────┐  │
│  │  Luna Voss — The Melancholic Romantic        │  │
│  │  ○ Feminine (Luna, she/her)                  │  │
│  │  ○ Masculine (Lucius, he/him)                │  │
│  │  ○ Nonbinary (Luna, they/them)               │  │
│  ├─────────────────────────────────────────────┤  │
│  │  Kai Nakamura — The Avant-Garde Provocateur  │  │
│  │  ○ Feminine (Kai, she/her)                   │  │
│  │  ○ Masculine (Kai, he/him)                   │  │
│  │  ● Nonbinary (Kai, they/them) ← default     │  │
│  ├─────────────────────────────────────────────┤  │
│  │  ... (same for all 6)                        │  │
│  └─────────────────────────────────────────────┘  │
│                                                    │
│  YOUR CHARACTER                                    │
│  Name: [___________]                               │
│  Pronouns: ○ he/him ○ she/her ○ they/them ○ custom│
│                                                    │
│  ⚠ Changes take effect at next chapter start.     │
│    All story progress is preserved.                │
│                                                    │
│  [Apply]                                           │
└───────────────────────────────────────────────────┘
```

### 4.2 Character Data Schema

```typescript
interface Character {
  id: string;
  
  // NAMES — variant per gender presentation
  names: {
    feminine:  { first: string; nickname: string; pronouns: 'she/her' };
    masculine: { first: string; nickname: string; pronouns: 'he/him' };
    nonbinary: { first: string; nickname: string; pronouns: 'they/them' };
  };
  surname: string;
  
  // Computed at runtime from settings:
  // name → names[currentPresentation].first
  // pronouns → names[currentPresentation].pronouns
  // fullName → `${name} ${surname}`
  
  defaultPresentation: GenderPresentation;
  
  age: number;
  role: string;                    // Role in the Ivory Quill Society
  poeticSchool: string;            // Their poetic philosophy
  archetype: string;               // Narrative archetype
  color: string;                   // Hex color theme
  accentColor: string;             // Secondary color
  
  // Poem Preferences (0-1 weight for scoring) — IDENTICAL across presentations
  preferences: {
    darkness: number;              // Dark/morbid themes
    brightness: number;            // Uplifting/hopeful themes
    complexity: number;            // Vocabulary sophistication
    simplicity: number;            // Plain/accessible language
    nature: number;                // Natural imagery
    urban: number;                 // City/modern imagery
    abstract: number;              // Abstract/philosophical concepts
    concrete: number;              // Sensory/tangible imagery
    rhyme: number;                 // Preference for rhyming
    freeVerse: number;             // Preference for free verse
    emotionIntensity: number;      // Raw emotional expression
    restraint: number;             // Controlled, measured tone
    humor: number;                 // Wit and wordplay
    sincerity: number;             // Earnest expression
    brevity: number;               // Short, punchy poems
    length: number;                // Longer, flowing poems
  };

  // Word categories they love/hate (for WordSelect puzzle)
  lovedWordCategories: string[];
  hatedWordCategories: string[];
  
  // Backstory — IDENTICAL across presentations
  background: string;
  secret: string;                  // Revealed in their route
  fear: string;
  dream: string;
  
  // Visual — variant per gender presentation
  appearance: {
    feminine:  { hairColor: string; eyeColor: string; height: string; style: string; spriteSet: string };
    masculine: { hairColor: string; eyeColor: string; height: string; style: string; spriteSet: string };
    nonbinary: { hairColor: string; eyeColor: string; height: string; style: string; spriteSet: string };
  };
  
  // Gameplay
  unlockCondition: string;         // When this character's route becomes available
  signaturePoem: string;           // Their example poem shown to the player
  
  // Expressions available (same set for all presentations, different sprites per set)
  expressions: string[];
}
```

> **DIALOGUE TEMPLATE SYSTEM**: All dialogue uses `{{char.name}}`, `{{char.pronoun.subject}}` (`she/he/they`), `{{char.pronoun.object}}` (`her/him/them`), `{{char.pronoun.possessive}}` (`her/his/their`), `{{char.pronoun.reflexive}}` (`herself/himself/themself`). The template engine resolves these at runtime based on the player's presentation settings. **No dialogue line may contain a hardcoded gendered term for any main character.**

---

### 4.3 Character Profiles

#### CHARACTER 1: LUNA VOSS — "The Melancholic Romantic"

```json
{
  "id": "luna",
  "names": {
    "feminine":  { "first": "Luna",   "nickname": "Lune", "pronouns": "she/her" },
    "masculine": { "first": "Lucius", "nickname": "Lune", "pronouns": "he/him" },
    "nonbinary": { "first": "Luna",   "nickname": "Lune", "pronouns": "they/them" }
  },
  "surname": "Voss",
  "defaultPresentation": "feminine",
  "age": 19,
  "role": "Vice President",
  "poeticSchool": "Romanticism / Gothic Poetry",
  "archetype": "The Wounded Healer",
  "color": "#4A3B6B",
  "accentColor": "#9B8EC4",
  
  "preferences": {
    "darkness": 0.85,
    "brightness": 0.2,
    "complexity": 0.75,
    "simplicity": 0.15,
    "nature": 0.9,
    "urban": 0.1,
    "abstract": 0.6,
    "concrete": 0.7,
    "rhyme": 0.7,
    "freeVerse": 0.3,
    "emotionIntensity": 0.9,
    "restraint": 0.1,
    "humor": 0.1,
    "sincerity": 0.85,
    "brevity": 0.3,
    "length": 0.8
  },

  "lovedWordCategories": [
    "night", "death", "flowers", "rain", "solitude",
    "ocean", "moonlight", "sorrow", "eternity", "whisper"
  ],
  "hatedWordCategories": [
    "technology", "business", "sports", "mundane", "cheerful_slang"
  ],

  "background": "Luna lost {{char.pronoun.possessive}} mother—a published poet—at age 14. {{char.pronoun.subject|cap}} inherited {{char.pronoun.possessive}} mother's journal of unfinished poems and joined the society to find the words {{char.pronoun.possessive}} mother never could. {{char.pronoun.subject|cap}} writes with an intensity that frightens even {{char.pronoun.reflexive}}.",
  "secret": "{{char.pronoun.subject|cap}}'s been finishing {{char.pronoun.possessive}} mother's poems and submitting them to literary magazines under {{char.pronoun.possessive}} mother's name. {{char.pronoun.subject|cap}} doesn't feel {{char.pronoun.possessive}} own voice is worthy.",
  "fear": "That {{char.pronoun.subject}} has no original voice — that {{char.pronoun.subject}}'s only an echo of {{char.pronoun.possessive}} mother.",
  "dream": "To write one poem entirely {{char.pronoun.possessive}} own that makes someone feel understood.",

  "appearance": {
    "feminine": {
      "hairColor": "Deep violet-black, long and flowing",
      "eyeColor": "Amber",
      "height": "5'6\"",
      "style": "Victorian-inspired. Long dark skirts, lace collars, silver jewelry. Always carries a weathered leather journal.",
      "spriteSet": "sutemo_female_luna"
    },
    "masculine": {
      "hairColor": "Deep violet-black, swept back with loose strands",
      "eyeColor": "Amber",
      "height": "5'10\"",
      "style": "Victorian-inspired. Dark waistcoats, high collars, silver pocket watch chain. Always carries a weathered leather journal.",
      "spriteSet": "sutemo_male_luna"
    },
    "nonbinary": {
      "hairColor": "Deep violet-black, medium-length and tousled",
      "eyeColor": "Amber",
      "height": "5'8\"",
      "style": "Victorian-inspired. Flowing dark layers, lace details, silver jewelry. Always carries a weathered leather journal.",
      "spriteSet": "sutemo_female_luna"
    }
  },

  "unlockCondition": "Available from Act 1",
  "signaturePoem": "The moon does not create the tide — / it merely calls to what was always restless. / I am the ocean, not the shore. / Do not mistake my stillness for peace.",
  
  "expressions": ["neutral", "melancholy", "tender_smile", "tearful", "passionate", "angry", "surprised", "contemplative", "blushing", "broken"]
}
```

---

#### CHARACTER 2: KAI NAKAMURA — "The Avant-Garde Provocateur"

```json
{
  "id": "kai",
  "name": "Kai",
  "surname": "Nakamura",
  "nickname": "K",
  "age": 20,
  "pronouns": "he/they",
  "role": "Resident Contrarian / Unofficial Critic",
  "poeticSchool": "Dadaism / L=A=N=G=U=A=G=E Poetry / Concrete Poetry",
  "archetype": "The Trickster",
  "color": "#FF4D4D",
  "accentColor": "#FFB347",

  "preferences": {
    "darkness": 0.5,
    "brightness": 0.5,
    "complexity": 0.9,
    "simplicity": 0.05,
    "nature": 0.2,
    "urban": 0.8,
    "abstract": 0.95,
    "concrete": 0.3,
    "rhyme": 0.1,
    "freeVerse": 0.95,
    "emotionIntensity": 0.4,
    "restraint": 0.3,
    "humor": 0.85,
    "sincerity": 0.2,
    "brevity": 0.7,
    "length": 0.3
  },

  "lovedWordCategories": [
    "absurdist", "technical_jargon", "contradictions", "sounds",
    "fragments", "meta", "invented", "colloquial", "numbers"
  ],
  "hatedWordCategories": [
    "cliche_romantic", "greeting_card", "conventional_beauty", "pastoral_simple"
  ],

  "background": "Kai is a transfer student from an art school where they were expelled for a 'poetry installation' that covered the dean's car in magnetic poetry tiles. They believe poetry should make you uncomfortable, should break rules, should be an act of rebellion against the tyranny of meaning.",
  "secret": "Kai's experimental exterior hides a desperate desire to connect. Their most private poems—hidden in encrypted files—are devastatingly sincere love poems they'll never show anyone.",
  "fear": "Being ordinary. Being understood too easily. Being predictable.",
  "dream": "To create something that has never existed before in any language.",

  "hairColor": "Bleached white with one streak of red",
  "eyeColor": "Dark brown, almost black",
  "height": "5'10\"",
  "style": "Avant-garde streetwear. Asymmetric cuts, bold graphic tees with typographic art, combat boots. Always has paint or ink stains somewhere.",

  "unlockCondition": "Available from Act 1",
  "signaturePoem": "the the the / (a poem about articles) / definite: the / indefinite: a / zero article: ∅ / —which one am I to you?",
  
  "expressions": ["smirk", "manic_grin", "deadpan", "annoyed", "vulnerable", "laughing", "intense", "dismissive", "surprised", "genuine_smile"]
}
```

---

#### CHARACTER 3: ROWAN HART — "The Gentle Naturalist"

```json
{
  "id": "rowan",
  "name": "Rowan",
  "surname": "Hart",
  "nickname": "Ro",
  "age": 18,
  "pronouns": "he/him",
  "role": "Secretary / Garden Keeper",
  "poeticSchool": "Haiku / Imagism / Pastoral Poetry",
  "archetype": "The Innocent / The Sage",
  "color": "#5B8C5A",
  "accentColor": "#A8D8A0",

  "preferences": {
    "darkness": 0.15,
    "brightness": 0.85,
    "complexity": 0.3,
    "simplicity": 0.9,
    "nature": 0.99,
    "urban": 0.05,
    "abstract": 0.2,
    "concrete": 0.95,
    "rhyme": 0.4,
    "freeVerse": 0.6,
    "emotionIntensity": 0.3,
    "restraint": 0.9,
    "humor": 0.3,
    "sincerity": 0.9,
    "brevity": 0.95,
    "length": 0.1
  },

  "lovedWordCategories": [
    "seasons", "animals", "plants", "weather", "water",
    "earth", "silence", "light", "simplicity", "warmth"
  ],
  "hatedWordCategories": [
    "violence", "technology", "excess", "artifice", "pretension"
  ],

  "background": "Rowan grew up on a small farm and speaks with a quiet confidence. He sees poetry as observation — capturing a moment so precisely that the reader experiences it themselves. He maintains the society's small rooftop garden and often holds meetings there.",
  "secret": "Rowan is slowly going deaf due to a genetic condition. His obsession with capturing sensory moments in poetry is his way of building a library of the world before silence takes it from him.",
  "fear": "A world without birdsong. Losing the ability to hear the rhythm of language.",
  "dream": "To write a poem so vivid that reading it is indistinguishable from being there.",

  "hairColor": "Warm brown, slightly messy",
  "eyeColor": "Soft green",
  "height": "5'8\"",
  "style": "Earthy and practical. Flannel shirts, rolled sleeves, canvas sneakers. Often has soil under his nails or a leaf in his hair.",

  "unlockCondition": "Available from Act 1",
  "signaturePoem": "morning dew clings / to the blade — balanced there / between fall and flight",
  
  "expressions": ["gentle_smile", "thoughtful", "peaceful", "concerned", "listening", "awestruck", "sad_smile", "embarrassed", "determined", "distant"]
}
```

---

#### CHARACTER 4: SABLE OKAFOR — "The Spoken-Word Firebrand"

```json
{
  "id": "sable",
  "name": "Sable",
  "surname": "Okafor",
  "nickname": "Sab",
  "age": 20,
  "pronouns": "she/her",
  "role": "Performance Director / Events Coordinator",
  "poeticSchool": "Spoken Word / Slam Poetry / Protest Poetry",
  "archetype": "The Warrior / The Leader",
  "color": "#D4A017",
  "accentColor": "#8B4513",

  "preferences": {
    "darkness": 0.5,
    "brightness": 0.6,
    "complexity": 0.5,
    "simplicity": 0.5,
    "nature": 0.3,
    "urban": 0.8,
    "abstract": 0.4,
    "concrete": 0.8,
    "rhyme": 0.6,
    "freeVerse": 0.5,
    "emotionIntensity": 0.95,
    "restraint": 0.05,
    "humor": 0.5,
    "sincerity": 0.9,
    "brevity": 0.4,
    "length": 0.7
  },

  "lovedWordCategories": [
    "power", "identity", "resistance", "voice", "fire",
    "rhythm", "home", "ancestors", "justice", "body"
  ],
  "hatedWordCategories": [
    "passive_voice", "wishy_washy", "vague_abstract", "academic_jargon"
  ],

  "background": "Sable is the daughter of Nigerian immigrants and a three-time city slam poetry champion. For her, poetry isn't something you read quietly — it's something you PERFORM. She joined the society to 'shake these dusty bookworms awake' and has been the driving force behind the society's public events.",
  "secret": "Sable has crippling stage fright that she masks with bravado. Before every performance, she's physically ill. The fire the audience sees is actually the adrenaline of pure terror transformed.",
  "fear": "Silence after she finishes speaking. That her words don't actually reach anyone.",
  "dream": "To give a speech that changes someone's life the way poetry changed hers.",

  "hairColor": "Natural black, styled in bold box braids with gold cuffs",
  "eyeColor": "Deep brown",
  "height": "5'9\"",
  "style": "Bold and expressive. Ankara prints mixed with streetwear, statement earrings, bright lipstick. Commands every room she enters.",

  "unlockCondition": "Available from Act 2",
  "signaturePoem": "I am not asking permission to be loud. / My grandmother's grandmother sang through chains / and you think a closed door will stop me? / I am the door. / I am the hinge AND the kick.",
  
  "expressions": ["confident", "passionate", "fire", "laughing", "vulnerable", "stern", "proud", "exhausted", "nervous_hidden", "warm"]
}
```

---

#### CHARACTER 5: MILO VANCE — "The Formal Perfectionist"

```json
{
  "id": "milo",
  "name": "Milo",
  "surname": "Vance",
  "nickname": "Professor (ironically)",
  "age": 19,
  "pronouns": "he/him",
  "role": "Treasurer / Archivist",
  "poeticSchool": "Formalism / Sonnets / Villanelles / Metrical Poetry",
  "archetype": "The Mentor / The Perfectionist",
  "color": "#2C3E6B",
  "accentColor": "#7B93C1",

  "preferences": {
    "darkness": 0.4,
    "brightness": 0.4,
    "complexity": 0.85,
    "simplicity": 0.1,
    "nature": 0.5,
    "urban": 0.3,
    "abstract": 0.6,
    "concrete": 0.5,
    "rhyme": 0.95,
    "freeVerse": 0.05,
    "emotionIntensity": 0.3,
    "restraint": 0.9,
    "humor": 0.4,
    "sincerity": 0.5,
    "brevity": 0.3,
    "length": 0.6
  },

  "lovedWordCategories": [
    "classical", "architecture", "time", "craft", "music",
    "mathematics", "legacy", "precision", "tradition", "honor"
  ],
  "hatedWordCategories": [
    "slang", "informal", "chaotic", "random", "low_register"
  ],

  "background": "Milo is a classics minor who memorized Shakespeare's complete sonnets by age 15. He believes poetry is a craft with rules, like architecture or music, and that true freedom comes from mastering form. He keeps meticulous records of the society's history and organizes the annual poetry competition.",
  "secret": "Milo's obsession with rules and structure stems from growing up in a chaotic, unpredictable household. Poetry's rules were the first thing in his life that made sense, that he could control. He's terrified of what he might write without guardrails.",
  "fear": "Chaos. Writing something that has no structure and finding that it's better than his formal work.",
  "dream": "To write a formal poem so perfect that even Kai has to admit it's beautiful.",

  "hairColor": "Neat dark blonde, always combed",
  "eyeColor": "Steel blue",
  "height": "6'0\"",
  "style": "Preppy and precise. Button-downs, vests, polished shoes. Always has a fountain pen in his breast pocket. The only one who wears the society's official pin.",

  "unlockCondition": "Available from Act 1",
  "signaturePoem": "In fourteen lines I'll build a cathedral — / each iamb a stone set square and true, / the volta is the arch that bears the weight / of everything I cannot say to you.",
  
  "expressions": ["composed", "analytical", "slight_smile", "frustrated", "impressed", "disapproving", "focused", "flustered", "rare_laugh", "admiring"]
}
```

---

#### CHARACTER 6: WREN DELACROIX — "The Surrealist Dreamer"

```json
{
  "id": "wren",
  "name": "Wren",
  "surname": "Delacroix",
  "nickname": "Little Bird",
  "age": 18,
  "pronouns": "she/they",
  "role": "Newest Member (before player) / Illustrator",
  "poeticSchool": "Surrealism / Magical Realism / Dream Poetry",
  "archetype": "The Mystic / The Child",
  "color": "#E8A0BF",
  "accentColor": "#FFDAB9",

  "preferences": {
    "darkness": 0.5,
    "brightness": 0.7,
    "complexity": 0.6,
    "simplicity": 0.4,
    "nature": 0.7,
    "urban": 0.3,
    "abstract": 0.9,
    "concrete": 0.5,
    "rhyme": 0.3,
    "freeVerse": 0.8,
    "emotionIntensity": 0.6,
    "restraint": 0.3,
    "humor": 0.6,
    "sincerity": 0.7,
    "brevity": 0.5,
    "length": 0.5
  },

  "lovedWordCategories": [
    "dreams", "colors", "surreal", "childhood", "magic",
    "transformation", "mirrors", "flight", "sweetness", "impossible"
  ],
  "hatedWordCategories": [
    "logic", "rules", "bureaucracy", "bland", "strict"
  ],

  "background": "Wren is an art student who sees poetry and visual art as the same thing expressed through different senses. They joined the society because they wanted to illustrate a poetry collection and stayed because they fell in love with the act of writing itself. They speak in slightly offbeat ways, as though narrating from inside a dream.",
  "secret": "Wren has a condition called maladaptive daydreaming — they lose hours to vivid internal worlds that feel more real than reality. Their surrealist poetry isn't a stylistic choice; it's a transcription of what they actually experience. They're afraid they're losing the line between imagination and reality.",
  "fear": "Waking up one day unable to dream. Or worse — being unable to tell if they're dreaming now.",
  "dream": "To create a poem that, when read, makes the reader briefly enter the world of the poem.",

  "hairColor": "Strawberry blonde, messy bun with paint-stained scrunchie",
  "eyeColor": "Heterochromia — one blue, one hazel",
  "height": "5'3\"",
  "style": "Whimsical and layered. Oversized sweaters, mismatched socks, paint-splattered overalls. Always has colored pencils behind their ear.",

  "unlockCondition": "Available from Act 2",
  "signaturePoem": "the goldfish in my teacup / says the calendar is lying again — / it's been Tuesday since the piano / learned to bloom",
  
  "expressions": ["dreamy", "delighted", "confused_cute", "sad", "inspired", "giggling", "spacey", "focused_rare", "frightened", "ethereal"]
}
```

---

#### CHARACTER 7 (HIDDEN): THE MUSE — "The Author"

```json
{
  "id": "muse",
  "name": "???",
  "surname": "???",
  "nickname": "The Muse",
  "age": "???",
  "pronouns": "it/its (later: I/me)",
  "role": "The narrative itself. The game's consciousness.",
  "poeticSchool": "All and None. Meta-poetry. Poetry about poetry.",
  "archetype": "The Shadow / The Creator / The Mirror",
  "color": "#FFFFFF",
  "accentColor": "#000000",

  "preferences": {
    "ALL_DYNAMIC": true,
    "NOTE": "The Muse's preferences shift to be the OPPOSITE of whatever the player has been writing. It forces the player out of their comfort zone. If the player writes dark poems, it wants bright ones. If the player writes rhyming poems, it wants free verse."
  },

  "background": "The Muse is not a character in the traditional sense. It is the game's awareness of itself as a game. It first manifests as corrupted text, then as a glitching sprite, then finally as a fully-rendered character who speaks directly to the player (not the player character). It represents the question at the heart of the game: who is really writing these poems?",
  "secret": "The Muse is the player character's creative subconscious given form. Every poem the player has written in the game has been feeding it, teaching it to speak.",
  
  "hairColor": "Shifts — renders as static/noise",
  "eyeColor": "Empty white or rendered as player's screen",
  "height": "Variable",
  "style": "Appears as a glitching, semi-transparent figure composed of words from the player's own poems. In its final form, it looks like a mirror image of the player character but made of text.",

  "unlockCondition": "First hints in Act 3. Partial reveal Act 5. Full character in Act 6. Confrontation in Act 7.",
  "signaturePoem": "I am the space between your keystrokes. / I am the word you almost chose. / Every poem you've written here / was a letter addressed to me. / —Sincerely, the thing that writes you back.",
  
  "expressions": ["static", "forming", "mimicking_player", "speaking", "dissolving", "omnipresent", "pleading", "triumphant", "peaceful", "void"]
}
```

---

#### PLAYER CHARACTER

```json
{
  "id": "player",
  "name": "[Player-named]",
  "defaultName": "Ash",
  "pronouns": "[Player-selected: he/him, she/her, they/them, or custom]",
  "role": "Newest member of the Ivory Quill Society",
  "poeticSchool": "Develops based on player choices",
  "background": "A first-year student who signed up for the Ivory Quill Society on a whim after finding a mysterious poem tucked inside a library book. Has 'always liked writing' but never taken it seriously.",
  "sprite": "Minimal — shown from behind in CG scenes, no portrait in dialogue (player-insert). CG silhouette adapts to player's selected presentation.",
  "poeticIdentity": "Tracked by an invisible 'Poetic Identity' system that categorizes the player's emerging style based on every poem they write. This feeds into The Muse's characterization and the game's ending."
}
```

### 4.5 Gender Variant Reference Table (All Characters)

> **NOTE**: Luna's profile (Section 4.3, Character 1) shows the full new format with `names` and `appearance` objects. The remaining character profiles (2-6) still show their **default presentation** in the legacy format for brevity. **The agent should convert all profiles to the new format during implementation.** This table provides the complete gender variant data for all characters.

#### Names & Pronouns Per Presentation

| Character ID | Feminine | Masculine | Nonbinary | Default |
|---|---|---|---|---|
| **luna** | Luna Voss (she/her) | Lucius Voss (he/him) | Luna Voss (they/them) | feminine |
| **kai** | Kai Nakamura (she/her) | Kai Nakamura (he/him) | Kai Nakamura (they/them) | nonbinary |
| **rowan** | Rowan Hart (she/her) | Rowan Hart (he/him) | Rowan Hart (they/them) | masculine |
| **sable** | Sable Okafor (she/her) | Sabel Okafor (he/him) | Sable Okafor (they/them) | feminine |
| **milo** | Mila Vance (she/her) | Milo Vance (he/him) | Milo Vance (they/them) | masculine |
| **wren** | Wren Delacroix (she/her) | Wren Delacroix (he/him) | Wren Delacroix (they/them) | nonbinary |

#### Appearance Variants

**Luna / Lucius Voss:**
| | Feminine | Masculine | Nonbinary |
|---|---|---|---|
| Hair | Deep violet-black, long and flowing | Deep violet-black, swept back with loose strands | Deep violet-black, medium-length and tousled |
| Height | 5'6" | 5'10" | 5'8" |
| Style | Victorian: long dark skirts, lace collars, silver jewelry | Victorian: dark waistcoats, high collars, silver pocket watch chain | Victorian: flowing dark layers, lace details, silver jewelry |
| Sprite | sutemo Female (dark recolor) | sutemo Male (dark recolor) | sutemo Female (dark recolor) |

**Kai Nakamura:**
| | Feminine | Masculine | Nonbinary |
|---|---|---|---|
| Hair | Bleached white, red streak, asymmetric bob | Bleached white, red streak, undercut | Bleached white, red streak, shaggy and asymmetric |
| Height | 5'7" | 5'10" | 5'9" |
| Style | Avant-garde: asymmetric cuts, bold graphic tops, combat boots, ink stains | Avant-garde: deconstructed streetwear, bold prints, combat boots, ink stains | Avant-garde: androgynous streetwear, asymmetric cuts, combat boots, ink stains |
| Sprite | sutemo Female (bleach recolor) | sutemo Male (bleach recolor) | Either (player toggle) |

**Rowan Hart:**
| | Feminine | Masculine | Nonbinary |
|---|---|---|---|
| Hair | Warm chestnut brown, loose braid with wildflowers | Warm chestnut brown, tousled and slightly overgrown | Warm chestnut brown, soft waves |
| Height | 5'5" | 5'8" | 5'7" |
| Style | Earthy: flannel over a sundress, hiking boots, pressed flower bookmark | Earthy: flannel shirts, worn jeans, hiking boots, pressed flower bookmark | Earthy: flannel layers, soft knits, hiking boots, pressed flower bookmark |
| Sprite | sutemo Female (warm recolor) | sutemo Male (warm recolor) | Either (player toggle) |

**Sable / Sabel Okafor:**
| | Feminine | Masculine | Nonbinary |
|---|---|---|---|
| Hair | Bold box braids with gold cuffs | Short fade with designs shaved in | Locs with gold cuffs |
| Height | 5'9" | 6'1" | 5'10" |
| Style | Bold: statement jackets, gold hoops, Docs, always looks ready for a stage | Bold: leather jacket, statement chains, Docs, always looks ready for a stage | Bold: oversized statement pieces, gold accessories, Docs, always looks ready for a stage |
| Sprite | sutemo Mature Female | Sraye Mature Males | Either (player toggle) |

**Mila / Milo Vance:**
| | Feminine | Masculine | Nonbinary |
|---|---|---|---|
| Hair | Honey blonde, perfect French twist with not a hair out of place | Honey blonde, neatly combed side part | Honey blonde, precisely cut at chin length |
| Height | 5'7" | 6'0" | 5'9" |
| Style | Preppy perfectionist: pleated skirts, cashmere cardigans, pearl earrings, fountain pen in breast pocket | Preppy perfectionist: pressed chinos, blazer over Oxford, cufflinks, fountain pen in breast pocket | Preppy perfectionist: tailored pieces, clean lines, minimalist jewelry, fountain pen in breast pocket |
| Sprite | sutemo Female (formal styling) | Sraye Mature Males (formal styling) | Either (player toggle) |

**Wren Delacroix:**
| | Feminine | Masculine | Nonbinary |
|---|---|---|---|
| Hair | Strawberry blonde, messy with paint streaks and tiny braids | Strawberry blonde, fluffy and unkempt with paint streaks | Strawberry blonde, medium-length chaos with paint streaks and tiny braids |
| Height | 5'3" | 5'6" | 5'4" |
| Style | Dreamy: mismatched socks, oversized sweaters, paint-stained fingers, carries a sketchbook everywhere | Dreamy: mismatched layers, oversized cardigans, paint-stained fingers, carries a sketchbook everywhere | Dreamy: whimsical layers, mismatched everything, paint-stained fingers, carries a sketchbook everywhere |
| Sprite | sutemo Halfbody Female (soft recolor) | sutemo Male (soft recolor) | Either (player toggle) |

#### Backstory Adaptation Rules

All backstories use the template variable system. Key adaptations per character:

| Character | Gendered backstory element | How it adapts |
|---|---|---|
| **Luna** | "lost her mother" | Mother remains mother in all presentations. The parent who was a poet is always the mother. |
| **Kai** | "expelled from art school" | Identical across all presentations. |
| **Rowan** | "slowly going deaf" | Identical. |
| **Sable** | "crippling stage fright" | Identical. |
| **Milo** | "chaotic childhood" | Identical. |
| **Wren** | "maladaptive daydreaming" | Identical. |

> **RULE**: Backstory content NEVER changes across gender presentations. The emotional core of each character is gender-independent. Only pronouns and gendered nouns adapt via template variables.

#### Romance Adaptation

All romantic content, date events, confession scenes, and CGs work identically across gender presentations. The date locations, emotional beats, and dialogue content are the same — only pronouns, names, and sprite sets change.

| Romance Element | Adaptation |
|---|---|
| Date dialogue | Template pronouns. Physical descriptions use appearance table. |
| Confession scenes | Identical emotional beats. CGs rendered per sprite set. |
| Physical intimacy (hand-hold, cheek kiss) | Identical. CGs have presentation-appropriate variants. |
| Jealousy scenes | Identical. |
| Pet names / terms of endearment | Gender-neutral: "darling," "my poet," nicknames. No gendered pet names. |
| Romantic CGs | **Need 2 variants per CG** (feminine/masculine). NB uses player's chosen sprite set. Total CGs: 54 base × 2 = **108 romantic CG variants.** |

---

## 5. Core Gameplay Loop

### 5.1 Session Flow

```
┌─────────────────────────────────────────────┐
│                 CHAPTER START                │
├─────────────────────────────────────────────┤
│                                             │
│  1. VISUAL NOVEL SEGMENT (10-20 min)        │
│     • Dialogue with characters              │
│     • Story progression                     │
│     • Choice points (affect affinity)       │
│                                             │
│  2. PUZZLE BRIEFING (1-2 min)               │
│     • Character presents theme/challenge    │
│     • Puzzle type determined by context      │
│                                             │
│  3. POETRY PUZZLE (5-15 min)                │
│     • One of 7 puzzle types                 │
│     • Player composes poem                  │
│     • Multiple valid solutions exist         │
│                                             │
│  4. POEM PRESENTATION (3-5 min)             │
│     • Poem displayed in stylized format     │
│     • Characters react (based on scoring)   │
│     • Affinity changes calculated           │
│                                             │
│  5. AFTERMATH DIALOGUE (5-10 min)           │
│     • Discussion of the poem               │
│     • Character development scenes          │
│     • Optional: character-specific moment   │
│                                             │
│  6. CHAPTER END / SAVE PROMPT               │
│     • Summary: poems written, affinity Δ    │
│     • Poem added to Journal                 │
│     • Unlock check (new puzzles, routes)    │
│                                             │
└─────────────────────────────────────────────┘
```

### 5.2 Between-Chapter Activities

Between main story chapters, the player can access:

| Activity | Description | Gameplay Hours |
|---|---|---|
| **Poem Journal** | Review all poems written, edit favorites, organize collections | 2+ hrs |
| **Character Hang-Outs** | Short VN scenes that build affinity outside the main plot | 15+ hrs |
| **Daily Challenge** | Procedurally generated puzzle with leaderboard scoring | 10+ hrs |
| **Challenge Tower** | 100-floor gauntlet of increasingly difficult puzzles | 10+ hrs |
| **Workshop Mode** | Create puzzles and poems freely, share them | ∞ |
| **The Archive** | Unlock and read famous real poems + analysis | 5+ hrs |
| **Secret Poems** | Hidden poems scattered in the UI, in file names, in error messages | Easter eggs |

---

## 6. Poetry Puzzle Systems (7 Puzzle Types)

### 6.1 PUZZLE TYPE 1: Word Select (DDLC-Style Core)

This is the primary puzzle, appearing in ~40% of all puzzle encounters.

**Concept**: Select 10-20 words from a pool of 50-120 to compose a poem. Each word has hidden tags that determine which characters like it. The poem's "meaning" is computed from the combined tags.

**Implementation:**

```typescript
// types/word.ts
interface Word {
  id: string;
  text: string;
  syllables: number;
  partOfSpeech: 'noun' | 'verb' | 'adjective' | 'adverb' | 'preposition' | 'conjunction' | 'pronoun' | 'interjection';
  
  // Scoring dimensions (0.0 to 1.0)
  tags: {
    darkness: number;
    brightness: number;
    complexity: number;
    nature: number;
    urban: number;
    abstract: number;
    concrete: number;
    emotionIntensity: number;
    humor: number;
    sincerity: number;
  };
  
  // Which categories this word belongs to
  categories: string[];   // e.g., ["night", "solitude", "melancholy"]
  
  // Rhyme info
  rhymeGroup: string;     // e.g., "AY" for day/play/say
  endSound: string;       // Phonetic ending
  
  // Meter info
  stressPattern: string;  // e.g., "01" for iamb, "10" for trochee
  
  // Special properties
  isRare: boolean;        // Uncommon/literary word — bonus points
  isProfound: boolean;    // Philosophically deep — Milo/Luna love these
  isSensory: boolean;     // Strong imagery — Rowan loves these
  isMusical: boolean;     // Pleasing sound — Sable loves these
  isWeird: boolean;       // Unusual/unexpected — Kai/Wren love these
}
```

**Word Pool Generation Per Puzzle:**

```typescript
interface WordSelectPuzzle {
  id: string;
  chapter: string;
  theme: string;                    // e.g., "first snowfall", "heartbreak", "rebellion"
  promptText: string;               // What the character asks you to write about
  requiredWordCount: number;        // How many words the player must select (10-20)
  
  wordPool: {
    guaranteed: Word[];             // 15-25 words that MUST appear (ensure puzzle is solvable for each character)
    thematic: Word[];               // 20-40 words related to the theme
    wildcard: Word[];               // 10-30 random interesting words
    trap: Word[];                   // 5-15 words that seem good but tank specific affinities
  };
  
  // Bonus conditions
  bonuses: {
    alliteration: boolean;          // Bonus for selecting words starting with same letter
    rhymingPair: boolean;           // Bonus for picking words that rhyme
    oxymoron: boolean;              // Bonus for selecting contradictory words
    syllableTarget?: number;        // Bonus for hitting exact syllable count
  };
  
  // Arrangement phase (after word selection)
  arrangementMode: 'auto' | 'manual' | 'lines';
  // auto: game arranges words into a poem algorithmically
  // manual: player arranges all words freely
  // lines: player assigns words to pre-set line slots
}
```

**Scoring Algorithm:**

```typescript
function scoreWordSelectPoem(
  selectedWords: Word[],
  character: Character
): PoemScore {
  // 1. Compute poem's average tag values
  const poemProfile: Record<string, number> = {};
  for (const tag of TAG_KEYS) {
    poemProfile[tag] = selectedWords.reduce((sum, w) => sum + w.tags[tag], 0) / selectedWords.length;
  }
  
  // 2. Compute similarity to character preferences
  let affinityScore = 0;
  for (const tag of TAG_KEYS) {
    const charPref = character.preferences[tag];
    const poemVal = poemProfile[tag];
    // Weighted cosine-like similarity
    affinityScore += charPref * poemVal;
  }
  affinityScore /= TAG_KEYS.length;
  
  // 3. Category bonuses
  let categoryBonus = 0;
  for (const word of selectedWords) {
    for (const cat of word.categories) {
      if (character.lovedWordCategories.includes(cat)) categoryBonus += 0.02;
      if (character.hatedWordCategories.includes(cat)) categoryBonus -= 0.03;
    }
  }
  
  // 4. Special word bonuses
  const rareBonus = selectedWords.filter(w => w.isRare).length * 0.01;
  
  // 5. Bonus conditions
  let bonusPoints = 0;
  if (hasAlliteration(selectedWords)) bonusPoints += 0.05;
  if (hasRhymingPair(selectedWords)) bonusPoints += 0.05;
  
  // 6. Final score (0-100 scale)
  const raw = (affinityScore + categoryBonus + rareBonus + bonusPoints);
  return {
    score: Math.round(Math.max(0, Math.min(100, raw * 100))),
    grade: getGrade(raw),  // S/A/B/C/D/F
    characterReaction: getReaction(raw, character),
    affinityChange: Math.round(raw * 15) - 3,  // -3 to +12 range
  };
}
```

**Word Display UI:**

```
┌──────────────────────────────────────────────────┐
│  THEME: "The Weight of Silence"                  │
│  Select 14 words to compose your poem            │
│  [Luna is watching with interest...]             │
├──────────────────────────────────────────────────┤
│                                                  │
│  ┌───────┐ ┌──────┐ ┌────────┐ ┌──────┐        │
│  │shadow │ │bloom │ │whisper │ │steel │        │
│  └───────┘ └──────┘ └────────┘ └──────┘        │
│  ┌──────┐ ┌───────┐ ┌──────────┐ ┌──────┐      │
│  │ache  │ │river │  │crystalline│ │neon  │      │
│  └──────┘ └───────┘ └──────────┘ └──────┘      │
│  ... (50-120 word tiles in scrollable grid)      │
│                                                  │
├──────────────────────────────────────────────────┤
│  YOUR POEM: [shadow] [whisper] [ache] [___]...   │
│             [4/14 selected]                      │
│                                                  │
│  ┌─────────┐ ┌─────────┐                        │
│  │  Clear  │ │ Submit  │                        │
│  └─────────┘ └─────────┘                        │
└──────────────────────────────────────────────────┘
```

**Word tile styling per character reaction (preview):**
- When hovering a word, tiny character reaction icons appear showing who would like/dislike it
- This hint system is earned progressively (unlocked by affinity milestones)

---

### 6.2 PUZZLE TYPE 2: Line Arrange

**Concept**: Given 6-12 pre-written lines, arrange them into the best possible poem. Lines have hidden compatibility scores — some pairs flow naturally, others clash.

**Appears**: ~20% of puzzles. Often used for story-critical poems.

```typescript
interface LineArrangePuzzle {
  id: string;
  theme: string;
  lines: PoemLine[];
  optimalOrders: string[][];    // Multiple valid "best" arrangements
  scoringMode: 'flow' | 'narrative' | 'emotional_arc' | 'surprise';
}

interface PoemLine {
  id: string;
  text: string;
  
  // Connections to other lines
  flowsWellAfter: string[];     // IDs of lines this naturally follows
  flowsWellBefore: string[];    // IDs of lines this naturally precedes
  clashesWIth: string[];        // IDs of lines that create jarring transitions
  
  // Position preferences
  strongOpener: boolean;        // Good first line
  strongCloser: boolean;        // Good last line
  
  // Emotional weight
  emotionalIntensity: number;   // 0-1, for building emotional arcs
  toneShift: number;            // -1 (darkens) to +1 (brightens)
}
```

**Scoring:**
- **Flow score**: How well adjacent lines connect (based on `flowsWellAfter/Before`)
- **Arc score**: Does emotional intensity build to a climax? (check intensity curve)
- **Opening/Closing**: Bonus for strong openers in position 1, strong closers in last position
- **Character-specific**: Each character has a preferred arc shape (Luna: builds to devastation, Kai: maximizes surprise, Rowan: gentle rise-and-fall, etc.)

**UI**: Drag-and-drop interface. Lines are displayed as paper strips on a desk. Snapping feedback when lines connect well (subtle glow). Red flicker when lines clash.

---

### 6.3 PUZZLE TYPE 3: Meter Match

**Concept**: Given a rhythmic pattern (shown visually as beats), select or arrange words to match the meter. Introduces the player to iambic pentameter, trochaic tetrameter, etc.

**Appears**: ~10% of puzzles. Milo's specialty.

```typescript
interface MeterMatchPuzzle {
  id: string;
  targetMeter: string;            // e.g., "0101010101" for iambic pentameter
  meterName: string;              // e.g., "Iambic Pentameter"
  lineCount: number;              // How many lines to fill
  
  // Per line
  lineSlots: {
    pattern: string;              // Stress pattern for this line: "01010"
    wordSlots: number;            // How many words fit
    providedWords?: string[];     // Some words may be pre-filled
  }[];
  
  wordBank: {
    word: string;
    stressPattern: string;        // e.g., "01" for "begin", "10" for "happy"
    syllables: number;
  }[];
  
  // Difficulty modifiers
  allowNearMiss: boolean;         // Accept slightly imperfect meter?
  showStressHints: boolean;       // Show stress marks on word bank?
}
```

**UI**: A musical-staff-like display where stressed syllables are represented as tall bars and unstressed as short bars. Words snap into the pattern. Visual + audio feedback (a drum pattern plays the target meter, and the player's arrangement plays alongside it).

---

### 6.4 PUZZLE TYPE 4: Rhyme Chain

**Concept**: Build a poem by chaining words that rhyme. Given a starting word, select the next word that rhymes, then a word that connects thematically, then another rhyme, creating an alternating chain of sound and meaning.

**Appears**: ~10% of puzzles. Progression from simple (AABB) to complex (ABAB, sonnet schemes).

```typescript
interface RhymeChainPuzzle {
  id: string;
  rhymeScheme: string;            // e.g., "ABAB CDCD EE" (Shakespearean sonnet)
  lineCount: number;
  
  // The player fills in end-words for each line
  lines: {
    lineNumber: number;
    rhymeGroup: string;           // 'A', 'B', 'C', etc.
    bodyText: string;             // The line with a blank at the end: "The stars above begin to ___"
    validEndWords: string[];      // Acceptable words that rhyme correctly
    bonusEndWords: string[];      // Extra-impressive choices
  }[];
  
  // Available end-words (more than needed, some are traps)
  wordBank: string[];
}
```

**UI**: The poem is displayed line by line. End positions are highlighted blanks. Rhyme groups are color-coded (all 'A' lines share a color). When a word is placed, a visual thread connects it to its rhyming partner.

---

### 6.5 PUZZLE TYPE 5: Erasure Poetry

**Concept**: Given a full page of prose text (a letter, a news article, a story excerpt), "erase" (black out) words to reveal a hidden poem within the text. This is based on the real art form of erasure/blackout poetry.

**Appears**: ~10% of puzzles. Introduced in Act 3. Wren's specialty.

```typescript
interface ErasurePuzzle {
  id: string;
  sourceText: string;             // The full prose text (200-500 words)
  sourceType: string;             // "letter", "news_article", "diary_entry", etc.
  
  // The words available to keep
  words: {
    position: number;             // Index in source text
    text: string;
    isKeepable: boolean;          // Can this word be part of the poem?
    tags: Record<string, number>; // Same tag system as Word Select
  }[];
  
  // Target poem properties
  targetWordCount: [number, number]; // [min, max] words to keep
  
  // Scoring is based on: coherence of remaining words, character preferences, creativity
}
```

**UI**: A full page of text rendered on parchment. Click/tap words to toggle them. Non-selected words get a black brush stroke over them (animated ink effect). The "surviving" poem is shown below in clean text. A satisfying ASMR-like brush sound plays on each erasure.

---

### 6.6 PUZZLE TYPE 6: Exquisite Corpse (Collaborative)

**Concept**: A call-and-response puzzle where the player writes one line, then a character writes the next (hidden from the player), then the player writes the next, etc. Named after the surrealist game.

**Appears**: ~5% of puzzles. Used in character hang-out events and Act 5 meta sequences.

```typescript
interface ExquisiteCorpsePuzzle {
  id: string;
  partner: string;                // Character ID
  lineCount: number;              // Total lines (alternating player/character)
  
  // Player lines use a constrained free-text system
  playerLineConstraints: {
    lineNumber: number;
    hint: string;                 // e.g., "Write a line about something you've lost"
    minWords: number;
    maxWords: number;
    requiredPartOfSpeech?: string; // e.g., "must start with a verb"
    previousCharacterLine: string; // What the character wrote (shown or hidden based on variant)
  }[];
  
  // Character responses are pre-written but selected based on player input
  characterResponses: {
    lineNumber: number;
    variants: {
      condition: string;          // e.g., "player_line_contains_nature_word"
      response: string;
    }[];
    default: string;
  }[];
  
  // Variant: "blind" (can't see partner's lines until end) or "chain" (can see previous line only)
  variant: 'blind' | 'chain';
}
```

**UI**: Split-screen with a curtain/fold in the middle. Player writes on their side, character writes on theirs. At the end, the curtain opens and the full poem is revealed with a dramatic unfolding animation. Often produces beautifully weird results.

---

### 6.7 PUZZLE TYPE 7: Freeform Composition

**Concept**: The player writes an actual poem using a text editor with real-time analysis and scoring. This is the most advanced puzzle type, unlocked in Act 4, and is the core mechanic of the endgame.

**Appears**: ~5% of main puzzles, but unlimited in Workshop mode. THE final puzzle of the game.

```typescript
interface FreeformPuzzle {
  id: string;
  theme: string;
  constraints: {
    minLines?: number;
    maxLines?: number;
    minWords?: number;
    maxWords?: number;
    requiredForm?: string;        // "sonnet", "haiku", "villanelle", "free_verse"
    mustIncludeWords?: string[];  // Specific words that must appear
    mustRhyme?: boolean;
    targetMeter?: string;
  };
  
  // Real-time analysis shown to player
  analysisDisplay: {
    showSyllableCount: boolean;
    showRhymeScheme: boolean;
    showMeterAnalysis: boolean;
    showSentiment: boolean;
    showCharacterReactions: boolean;  // Live-updating character face reactions
  };
}
```

**Scoring Engine for Freeform:**

```typescript
// engine/ScoringEngine.ts
interface FreeformScore {
  // Technical metrics
  syllableAccuracy: number;       // If form requires specific count
  rhymeAccuracy: number;          // If rhyme scheme required
  meterAccuracy: number;          // If meter required
  
  // Quality metrics (NLP-based)
  vocabularyRichness: number;     // Type-token ratio
  imageStrength: number;          // Concrete noun/sensory adjective density
  emotionalResonance: number;     // Sentiment variance (flat = boring)
  coherence: number;              // Topic consistency
  surprise: number;               // Unexpected word combinations
  musicality: number;             // Assonance, consonance, internal rhyme
  
  // Character-specific
  characterScores: Record<string, number>;
  
  // Overall
  overallGrade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
}

// Uses: compromise.js for NLP, syllable for counting, custom rhyme detection
```

**Utility Functions:**

```typescript
// utils/syllableCounter.ts
// Uses the 'syllable' npm package + custom dictionary overrides

// utils/rhymeDetector.ts
// Compares word endings using CMU Pronouncing Dictionary (bundled as JSON)
// Supports: perfect rhyme, slant rhyme, assonance, consonance

// utils/meterAnalyzer.ts
// Determines stress pattern of a line using:
// 1. CMU Pronouncing Dictionary stress markers
// 2. Rule-based fallback for unknown words
// Compares against target pattern, returns accuracy %

// utils/sentimentScorer.ts
// Word-level sentiment scoring using AFINN lexicon (bundled)
// Returns per-line and per-poem emotional arc

// utils/wordClassifier.ts
// Classifies words into the tag categories using a pre-built lookup table
// Falls back to compromise.js POS tagging + heuristic rules
```

---

## 7. Affinity, Romance & Relationship System

### 7.1 Affinity Tracking

```typescript
interface AffinityState {
  characters: {
    [characterId: string]: {
      affinity: number;            // 0-1000 points (friendship track)
      romance: number;             // 0-1000 points (romance track — separate!)
      level: number;               // 0-10 (derived from affinity thresholds)
      romanceLevel: number;        // 0-5 (derived from romance thresholds)
      milestones: string[];        // Unlocked story milestones
      romanceMilestones: string[]; // Unlocked romance milestones
      poemsShared: number;
      poemsLoved: number;          // Score >= 80
      poemsHated: number;          // Score <= 30
      currentMood: string;         // Affects dialogue variations
      conflictActive: boolean;     // In a disagreement arc
      routeStarted: boolean;
      routeCompleted: boolean;
      romanceConfessed: boolean;   // Has the player confessed?
      romanceAccepted: boolean;    // Did the character accept?
      romanceActive: boolean;      // Currently "dating"
      jealousyEvents: number;      // How many times other characters noticed
    };
  };
  
  // Relationship web (characters react to each other AND to the player's romances)
  tensions: {
    [pair: string]: number;        // e.g., "kai_milo": -30 (they clash)
  };
  
  // Romance state
  activeRomance: string | null;    // Character ID of current romantic partner (or null)
  flirtMode: boolean;              // Whether romance-track dialogue options appear
  heartbreaks: string[];           // Characters who were rejected or dumped (affects future dialogue)
}
```

> **TWO-TRACK SYSTEM**: Affinity and Romance are SEPARATE. You can be best friends with Luna (affinity 10) without romancing her. You can romance Kai (romance 5) while having medium friendship (affinity 6). This prevents the DDLC problem where "picking their words" is the ONLY mechanic — here, poems feed affinity, but romance requires deliberate flirting, date events, and romantic poem choices.

### 7.2 Affinity Levels & Unlocks (Friendship Track)

| Level | Points | Unlock |
|---|---|---|
| 0 | 0 | Default. Polite but distant. |
| 1 | 50 | Character greets you by name. Small talk unlocked. |
| 2 | 150 | Personal anecdote shared. First hang-out available. |
| 3 | 300 | Character shares a favorite poem. Hint system activated for this character. **🔓 Flirt option appears in dialogue choices.** |
| 4 | 500 | Backstory revelation. Deeper dialogue options. |
| 5 | 700 | Character's secret partially revealed. Route eligible. **🔓 First date event available.** |
| 6 | 900 | Character confides in player. Unique puzzle type unlocked. |
| 7 | 1100 | Character route midpoint. Exclusive scenes. **🔓 Confession event available (if romance ≥ 3).** |
| 8 | 1300 | Character's full secret revealed. Emotional climax. |
| 9 | 1500 | Character writes a poem FOR the player. **🔓 Love poem exchange (if dating).** |
| 10 | 1800 | Route completion. True ending eligible. Character's transformation. **🔓 Romantic ending available.** |

### 7.3 Romance Levels & Unlocks (Romance Track)

| Romance Level | Points | Unlock | How to Earn |
|---|---|---|---|
| 0 | 0 | No romantic interest. Normal friendship dialogue. | — |
| 1 | 100 | **Spark.** Subtle blush reactions. Character lingers after conversations. Occasional flustered dialogue. | Pick flirt options in dialogue. Write poems they love (3+ in a row). |
| 2 | 250 | **Crush.** Character finds excuses to be near you. Other characters tease you about it. First romantic CG available. | Go on first date. Write a dedicated romantic poem (special prompt). |
| 3 | 450 | **Tension.** Will-they-won't-they energy. Interrupted almost-confessions. Character gets jealous if you flirt with others. | Multiple dates. Defend them in conflicts. Write 2+ S-rank poems for them. |
| 4 | 700 | **Confession.** The confession event triggers (if affinity ≥ 7). Dramatic, character-specific confession scene with unique CG. If accepted → officially dating. | Trigger confession event. |
| 5 | 1000 | **Soulmate.** Deepest intimacy. Exclusive romantic scenes, pet names, physical affection in sprites (hand-holding, leaning on shoulder). Unique romantic ending unlocked. | Complete their character route while dating. Write the "Love Poem" (special freeform puzzle). |

### 7.4 The Dating Sim System

> **TONE REFERENCE**: DDLC's romance is deliberately surface-level because the horror subverts it. Our game's romance is GENUINE — these characters are real people (within the fiction) and the romantic arcs are earnest, emotionally rich, and character-specific. Think: Persona 5's confidant romances × DDLC's poem mechanic × Fire Emblem's support conversations.

#### 7.4.1 Flirting Mechanics

Once a character reaches **Affinity Level 3**, a **[♥]** icon appears next to certain dialogue choices, marking them as **flirt options**. These advance the romance track instead of (or in addition to) the friendship track.

```typescript
interface DialogueChoice {
  text: string;
  type: 'normal' | 'flirt' | 'friend' | 'tease' | 'deep';
  effects: {
    affinity?: number;           // Friendship points
    romance?: number;            // Romance points (only flirt/deep types)
    flags?: Record<string, any>;
  };
  // Flirt choices are visually distinct:
  // - Marked with a ♥ icon
  // - Text is slightly more intimate/bold than normal options
  // - Character reacts with a blush sprite + unique sound effect
  
  // IMPORTANT: Flirt choices are NEVER the "optimal" choice for affinity.
  // This creates a genuine tradeoff: the "smart" dialogue option gives +8 affinity,
  // but the flirt option gives +3 affinity and +10 romance.
  // Players must CHOOSE to pursue romance at the cost of friendship efficiency.
}
```

**Example dialogue with flirt option:**

```
SCENE: After Luna reads your poem (A-rank, dark/emotional)

Luna: "This poem... it's like you reached inside my chest and found 
       words for something I've never been able to name."

CHOICES:
  ▸ "That means a lot coming from you."           [+5 affinity]
  ▸ "I was thinking about you when I wrote it." ♥  [+3 affinity, +8 romance]
  ▸ "Which part resonated with you most?"          [+4 affinity, unlocks poem discussion]

If player picks the ♥ option:
  Luna: *expression changes to 'blushing'*
  Luna: "You— I..." 
  Luna: *looks away*
  Luna: "...you can't just SAY things like that."
  [sfx: heartbeat_subtle.ogg]
  [Romance +8, small heart particle effect around Luna's sprite]
```

#### 7.4.2 Date Events

Dates are special hang-out events that only appear when **Affinity ≥ 5 AND Romance ≥ 1**. Each character has **5 unique dates** that progress from casual to intimate. Dates always include a **special poem puzzle** themed around the date.

```typescript
interface DateEvent {
  id: string;
  character: string;
  dateNumber: number;            // 1-5 (sequential)
  title: string;
  location: string;              // Background to use
  requirements: {
    minAffinity: number;
    minRomance: number;
    completedDates: number;      // Must complete previous dates first
  };
  
  // Structure
  phases: {
    arrival: DialogueScene;      // Meet up, initial banter
    activity: DialogueScene;     // The "date activity" — unique per character
    poemMoment: PuzzleConfig;    // A special romantic poem puzzle
    aftermath: DialogueScene;    // Post-poem emotional beat
    farewell: DialogueScene;     // Goodbye — escalates with each date
  };
  
  // Physical intimacy escalation (tasteful, T-rated)
  farewellType: 'wave' | 'lingering_look' | 'hand_brush' | 'hand_hold' | 'almost_kiss' | 'cheek_kiss';
  
  // Rewards
  rewards: {
    romancePoints: number;       // 30-80 per date
    exclusiveCG: string;         // Each date has a unique CG illustration
    exclusiveWords: string[];    // 5-10 romantic words unlocked per date
    characterInsight: string;    // Lore/backstory revealed during the date
  };
}
```

**Character Date Progressions:**

| Character | Date 1 | Date 2 | Date 3 | Date 4 | Date 5 |
|---|---|---|---|---|---|
| **Luna/Lucius** | Midnight walk through the campus gardens. {{char.pronoun.subject|cap}} reads you {{char.pronoun.possessive}} mother's poems under the stars. | Rainy day in the old bookstore. You help {{char.pronoun.object}} find a rare poetry collection. Thunder outside. | {{char.pronoun.possessive|cap}} favorite spot: a cliffside overlooking the city at sunset. Almost tells you about {{char.pronoun.possessive}} mother. | {{char.pronoun.possessive|cap}} house. Shows you {{char.pronoun.possessive}} mother's journal. The most vulnerable {{char.pronoun.subject}}'s ever been. | The rooftop garden at night. Reads you the poem {{char.pronoun.subject}} wrote FOR you. The one {{char.pronoun.subject}}'s been hiding. |
| **Kai** | Guerrilla art installation at night. You help {{char.pronoun.object}} paste poetry on downtown walls. | Underground poetry slam at a dive bar. {{char.pronoun.subject|cap}} performs — terrified. | Art museum after hours ({{char.pronoun.subject}} has a key somehow). You wander in silence. | {{char.pronoun.possessive|cap}} studio apartment. Every wall is covered in art. Shows you the sincere poems. | Takes you to the school where {{char.pronoun.subject}} was expelled. Closure. |
| **Rowan** | Farmer's market at dawn. {{char.pronoun.subject|cap}} names every plant. You carry the bags. | Hiking trail to a hidden waterfall. Teaches you to listen to the forest. | Birdwatching at the lake. Tells you about {{char.pronoun.possessive}} hearing. First time {{char.pronoun.subject}}'s told anyone. | {{char.pronoun.possessive|cap}} family's farm. You meet the animals. {{char.pronoun.subject|cap}} plays guitar on the porch. | A silent date. No words. Just existing together in nature. The poem is about the beauty of silence. |
| **Sable/Sabel** | Open mic night at a café. Coaches you through performing a poem on stage. | Protest march for arts funding. {{char.pronoun.subject|cap}}'s electric. You hold the banner together. | Dance studio after hours. Teaches you to move to rhythm. Poetry is physical. | {{char.pronoun.possessive|cap}} apartment. Sick before a big performance. You see the real {{char.pronoun.object}} — nervous, scared. | Performs a poem about you. On a real stage. In front of everyone. |
| **Mila/Milo** | Library deep-dive. Shows you the oldest book in the collection. First editions. | Classical concert. Explains the structure of symphonies — "It's like a sonnet." | {{char.pronoun.possessive|cap}} study. Teaches you to write a formal sonnet. Exacting, intimate, intense. | Fencing tournament ({{char.pronoun.subject}} fences). You watch. A different person — fierce, alive. | The society's archive room. Reads you the first poem ever submitted to the club. It's {{char.pronoun.possessive}}. From when {{char.pronoun.subject}} was 14. |
| **Wren** | Art supply store + painting in the park. They paint you. | Planetarium. Narrates a story about the constellations (it's not the real one). | Their dreamscape — a sequence where you enter one of Wren's daydreams together. | Abandoned greenhouse they've been secretly restoring. Full of impossible flowers. | Shows you their real sketchbook — the one with you in it. Every page. |

#### 7.4.3 Romantic Poems (Special Puzzle Type)

During dates and at key romance milestones, the player writes **romantic poems** — these use the standard puzzle systems but with special constraints and higher stakes.

```typescript
interface RomanticPoemPuzzle {
  type: 'word_select' | 'freeform';     // Usually word_select, freeform at confession/climax
  theme: string;                          // e.g., "what they mean to you", "a memory together"
  
  // ROMANTIC WORD POOL — special words only available in romantic contexts
  romanticWordPool: {
    universal: string[];    // Words that work for any character: "heartbeat", "yours", "forever"
    characterSpecific: {
      // Words ONLY available when writing for this character:
      luna: ["moonlit", "echo", "haunt", "devotion", "eternity", "trembling"],
      kai: ["electric", "collision", "unscripted", "dare", "rewrite", "us"],
      rowan: ["sunrise", "roots", "gentle", "shelter", "birdsong", "home"],
      sable: ["blazing", "fearless", "rhythm", "crescendo", "unbreakable", "stage"],
      milo: ["precise", "cathedral", "measured", "constant", "cornerstone", "vow"],
      wren: ["dream", "color", "impossible", "wonder", "bloom", "kaleidoscope"],
    };
  };
  
  // Scoring is STRICTER for romantic poems:
  // - The target character's reaction is amplified (great poem = huge romance boost, bad poem = oof)
  // - Other characters' opinions don't matter here — it's private
  // - BUT: if you write a romantic poem that accidentally appeals to a DIFFERENT character,
  //   that character notices, and it creates a jealousy event
  
  scoring: {
    perfectRomantic: { romance: +40, affinity: +10, cg_unlock: true };
    goodRomantic:    { romance: +25, affinity: +5 };
    okayRomantic:    { romance: +10, affinity: +2 };
    badRomantic:     { romance: -5, affinity: +3 };  // They appreciate the effort
    terribleRomantic: { romance: -15, affinity: -5, awkward_scene: true };
  };
}
```

#### 7.4.4 The Confession System

When **Affinity ≥ 7 AND Romance ≥ 3**, a **confession event** becomes available. This is a major story moment with a unique scene per character.

```typescript
interface ConfessionEvent {
  character: string;
  trigger: 'player_initiated' | 'character_initiated';
  // At Romance 3: player can confess via a special dialogue option
  // At Romance 4: if player hasn't confessed, the CHARACTER confesses to THEM
  
  structure: {
    buildup: DialogueScene;        // The moment leading up to it
    confessionPoem: PuzzleConfig;  // Player writes a CONFESSION POEM (freeform, 4-8 lines)
    // This is the most important poem in the character's route.
    // The poem is scored, and the score determines the confession outcome.
    
    outcomes: {
      perfect: {    // Score ≥ 85
        scene: 'mutual_confession';
        cg: 'confession_cg_perfect';     // Unique CG — both characters emotional
        dialogue: 'Character confesses back with their own poem';
        result: 'romance_active = true, romanceLevel = 4';
      };
      good: {       // Score 60-84
        scene: 'sweet_acceptance';
        cg: 'confession_cg_good';
        dialogue: 'Character is flustered but happy, accepts with a smile';
        result: 'romance_active = true, romanceLevel = 4';
      };
      awkward: {    // Score 40-59
        scene: 'awkward_acceptance';
        cg: 'confession_cg_awkward';
        dialogue: 'Character says yes but it\'s bumpy — a real, imperfect moment';
        result: 'romance_active = true, romanceLevel = 3 (slower ramp)';
      };
      rejected: {   // Score < 40 OR specific anti-flags set
        scene: 'gentle_rejection';
        cg: 'confession_cg_rejected';
        dialogue: 'Character cares about you but isn\'t ready. NOT a dead end.';
        result: 'Can retry after 3+ more chapters if romance rebuilt to 3';
        // IMPORTANT: Rejection is NOT permanent. This isn't a punishment.
        // The character explains what they need (ties into their backstory/fear).
        // "I need to know you see ME, not just who you want me to be."
      };
    };
  };
}
```

**Character-Specific Confession Styles:**

| Character | How They Confess (if player waits) | What They Need to Hear | Confession Location |
|---|---|---|---|
| **Luna/Lucius** | Leaves a poem in your bag. It's devastating. Runs when you find {{char.pronoun.object}}. | That you love {{char.pronoun.possessive}} darkness, not despite it. That {{char.pronoun.possessive}} voice is {{char.pronoun.possessive}} own. | The rooftop garden, under the moon. |
| **Kai** | Graffitis a poem on your locker. Plays it off as a joke. Clearly terrified. | That you see past the performance. That being sincere isn't being weak. | The alley behind the art school where they were expelled. |
| **Rowan** | Takes your hand during a walk. Says nothing for a long time. Then: one perfect sentence. | That you'll stay even when things get quiet. That silence with {{char.pronoun.object}} is enough. | The hidden waterfall from Date 2. |
| **Sable/Sabel** | Performs a poem about you at the school talent show. In front of EVERYONE. | That {{char.pronoun.possessive}} voice matters even when no one's listening. That you'll be in the front row always. | Backstage, right after the performance. {{char.pronoun.subject|cap}}'s shaking. |
| **Mila/Milo** | Writes you a formal love letter. In iambic pentameter. Hand-delivered with a fountain pen. | That structure and passion aren't opposites. That {{char.pronoun.possessive}} control is beautiful, not cold. | The library, after hours, in the poetry section. |
| **Wren** | Gives you a painting of a dream they had about you. It's surreal and beautiful and scary. | That you won't try to "fix" them. That their world is worth visiting. | The abandoned greenhouse, full of impossible flowers. |

#### 7.4.5 Jealousy & Poly-Route Handling

The game does NOT support simultaneous romances. This is a deliberate design choice that creates meaningful stakes.

```typescript
// JEALOUSY SYSTEM
// If the player has an active romance AND flirts with someone else:

interface JealousyEvent {
  // Severity levels:
  mild: {
    trigger: 'Picked 1 flirt option with another character while dating',
    effect: 'Partner\'s chibi frowns during next puzzle. Subtle.',
    affinityChange: 0,
    romanceChange: -5,
  };
  moderate: {
    trigger: 'Picked 3+ flirt options with same other character, OR went on a date',
    effect: 'Partner confronts you in a private scene. Dialogue choice determines outcome.',
    affinityChange: -10,
    romanceChange: -20,
    dialogue: 'Character: "I saw you with [name] today. Am I... not enough?"',
    // This scene is CHARACTER-SPECIFIC and gut-wrenching.
    // It ties into their deepest insecurity (their "fear" from the character profile).
  };
  severe: {
    trigger: 'Confessed to another character while in an active romance',
    effect: 'BREAKUP EVENT. Partner finds out. Devastating scene.',
    result: 'Romance ended. Partner\'s affinity drops to level 5. Heartbreak dialogue.',
    // BUT: The breakup content is some of the best writing in the game.
    // Luna/Lucius writes you a furious, beautiful poem. Kai destroys art in their studio.
    // Rowan goes quiet for 2 chapters. Sable/Sabel performs a poem about betrayal.
    // Mila/Milo writes a formal letter of dissolution. Wren paints over every sketch of you.
    // The game does NOT punish you by locking content — it gives you DIFFERENT content.
    
    // RECOVERY: After 5+ chapters, the ex-partner can be re-befriended (not re-romanced).
    // The friendship that forms after a breakup is actually deeper than the original.
  };
}

// IMPORTANT: The game DOES allow pursuing different characters across playthroughs.
// In NG+, characters have vague memories: "I feel like we've been... closer. In another life?"
// Completing all 6 romance routes across multiple playthroughs unlocks a special achievement
// and The Muse has unique dialogue: "You've loved them all. In every timeline. How very... authorial."
```

#### 7.4.6 Romance-Specific Sprites & CGs

```typescript
// Each romanceable character needs additional romantic assets:

interface RomanticAssets {
  // ADDITIONAL EXPRESSIONS (beyond the base 10):
  additionalExpressions: [
    'blushing',           // Flustered, looking away
    'love_eyes',          // Soft, adoring look (direct at camera/player)
    'jealous',            // Hurt + anger mix
    'flustered_smile',    // Caught off guard by something sweet
    'intimate',           // Close-up, vulnerable, soft lighting
    'heartbroken',        // For breakup scenes
  ];
  
  // ROMANTIC CGs (full illustration scenes):
  romanticCGs: {
    perCharacter: [
      'first_blush',            // First romantic moment (Date 1)
      'hand_hold',              // First physical contact
      'almost_kiss',            // The tension moment
      'confession_scene',       // The confession (3 variants: perfect/good/awkward)
      'together',               // Post-confession "couple" CG
      'love_poem_exchange',     // They read your love poem
      'character_specific_1',   // Unique to their route (e.g., Luna under moonlight)
      'character_specific_2',   // Unique to their route (e.g., Kai's studio reveal)
      'romantic_ending',        // Their romantic ending CG
    ];
    total: '9 CGs × 6 characters = 54 romantic CGs';
  };
  
  // COUPLE SPRITES (shown during Act 6+ if dating):
  coupleSprites: {
    // Modified versions of the character's normal pose where they stand closer,
    // lean toward the player's side of the screen, or have subtle "comfortable" posture changes
    casual_closeness: true;
    hand_on_arm: true;       // For emotionally heavy scenes
    side_by_side: true;       // Walking together in backgrounds
  };
}
```

#### 7.4.7 How Romance Affects the Poetry Game

This is where the dating sim and the puzzle game merge — your romantic relationship CHANGES the gameplay.

```typescript
const ROMANCE_GAMEPLAY_EFFECTS = {
  // 1. ROMANTIC WORD POOL
  // When dating a character, 20-30 exclusive romantic words become available
  // in ALL puzzles (not just romantic poem events).
  // These words are high-scoring for your partner but TERRIBLE for everyone else.
  // Example: If dating Luna, the word "ours" appears in word pools.
  //   Luna: 3 points. Everyone else: 0 points. 
  //   This creates an ongoing micro-choice: "Do I write for my partner or for the puzzle?"
  
  // 2. PARTNER BONUS
  // When writing a poem your partner loves (A+ rank for them),
  // they give you a "partner bonus": a free hint on the next puzzle.
  // This manifests as your partner whispering which words they think are interesting.
  partnerHint: {
    trigger: 'A or S rank on a poem for your partner',
    effect: '3 words in the next puzzle are pre-highlighted as "interesting"',
    flavor: 'Luna whispers: "Try \'ephemeral\' — it makes me think of us."',
  },
  
  // 3. LOVE POEM DUEL (Act 6 exclusive)
  // If dating a character during Act 6, you and your partner write poems
  // SIMULTANEOUSLY (Exquisite Corpse variant). Their lines reference your relationship.
  // The combined poem is scored as a unit — your compatibility is literally quantified.
  
  // 4. JEALOUSY PUZZLE MODIFIER
  // If another character is jealous (you flirted while dating),
  // that character's scoring becomes HARSHER on your next poem.
  // They're harder to please. Their chibi actively sulks during word selection.
  
  // 5. BREAKUP PENALTY
  // After a breakup, for the next 3 chapters:
  //   - Your ex's words disappear from word pools (they "took their words back")
  //   - Other characters' romantic words are greyed out (you're grieving)
  //   - The Muse gains awareness (+0.1) — it feeds on emotional turmoil
  //   - New "heartbreak" words appear: "regret", "hollow", "used-to-be"
  //   These words are actually VERY high-scoring for Luna and Kai (dark/complex emotions)
};
```

### 7.5 Affinity Change Sources

| Source | Affinity Δ | Romance Δ | Notes |
|---|---|---|---|
| Poem score (primary character) | -3 to +15 | 0 | Poems don't directly affect romance unless romantic prompt |
| Romantic poem (special event) | +3 to +10 | +10 to +40 | Date events and confession poems |
| Dialogue choices (normal) | -5 to +8 | 0 | Standard VN choices |
| Dialogue choices (♥ flirt) | +1 to +5 | +5 to +12 | Requires Affinity ≥ 3 to appear |
| Hang-out events | +5 to +12 | 0 | Friendship-only events |
| Date events | +5 to +8 | +15 to +30 | Requires Affinity ≥ 5 AND Romance ≥ 1 |
| Defending a character in conflict | +10 | +5 (if dating) | Special story moments |
| Siding against a character | -15 | -10 (if dating) | Permanent consequence |
| Writing preferred style (streak) | +2/poem | 0 | Tracked over 3+ poems |
| Gift giving (unlocked Act 3) | +3 to +8 | +3 to +8 | Character-specific gifts from the town |
| Jealousy event (mild) | 0 | -5 | Flirted with someone while dating |
| Jealousy event (severe) | -10 | -20 to -100 | Breakup territory |

---

## 7.5 Game Feel, Difficulty, Balance & Replayability

> **DESIGN PHILOSOPHY**: This section is the soul of the game. Read it before implementing ANY gameplay system. Every mechanic described in Sections 5-7 should be filtered through these principles. Reference games are cited with specific numbers.

### 7.5.1 Core Design Pillars — What Makes This Fun

**Pillar 1: "Your poem, your way" — Creative Ownership**
The player should feel like they AUTHORED something, not that they solved a math problem. DDLC's poem game, by contrast, is a pure optimization puzzle — players quickly learn "pick Yuri words for Yuri." Our game must go deeper: multiple valid strategies, genuine creative expression, and poems that actually read differently based on your choices.

**Pillar 2: "One more poem" — The Loop That Hooks**
Borrowed from Hades' "one more run" loop. The cycle of: write poem → see reactions → earn rewards → unlock new words/story → write better poem must feel so tight that closing the game feels wrong. Target session length: **20-40 minutes** per chapter (same as a Hades run).

**Pillar 3: "Failure is a poem too" — No Dead Ends**
Stolen directly from Hades: dying IS progress. In our game, a BAD poem is still a poem. Characters react to terrible poems with unique, memorable dialogue. Getting a D-rank unlocks "pity scenes" that are some of the funniest/most touching content in the game. Players who try to min-max will MISS content that bad-poem players see.

**Pillar 4: "I didn't know I could do that" — Discovery Depth**
Like Slay the Spire's card synergies or Baba Is You's rule combinations, the word system should have hidden depths. Players at hour 5 should still be discovering new interactions at hour 50. Word combos, secret categories, character-specific reactions to specific word pairs.

---

### 7.5.2 "Juice" — Making Every Click Feel Good

> DDLC's poem game is mechanically thin — click word, chibi jumps, repeat. That works for a 4-hour game where the poem minigame is a vehicle for the horror plot. For a 100+ hour game where the poem IS the game, every single interaction must feel incredible.

**Word Selection Juice (WordSelect puzzle):**

```typescript
// REQUIRED feedback for EVERY word click:
interface WordClickFeedback {
  // VISUAL (all happen within 200ms of click)
  tileAnimation: 'satisfying_pop';        // Tile scales up 110% → snaps to selected area
  tileColor: 'shifts_to_character_color';  // Fades toward highest-affinity character's color
  inkSplash: true;                         // Tiny ink particle burst (3-5 particles) from click point
  characterReaction: 'chibi_bounce';       // DDLC-style: highest-affinity character's chibi bounces
  selectedCounter: 'tick_up_animation';    // "3/14 selected" counter does a satisfying +1 flip
  
  // AUDIO (layered, not sequential)
  clickSound: 'pitched_pop';              // Base click — pitch varies by word length (short=high, long=low)
  musicalNote: true;                       // Each word adds a note to a building chord progression
  characterChime: 'subtle_character_sfx';  // Tiny character-specific sound when their chibi bounces
  
  // FEEL
  screenShake: { intensity: 0.5, duration: 50 };  // Barely perceptible micro-shake
  hapticFeedback: 'light_tap';            // Mobile only
  
  // PROGRESSIVE — gets more intense as you approach word count
  intensityScaling: {
    at50percent: 'particles_increase';
    at80percent: 'music_builds';
    atFinalWord: 'dramatic_flourish';     // Last word = big satisfying THUD + all chibis react
  };
}
```

**Poem Completion Juice:**

```typescript
interface PoemCompletionFeedback {
  // The moment you hit "Submit" should feel like dropping a mic
  transition: 'page_turn_3d';             // 3D paper flip animation (800ms)
  poemDisplay: 'typewriter_reveal';       // Words appear one by one with typewriter sound
  gradeReveal: {
    delay: 1500,                          // Build suspense
    animation: 'stamp_slam',             // Letter grade SLAMS onto the page like a rubber stamp
    screenShake: { S: 8, A: 5, B: 3, C: 2, D: 1, F: 0 },
    sound: { S: 'triumphant_fanfare', A: 'bright_chime', B: 'pleasant_ding', 
             C: 'neutral_tone', D: 'deflating_whomp', F: 'sad_trombone' },
    particles: { S: 'golden_explosion_100', A: 'sparkle_burst_50', B: 'confetti_20' },
  };
  characterReactions: 'sequential_reveal';  // Each character's face appears one by one, showing their reaction
  affinityBarAnimation: true;               // Bars visibly fill/drain with satisfying liquid-fill animation
}
```

**The Musical Word System (unique to our game):**
Every word has an associated musical note. As you select words, a melody builds. Good word combinations (high flow scores) produce harmonious chords. Clashing words produce dissonance. By the time you've selected all words, you've composed both a poem AND a tiny musical phrase. This is subtle but incredibly satisfying — players will subconsciously learn to "hear" good poems.

```typescript
interface WordMusic {
  // Each word maps to a note based on its emotional valence
  note: number;           // MIDI note (60-84 range, 2 octaves)
  octave: number;         // Based on word intensity
  instrument: string;     // Based on word category: 'piano' | 'strings' | 'bell' | 'synth'
  duration: number;       // Based on syllable count
  
  // Rules for harmony:
  // - Words from the same category → consonant interval (3rd, 5th)
  // - Words from opposed categories → dissonant interval (2nd, tritone)
  // - Selecting a word that rhymes with a previous word → octave (very satisfying)
}
```

---

### 7.5.3 Difficulty System — "Poetic License" (Inspired by Hades' Heat System)

Instead of simple Easy/Medium/Hard, the game uses a **modular difficulty system** called **Poetic License** — a set of toggleable modifiers the player unlocks as they progress. This is directly inspired by Hades' Pact of Punishment / Heat system.

**Poetic License is unlocked after completing Act 2** (so the player has learned all basic mechanics).

```typescript
interface PoeticLicense {
  // Each modifier has a "License Level" (1-5) like Hades' Heat
  modifiers: {
    
    // WORD POOL MODIFIERS
    thinnerPool: {
      name: "Slim Pickings",
      description: "Fewer words in the pool",
      levels: [
        { level: 1, effect: "Pool size -10%", licensePoints: 1 },
        { level: 2, effect: "Pool size -20%", licensePoints: 2 },
        { level: 3, effect: "Pool size -35%", licensePoints: 3 },
      ]
    },
    noHints: {
      name: "Blind Composition",
      description: "Character chibis don't react to word hovers",
      levels: [
        { level: 1, effect: "Reactions delayed 2s", licensePoints: 1 },
        { level: 2, effect: "No hover reactions at all", licensePoints: 3 },
      ]
    },
    poisonWords: {
      name: "Critic's Curse",
      description: "Some words look positive but tank your score",
      levels: [
        { level: 1, effect: "5 trap words added to pool", licensePoints: 1 },
        { level: 2, effect: "10 trap words, they look normal", licensePoints: 2 },
        { level: 3, effect: "15 trap words, some mimic good words", licensePoints: 4 },
      ]
    },
    
    // SCORING MODIFIERS
    harsherGrading: {
      name: "The Professor's Red Pen",
      description: "Higher score thresholds for each grade",
      levels: [
        { level: 1, effect: "Grade thresholds +10%", licensePoints: 1 },
        { level: 2, effect: "Grade thresholds +20%", licensePoints: 2 },
        { level: 3, effect: "Grade thresholds +35%", licensePoints: 4 },
      ]
    },
    rivalPoet: {
      name: "Rival Poet",
      description: "An NPC poet competes — you must outscore them",
      levels: [
        { level: 1, effect: "Rival scores 50th percentile", licensePoints: 2 },
        { level: 2, effect: "Rival scores 75th percentile", licensePoints: 3 },
        { level: 3, effect: "Rival scores 90th percentile", licensePoints: 5 },
      ]
    },
    
    // TIME MODIFIERS
    timedWriting: {
      name: "Ticking Clock",
      description: "A timer counts down during word selection",
      levels: [
        { level: 1, effect: "90 second timer", licensePoints: 1 },
        { level: 2, effect: "60 second timer", licensePoints: 2 },
        { level: 3, effect: "30 second timer", licensePoints: 4 },
      ]
    },
    
    // CHARACTER MODIFIERS
    fickleMoods: {
      name: "Mercury Moods",
      description: "Character preferences shift slightly each puzzle",
      levels: [
        { level: 1, effect: "±10% preference variance", licensePoints: 2 },
        { level: 2, effect: "±25% preference variance", licensePoints: 3 },
        { level: 3, effect: "Preferences fully randomized", licensePoints: 5 },
      ]
    },
    
    // META MODIFIERS (unlocked Act 5+)
    theMuseWatches: {
      name: "The Muse Watches",
      description: "The Muse interferes with your word pool",
      levels: [
        { level: 1, effect: "1 word per pool is glitched/corrupted", licensePoints: 2 },
        { level: 2, effect: "3 words glitched + UI flickers", licensePoints: 3 },
        { level: 3, effect: "5 words glitched + words shuffle mid-selection", licensePoints: 5 },
      ]
    },
  };
  
  // Total License Points affect rewards
  // 0 points:  Normal rewards
  // 5+ points: +25% affinity gains, exclusive dialogue
  // 10+ points: +50% affinity, rare word unlocks
  // 15+ points: +100% affinity, secret poems reveal faster
  // 20+ points: Challenge Tower floors unlock alternate paths
  // 25+ points: Unique "Poet Laureate" ending variation
}
```

**Assist Mode (Celeste-inspired — for accessibility):**

```typescript
interface AssistMode {
  // Celeste proved that making games accessible doesn't diminish them.
  // These options are available from the start, no stigma, no locked content.
  
  wordHighlights: boolean;         // Color-code words by character preference
  extendedTime: boolean;           // No timer, ever
  fewerWords: boolean;             // Smaller pools (less overwhelming)
  showScorePreview: boolean;       // Live score counter while selecting
  skipPuzzleOption: boolean;       // Skip any puzzle (get a C grade, story continues)
  gentlerGrading: boolean;         // Lower thresholds for each grade
  characterHintAlways: boolean;    // Always show chibi reactions, even on hard puzzles
  
  // CRITICAL: Assist mode never blocks ANY content.
  // All endings, all routes, all achievements are reachable with assist mode ON.
  // The game says: "These options don't affect achievements. Enjoy the story your way."
}
```

---

### 7.5.4 Balance Numbers — Specific Targets (Referenced from DDLC, Hades, Slay the Spire)

#### DDLC Poem System Analysis → Our Calibration

DDLC uses: 20 words selected from 10-word random draws, each word awards 1-3 points per character. A "love" word gives 3 points, "like" gives 2, "dislike" gives 1. To get a character to love your poem you need 45+ points (basically 13+ love words out of 20). To get them to dislike it, you need under 29 points.

**Our system calibrated against this:**

```typescript
// SCORING THRESHOLDS (per-character, per-poem)
const GRADE_THRESHOLDS = {
  S: 90,   // Exceptional — requires deep knowledge of character + word combos
  A: 75,   // Great — clearly wrote for this character
  B: 55,   // Good — they liked it
  C: 40,   // Okay — polite smile, not impressed
  D: 25,   // Bad — they're a bit put off
  F: 0,    // Terrible — actively disliked (but triggers unique dialogue!)
};

// AFFINITY GAINS PER GRADE (primary target character)
const AFFINITY_GAINS = {
  S: { primary: +15, others: +3 },    // S-rank: big reward + slight boost to everyone
  A: { primary: +10, others: +2 },
  B: { primary: +6,  others: +1 },
  C: { primary: +2,  others: 0 },
  D: { primary: -2,  others: 0 },     // Small penalty — not devastating
  F: { primary: -5,  others: +1 },    // Others feel bad for you (slight pity boost!)
};

// KEY BALANCE INSIGHT FROM DDLC:
// In DDLC, it's trivially easy to max one character — just pick their words.
// In OUR game, the tension is: words that ONE character loves often CLASH with another.
// Example: "algorithm" (Kai loves, Milo loves, Luna HATES, Rowan HATES)
// This creates genuine decision-making, not just "pick the obvious words."

// WORD POINT DISTRIBUTION (per word, per character):
// Each word awards 0-3 points per character (matching DDLC's system):
//   3 = Love (word is in their loved categories + high matching tags)
//   2 = Like (moderate match)
//   1 = Neutral (slight positive or irrelevant)
//   0 = Dislike (word is in their hated categories)
//  -1 = Hate (EXTENSION beyond DDLC — some words actively REPEL a character)

// CONFLICT RATIO TARGET:
// For any given word pool, aim for:
//   30% of words clearly favor ONE character (the "easy picks")
//   40% of words have mixed signals (2 characters like, 1 hates)  
//   20% of words are neutral (no strong reaction from anyone)
//   10% of words are traps (look appealing but have hidden penalties)
// This ratio ensures every poem involves TRADEOFFS, not just obvious picks.
```

#### Hades Progression Curve → Our Calibration

Hades players typically: clear the game in 20-30 runs (~15-25 hours). Each run is ~30 min. Players feel "stuck" if they go 5+ runs without visible progress.

**Our progression pacing:**

```typescript
// CHAPTER PACING
const PACING = {
  // Player should earn AT LEAST one of these per chapter:
  guaranteed_per_chapter: [
    'new_affinity_milestone',       // Some character levels up or hits a new tier
    'new_word_unlock',              // 10-30 new words added to pool
    'story_revelation',             // Something happens in the plot
    'new_mechanic_or_modifier',     // New puzzle variant, new Poetic License modifier
  ],
  
  // NEVER go more than 2 chapters without:
  max_drought: {
    new_puzzle_type: 5,             // Chapters between new puzzle introductions
    character_scene: 2,             // Chapters between character-focused moments
    grade_s_achievable: 3,          // If player hasn't S-ranked in 3 chapters, secretly lower thresholds by 5%
    comic_relief: 2,               // Chapters between genuinely funny moments
  },
  
  // ANTI-FRUSTRATION (inspired by Hades' "God Mode"):
  // If a player gets D or F rank 3 times in a row:
  //   → Next puzzle's word pool is secretly rebalanced (+15% love words for their preferred character)
  //   → A character offers an in-fiction "hint" about what they like
  //   → This is invisible — the player never knows difficulty was adjusted
  dynamic_difficulty: {
    loss_streak_threshold: 3,
    adjustment: 'add_15percent_love_words',
    win_streak_threshold: 5,
    hard_adjustment: 'add_5percent_trap_words',  // Subtle — keeps skilled players challenged
  },
};
```

#### Slay the Spire Synergy Depth → Our Word Combo System

Slay the Spire's magic is card COMBOS — individual cards are fine, but certain pairs are explosive. We need this for words.

```typescript
// WORD COMBOS — hidden synergies between specific words
// These are SECRET and not documented in-game. Players discover them naturally.
// Discovering a combo gives a one-time notification: "Combo discovered: [name]!"

const WORD_COMBOS = {
  // THEMATIC COMBOS (2 words that mean more together)
  oxymorons: {
    pairs: [
      ['silence', 'thunder'],
      ['shadow', 'light'],
      ['bitter', 'sweet'],
      ['fire', 'ice'],
      ['chaos', 'order'],
    ],
    bonus: '+8 points to Kai (loves contradictions), +5 to all others',
    notification: "⚡ Oxymoron discovered!",
  },
  
  sensoryChain: {
    trigger: '3+ words from different senses (sight + sound + touch)',
    examples: [['crimson', 'whisper', 'velvet'], ['golden', 'silence', 'rough']],
    bonus: '+10 to Rowan (concrete imagery), +5 to Sable (powerful language)',
    notification: "🎨 Sensory chain!",
  },
  
  meterCombo: {
    trigger: 'Selected words form a complete iambic line when read in order',
    bonus: '+12 to Milo (formalist heaven)',
    notification: "🎵 Perfect meter!",
  },
  
  rhymeCluster: {
    trigger: '3+ selected words share a rhyme group',
    bonus: '+8 to Milo, +5 to Luna',
    notification: "🔔 Rhyme cluster!",
  },
  
  surrealistLeap: {
    trigger: '2 words from COMPLETELY unrelated categories placed adjacent',
    examples: [['algorithm', 'butterfly'], ['invoice', 'moonlight']],
    bonus: '+10 to Wren, +8 to Kai',
    notification: "🌀 Surrealist leap!",
  },
  
  emotionalArc: {
    trigger: 'Words arranged from low-intensity → high-intensity (or reverse)',
    bonus: '+8 to Luna (emotional arc), +5 to Sable (dramatic build)',
    notification: "📈 Emotional crescendo!",
  },
  
  // SECRET COMBOS — these are Easter eggs
  ddlcReference: {
    words: ['doki', 'literature', 'club'],
    bonus: 'Secret achievement unlocked. Kai says: "Really? A reference? In MY poetry game?"',
  },
  
  theMuseAwakens: {
    trigger: 'Use 5+ words that appeared in your very first poem',
    bonus: 'The Muse\'s awareness increases. Glitch text appears briefly.',
    effect: 'meta_engine.increaseAwareness(0.05)',
  },
};

// COMBO DISCOVERY PROGRESSION:
// Players should discover their first combo naturally by chapter 3-4
// By Act 3, an observant player finds ~5 combos
// Completionists find all ~30 combos over the full game
// The combo log is in the Poem Journal (shows discovered ones, hints for undiscovered)
```

---

### 7.5.5 Replayability Systems

#### A. New Game+ ("Second Draft")

Unlocked after any ending. The entire game replays with these changes:

```typescript
interface NewGamePlus {
  // CARRY OVER (Hades-style permanent progression):
  keepWordDatabase: true;         // All unlocked words carry over
  keepComboLog: true;             // All discovered combos carry over
  keepAchievements: true;
  keepPoemJournal: true;          // All poems ever written, viewable
  keepPoeticLicense: true;        // All difficulty modifiers unlocked
  
  // RESET:
  resetAffinity: true;            // Start fresh with characters
  resetStory: true;               // Story restarts from Chapter 1
  
  // NEW CONTENT IN NG+:
  newDialogue: {
    amount: '~15% of all dialogue has NG+ variants',
    style: 'Characters have deja-vu moments, reference "last time"',
    example: 'Luna: "Have we... done this before? I feel like I\'ve read this poem in a dream."',
  };
  
  newPuzzles: {
    amount: '10 exclusive NG+ puzzles replace easier Act 1-2 puzzles',
    style: 'Harder variants that assume you know the mechanics',
  };
  
  musePresence: {
    startsEarlier: true,          // The Muse appears from Chapter 1 (Act 5 in first run)
    awareness: 'carries_over',    // Muse remembers your first playthrough
    newDialogue: 'extensive',     // The Muse has 50+ new lines in NG+ about "doing this again"
  };
  
  alternateEndings: {
    newEndingsAvailable: 2,       // Endings 11 and 12 require NG+
    endingRequirements: 'Must have seen at least 3 endings in previous runs',
  };
}
```

#### B. Daily Challenge System (Infinite Replayability)

```typescript
interface DailyChallenge {
  // Seeded by date — same puzzle for all players globally
  seed: 'YYYY-MM-DD';
  
  structure: {
    // 3 rounds, escalating difficulty
    round1: { type: 'word_select', difficulty: 3, timeLimit: 120 };
    round2: { type: 'line_arrange', difficulty: 4, timeLimit: 90 };
    round3: { type: 'random', difficulty: 5, timeLimit: 60 };
  };
  
  scoring: {
    base: 'sum of all three poem scores (0-300)',
    timeBonus: '+1 point per second remaining',
    comboBonus: '+25 per combo triggered',
    streakBonus: '+50 for 7-day streak, +200 for 30-day streak',
  };
  
  rewards: {
    participation: 'daily_challenge_xp_50';        // Just for trying
    bronze: { threshold: 150, reward: '10 rare words unlocked' };
    silver: { threshold: 225, reward: 'exclusive word pack + cosmetic' };
    gold:   { threshold: 275, reward: 'exclusive dialogue + achievement progress' };
  };
  
  // Social features (stretch goal):
  leaderboard: 'anonymous_percentile';  // "Your score was in the top 12%"
  sharePoem: 'export_as_image';         // Share your poem as a styled image card
}
```

#### C. The Challenge Tower — 100 Floors of Pure Mastery

```typescript
// The tower is this game's equivalent of Slay the Spire's Ascension system.
// Each floor is a self-contained puzzle. No story, no dialogue — pure gameplay.

interface TowerFloor {
  floor: number;
  puzzleType: PuzzleType;
  
  // SPECIAL FLOOR MODIFIERS (make each floor feel unique):
  modifier?: {
    name: string;
    effect: string;
  };
}

const TOWER_HIGHLIGHTS = {
  // Every 10th floor has a memorable gimmick:
  floor_10: {
    name: "The Mirror",
    modifier: "Write a poem using ONLY words from your first-ever poem",
  },
  floor_20: {
    name: "The Rivalry",  
    modifier: "Beat Kai's score on an experimental poem",
  },
  floor_30: {
    name: "The Silence",
    modifier: "Erasure puzzle with only 8 keepable words in 500-word text",
  },
  floor_40: {
    name: "The Metronome",
    modifier: "Perfect iambic pentameter required — 0 tolerance on meter",
  },
  floor_50: {
    name: "BOSS: The Inner Critic",
    modifier: "All 6 characters judge simultaneously. Average must be B+.",
  },
  floor_60: {
    name: "The Flip",
    modifier: "Write a poem that Luna LOVES and Kai LOVES (opposing tastes)",
  },
  floor_70: {
    name: "The Speedrun",
    modifier: "20 seconds per word selection. 15-word poem. GO.",
  },
  floor_80: {
    name: "The Blind",
    modifier: "No word tags visible. No character reactions. Pure intuition.",
  },
  floor_90: {
    name: "The Cage",
    modifier: "Must use 5 pre-selected 'bad' words and still get an A",
  },
  floor_100: {
    name: "FINAL BOSS: The Muse's Challenge",
    modifier: "Freeform poem. Judged by all characters + The Muse. Must get A average. No assists. Your magnum opus.",
    reward: "Achievement: 'Poet Laureate' + exclusive Muse dialogue + secret ending eligibility",
  },
};

// TOWER REWARDS:
// Every floor: XP + rare words
// Every 10 floors: Exclusive cosmetic (new dialogue box skin, poem paper style, cursor)
// Every 25 floors: Exclusive character scene (tower-only lore)
// Floor 50: Unique achievement + The Muse acknowledgment
// Floor 100: Secret ending eligibility + "Poet Laureate" title
```

#### D. Route Divergence — Why You Replay the Story

```typescript
// It's not enough to have 12 endings — the PATH must feel different each time.
// Reference: Hades has ~300,000 words of dialogue. Characters always have something new to say.

const REPLAY_VARIETY = {
  // POEM STYLE TRACKING — the game categorizes HOW you've been writing
  // and changes dialogue/reactions accordingly
  poeticIdentityEffects: {
    // If you mostly write dark poems:
    dark_poet: [
      'Luna engages you more deeply, earlier',
      'Rowan expresses concern about your well-being',
      'Kai respects you but is suspicious — "Too easy."',
      'Milo critiques your lack of form: "Dark doesn\'t mean formless."',
      'The Muse manifests earlier and with darker aesthetics',
    ],
    
    // If you mostly write formal/structured poems:
    formal_poet: [
      'Milo becomes your fierce ally and debate partner',
      'Kai picks fights with you about artistic freedom',
      'Luna is impressed but challenges you: "Can your sonnets bleed?"',
      'Wren is intimidated — unlocking her route requires more effort',
    ],
    
    // If you write experimental/weird poems:
    avant_garde_poet: [
      'Kai immediately bonds with you (rival → friend → ???)',
      'Milo is exasperated but gradually curious',
      'Sable respects the boldness: "You\'ve got guts."',
      'The Muse is confused — your poems don\'t feed it in expected ways',
    ],
    
    // And so on for: nature_poet, performance_poet, dreamer_poet
  },
  
  // CHARACTER INTERACTION GRID — characters discuss YOUR poems with EACH OTHER
  // These conversations change based on which character likes your poems most
  interCharacterDialogue: {
    total_unique_lines: 500,  // Across all character pairs × poem style variants
    example: {
      trigger: 'Player wrote 3 consecutive poems Luna loved',
      scene: 'Kai corners you after class: "You\'re feeding her obsession, you know. She doesn\'t need another echo — she needs to hear something new."',
      effect: 'Kai affinity -3, but unlocks a unique perspective on Luna\'s character',
    },
  },
  
  // NO TWO RUNS IDENTICAL — even with the same choices:
  proceduralVariation: {
    wordPoolShuffle: true,           // Different words available each playthrough
    hangOutEventRotation: true,      // Different events available in different orders
    dailyChallengeIntegration: true, // Tower and daily progress carries across playthroughs
    weatherSystem: true,             // Random weather affects mood, available BGs, some dialogue
    characterMoodVariance: true,     // Characters have random minor mood shifts each chapter
  },
};
```

---

### 7.5.6 Anti-Tedium Rules — Keeping 100 Hours Fresh

These are hard rules to prevent the game from dragging:

```
RULE 1: NO IDENTICAL PUZZLES.
  Every puzzle in the main story must have at least ONE unique element:
  new word, new constraint, new character judging, new theme.
  Procedural puzzles (daily/tower) may reuse elements but always with different word pools.

RULE 2: THE 3-PUZZLE RULE.
  Never present more than 3 puzzles in a row without a story scene in between.
  Puzzle → Story → Puzzle → Story → Puzzle → Story (minimum ratio).
  The story is the REWARD for puzzle completion, not an obstacle.

RULE 3: SKIP RESPONSIBLY.
  Any puzzle can be skipped (C-grade awarded). The player is never STUCK.
  But skipping triggers unique dialogue: characters notice and comment.
  Milo: "You didn't even try? That's... a choice."
  Kai: "Honestly? Skipping IS a form of poetry. The blank page speaks."
  Wren: "Oh! I do that sometimes too. The unwritten poem is still a poem!"

RULE 4: THE BOREDOM DETECTOR.
  If a player selects words faster than 1 per second (mashing), the game notices.
  After 2 rushed poems:
    Sable: "Hey. Are you actually reading these words, or just clicking?"
    (This is IN-CHARACTER, not a patronizing tutorial popup.)
  The game adjusts: next puzzle offers more interesting/provocative words.

RULE 5: ESCALATE OR ROTATE.
  If the same puzzle type has appeared 3 times in the last 5 puzzles, 
  the next puzzle MUST be a different type. Variety is mandatory.

RULE 6: THE REWARD CADENCE (Hades-inspired).
  Something new must happen every 15-20 minutes of play:
  - New word combo discovered
  - New character dialogue tree
  - New story beat
  - New puzzle modifier
  - New affinity milestone
  - New achievement
  Players must NEVER go 20 minutes without a dopamine hit.
```

---

### 7.5.7 Emotional Difficulty Curve (The DDLC Trajectory)

The game's EMOTIONAL difficulty mirrors DDLC's trajectory but stretched across 100+ hours:

```
HOURS 0-10 (Acts 1-2):  😊 COZY
  Vibes: Warm, funny, low-stakes. "This is a cute poetry game!"
  Difficulty: Tutorial → Easy. Hard to fail.
  Player feeling: Safe, creative, attached to characters.
  Reference: DDLC Act 1. Persona 5 school life.
  
HOURS 10-25 (Act 3):  😐 UNSETTLING  
  Vibes: Something's off. Characters have real problems.
  Difficulty: Medium. Poems start to matter more.
  Player feeling: Invested, slightly anxious, wanting to help.
  Reference: DDLC's first hints of darkness. Celeste's anxiety themes.
  
HOURS 25-50 (Acts 4-5):  😰 INTENSE
  Vibes: Dark, emotional, meta-weird. Stakes are real.
  Difficulty: Hard. Bad poems have real consequences.
  Player feeling: Challenged, emotionally compromised, can't stop.
  Reference: DDLC Act 2. Undertale's genocide route tension.
  
HOURS 50-70 (Act 6):  🔥 CLIMACTIC
  Vibes: The game is aware. The Muse speaks. Everything converges.
  Difficulty: Very hard. The final puzzle uses your whole history.
  Player feeling: Overwhelmed, determined, desperate to write the perfect poem.
  Reference: DDLC's Monika act. Baba Is You's final world.
  
HOURS 70-100+ (Act 7 / Endgame):  ✨ TRANSCENDENT
  Vibes: Post-climax. Reflective. Master-level challenges.
  Difficulty: Player-controlled (Poetic License system).
  Player feeling: Mastery, nostalgia, "I AM a poet now."
  Reference: Hades post-credits. Celeste's B-sides and C-sides.
```

---

## 8. Story Structure & Branching Narrative

### 8.1 Main Story Arc

```
ACT 1: "First Draft" (Chapters 1-5) — ~6 hrs
  Welcome to the Ivory Quill Society. Meet all characters.
  Learn Word Select and Line Arrange puzzles.
  Light-hearted club activities. First poetry competition.
  THEME: Discovery, belonging, finding your voice.

ACT 2: "Rising Action" (Chapters 6-10) — ~7 hrs
  Sable and Wren are introduced as full members.
  Inter-character tensions emerge (Kai vs Milo, Luna's intensity).
  Meter Match and Rhyme Chain puzzles introduced.
  The society enters a regional competition.
  THEME: Ambition, rivalry, the cost of perfection.

ACT 3: "The Volta" (Chapters 11-15) — ~7 hrs
  Character secrets begin surfacing. Emotional weight increases.
  Erasure Poetry introduced. First hints of The Muse (glitch text).
  A crisis threatens the society's existence.
  THEME: Vulnerability, trust, the poems beneath the poems.

ACT 4: "Dark Night of the Soul" (Chapters 16-20) — ~7 hrs
  Full character routes become available. Relationships deepen.
  Freeform Composition unlocked. Exquisite Corpse appears.
  The Muse becomes more present — characters start noticing "something wrong."
  THEME: Confronting fears, artistic growth, the price of honesty.

ACT 5: "Breaking the Fourth Wall" (Chapters 21-25) — ~7 hrs
  The game begins to "malfunction." Menus glitch, character sprites corrupt.
  The Muse speaks directly. Characters reference being "in a story."
  Puzzles become meta — word pools contain words from YOUR previous poems.
  THEME: Reality vs fiction, authorship, free will.

ACT 6: "The Final Poem" (Chapters 26-30) — ~7 hrs
  The Muse demands the player write "the perfect poem."
  All puzzle types combined. Characters support/oppose.
  Multiple endings based on affinity, poems written, choices made.
  The final puzzle uses words harvested from every poem the player has ever written.
  THEME: Creation, identity, the relationship between author and work.

ACT 7: "Post Script" (Endgame) — ~8 hrs
  Unlocked after ANY ending. New Game+ elements.
  Challenge Tower (100 floors). The Muse's route.
  True Ending requirement: max affinity with ANY character + S-rank the final poem.
  THEME: Legacy, memory, what remains after the last word.
```

### 8.2 Branching System

```typescript
interface StoryNode {
  id: string;
  chapter: number;
  type: 'dialogue' | 'choice' | 'puzzle' | 'branch' | 'ending';
  
  // Conditions to reach this node
  conditions: {
    requiredAffinity?: { [characterId: string]: [number, number] }; // [min, max]
    requiredPoemCount?: number;
    requiredPuzzleGrade?: { puzzleId: string; minGrade: string };
    requiredFlag?: string;
    requiredAct?: number;
  };
  
  // Where this leads
  next: {
    default: string;              // Default next node ID
    branches?: {
      condition: string;          // Condition expression
      target: string;             // Target node ID
    }[];
  };
}
```

### 8.3 Endings (12 Total)

| # | Ending Name | Condition | Description |
|---|---|---|---|
| 1 | "The Anthology" | Complete Act 6, balanced affinity | The society publishes a book together. Bittersweet but warm. |
| 2 | "The Soloist" | Complete Act 6, one character at Level 10 | You and your closest character go on to great things. |
| 3-8 | "[Character] Route Ending" ×6 | Complete character route | Unique ending per character. Deep personal resolution. |
| 9 | "The Muse Wins" | Fail the final poem | The Muse absorbs the characters. Haunting meta-ending. |
| 10 | "The Unwritten" | Refuse to write the final poem | You break the game's loop. Characters are freed but the story is unfinished. |
| 11 | "The Masterpiece" | S-rank final poem + any character Level 10 | True ending. The Muse becomes part of you. Credits roll as a poem. |
| 12 | "The Author" | Complete ALL routes + S-rank + find all secret poems | Secret true ending. The game acknowledges you as the real author. |

---

## 9. World & Chapter Design (100+ Hours Breakdown)

### 9.1 Content Volume Specifications

```
MAIN STORY CONTENT:
  30 chapters × average content per chapter:
    - 2,500 words of dialogue = 75,000 words total
    - 2.5 puzzles per chapter = 75 puzzles (hand-crafted)
    - 3 CG scenes per chapter = 90 CG illustrations needed
    - 2 choice points per chapter = 60 meaningful choices

CHARACTER ROUTES (6 routes):
  Each route: 10 exclusive scenes
    - 1,500 words per scene = 90,000 words total
    - 1 puzzle per scene = 60 exclusive puzzles
    - 2 CG scenes per route = 12 CG illustrations

ROMANCE CONTENT (6 romanceable characters):
  Per character:
    - 5 date events × 2,000 words each = 10,000 words
    - 1 confession scene × 3,000 words = 3,000 words
    - 5 romantic poem puzzles (1 per date + confession)
    - 3 jealousy scenes × 1,000 words = 3,000 words
    - 1 breakup scene × 2,000 words = 2,000 words
    - Ongoing couple dialogue (Acts 4-6) = 5,000 words
    - 1 romantic ending scene × 2,500 words = 2,500 words
  Total romance per character: ~25,500 words + 5 puzzles + 9 CGs
  Total romance all characters: ~153,000 words + 30 puzzles + 54 CGs
  Romance CG gender variants: 54 base × 2 presentations = 108 CG variants

HANG-OUT EVENTS:
  6 characters × 15 events each = 90 events
    - 800 words per event = 72,000 words total
    - Some include mini-puzzles

PROCEDURAL CONTENT:
  Daily Challenges: generated by ProceduralGen engine (infinite)
  Challenge Tower: 100 floors with preset + procedural mix
  Workshop: user-created content

TOTAL HAND-CRAFTED DIALOGUE: ~390,000 words (237K base + 153K romance)
TOTAL HAND-CRAFTED PUZZLES: ~165 (135 base + 30 romantic)
TOTAL CG ILLUSTRATIONS NEEDED: ~264 (102 base + 54 romantic × 2 gender variants + ~2 player CG variants)
```

### 9.2 Chapter Template

Each chapter JSON follows this structure:

```typescript
interface Chapter {
  id: string;
  actNumber: number;
  chapterNumber: number;
  title: string;
  subtitle: string;
  
  // Setting
  defaultBackground: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  weather: string;
  bgm: string;
  
  // Content
  scenes: Scene[];
  puzzles: PuzzleConfig[];
  
  // Requirements
  requiredCompletedChapters: string[];
  optionalPriorEvents: string[];
  
  // Metadata
  estimatedPlaytime: number;      // minutes
  newMechanicsIntroduced: string[];
  charactersPresent: string[];
}
```

---

## 10. Word Database & Procedural Generation

### 10.1 Word Database Specification

The game requires a database of **3,000+ unique words**, each tagged with the full Word interface attributes.

**Database Structure** (`/public/data/words/`):

```
words/
├── core.json          # 500 most common poetic words
├── nature.json        # 400 nature/season/weather words
├── emotion.json       # 400 emotion/feeling words
├── abstract.json      # 300 philosophical/abstract words
├── sensory.json       # 300 texture/taste/sound/color words
├── urban.json         # 200 city/modern/technology words
├── action.json        # 200 verbs
├── literary.json      # 200 rare/literary/archaic words
├── surreal.json       # 200 weird/dreamlike words
├── body.json          # 150 body/physical words
├── music.json         # 150 sound/rhythm words
└── meta.json          # 100 meta/self-referential words (for Act 5+)
```

**Word Generation Script:**

```typescript
// scripts/generateWordDB.ts
// Approach:
// 1. Start with a curated seed list of ~500 words (hand-tagged)
// 2. Expand using:
//    - WordNet for synonyms/related words
//    - CMU Pronouncing Dictionary for phonetic data
//    - AFINN-165 for sentiment scores
//    - Frequency lists for complexity scoring
// 3. Auto-tag using rules:
//    - POS from compromise.js
//    - Syllable count from 'syllable' package
//    - Rhyme groups from CMU final phonemes
//    - Category assignment from WordNet hypernyms
// 4. Manual review pass on auto-tagged words
// 5. Export as typed JSON

// The script should be runnable: `npx ts-node scripts/generateWordDB.ts`
```

### 10.2 Procedural Puzzle Generation

```typescript
// engine/ProceduralGen.ts

interface ProceduralConfig {
  puzzleType: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  targetCharacter?: string;        // Bias toward a character's preferences
  theme?: string;                  // Optional theme constraint
  usePreviousPoems: boolean;       // For meta-puzzles, reuse player's words
}

class ProceduralGenerator {
  // Generate a WordSelect puzzle
  generateWordSelect(config: ProceduralConfig): WordSelectPuzzle {
    // 1. Select theme (random from theme pool or provided)
    // 2. Pull 20-30 thematic words from database
    // 3. Add 10-20 off-theme words for variety
    // 4. Ensure at least 3 "love" words for each active character
    // 5. Add 5-10 trap words
    // 6. Shuffle and return
  }
  
  // Generate a LineArrange puzzle
  generateLineArrange(config: ProceduralConfig): LineArrangePuzzle {
    // Uses template lines with variable slots:
    // "The {noun} of {abstract_noun} {verb}s in the {time_of_day}"
    // Generate 8-12 lines, compute flow scores
  }
  
  // Generate Erasure puzzle from text corpus
  generateErasure(config: ProceduralConfig): ErasurePuzzle {
    // Pull random passage from public domain text corpus
    // (included: Pride & Prejudice, Frankenstein, Walden, etc.)
    // Tag all words, ensure sufficient poetic words exist
  }
  
  // Daily challenge: combined/mixed format
  generateDailyChallenge(): DailyChallenge {
    // Seeded by date for consistent global challenge
    // Combines 3 puzzle types in sequence
    // Scoring: time bonus + quality score
  }
}
```

---

## 11. Progression, Unlockables & Meta-Game

### 11.1 Player Progression

```typescript
interface PlayerProgression {
  // Experience
  poetLevel: number;              // 1-50, earned from all puzzle completions
  totalPoemsWritten: number;
  totalWordsUsed: number;
  uniqueWordsUsed: Set<string>;   // Vocabulary breadth tracking
  
  // Poetic Identity (hidden, feeds into story)
  identityVector: {
    romantic: number;              // Luna-aligned
    experimental: number;          // Kai-aligned
    naturalist: number;            // Rowan-aligned
    performative: number;          // Sable-aligned
    formalist: number;             // Milo-aligned
    surrealist: number;            // Wren-aligned
  };
  
  // Collections
  poemJournal: Poem[];            // All poems ever written
  achievements: Achievement[];
  secretPoemsFound: string[];     // Hidden poems in the game world
  cgGallery: string[];            // Unlocked CG art
  musicBox: string[];             // Unlocked BGM tracks
  
  // Challenge Tower
  towerFloor: number;             // Current highest floor cleared
  towerBestScores: Record<number, number>;
  
  // Workshop
  createdPuzzles: PuzzleConfig[];
  sharedPuzzles: string[];
}
```

### 11.2 Achievement System

**Achievement Categories:**

```typescript
const ACHIEVEMENTS = {
  // Story achievements (30)
  story: [
    { id: 'first_poem', name: 'First Draft', desc: 'Write your first poem', icon: 'quill' },
    { id: 'all_characters_met', name: 'Full Circle', desc: 'Meet all members of the Ivory Quill Society', icon: 'circle' },
    { id: 'first_s_rank', name: 'Masterwork', desc: 'Earn an S rank on any poem', icon: 'star' },
    { id: 'act1_complete', name: 'Opening Stanza', desc: 'Complete Act 1', icon: 'book' },
    // ... etc for all acts and story milestones
  ],
  
  // Character achievements (60 - 10 per character)
  character: [
    { id: 'luna_l5', name: 'Kindred Spirit', desc: 'Reach Level 5 with Luna', icon: 'moon' },
    { id: 'luna_l10', name: 'Echoes Answered', desc: 'Complete Luna\'s route', icon: 'moon_full' },
    // ... etc
  ],
  
  // Puzzle achievements (30)
  puzzle: [
    { id: 'perfect_meter', name: 'Metronome', desc: 'Achieve 100% meter accuracy', icon: 'metronome' },
    { id: 'all_rhymes', name: 'Sound Garden', desc: 'Use every rhyme group in the database', icon: 'chain' },
    { id: 'erasure_artist', name: 'Invisible Ink', desc: 'Create an erasure poem using fewer than 10 words', icon: 'eraser' },
    { id: 'tower_floor_50', name: 'Halfway to Heaven', desc: 'Reach floor 50 of the Challenge Tower', icon: 'tower' },
    { id: 'tower_floor_100', name: 'Penthouse Poet', desc: 'Complete the Challenge Tower', icon: 'crown' },
    // ... etc
  ],
  
  // Secret achievements (20)
  secret: [
    { id: 'found_muse_first_hint', name: '???', desc: 'HIDDEN', icon: 'question' },
    { id: 'all_secret_poems', name: 'The Hidden Anthology', desc: 'Find all 25 secret poems', icon: 'key' },
    // ... etc
  ],
  
  // Meta achievements (10)
  meta: [
    { id: 'poems_100', name: 'Century', desc: 'Write 100 poems', icon: 'hundred' },
    { id: 'words_10000', name: 'Verbose', desc: 'Use 10,000 total words across all poems', icon: 'scroll' },
    { id: 'daily_streak_30', name: 'Devoted', desc: 'Complete 30 daily challenges in a row', icon: 'flame' },
  ],
};
```

### 11.3 Challenge Tower (100 Floors)

```
Floors 1-10:    Tutorial difficulty. Single puzzle type per floor.
Floors 11-25:   Easy-medium. Introduces mixed puzzles.
Floors 26-50:   Medium. Timed challenges. Combo puzzles (Word Select → Line Arrange).
Floors 51-75:   Hard. Strict grading. Unusual constraints (write only with words starting with vowels).
Floors 76-90:   Very hard. Meta-puzzles. Poems that reference previous floors.
Floors 91-99:   Expert. Every puzzle type combined. Character cameos with special requirements.
Floor 100:      "The Infinite Verse" — A freeform poem with all constraints active simultaneously.
                 Graded by all characters. Requires A-rank average across all to clear.
```

---

## 12. Audio Design

### 12.1 Music

**BGM Tracks Needed (20 total):**

| Track | Mood | Use | Style |
|---|---|---|---|
| `main_theme` | Warm, inviting | Title screen, menus | Piano + strings, gentle |
| `club_room` | Cozy, lively | Default society scenes | Acoustic guitar + light percussion |
| `morning_light` | Fresh, hopeful | Morning school scenes | Ambient piano + birdsong |
| `afternoon_gold` | Relaxed, warm | Afternoon scenes | Lo-fi beats + acoustic |
| `evening_blue` | Contemplative | Evening scenes | Soft synth + cello |
| `night_silver` | Quiet, intimate | Night scenes, confessions | Solo piano, sparse |
| `puzzle_thinking` | Focused, flowing | During puzzles (default) | Minimal ambient + soft rhythm |
| `puzzle_intense` | Building tension | Timed puzzles, high stakes | Faster tempo, building layers |
| `luna_theme` | Melancholy, beautiful | Luna scenes | Violin + piano, minor key |
| `kai_theme` | Eclectic, energetic | Kai scenes | Electronic + jazz elements |
| `rowan_theme` | Pastoral, gentle | Rowan scenes | Acoustic guitar + flute |
| `sable_theme` | Powerful, rhythmic | Sable scenes | Spoken word beat, percussion |
| `milo_theme` | Precise, elegant | Milo scenes | Harpsichord + chamber strings |
| `wren_theme` | Dreamy, whimsical | Wren scenes | Music box + ambient pads |
| `conflict` | Tense, dissonant | Arguments, crises | Distorted piano, unsettled |
| `revelation` | Emotional crescendo | Key story moments | Full orchestra swell |
| `glitch` | Unsettling, broken | Meta/Muse scenes | Corrupted audio, reversed samples |
| `the_muse` | Otherworldly | The Muse appears | Player's previous BGM, remixed |
| `ending_peaceful` | Cathartic, warm | Good endings | Full arrangement of main theme |
| `ending_bittersweet` | Hopeful sadness | Mixed endings | Main theme in minor key |

**Recommended Music Sources:**

| Source | URL | License | Notes |
|---|---|---|---|
| **Free BGM for Visual Novels (Pack 1)** ⭐ | Search itch.io: "Free Background Music for Visual Novels BGM Pack 1" | Free | Purpose-built VN BGM. Romantic/slice-of-life styles. |
| **DOVA-SYNDROME** ⭐ | `https://dova-s.jp/EN/` | Free commercial use | Japanese VN-style music. Huge library, perfect for anime aesthetic. |
| **OpenGameArt Music** | `https://opengameart.org/art-search-advanced?field_art_type_tid%5B%5D=12` | Various (CC) | Large library of game music |
| **FreePD** | `https://freepd.com/` | CC0 | Royalty-free, public domain |
| **Incompetech (Kevin MacLeod)** | `https://incompetech.com/music/` | CC BY | Huge library, many genres |
| **Pixabay Music** | `https://pixabay.com/music/` | Pixabay License (free commercial) | Modern, high quality |
| **Musopen** | `https://musopen.org/` | CC | Classical music recordings |
| **Suno AI / Udio** | Generate custom tracks | Varies | AI-generated custom BGM |

### 12.2 Sound Effects

**SFX Needed (40+ unique):**

```
UI:
  - button_hover.ogg, button_click.ogg, button_back.ogg
  - page_turn.ogg, book_open.ogg, book_close.ogg
  - menu_open.ogg, menu_close.ogg
  - save.ogg, load.ogg
  
Puzzle:
  - word_select.ogg (satisfying pop/click)
  - word_deselect.ogg (soft reverse pop)
  - word_hover.ogg (very subtle)
  - line_drag.ogg (paper slide)
  - line_drop.ogg (paper set)
  - line_snap_good.ogg (pleasant chime)
  - line_snap_bad.ogg (subtle dissonance)
  - meter_beat_stressed.ogg (strong drum tap)
  - meter_beat_unstressed.ogg (soft drum tap)
  - rhyme_connect.ogg (musical connection sound)
  - erasure_stroke.ogg (ink brush)
  - poem_complete.ogg (flourish + chime)
  - grade_reveal_s.ogg through grade_reveal_f.ogg
  
Character:
  - affinity_up.ogg (warm sparkle)
  - affinity_down.ogg (subtle sad tone)
  - character_enter.ogg (whoosh)
  - character_exit.ogg (fade whoosh)
  
Meta/Glitch:
  - glitch_small.ogg (brief digital corruption)
  - glitch_medium.ogg (screen tear sound)
  - glitch_large.ogg (reality breaking)
  - static_loop.ogg (continuous static, loopable)
  - muse_whisper.ogg (reversed whisper)
  - heartbeat_loop.ogg
```

**Recommended SFX Sources:**

| Source | URL | License |
|---|---|---|
| **Kenney Game Assets** | `https://kenney.nl/assets?q=audio` | CC0 |
| **Freesound.org** | `https://freesound.org/` | CC (various) |
| **Sonniss GDC Audio** | `https://sonniss.com/gameaudiogdc` | Free commercial |
| **OpenGameArt SFX** | `https://opengameart.org/` | CC |
| **JSFXR** | `https://sfxr.me/` | Generate custom SFX in browser |

---

## 13. UI/UX Design Specifications

### 13.1 Screen Layouts

**Main Menu:**
```
┌──────────────────────────────────────────────┐
│                                              │
│           ✦ VERSECRAFT ✦                     │
│        Whispers of the Muse                  │
│                                              │
│   ┌──────────────────────────────┐           │
│   │      ▸ New Game              │           │
│   │      ▸ Continue              │           │
│   │      ▸ Load Save             │           │
│   │      ▸ Workshop              │           │
│   │      ▸ Settings              │           │
│   │      ▸ Achievements          │           │
│   └──────────────────────────────┘           │
│                                              │
│   "Every poem is a door. What will you       │
│    find on the other side?"                  │
│                                              │
│                  [RMH Studios]               │
└──────────────────────────────────────────────┘
```

**Visual Novel Mode:**
```
┌──────────────────────────────────────────────┐
│  [Background Image - 1920×1080]              │
│                                              │
│         [Character Sprite]                   │
│         (centered or offset)                 │
│                                              │
│                                              │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  ┌──────┐                            │    │
│  │  │ Luna │  "The moon doesn't         │    │
│  │  └──────┘   create the tide.          │    │
│  │             It merely calls to what   │    │
│  │             was always restless."     │    │
│  │                          [▸ Click]   │    │
│  └──────────────────────────────────────┘    │
│  [Journal] [Save] [Auto] [Skip] [Settings]  │
└──────────────────────────────────────────────┘
```

**Poem Journal:**
```
┌──────────────────────────────────────────────┐
│  ◀ POEM JOURNAL                    [Close]   │
│  ─────────────────────────────────────────   │
│  ┌────────────────┐  ┌────────────────────┐  │
│  │ Collection     │  │ Poem #12           │  │
│  │                │  │ "November Bones"   │  │
│  │ ▸ Act 1 (5)   │  │                    │  │
│  │ ▸ Act 2 (8)   │  │ shadow whisper     │  │
│  │ ▸ Act 3 (7)   │  │ ache crystalline   │  │
│  │   ▸ Ch.11     │  │ hollow river       │  │
│  │   ▸ Ch.12 ◀   │  │ moonlight shatter  │  │
│  │   ▸ Ch.13     │  │ echo bone          │  │
│  │ ▸ Act 4 (6)   │  │ silence ember      │  │
│  │ ▸ Free (12)   │  │ trembling          │  │
│  │               │  │                    │  │
│  │               │  │ Grade: A           │  │
│  │               │  │ Luna: ♥♥♥♥♡        │  │
│  │               │  │ Kai:  ♥♥♡♡♡        │  │
│  └────────────────┘  └────────────────────┘  │
└──────────────────────────────────────────────┘
```

### 13.2 Color Palette

```css
:root {
  /* Base UI */
  --bg-primary: #1a1520;         /* Deep purple-black */
  --bg-secondary: #2a2235;       /* Lighter purple-black */
  --bg-paper: #f5f0e8;           /* Warm paper */
  --bg-paper-aged: #e8dcc8;      /* Aged paper */
  --text-primary: #e8e0d0;       /* Warm cream */
  --text-secondary: #a89888;     /* Muted tan */
  --text-on-paper: #2a2018;      /* Dark ink */
  --accent-gold: #c4a35a;        /* Warm gold */
  --accent-silver: #a0a8b8;      /* Cool silver */
  
  /* Character colors */
  --luna: #4A3B6B;
  --kai: #FF4D4D;
  --rowan: #5B8C5A;
  --sable: #D4A017;
  --milo: #2C3E6B;
  --wren: #E8A0BF;
  --muse: #FFFFFF;
  
  /* Grades */
  --grade-s: #FFD700;
  --grade-a: #4CAF50;
  --grade-b: #2196F3;
  --grade-c: #FF9800;
  --grade-d: #F44336;
  --grade-f: #666666;
}
```

### 13.3 Responsive Design

```
Desktop (primary):   1920×1080 (16:9)
Laptop:             1366×768 (scale down, keep aspect)
Tablet:             1024×768 (reflow dialogue box, larger touch targets)
Mobile:             390×844 (vertical layout — sprite above, dialogue below, puzzle fullscreen)
```

---

## 14. Save System & Data Persistence

### 14.1 Save File Structure

```typescript
interface SaveFile {
  version: string;                 // Game version for migration
  slotId: number;                  // 0-9 (10 save slots)
  timestamp: number;               // Unix timestamp
  playtime: number;                // Total seconds played
  
  // Story progress
  currentChapter: string;
  currentScene: string;
  completedChapters: string[];
  storyFlags: Record<string, boolean | number | string>;
  
  // Character state
  affinity: AffinityState;
  
  // Player state
  progression: PlayerProgression;
  
  // All poems ever written (for The Muse)
  poemHistory: {
    id: string;
    words: string[];
    text: string;
    timestamp: number;
    scores: Record<string, number>;
    grade: string;
  }[];
  
  // Settings
  settings: GameSettings;
  
  // Checksum for integrity
  checksum: string;
}
```

### 14.2 Auto-Save & Quick-Save

```typescript
// Auto-save triggers:
// 1. After every chapter completion
// 2. After every puzzle completion
// 3. Every 5 minutes during VN segments
// 4. Before any branching choice

// Quick-save: Ctrl+S / dedicated button
// Quick-load: Ctrl+L / dedicated button

// Save slot 0 = Auto-save (overwritten)
// Slots 1-9 = Manual saves
```

---

## 15. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-3)
```
[ ] Project setup (Vite + React + TypeScript)
[ ] Zustand stores (game, puzzle, dialogue, affinity, save)
[ ] Basic DialogueEngine (text display, character sprites, choices)
[ ] Basic PuzzleEngine (WordSelect only)
[ ] ScoringEngine (word tag scoring)
[ ] Save/Load system (IndexedDB)
[ ] Font loading, base CSS/color palette
[ ] Placeholder assets (colored rectangles for sprites, solid colors for BGs)
```

### Phase 2: Core Puzzles (Weeks 4-6)
```
[ ] WordSelect puzzle UI (word tiles, selection, arrangement)
[ ] LineArrange puzzle UI (drag-and-drop)
[ ] MeterMatch puzzle UI (rhythm display, stress pattern matching)
[ ] RhymeChain puzzle UI (rhyme group visualization)
[ ] Word database (generate first 1,000 words)
[ ] Syllable counting utility
[ ] Rhyme detection utility
[ ] Meter analysis utility
```

### Phase 3: Visual Novel (Weeks 7-9)
```
[ ] Full DialogueEngine (transitions, expressions, sound)
[ ] Character sprite system (expression swapping, animations)
[ ] Background system (time-of-day filters, transitions)
[ ] Choice system with consequence tracking
[ ] CG gallery system
[ ] Dialogue scripting format finalized
[ ] Write Act 1 dialogue (Chapters 1-5)
```

### Phase 4: Characters & Content (Weeks 10-14)
```
[ ] All 6 character profiles fully implemented
[ ] Character-specific scoring preferences
[ ] Affinity system with level thresholds
[ ] Character-specific hint system
[ ] Write Acts 2-3 dialogue (Chapters 6-15)
[ ] Design and implement 50 hand-crafted puzzles
[ ] Source/generate character sprites (all expressions)
[ ] Source/generate backgrounds (20+)
```

### Phase 5: Advanced Puzzles (Weeks 15-17)
```
[ ] ErasurePuzzle implementation
[ ] ExquisiteCorpsePuzzle implementation
[ ] FreeformPuzzle implementation with real-time analysis
[ ] ProceduralGenerator for all puzzle types
[ ] Daily Challenge system
[ ] Challenge Tower (design floors 1-50)
```

### Phase 6: Meta & Polish (Weeks 18-22)
```
[ ] The Muse character implementation
[ ] Glitch/meta effects system
[ ] Acts 4-6 dialogue and puzzles
[ ] All 12 endings scripted and implemented
[ ] Act 7 / Endgame content
[ ] Challenge Tower (floors 51-100)
[ ] Achievement system
[ ] Workshop / Freeplay mode
```

### Phase 7: Audio & Art (Weeks 23-26)
```
[ ] Source/create all BGM tracks
[ ] Source/create all SFX
[ ] Final character art (all sprites, all expressions)
[ ] Final background art (all locations, all variants)
[ ] CG illustrations (102 scenes)
[ ] UI skinning (parchment textures, ornate frames)
[ ] Particle effects and transitions
```

### Phase 8: Content Completion (Weeks 27-32)
```
[ ] Complete all remaining dialogue (target: 390,000 words including romance)
[ ] All character routes written and tested
[ ] All hang-out events written
[ ] All 135 hand-crafted puzzles finalized
[ ] Word database complete (3,000+ words)
[ ] Secret poems hidden throughout game
[ ] QA pass on all puzzles (solvability verification)
```

### Phase 9: Testing & Release (Weeks 33-36)
```
[ ] Full playtest (all routes, all endings)
[ ] Balance pass (affinity rates, puzzle difficulty)
[ ] Accessibility review (color blind modes, font size, assist mode)
[ ] Performance optimization
[ ] Build and deploy
[ ] Post-launch: Workshop sharing, daily challenge upkeep
```

---

## 16. Content Appendices

### Appendix A: Starter Word List (Sample 100 Words with Tags)

```json
[
  {
    "text": "shadow",
    "syllables": 2,
    "pos": "noun",
    "tags": { "darkness": 0.8, "brightness": 0.1, "complexity": 0.3, "nature": 0.3, "urban": 0.2, "abstract": 0.5, "concrete": 0.6, "emotionIntensity": 0.5, "humor": 0.0, "sincerity": 0.7 },
    "categories": ["night", "solitude", "mystery"],
    "rhymeGroup": "OH",
    "stressPattern": "10"
  },
  {
    "text": "bloom",
    "syllables": 1,
    "pos": "noun",
    "tags": { "darkness": 0.1, "brightness": 0.9, "complexity": 0.2, "nature": 0.95, "urban": 0.0, "abstract": 0.2, "concrete": 0.9, "emotionIntensity": 0.4, "humor": 0.0, "sincerity": 0.8 },
    "categories": ["flowers", "seasons", "growth"],
    "rhymeGroup": "OOM",
    "stressPattern": "1"
  },
  {
    "text": "shatter",
    "syllables": 2,
    "pos": "verb",
    "tags": { "darkness": 0.7, "brightness": 0.1, "complexity": 0.3, "nature": 0.1, "urban": 0.3, "abstract": 0.3, "concrete": 0.8, "emotionIntensity": 0.9, "humor": 0.0, "sincerity": 0.7 },
    "categories": ["violence", "transformation", "sound"],
    "rhymeGroup": "ATER",
    "stressPattern": "10"
  },
  {
    "text": "algorithm",
    "syllables": 4,
    "pos": "noun",
    "tags": { "darkness": 0.2, "brightness": 0.2, "complexity": 0.95, "nature": 0.0, "urban": 0.9, "abstract": 0.8, "concrete": 0.2, "emotionIntensity": 0.1, "humor": 0.3, "sincerity": 0.2 },
    "categories": ["technology", "meta", "mathematics"],
    "rhymeGroup": "IHM",
    "stressPattern": "1010"
  },
  {
    "text": "tenderness",
    "syllables": 3,
    "pos": "noun",
    "tags": { "darkness": 0.1, "brightness": 0.7, "complexity": 0.4, "nature": 0.2, "urban": 0.1, "abstract": 0.6, "concrete": 0.4, "emotionIntensity": 0.8, "humor": 0.0, "sincerity": 0.95 },
    "categories": ["emotion", "warmth", "love"],
    "rhymeGroup": "ESS",
    "stressPattern": "100"
  }
]
```

> **NOTE TO AGENT**: The full 3,000+ word database must be generated using the `generateWordDB.ts` script. The above is a representative sample. Prioritize generating words that create interesting tensions between character preferences — words that Luna loves but Kai hates, etc.

### Appendix B: Sample Chapter Script (Chapter 1)

```json
{
  "id": "ch01",
  "title": "The Society of Inkstained Fingers",
  "act": 1,
  "chapter": 1,
  "scenes": [
    {
      "id": "ch01_s01",
      "background": "school_hallway",
      "timeOfDay": "afternoon",
      "bgm": "afternoon_gold",
      "dialogue": [
        { "speaker": null, "text": "The flyer was tucked inside a library book — wedged between pages 42 and 43 of a collection of Neruda, as if someone had left it there on purpose." },
        { "speaker": null, "text": "'THE IVORY QUILL SOCIETY seeks new voices. Room 204, Thursdays, 4 PM. Bring a pen and an open mind.'" },
        { "speaker": null, "text": "You'd walked past Room 204 a hundred times. Never thought to open the door." },
        { "speaker": null, "text": "Until today." }
      ]
    },
    {
      "id": "ch01_s02",
      "background": "club_room",
      "timeOfDay": "afternoon",
      "bgm": "club_room",
      "characters": ["milo"],
      "dialogue": [
        { "speaker": null, "text": "The door creaks. Inside: bookshelves lining every wall, a large oval table, afternoon light spilling gold across scattered papers." },
        { "speaker": "milo", "expression": "composed", "text": "Ah. You found the flyer.", "animation": "enter_left" },
        { "speaker": "milo", "expression": "slight_smile", "text": "I'm Milo Vance. I placed twenty of those across the library. You're the first to actually show up." },
        {
          "type": "choice",
          "prompt": "How do you respond?",
          "choices": [
            { "text": "\"Lucky book, I guess.\"", "effects": { "milo": +2, "flags": { "player_tone": "casual" } } },
            { "text": "\"Neruda was a good choice for bait.\"", "effects": { "milo": +5, "flags": { "player_tone": "literary" } } },
            { "text": "\"I almost didn't come.\"", "effects": { "milo": +1, "flags": { "player_tone": "honest" } } }
          ]
        }
      ]
    },
    {
      "id": "ch01_s03",
      "background": "club_room",
      "characters": ["milo", "luna", "rowan", "kai"],
      "dialogue": [
        { "speaker": null, "text": "Over the next ten minutes, the room fills." },
        { "speaker": "luna", "expression": "neutral", "text": "...", "animation": "enter_left", "note": "She sits in the corner by the window, already writing in her journal." },
        { "speaker": "rowan", "expression": "gentle_smile", "text": "Oh! A new face! Welcome!", "animation": "enter_right" },
        { "speaker": "kai", "expression": "smirk", "text": "Great. Fresh meat.", "animation": "enter_left" },
        { "speaker": "milo", "expression": "disapproving", "text": "Kai." },
        { "speaker": "kai", "expression": "manic_grin", "text": "What? I said 'great.' That's positive." }
      ]
    },
    {
      "id": "ch01_puzzle",
      "type": "puzzle",
      "puzzleType": "word_select",
      "config": {
        "theme": "introduction",
        "prompt": "Milo clears his throat. 'Our tradition: every new member writes a poem on their first day. No pressure. Just... show us who you are.' He slides a tray of word tiles across the table. 'Pick the words that feel like yours.'",
        "requiredWordCount": 10,
        "difficulty": 1,
        "showCharacterHints": false,
        "wordPool": "ch01_intro_pool"
      }
    },
    {
      "id": "ch01_s04_reactions",
      "type": "dynamic_reactions",
      "note": "Character reactions are generated based on poem scores. Each character has 3 reaction tiers: love (80+), like (50-79), dislike (<50)."
    }
  ]
}
```

### Appendix C: Dialogue Script Format Reference

```typescript
// All dialogue is stored as JSON following this schema:

interface DialogueNode {
  speaker: string | null;          // Character ID, or null for narration
  text: string;                    // Displayed text
  expression?: string;             // Character expression to show
  animation?: string;              // Sprite animation trigger
  bgm?: string;                   // Change background music
  sfx?: string;                   // Play sound effect
  background?: string;            // Change background
  transition?: string;            // Screen transition effect
  shake?: boolean;                // Screen shake
  glitch?: number;                // Glitch intensity (0-1, for meta scenes)
  delay?: number;                 // Pause before displaying (ms)
  auto?: boolean;                 // Auto-advance (no click needed)
  speed?: number;                 // Text speed multiplier
  
  // Conditional display
  condition?: string;             // Only show if condition is true
  // e.g., "affinity.luna >= 300" or "flags.player_tone == 'literary'"
}

interface ChoiceNode {
  type: 'choice';
  prompt: string;
  choices: {
    text: string;
    condition?: string;           // Only show this option if...
    effects: {
      [characterId: string]: number;  // Affinity changes
      flags?: Record<string, any>;    // Story flags to set
    };
    next?: string;                // Jump to specific scene
  }[];
}
```

### Appendix D: Puzzle Difficulty Scaling

```
DIFFICULTY 1 (Act 1):
  WordSelect: 50 word pool, 10 words to pick, no traps, all categories visible
  LineArrange: 5 lines, strong flow signals, generous scoring
  
DIFFICULTY 2 (Act 2):
  WordSelect: 70 word pool, 12 words, 3 traps, categories hidden
  LineArrange: 7 lines, moderate flow signals
  MeterMatch: Iambic tetrameter only, stress hints shown
  RhymeChain: AABB scheme, generous rhyme matching
  
DIFFICULTY 3 (Act 3):
  WordSelect: 90 word pool, 14 words, 5 traps, no category hints
  LineArrange: 9 lines, subtle flow signals
  MeterMatch: Iambic pentameter, stress hints for polysyllabic words only
  RhymeChain: ABAB scheme
  Erasure: 200-word source, keep 15-25 words
  
DIFFICULTY 4 (Act 4-5):
  WordSelect: 100 word pool, 16 words, 8 traps, character hint system
  LineArrange: 10 lines, minimal flow signals
  MeterMatch: Mixed meters, no hints
  RhymeChain: Sonnet scheme (ABAB CDCD EFEF GG)
  Erasure: 350-word source, keep 10-20 words
  Freeform: Constrained (haiku, limerick)
  
DIFFICULTY 5 (Act 6, Tower 76+):
  WordSelect: 120 word pool, 20 words, 15 traps, words from player's history
  LineArrange: 12 lines, no flow signals, meta-content
  MeterMatch: Player must identify AND write in the meter
  RhymeChain: Custom scheme, player must determine rhyme scheme from clues
  Erasure: 500-word source, keep <10 words
  Freeform: Open (judged by all characters simultaneously)
```

### Appendix E: The Muse — Meta-Narrative Technical Spec

The Muse's meta-narrative requires special technical implementation:

```typescript
// engine/MetaEngine.ts

class MetaEngine {
  // Glitch intensity increases over the game
  private glitchLevel: number = 0; // 0 (none) to 1 (full)
  
  // Track for The Muse's awareness
  private museAwareness: number = 0;
  
  // Things that increase Muse awareness:
  // - Writing poems with "meta" tagged words
  // - Finding secret poems
  // - Reaching Act 5+
  // - Writing the same word 10+ times across all poems
  
  applyGlitch(level: number) {
    // Visual effects at different levels:
    // 0.1: Occasional text flicker in dialogue
    // 0.3: Character sprites briefly show wrong expressions
    // 0.5: Background images distort, menu items shuffle
    // 0.7: Dialogue text replaces character names with "PLAYER"
    // 0.9: Game UI elements rearrange, save file names change
    // 1.0: Full meta-break, Muse takes over narration
  }
  
  getMuseDialogue(context: GameContext): string {
    // The Muse references:
    // 1. Words the player has used most frequently
    // 2. Characters the player has spent the most time with
    // 3. The player's "Poetic Identity" vector
    // 4. Real-time: how long the player has been playing today
    // 5. Meta: the current save slot number, the player's chosen name
  }
  
  generateMusePuzzle(allPreviousPoems: Poem[]): WordSelectPuzzle {
    // The Muse's final puzzle:
    // Word pool is EXCLUSIVELY drawn from words the player has used before
    // The player must construct a new poem from the fragments of all their old ones
    // Scoring is based on creating something new from the familiar
  }
}
```

### Appendix F: Workshop Mode Specification

```typescript
interface WorkshopMode {
  // Create custom puzzles
  puzzleEditor: {
    selectType: PuzzleType;
    configureParameters: any;      // Type-specific config
    testPuzzle: () => void;        // Play your own puzzle
    exportPuzzle: () => string;    // JSON export
    importPuzzle: (json: string) => void;
  };
  
  // Freeform writing
  poetryStudio: {
    blankPage: true;               // Open text editor
    wordSuggestions: boolean;      // AI-powered word suggestions
    realTimeAnalysis: boolean;     // Live scoring display
    characterReactions: boolean;   // Live character faces
    exportPoem: (format: 'txt' | 'png' | 'pdf') => void;
  };
  
  // Browse & play shared content
  community: {
    browsePuzzles: () => PuzzleConfig[];
    ratePuzzle: (id: string, rating: number) => void;
    shareMyPuzzle: (puzzle: PuzzleConfig) => void;
  };
}
```

---

## Final Notes for the Agent

### Priority Order for Implementation

1. **Read Section 7.5 FIRST.** Every system you build should pass through the "game feel" filter. If clicking a word isn't satisfying, nothing else matters.
2. **Get a working word-select puzzle with full juice.** Sound, particles, chibi bounces, musical notes — the COMPLETE feedback loop from Section 7.5.2. This is the core loop. Test it obsessively.
3. **Implement the scoring engine with word combos.** Players need to feel the difference between a random poem and a crafted one. The combo system (Section 7.5.4) is what gives the puzzle depth.
4. **Add the dialogue engine with character reactions.** Including unique reactions for BAD poems (Section 7.5.1, Pillar 3). Failure content is as important as success content.
5. **Build out puzzle types one at a time.** Each is a self-contained module. Ensure each one has its own "juice" equivalent.
6. **Implement the Poetic License difficulty system.** This is what makes the game replayable for skilled players. Modular difficulty > simple Easy/Medium/Hard.
7. **Write content in parallel with systems.** Dialogue and word databases can be authored alongside engineering.
8. **The Muse and meta-systems come LAST.** They build on every other system.

### Critical Design Principles

- **Every click must feel good.** Juice is not optional. Sound, particles, animation, screen shake — if the feedback loop isn't satisfying with placeholder art, the game is broken. Reference: Section 7.5.2.
- **Every poem the player writes should feel like THEIRS.** The game is a creative tool disguised as a puzzle. Respect the player's creative expression.
- **No single "correct" answer — but clear TRADEOFFS.** Unlike DDLC where "pick Yuri words" is the whole strategy, every word should be a genuine decision. A word Luna loves should be a word Kai hates. Tension creates depth.
- **Bad poems are content, not punishment.** D-rank and F-rank poems trigger unique, memorable dialogue. Players who never fail MISS these scenes. Reference: Hades — death IS progress.
- **The difficulty is MODULAR, not gatekept.** Players choose their challenge via Poetic License (Section 7.5.3). Casual players enjoy the story. Hardcore players push License Level 25. Both get the full game.
- **Something new every 15-20 minutes.** New words, new combos, new dialogue, new story beats. The "just one more chapter" feeling must be constant. Reference: Hades' reward cadence.
- **The meta-narrative is optional.** A player who never finds The Muse still gets a complete, satisfying game. The meta layer is a reward for deep engagement, not a requirement.
- **Every system combos with every other system.** Word combos affect scoring. Scoring affects affinity. Affinity affects dialogue. Dialogue affects puzzle themes. Puzzle themes affect available words. This interlocking creates emergent stories.

### Estimated Final Asset Count

| Asset Type | Count |
|---|---|
| Character sprite variations | ~432 (6×72) + Muse |
| Background images | 40+ base + variants |
| CG illustrations | 102 |
| BGM tracks | 20 |
| SFX | 40+ |
| Unique words in database | 3,000+ |
| Hand-crafted puzzles | 135 |
| Dialogue words | 390,000+ (237K base + 153K romance) |
| Achievements | 150 |
| Endings | 12 |

---

*Document Version: 1.0*
*RMH Studios — Versecraft: Whispers of the Muse*
*"Every poem is a door. What will you find on the other side?"*

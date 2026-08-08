# Bum's Rush — Game Design & Implementation Document

> **Status:** design, not yet implemented. Written 2026-08-08 against `main`.
> **Target:** a 2–4 player physics party game at `/bums-rush`, in the tradition
> of Le Cartel Studio's _Heave Ho_ / _Heave Ho 2_ — you are a head with two
> long arms, you grab things, you swing, you form chains with your friends, you
> fall to your splattery end.
> **Audience:** the implementing agents. Every section is meant to be actionable
> without re-deriving decisions; §20 splits the work into tickets that can be
> handed out in parallel.

---

## §0 How to read this

### 0.1 Source material, and how much to trust it

The design brief was "recreate _Heave Ho 2_". The source material actually
consulted, in descending order of reliability:

| Source                                                     | What it settled                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| The Steam store page (supplied as HTML — the store itself is egress-blocked) | Official copy, feature matrix, tags, accessibility list, "developers recommend a controller", 2–4 players, online + shared-screen co-op **and** PvP, price/scope signal (~1.8h main story, $9.99) |
| Reviews & previews (Game Informer, TheSixthAxis, Checkpoint, Quest Daily, MKAU, PowerUp!, Siliconera, Nintendo World Report — all read via search summaries; the sites are egress-blocked) | Control scheme, world themes, level and Showdown counts, objective types, the item list, the assist cat |
| The original _Heave Ho_ (2019) coverage                     | The grab/swing/chain fundamentals, respawn behaviour, the striped assist beams, the golden-rope minigames             |

**Where sources disagree, this document picks and says so.** The clearest
disagreement is level count: reviews variously report "about 60 levels" and "72
co-op levels across eight worlds, plus 56 randomized versus levels". We target
**72 co-op + 56 Showdown arenas** (§6.6, §8) because it divides cleanly by eight
and because a level here is cheap — the level format is data (§6.1), not code.

Nothing in this document is a claim about _Heave Ho 2_'s internals. Where it
says "the source does X", that is what coverage described; where it says "we do
Y", that is our decision.

### 0.2 Deliberate deviations, and why

A faithful port would be wrong for this site in five specific ways. Each
deviation below is intentional; do not "fix" them back toward the source.

1. **Solo is playable.** The source requires two players. A visitor who lands on
   `/bums-rush` from the games index is, statistically, alone. Every level
   carries a `minPlayers` field; ~40 of 72 are authored solo-viable, and the
   solo player gets a **Solo Ladder** (time attack + leaderboard) over exactly
   those. Co-op-only levels are visibly marked and offer one-tap matchmaking
   rather than a dead end. See §6.7 and §9.7.
2. **Mobile is a first-class target.** The source is a controller game on
   console and PC. Roughly half this site's traffic is a phone in landscape, so
   touch is designed (§12), not bolted on — including an **Auto-Grab** input
   model that exists because two independent analog arms plus two grab buttons
   do not fit on two thumbs.
3. **Progress follows the account.** Steam Cloud's equivalent here is our own
   tables (§10), including cross-device resume mid-session and a guest→account
   merge, because a browser game's players routinely start signed out.
4. **Nothing strobes.** The source has a rave world. Ours does too (Marker
   Mosh), and it is beat-*driven* without ever flashing above the WCAG 2.3.1
   threshold (§2.8). This is a design constraint on the world, not a toggle.
5. **No crossover skins.** The source unlocks skins from other Devolver games.
   We unlock our own cast (§2.5) and RMH Studios cosmetics. See 0.3.

### 0.3 Originality rules (binding on every implementer)

This is a **homage built from mechanics**, not a port. Mechanics, physics
behaviour and genre conventions are not protectable and we recreate them
deliberately. Everything expressive is ours:

- **No copied assets.** No sprites, audio, fonts, UI, or level geometry from
  _Heave Ho_ / _Heave Ho 2_ — including tracing screenshots. Every level in §6.6
  is authored fresh against the pacing rules in §6.7.
- **No copied names.** "Bum's Rush" is ours (the idiom for being thrown out by
  the scruff — which is the game). Worlds, characters, items and cosmetics use
  the names in this document. In particular the source's `Ima Rock` and
  `arm spray` items ship here as **Paperweight** and **Stretch Ink**.
- **No third-party characters**, no Devolver cast, no "inspired by" skins of
  other studios' properties.
- **Attribution, once, honestly.** The credits screen carries a single line:
  _"A physics party game in the tradition of Heave Ho by Le Cartel Studio.
  Unaffiliated."_ That line is the only place the source is named in shipped UI,
  and it is a statement of lineage, not endorsement.

If a ticket in §20 seems to require copying something specific, that ticket is
wrong — raise it rather than copying.

### 0.4 Definition of done for this feature

Beyond the repo's standing gates (`pnpm check:consistency`, no new type/lint
warnings, `docs/design-language.md` §0), Bum's Rush is done when:

- Two strangers can reach a shared level from `/bums-rush` in under 15 seconds
  with no account, no download, and no room code typed by hand.
- A player can leave mid-level and rejoin from a different device with cosmetics
  and progress intact.
- The same level is completable with a gamepad, a keyboard, and two thumbs on a
  phone, without any of the three feeling like the fallback.
- The `GAME_CAPABILITIES` entry (§1.2) is true — every accessibility feature it
  claims exists in code. The honesty rule in `lib/game-capabilities.ts` is not
  negotiable; drop a claim rather than ship it aspirationally.

---

## §1 Identity & registration

### 1.1 Names and ids

| Thing                   | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| Title                   | **Bum's Rush**                                                            |
| Catalog / capability id | `bums-rush` (stable — renaming it is a data migration, per `lib/catalog/types.ts`) |
| Route                   | `/bums-rush` (top-level, full-screen — **not** under `_site/`)             |
| Socket event prefix     | `br:` (isolation is by event-name prefix, per `server/CLAUDE.md`)          |
| i18n namespaces         | `c-bums-rush` (game UI), `r-bums-rush` (route/SEO copy)                    |
| Scoped CSS token group  | `--bum-*` in `app/globals.css`                                            |
| Level data root         | `data/bums-rush/levels/`                                                   |
| Component root          | `components/bums-rush/`                                                    |
| Logic root              | `lib/bums-rush/`                                                           |

### 1.2 Registry entries this game must land in

A new game is not one file. These are all of them; §20-T1 does them together so
the game is never half-registered.

**`lib/catalog/games/bums-rush.ts`** (new file — the barrel imports
alphabetically, so nothing else changes):

```ts
import type { GameInfo } from '../types';

const entry: GameInfo = {
  id: 'bums-rush',
  order: 220, // next free slot — existing entries run 0…210 in tens
  title: "Bum's Rush",
  description:
    'A hand-drawn physics party game: you are a head with two long arms. Grab, swing, and fling your friends across 72 levels — 2–4 players online or on one screen.',
  longDescription:
    "You are a head with two enormous arms and no legs whatsoever. Grab a ledge, swing, let go at exactly the wrong moment, and paint the wall. Bum's Rush is a hand-drawn physics party game for one to four players: link hands into a living rope, haul each other over gaps that none of you could cross alone, and argue about whose fault it was. Eight worlds, 72 co-op levels with hidden objectives, and a 56-arena Showdown mode for when co-operation has run its course. Plays online, on one screen, or both at once — with a gamepad, a keyboard, or two thumbs.",
  href: '/bums-rush',
  cta: 'Get a Grip',
  isSteam: false,
  gradient: 'from-amber-400 to-rose-500',
  iconName: 'Hand',
  color: 'from-amber-400/20 to-rose-500/20 hover:border-amber-400/50',
  tags: ['Party', 'Multiplayer', 'Physics', 'Platformer'],
  imagePath: '/images/games/Bums-Rush.webp',
  authGate: false,
};

export default entry;
```

**`lib/game-capabilities.ts`** — `GAME_CAPABILITIES['bums-rush']`. The test file
holds this to exact key parity with the catalog, so it lands in the same commit:

```ts
'bums-rush': {
  genre: ['party', 'platformer'],
  players: ['single', 'online-coop', 'online-versus', 'async-leaderboard'],
  maxPlayers: 4,
  input: {
    supported: ['keyboard', 'mouse', 'touch', 'gamepad'],
    required: [],           // playable with any one of the above
  },
  sessionMinutes: [10, 45],
  engine: '2d-canvas',
  demanding: false,          // budget in §17 is a mid-range phone at 60fps
  save: 'own-table',         // §10.2 — its own models, not the shared blob
  accessibility: [
    'remappable-input',      // §4.5
    'assist-mode',           // §4.7
    'reduced-flashing',      // §2.8 — by construction, no toggle needed
    'colorblind-safe',       // §2.8 — seat identity is shape + colour
    'no-timed-input',        // §6.7 — no level fails on a timer; par times are optional objectives
  ],
  // no `descriptors` — comic ink-splat deaths are not `violence`, and nothing flashes
},
```

> **Honesty check.** Each `accessibility` string above is a promise about
> shipped code. T13 (§20) owns delivering all five. If one slips, delete the
> string, not the ticket.

**Other registries, all one-liners:**

| File                                       | Change                                                            |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `lib/i18n/config.ts`                       | add `"c-bums-rush"`, `"r-bums-rush"` to `NAMESPACES`               |
| `server/socket-server/config.ts`           | add the `br:*` rate-limit rules (§9.3) — that map is also the allowlist of valid inbound events |
| `server/socket-server/index.ts`            | `registerBumsRushHandlers` / `handleBumsRushDisconnect`            |
| `lib/achievements/catalog.ts`              | 12 entries, `category: 'games'`, `group: "Bum's Rush"` (§11.4)     |
| `prisma/schema.prisma`                     | 5 models (§10.2) + migration                                       |
| `app/globals.css`                          | the `--bum-*` group + its `@theme` aliases (§2.2)                  |
| `public/images/games/Bums-Rush.webp`       | catalog card art                                                   |

`THEME_EXCLUDED_ROUTES` needs **no** edit — `components/Providers.tsx` derives it
from `games.map(g => g.href)`, so adding the catalog entry suppresses the site
theme on `/bums-rush` automatically. Likewise the docs generators
(`pnpm docs:site`) read the catalog; run them, don't hand-edit their output.

### 1.3 The route

`app/routes/bums-rush.tsx`, following `app/routes/void-breaker.tsx` exactly —
lazy game import, `gameRouteHead('bums-rush')`, `GameBackLink`,
`GameErrorBoundary`, `GameLoadingFallback`. Do not hand-roll `og:*` tags;
`buildMeta` (through `gameRouteHead`) owns the whole Open Graph block.

The one departure from `void-breaker.tsx`: the root element is **not**
unconditionally `fixed inset-0`. Bum's Rush has document-shaped screens (title,
world map, wardrobe, results) and a fixed-viewport screen (the level). Per
`docs/design-language.md` §12.1 rule 6, the shell switches:

- Title / world map / lobby / wardrobe / results → `.app-page`
- An active level or Showdown round → `.app-viewport`

and resets `window.scrollY` on the transition into `.app-viewport`, because a
fixed viewport cannot undo a scroll offset it inherits.

---

## §2 Art direction — the notebook

### 2.1 The conceit

**The game is a flipbook someone drew in the back of a school exercise book
during a very boring lesson.** Not "cartoon". Not "hand-drawn" in the vague
sense. Specifically: cream paper with a faint ruled grid, biro and marker on
top, margin doodles, corrections that were never erased, a coffee ring, tape
holding a torn corner down.

This is load-bearing for three reasons and not just a look:

1. **It makes cheap art read as intentional.** A wobbling ink line is a style;
   a wobbling vector is a bug. Everything we cannot afford to animate richly, we
   animate as a drawing instead.
2. **It gives the physics somewhere to be funny.** Splatting against a wall is
   funnier as an ink blot on paper than as a gore effect, and it keeps the game
   family-friendly without a single content descriptor.
3. **It is legible at phone size.** High-contrast dark ink on light paper
   survives a 6" screen in daylight far better than the site's glass tier does.

The game is **exempt from the `--site-*` palette** (it is a game route, theme
suppressed) but **not exempt from shared behaviour**: `GameErrorBoundary`,
`GameLoadingFallback`, the session hook, the viewport primitives in §12.1, and
the DOM chrome rules (`rounded-site*` where DOM chrome exists, no
`transition-all`, no `tailwindcss-animate` classes) all still apply. Canvas
pixels are ours; DOM is the site's.

### 2.2 The `--bum-*` token group

Defined in `app/globals.css` alongside `--temple-*` / `--slice-*` / `--neon-*`,
with `@theme` aliases so Tailwind utilities exist (`bg-bum-paper`,
`text-bum-ink`, …). **No raw hex inside components** — that is CI-enforced for
site-tier files and is the convention here regardless.

```css
/* Bum's Rush — a scoped variable group, in the spirit of --temple-* / --slice-*.
   The game route suppresses the site theme, so these are absolute values, not
   theme-tracking ones. Ink is near-black-blue rather than #000 because pure
   black on cream reads as printed, not drawn. */
--bum-paper:        #f4ead6;   /* base sheet */
--bum-paper-2:      #ece0c8;   /* torn underlay / shadowed sheet */
--bum-paper-edge:   #d8c9aa;   /* sheet edge + fold */
--bum-rule:         #b9c9d6;   /* ruled lines */
--bum-margin:       #e2a0a8;   /* the red margin line */
--bum-ink:          #1e2430;   /* primary stroke */
--bum-ink-soft:     #47506080; /* construction lines, hints, ghosts */
--bum-graphite:     #6b7280;   /* pencil under-drawing */
--bum-highlight:    #fff6a8;   /* highlighter — objectives, goal */
--bum-tape:         #e8dcc0cc; /* sticky tape */
--bum-splat:        #232b3a;   /* death blot */

/* Seat colours: four marker pens. Chosen for distinct hue AND distinct
   lightness, so they separate under protan/deutan/tritan simulation — but see
   §2.8: colour is never the only channel. */
--bum-seat-1:       #d1495b;   /* red pen      */
--bum-seat-2:       #2a7fbf;   /* blue biro    */
--bum-seat-3:       #3f8f52;   /* green marker */
--bum-seat-4:       #c9761a;   /* orange       */
```

Per-world accent overrides live in the level data (§6.1 `palette`), not in CSS —
a world tints the paper and the ink slightly (Vacuum Ward is graph paper in cold
grey; Sizzle Street is a grease-stained recipe card), and those are values the
renderer reads, not classes the DOM applies.

### 2.3 The paper & ink render pipeline

Canvas 2D (`engine: '2d-canvas'`). The whole look is six layers, drawn back to
front each frame. Everything expensive is baked once to an offscreen canvas and
blitted; only the ink layer is redrawn per frame.

| # | Layer          | Content                                                                     | Cost                            |
| - | -------------- | --------------------------------------------------------------------------- | ------------------------------- |
| 0 | **Sheet**      | Paper base colour + fibre noise + ruled grid + margin line + coffee ring     | Baked once per world, tiled     |
| 1 | **Under-drawing** | Pencil construction lines for level geometry — deliberately not aligned with the ink | Baked per level              |
| 2 | **World ink**  | Level geometry, props, hazards as ink strokes                                | Baked per level; re-baked only when a prop's shape changes |
| 3 | **Actors**     | Characters, arms, carried objects, drones                                   | Per frame — the only hot layer  |
| 4 | **FX**         | Splats, torn-paper confetti, speed scribbles, dust                          | Per frame, pooled               |
| 5 | **Chrome-in-world** | Sticky-note tutorials, doodle arrows, the goal's highlighter wash      | Baked per level                 |

**The boil.** Hand-drawn animation "boils": the line wobbles because each frame
was drawn again. We fake it with a per-vertex offset sampled from a seeded noise
field, **advanced only every 3rd frame** (a 20fps boil under a 60fps sim). Three
rules:

- The boil offset is a function of `(vertexId, floor(frame/3))` through a seeded
  PRNG — never `Math.random()` per frame, or the line hisses instead of boils.
- Amplitude is **1.4 px at design scale** on world ink, **0.8 px** on actors.
  More reads as an earthquake.
- `useReducedMotion` → boil amplitude 0 and the offset frozen at phase 0. The
  drawing still looks drawn (the strokes are tapered and imperfect); it just
  stops moving. This is also what `perf-lite` devices get (§17).

**Stroke style.** Every ink stroke is drawn twice: a `--bum-graphite` pass at
40% alpha offset by (+1.5, +1.5) px, then the `--bum-ink` pass. That single
trick does 80% of the "drawn" impression for the price of one extra path fill.
Strokes taper — width scales with `1 - 0.35 * |t - 0.5| * 2` along the path — so
they end like a pen lifting rather than a rectangle stopping.

**Fills** are never flat. Solid areas use one of four repeating pattern
canvases (crosshatch, scribble, dot-stipple, marker-streak) at `multiply` blend
over the paper. Pattern choice is per material (§6.2), which means material is
readable in monochrome — the grip surface is *visibly* a different scribble from
the slick one, and that is an accessibility feature, not just decoration.

**DPR.** The surface goes through `gameSurfaceDpr()` from `lib/display-scale.ts`
(capped at 2). Whatever sizes the drawing buffer is also what the render
transform uses. Never reassign `canvas.width` inside the rAF loop
(`docs/design-language.md` §12.1 rule 4).

### 2.4 The cast

**Anatomy.** A character is a **head** and **two arms**. No body, no legs. The
head is where the personality is; the arms are drawn as tapered strokes, the
same in every skin, because they must read instantly as "that is a grabbing
arm" from across the screen.

- **Head:** a circle of radius 26px (design space), squashed and stretched by
  velocity (§2.7). Face is 2–4 strokes plus whatever the head design adds.
- **Arms:** a 4-segment tapered stroke from shoulder point to hand, root width
  7px → 3px at the wrist. Rendered as a smoothed polyline through the physics
  segment positions (§3.1), so the arm visibly *whips*.
- **Hands:** a mitten — one thumb, one mass. Open (splayed) when not gripping,
  closed (fist) when gripping, and a distinct "reaching" pose within 12px of a
  grabbable. That third pose is the single most important readability affordance
  in the game and is worth more than any UI indicator.

**Sixteen launch heads.** Unlocked as described in §11.2. Each is a silhouette
first — recognisable as a black shape at 32px — because that is how you find
yourself in a four-player scramble.

| # | Head            | Silhouette hook            | Unlock                          |
| - | --------------- | -------------------------- | ------------------------------- |
| 1 | **Biro**        | Plain doodle head. Default | Start                           |
| 2 | **Eraser**      | Rounded pink block, worn corner | Start                      |
| 3 | **Sharpener**   | Grey wedge, one hole       | Start                           |
| 4 | **Staple**      | Wire staple bent into a face | Clear World 1                 |
| 5 | **Paper Plane** | Folded triangle            | Clear World 1 with all objectives |
| 6 | **Teacup**      | Handle sticking out        | Clear World 2                   |
| 7 | **Whisk**       | Wire dome                  | 12 Recipes in Sizzle Street     |
| 8 | **Balloon**     | Sphere + knot + string     | Clear World 3                   |
| 9 | **Lightbulb**   | Bulb + filament face       | 20 hidden Poses                 |
| 10| **Helm**        | Visor slit                 | Clear World 4                   |
| 11| **Inkpot**      | Squat pot, dripping        | 30 Parcels found                |
| 12| **Shuriken**    | Four points                | Clear World 5                   |
| 13| **Snowball**    | Lumpy, one carrot          | Clear World 6                   |
| 14| **Helmet**      | Fishbowl + antenna         | Clear World 7                   |
| 15| **Speaker**     | Cone + grille              | Clear World 8                   |
| 16| **Inkblot**     | The studio cat, as a head  | 100% campaign                   |

**Seat marks.** Independently of the head, every seat wears a **doodle mark**
inked on the forehead: `●` seat 1, `▲` seat 2, `■` seat 3, `✚` seat 4. See §2.8.

### 2.5 Cosmetics

Four slots, all cosmetic, none affecting physics (mass is fixed — a heavier hat
would be a competitive item in Showdown, and the source's economy is cosmetic).

| Slot       | Count at launch | Examples                                                                 |
| ---------- | --------------- | ------------------------------------------------------------------------ |
| **Head**   | 16              | §2.4                                                                     |
| **Hat**    | 24              | party hat, chef's toque, colander, traffic cone, crown (bent), snorkel, halo (drawn with a compass), sticky note stuck to forehead |
| **Gloves** | 12              | bare mitten, oven mitt, boxing glove, rubber glove, gauntlet, ninja tabi-hand, bubble-wrap |
| **Ink**    | 10              | the four seat pens plus highlighter-yellow, pencil-grey, red-correction, gel-sparkle, invisible-ink (outline only), crayon |

Cosmetics are **not** coin-purchasable in v1 — they are earned (§11.2). Coins
enter later only via the existing shop if the economy team wants them; do not
build a second currency.

**Persistence:** equipped set lives on `BumsRushProfile` (§10.2) and is echoed
into the room on join so everyone sees the right hat immediately.

### 2.6 Prop & set-dressing vocabulary

Everything in the world is a **paper object taped, pinned or drawn onto the
sheet**. This gives every world a consistent construction language:

- **Drawn** — inked directly onto the paper; static geometry, never moves.
- **Cut out** — a paper shape with a 2px drop shadow and a 1° tilt; anything
  that moves (platforms, crates, props) so motion reads as a cut-out sliding.
- **Taped** — has visible tape corners; anything that can be *broken* or
  detached.
- **Pinned** — has a drawing-pin head; a rotation pivot (levers, wheels, arms).
- **Torn** — jagged edge; a hazard boundary or a hole.

The rule for authors: **if it moves, it must be cut out or pinned.** A player
should be able to tell a moving platform from a wall without moving.

### 2.7 Juice

The game lives or dies on feedback. Per the repo, use `lib/motion.ts` tokens for
DOM motion; the canvas has its own, listed here so they are consistent between
implementers.

| Event                | Response                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Grab connects        | Hand snaps to fist; 1-frame white flash on the gripped surface; short click SFX; 15ms rumble @0.25 |
| Grab misses          | Hand splays wide for 120ms; small "fwip" scribble mark at the hand                                 |
| Release under load   | 3 speed-scribble strokes trailing the head for 200ms                                               |
| High-speed travel    | Head stretches along velocity: scale `1 + min(0.35, |v|/1800)` on the velocity axis, inverse on the other |
| Impact (survivable)  | Head squashes to 0.75 on the impact axis, springs back over 180ms; dust puff of 4 torn-paper bits  |
| Death                | Head becomes an ink splat (one of 6 hand-drawn blots, randomly rotated) that stays on the sheet for the rest of the attempt; paper crumple SFX; 120ms rumble @0.6 |
| Level clear          | The sheet is grabbed at the corner and *turned* — a page-turn wipe into the results card           |
| Objective completed  | The objective's line on the tray gets a highlighter swipe, left to right, 240ms                    |
| Player joins mid-run | Their head is drawn onto the sheet with a 300ms "sketching in" stroke reveal                       |

**Death splats persist.** After a few failed attempts a hard section is
visibly covered in the marks of your failures. That is the joke, it is free
telemetry for the player, and it is why the assist system in §6.4 can announce
itself without feeling like an insult.

### 2.8 Accessibility of the look

Three commitments, all testable:

1. **Seat identity is never colour alone.** Each seat has a colour (`--bum-seat-N`),
   a **forehead mark** (`● ▲ ■ ✚`), and a **name tag** that can be pinned on
   permanently (Settings → "Always show name tags"). The colourblind-safe
   capability claim rests on the mark, not on the palette.
2. **Nothing flashes.** Hard ceiling: **no more than 3 luminance transitions per
   second exceeding 10% of the screen area**, anywhere, in any world, including
   Marker Mosh. The rave world pulses via *scale and position* on the beat, and
   via a slow (≤1Hz) wash across a maximum of 25% of the frame. This is enforced
   by review, and there is a note in the world's level data
   (`palette.flashSafe: true`) so an author cannot quietly opt out.
3. **Contrast.** Ink on paper is ~12:1. World palettes may tint but must keep
   the ink/paper pair above **7:1**; the level loader asserts this at author time
   (§6.1) so a pretty world cannot ship unreadable.

---

## §3 Core mechanics — the physics of grabbing

### 3.1 Body model

Built on **`matter-js`** (already a dependency — `matter-js@0.20` +
`@types/matter-js`, currently used only by `lib/rmhvibe`). Reasons to pick it
over hand-rolling: constraints, sleeping, broadphase and composite bodies are
exactly what this game is, and it is small, deterministic-enough for a
host-authoritative model (§9.1), and has no WebGL requirement.

One character is a `Composite`:

| Part            | Body                       | Notes                                                                  |
| --------------- | -------------------------- | ---------------------------------------------------------------------- |
| Head            | circle, r = 26             | `mass 1.2`, `frictionAir 0.012`, `restitution 0.15`                    |
| Arm segments ×4 per arm | capsule, len 22, r 4 | `mass 0.05` each — light enough that arms don't drag the head around   |
| Hand            | circle, r = 10             | `mass 0.12`, high friction (`0.9`)                                     |
| Shoulder joint  | `Constraint` head↔seg0     | `stiffness 1`, `length 0` (rigid attach at ±18px from head centre)     |
| Segment joints  | `Constraint` segN↔segN+1   | `stiffness 0.9`, `damping 0.08`                                        |

Total: 4 players × (1 head + 8 segments + 2 hands) = **44 bodies** for actors,
plus level geometry. Comfortably inside budget (§17).

**Collision layers** (`collisionFilter`):

| Layer            | Bit | Collides with                                     |
| ---------------- | --- | ------------------------------------------------- |
| `WORLD`          | 1   | everything                                        |
| `HEAD`           | 2   | `WORLD`, `PROP`, `HAZARD`, `HEAD`                 |
| `ARM`            | 4   | `WORLD`, `PROP` — **not** `HEAD`, **not** `ARM`   |
| `HAND`           | 8   | `WORLD`, `PROP`, `HAZARD`                         |
| `PROP`           | 16  | everything                                        |
| `HAZARD`         | 32  | `HEAD`, `HAND`, `PROP`                            |
| `CARRY`          | 64  | `WORLD` only (a carried relic does not shove you) |

Arms not colliding with heads or other arms is the single most important
decision here: four players tangling in one gap is the *point*, and arm-vs-arm
collision turns that into a jittering knot that ejects everyone.

### 3.2 Aim model

Each arm has a **target direction** — a unit vector from the analog stick (or
its keyboard/touch equivalent, §4). Every physics step, each arm segment
receives a torque pulling it toward lying along that direction, strongest at the
shoulder and weakest at the wrist:

```
for i in 0..3:
  desired   = shoulderPos + dir * (segLen * (i + 0.5))
  toward    = desired - seg[i].position
  force     = clamp(toward * ARM_REACH_GAIN * segWeight[i], ARM_FORCE_MAX)
  applyForce(seg[i], force)
```

`segWeight = [1.0, 0.85, 0.7, 0.55]`. When the stick is centred, the arm goes
limp (gain × 0.15) and dangles — which matters, because "limp arms" is how you
read a player who has let go and is falling.

**Reach.** Fully extended, hand centre sits **118 px** from the head centre.
Stretch Ink (§6.2) raises this to **176 px** for 20 s by scaling `segLen`.

### 3.3 Grab model

The grab is the whole game, so it is specified exactly.

**Attach.** While the grab input for a hand is held:

1. Query bodies whose `grabbable` flag is set within `GRAB_RADIUS` (18 px, or 24
   px with assist, §4.7) of the hand centre.
2. Prefer, in order: another player's **hand** > another player's **head** > a
   `PROP` > `WORLD` geometry. (Hand-to-hand beats hand-to-head so that a
   deliberate handshake wins over an accidental headlock.)
3. Create a `Constraint` between the hand and the target body at the contact
   point: `stiffness 0.95`, `damping 0.12`, `length 0`.
4. Latch it. The grip **persists while the button is held**, even if the target
   moves away — you are holding on, not overlapping.

**Detach** when the button releases, when the constraint's tension exceeds
`GRIP_BREAK_FORCE`, or when the target is destroyed/despawned.

**Grip strength is finite and that is the drama.** `GRIP_BREAK_FORCE = 0.085`
(matter force units). A four-player chain hanging from one hand *can* tear, and
the tearing is telegraphed: at >70% of break force the arm renders with a
stretched, thinning stroke and the rumble ramps 0.1→0.5. Players learn to feel
this. Do not remove it to "fix" chains breaking.

**Slick and grip materials** scale the break force (§6.2): ice is 0.45×, rubber
matting 1.6×, greased pan 0.25×.

### 3.4 Chains and throwing

No special code. A chain is `player A's hand → player B's hand` constraints
composed transitively, and a throw is momentum transfer through those
constraints followed by release. Two support systems make it *feel* deliberate:

- **Release assist.** If a player releases within 80 ms of their peak swing
  speed, the hand's release impulse is scaled by 1.08. Invisible, and it makes
  "let go at the top of the arc" reward timing rather than luck.
- **Chain read-out.** When ≥3 characters are linked, each link's stroke is drawn
  slightly thicker and a faint tension gradient runs along it. Four players can
  see they are one rope.

**Anchor rule.** A grab is only load-bearing if *something* in the chain is
attached to `WORLD` or a `PROP` that is itself anchored. Two players holding
only each other in mid-air fall together — the sim gives this for free, and
several levels are built on players discovering it.

### 3.5 Death, respawn, checkpoints

- **Death** on: leaving level bounds; contact with a `HAZARD` body; impact
  above `DEATH_SPEED` (**26 px/step**, ≈ a 3-storey fall) against `WORLD`.
- **Respawn** at the **last checkpoint reached by the party**, after a 900 ms
  splat-and-crumple beat. The source respawns at the level start; we use
  checkpoints because our sessions are shorter and our audience is
  drop-in — losing three minutes of four-player progress to one player's
  mistake is a churn event on a website in a way it is not on a console.
  Checkpoints are **generous and authored** (§6.7): roughly every 25–40 s of
  intended play.
- **A dead player never blocks the party.** They respawn alone at the checkpoint
  while everyone else keeps playing. This is the anti-frustration keystone.
- **Party wipe** (all players dead simultaneously) → all respawn at the
  checkpoint, attempt counter +1, and the failure counter for §6.4 ticks.
- **Ink splats persist** for the attempt (§2.7).

### 3.6 The tunables table

Everything above, in one place, as `lib/bums-rush/constants.ts`. These are the
values to hand a designer; nothing else in the engine should carry a magic
number.

```ts
export const PHYSICS = {
  FIXED_DT_MS: 1000 / 60,
  MAX_SUBSTEPS: 3,          // accumulator clamp — never spiral
  GRAVITY_Y: 1.15,          // matter units
  HEAD_RADIUS: 26,
  HEAD_MASS: 1.2,
  HEAD_AIR_FRICTION: 0.012,
  HEAD_RESTITUTION: 0.15,
  ARM_SEGMENTS: 4,
  ARM_SEG_LENGTH: 22,
  ARM_SEG_RADIUS: 4,
  ARM_SEG_MASS: 0.05,
  ARM_SEG_WEIGHT: [1.0, 0.85, 0.7, 0.55],
  ARM_REACH_GAIN: 0.0016,
  ARM_FORCE_MAX: 0.0055,
  ARM_LIMP_GAIN: 0.15,
  ARM_REACH_PX: 118,
  ARM_REACH_PX_STRETCHED: 176,
  SHOULDER_OFFSET_X: 18,
  HAND_RADIUS: 10,
  HAND_MASS: 0.12,
  HAND_FRICTION: 0.9,
  GRAB_RADIUS: 18,
  GRAB_RADIUS_ASSIST: 24,
  GRIP_STIFFNESS: 0.95,
  GRIP_DAMPING: 0.12,
  GRIP_BREAK_FORCE: 0.085,
  GRIP_WARN_RATIO: 0.7,
  RELEASE_ASSIST_WINDOW_MS: 80,
  RELEASE_ASSIST_SCALE: 1.08,
  DEATH_SPEED: 26,
  RESPAWN_DELAY_MS: 900,
  DESIGN_WIDTH: 1920,       // design space; the stage fits 16:9
  DESIGN_HEIGHT: 1080,
} as const;
```

**Tuning discipline.** These numbers are a system, not a list. `GRIP_BREAK_FORCE`
and `HEAD_MASS` and player count are one equation: raising head mass makes
four-player chains tear at rest. Any PR that changes a `PHYSICS` value must
state which of the four **feel tests** it was validated against:

1. A single player can swing from one handhold and reach a ledge 300 px away.
2. Two players can chain to cross a 420 px gap with one anchored.
3. Four players hanging vertically from one anchored hand do **not** tear at rest,
   but tear if the bottom player swings hard.
4. A dropped player falling 1000 px and landing flat survives; falling 1600 px
   does not.

These four are the acceptance criteria for T3 (§20) and live as unit tests.

### 3.7 Fixed timestep, and what determinism we do and don't need

The sim runs on a **fixed 1/60 s accumulator**, max 3 substeps per frame, with
rendering interpolated between the last two sim states. Render never drives the
sim; a 144Hz monitor and a 30fps phone simulate identically.

We deliberately **do not require cross-machine determinism.** `matter-js` is not
bit-reproducible across engines and CPU architectures, and every lockstep design
that assumes otherwise eventually desyncs in a way nobody can reproduce. The
netcode (§9.1) is host-authoritative precisely so this never becomes a question.
Do not add "deterministic" to any module name here.

---

## §4 Controls & bindings

The source's developers explicitly recommend a controller, and its Steam
accessibility block lists **Full Controller Support**, **Xbox** and
**PlayStation** controller support, and a **Keyboard Only Option**. We match all
three and add touch.

### 4.1 Gamepad — the default map

One arm per trigger/stick pair. This is the layout the genre has settled on and
players arrive already knowing it.

| Input                     | Xbox        | PlayStation | Switch      | Action                                       |
| ------------------------- | ----------- | ----------- | ----------- | -------------------------------------------- |
| Left stick                | LS          | L3          | L Stick     | **Aim left arm** (direction = stick vector)  |
| Right stick               | RS          | R3          | R Stick     | **Aim right arm**                            |
| Left trigger              | LT          | L2          | ZL          | **Grab / hold — left hand**                  |
| Right trigger             | RT          | R2          | ZR          | **Grab / hold — right hand**                 |
| Left bumper               | LB          | L1          | L           | Grab left (alternate — same action)          |
| Right bumper              | RB          | R1          | R           | Grab right (alternate)                       |
| Face down                 | A           | ✕           | B           | **Emote / holler** (hold to charge, §4.8)    |
| Face right                | B           | ○           | A           | Use held item (§6.2)                         |
| Face left                 | X           | □           | Y           | Drop carried object                          |
| Face up                   | Y           | △           | X           | Toggle name tags                             |
| D-pad                     | —           | —           | —           | Emote wheel (4 quick emotes)                 |
| Start / Options / +       | —           | —           | —           | Pause (host: pauses room; guest: personal menu, §9.6) |
| Select / Share / −        | —           | —           | —           | Scoreboard / objective tray                  |

**Why triggers *and* bumpers both grab.** Analog triggers are the better feel,
but some pads have no analog triggers and some players cannot hold a trigger
comfortably for minutes at a time. Both being live by default costs nothing and
removes a support class entirely.

**Analog trigger nuance.** Where the trigger reports an axis, grip strength
ramps with pull: below 0.25 no grip; 0.25–1.0 maps to 60%–100% of
`GRIP_BREAK_FORCE`. A light grip that slips is a mechanic, not a bug — and it is
*off* under Assist (§4.7).

**Deadzones.** Radial deadzone of **0.22** with a re-normalised outer range, and
a **0.92** saturation radius so square-gated sticks can reach the diagonals.
Both are exposed in Settings (0.05–0.40) because worn sticks are common.

**Detection & labels.** `navigator.getGamepads()` polled once per frame inside
the existing rAF loop (the pattern in `components/nightrail/NightrailGame.tsx`).
Brand is inferred from `Gamepad.id` (`Vendor: 054c` → PlayStation, `057e` →
Nintendo, `xinput|Xbox` → Xbox, else generic ABXY), and **every prompt in the
game re-labels accordingly** — including tutorial sticky notes. A PlayStation
player must never be told to press "A". Detection is a hint, not a lock: the
Settings screen has a manual override.

**Rumble** via `gamepad.vibrationActuator.playEffect('dual-rumble', …)` where
supported, with a global intensity slider (0–100%, default 60%) and an off
switch. Effects listed in §2.7. Never assume the API exists; feature-detect.

**The user-gesture catch.** Browsers do not expose gamepads until a button is
pressed. The title screen therefore shows "Press any button" and listens for
`gamepadconnected` *plus* polls, and the device-join prompt (§4.6) explains this
in one line rather than appearing broken.

### 4.2 Keyboard

A full keyboard-only path (the source ships one; so do we), plus a two-players-
on-one-keyboard split, which is how couch co-op actually happens on a laptop.

**Player 1 (default):**

| Keys        | Action                                        |
| ----------- | --------------------------------------------- |
| `W A S D`   | Aim left arm (8-way, smoothed — see below)    |
| `↑ ← ↓ →`   | Aim right arm                                 |
| `Q` or `Shift` | Grab left                                  |
| `E` or `/`  | Grab right                                    |
| `Space`     | Emote / holler                                |
| `F`         | Use item · `G` drop                           |
| `Esc`       | Pause · `Tab` objectives                      |

**Player 2 (split keyboard, local only):** `T F G H` / `I J K L` aim, `R` / `O`
grab, `Y` emote. Deliberately reachable by two people sharing one board.

**Digital→analog smoothing.** A key press does not snap the aim vector; it
drives it toward the 8-way target at **12 rad/s**, so keyboard swings have
momentum instead of teleporting the arm. Without this, keyboard play is
genuinely unplayable (a complaint the original game collected), and with it,
keyboard is a real option — just less precise.

**Keyboard assist default: ON.** Keyboard players get `GRAB_RADIUS_ASSIST` by
default (toggleable). This is the compensation for 8-way aim, and it is why we
can honestly claim a keyboard-only option.

### 4.3 Mouse

Mouse is a **supported supplement, not a control scheme**: menus, the wardrobe,
the world map and the level editor are fully mouse-driven, and in-game the mouse
aims the **right** arm (with left-click = right grab) so a mouse+keyboard player
gets one precise arm and one WASD arm. This is a genuinely good hybrid and
should be offered explicitly in the input picker, not discovered.

### 4.4 Touch

Full spec in §12. Summary: two thumb zones, drag to aim, **Auto-Grab** on by
default, with an advanced two-button mode for players who want it.

### 4.5 Remapping

Every action above is remappable. This is the `remappable-input` capability
claim and must actually ship.

```ts
// lib/bums-rush/input/bindings.ts
export type ActionId =
  | 'aimLeft' | 'aimRight'          // axis pairs
  | 'grabLeft' | 'grabRight'
  | 'emote' | 'useItem' | 'dropItem' | 'toggleTags'
  | 'pause' | 'objectives';

export interface Binding {
  /** Which physical source. */
  source: 'keyboard' | 'gamepad' | 'touch' | 'mouse';
  /** KeyboardEvent.code, gamepad button index, or axis pair id. */
  code: string;
  /** For axis bindings: which of the pair, and its polarity. */
  axis?: { index: number; sign: 1 | -1 };
}

export interface BindingSet {
  version: 1;
  profileName: string;
  bindings: Partial<Record<ActionId, Binding[]>>;  // multiple per action = alternates
  deadzone: number;
  saturation: number;
  rumble: number;      // 0..1
  triggerAnalog: boolean;
  assist: AssistSettings;   // §4.7
}
```

- Stored **per device profile** (keyed by `gamepad.id` hash for pads, one entry
  for keyboard, one for touch) on `BumsRushProfile.bindings` (§10.2), mirrored to
  `localStorage` so a signed-out player keeps them.
- The remap UI is a DOM screen (not canvas): a table of actions, each row a
  `TapeButton` that enters listen mode. It shows the **detected brand's glyphs**.
- **Conflict handling:** binding a key already used shows an inline warning and
  offers to swap. Never silently steal.
- **"Reset to defaults"** per profile, and a hard reset.
- Serialisation is versioned (`version: 1`) with a migration function, because
  bindings outlive schema changes and a broken binding set is a player who
  cannot move.

### 4.6 Local devices, seats and drop-in

A **seat** is a playable character in a room (max 4). A **device** is a physical
input. One browser client may own several seats (couch co-op).

- Any unassigned gamepad pressing any button raises the **join prompt**:
  a paper card sliding in — _"Player 3, press <Grab> to join"_. Confirm → a seat
  is requested from the server, the character is sketched in at the checkpoint
  (§2.7) and play continues. **Never pause the game to add a player.**
- Devices are bound to seats by identity, so unplugging and replugging a pad
  restores its seat within a 60 s grace window rather than orphaning it.
- Leaving: hold the pause button 1.5 s, or a disconnected pad after grace →
  seat is released, the character walks off as a torn-out piece of paper.
- The **input picker** on the title screen lets a solo player pick keyboard,
  keyboard+mouse, or pad explicitly rather than guessing.

### 4.7 Assist settings

This is the `assist-mode` capability claim. All are per-player (so one person in
a party can use them without imposing on anyone), all are non-competitive-safe
(they are **disabled in ranked Showdown**, §8.4), and all are visible in the
seat's HUD chip so nobody is secretly playing a different game.

| Setting              | Default            | Effect                                                              |
| -------------------- | ------------------ | ------------------------------------------------------------------- |
| **Grab assist**      | on (kbd/touch), off (pad) | `GRAB_RADIUS` 18 → 24                                        |
| **Sticky grip**      | off                | Grip never breaks from tension (only from release)                  |
| **Analog triggers**  | on                 | Off = binary grip at full strength                                  |
| **Auto-grab**        | on (touch), off    | Hand grips automatically on contact while the input is held         |
| **Slow-mo**          | off                | Sim runs at 0.75× for this player's *local* practice only (solo/practice modes; never in a shared room) |
| **Extra checkpoints**| off                | Enables the authored optional checkpoint set (§6.7)                 |
| **No fall damage**   | off                | `DEATH_SPEED` → ∞ (bounds and hazards still kill)                   |
| **Aim smoothing**    | 0.35               | Low-pass on the aim vector; helps tremor and worn sticks            |
| **One-handed mode**  | off                | Both arms driven from one stick: aim controls the active arm, grab-toggle swaps. Slower, fully completable |

**Solo Ladder leaderboards** record which assists were active and file runs into
`assisted` or `clean` boards — visible, never hidden, never a scold.

### 4.8 The holler

The face-down button is an **emote** — the character opens its mouth and yells,
with a paper speech-bubble. Held longer = bigger bubble. It exists because a
four-player physics game needs a non-verbal "GRAB ME" and because voice chat is
out of scope. Four D-pad quick emotes: **"grab me!"**, **"go!"**, **"sorry"**,
**"wait"**. All localised (§15), all rate-limited (6/5s) with a per-seat mute in
the scoreboard for the one player who discovers the sorry button.

---

## §5 Camera & staging

Levels are **wider and taller than one screen**; the camera must handle four
players who are frequently trying to be in different places.

- **Frame all live players**, plus a 140 px margin, clamped to level bounds.
- **Zoom range 0.55×–1.35×** of design scale. If the required zoom would go
  below 0.55×, the camera stops zooming and instead shows **edge indicators**:
  each off-screen player is a small arrow at the frame edge in their seat colour
  and mark, with a distance number. Never let a player be invisible with no cue.
- **Zoom and pan are critically damped** toward the target (spring `ω = 6.0`,
  `ζ = 1.0`), so nothing overshoots and nobody gets motion sick.
- **Dead players are excluded** from framing after 400 ms.
- **Lookahead**: the frame biases 0.18 × mean party velocity in the direction of
  travel, capped at 180 px.
- **`prefers-reduced-motion`**: lookahead and zoom-spring are halved, and the
  screen-shake amplitude is 0.
- **Solo camera** is tighter (0.85×–1.2×) because there is nobody to frame with.
- **Showdown split**: race arenas frame all players like co-op; last-one-standing
  arenas are single-screen by design (§8.2), so no split-screen renderer is
  needed — this is a deliberate scope saving and it constrains arena authoring.

The playfield uses `.app-stage-fit` + `.app-stage` (16:9) per §12.1 rule 2. The
HUD sits **outside** `.app-stage` (in the letterbox) except for in-world
indicators, which sit inside.

---

## §6 The level system

### 6.1 The level file format

Levels are **data**, in `data/bums-rush/levels/<world>/<id>.json`, validated by a
zod schema at load. This is the decision that makes §20's parallel authoring
possible: eight agents can write eight worlds simultaneously and the only shared
code is the schema.

```ts
// lib/bums-rush/levels/schema.ts  (abridged — full field list is normative)
export const levelSchema = z.strictObject({
  version: z.literal(1),
  id: z.string().regex(/^w[1-8]-\d{2}$/),        // e.g. "w3-07"
  world: z.number().int().min(1).max(8),
  index: z.number().int().min(1),                 // order within the world
  name: z.string().min(1),                        // i18n KEY, not display text
  minPlayers: z.number().int().min(1).max(4),
  maxPlayers: z.number().int().min(1).max(4).default(4),
  parSeconds: z.number().positive(),              // for the Clock objective
  bounds: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  palette: z.object({
    paper: z.string(), ink: z.string(), accent: z.string(),
    flashSafe: z.literal(true),                   // §2.8 — cannot be opted out of
    contrastRatio: z.number().min(7),             // asserted by the loader
  }),
  spawn: z.array(pointSchema).min(1).max(4),
  goal: z.object({ shape: shapeSchema, requires: z.enum(['any', 'all']) }),
  checkpoints: z.array(z.object({
    at: pointSchema, optional: z.boolean().default(false),  // §4.7 extra checkpoints
  })),
  geometry: z.array(z.object({
    shape: shapeSchema,                            // rect | poly | circle | chain
    material: materialIdSchema,                    // §6.2
    render: z.enum(['drawn', 'cutout', 'taped', 'pinned', 'torn']),
    grabbable: z.boolean().default(true),
  })),
  props: z.array(propSchema),                      // §6.2 — discriminated union on `kind`
  hazards: z.array(hazardSchema),                  // §6.3
  objectives: z.array(objectiveSchema).length(3),  // §7 — exactly three
  decorations: z.array(decorationSchema),          // sticky notes, doodles, coffee rings
  assistBeams: z.array(shapeSchema),               // §6.4
  music: z.string(),                               // track id
  authorNotes: z.string().optional(),              // not shipped to client
});
```

**Loader rules** (`lib/bums-rush/levels/loader.ts`):

- Parses with the strict schema; an unknown key is an error, exactly as the
  catalog does — the same class of bug (a typo that silently renders nothing).
- Asserts `palette.contrastRatio` against the actual computed ratio of
  `ink`/`paper` and **refuses** to load below 7:1.
- Asserts `spawn.length >= minPlayers`, every objective is reachable-by-type,
  the goal is inside `bounds`, and no prop overlaps a spawn point.
- Levels are **lazily fetched per world** (one JSON bundle per world, ~9 levels,
  gzip target < 60 KB/world) so the initial load ships World 1 only.
- The manifest `data/bums-rush/levels/index.json` lists worlds, level ids,
  `minPlayers` and par times — small enough to ship in the initial bundle so the
  world map renders before any world is fetched.

### 6.2 The prop catalog

Every prop is a `kind` in a discriminated union, each with its own params. The
source's item list (_"pop guns, drones, space ships, ski lifts, keys, and
ketchup … and lasers"_) maps onto these; the two named power-ups become
**Paperweight** and **Stretch Ink** per §0.3.

**Materials** (affect grip and render pattern — §2.3):

| Material   | Grip ×  | Friction | Pattern        | Reads as             |
| ---------- | ------ | -------- | -------------- | -------------------- |
| `paper`    | 1.00   | 0.6      | crosshatch     | default surface      |
| `rubber`   | 1.60   | 0.95     | dot-stipple    | grippy matting       |
| `ice`      | 0.45   | 0.05     | thin-scribble  | slick                |
| `grease`   | 0.25   | 0.02     | marker-streak  | greased / ketchup    |
| `crumbly`  | 1.00   | 0.6      | broken-hatch   | breaks after 1.2 s held |
| `nogrip`   | 0.00   | 0.4      | flat wash      | cannot be gripped at all |

**Props:**

| `kind`           | Behaviour                                                                                       | Params                                    |
| ---------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `crate`          | Dynamic body, grabbable, carryable                                                               | `size`, `mass`                            |
| `swing`          | Pinned bar on a pivot; free rotation                                                             | `pivot`, `length`, `damping`              |
| `rope`           | Chain of 8–20 linked segments, all grabbable                                                     | `anchor`, `segments`, `stiffness`         |
| `platformMoving` | Kinematic, follows a path, carries whatever grips it                                             | `path[]`, `speed`, `easing`, `loop`       |
| `platformFalling`| Static until gripped, then falls after `delay`                                                   | `delay`                                   |
| `lever`          | Pinned; rotating past `threshold` fires a `signal`                                               | `threshold`, `signal`, `latching`         |
| `button`         | Fires `signal` while a body of ≥ `minMass` rests on it                                           | `minMass`, `signal`                       |
| `door`           | Opens on `signal`; blocks otherwise                                                              | `signal`, `openOffset`, `speed`           |
| `key`            | Carryable; opens `lockId` on contact                                                             | `lockId`                                  |
| `popCannon`      | Grab the handle, aim with the other arm, release to **launch whoever is in the barrel**          | `power`, `cooldownMs`, `arc`              |
| `fan`            | Directional air volume; applies force, no collision                                              | `dir`, `force`, `pulse?`                  |
| `conveyor`       | Surface with tangential velocity                                                                 | `speed`                                   |
| `skiLift`        | Chair on a cable path; grabbable; carries riders                                                 | `path`, `speed`, `chairs`                 |
| `trampoline`     | High restitution surface                                                                         | `bounce`                                  |
| `magnet`         | Radial attraction on `HEAD`/`PROP`                                                               | `radius`, `force`, `polarity`             |
| `zeroG`          | Volume where gravity scales to `g`                                                               | `g` (0…1)                                 |
| `thruster`       | Carried item; `useItem` fires a puff of impulse opposite the aim                                 | `impulse`, `charges`                      |
| `relic`          | Carryable objective token (§7)                                                                   | `relicId`                                 |
| `parcel`         | Hidden gift → cosmetic unlock (§11.2)                                                            | `parcelId`                                |
| `poseOutline`    | Dotted silhouette; completing the pose scores the objective (§7)                                 | `poseId`, `tolerance`                     |
| `camera`         | Equippable; `useItem` takes a photo, scoring photo objectives (§7)                               | —                                         |
| `paperweight`    | Pickup: freezes the user in place as a solid platform for `durationMs` or until re-used          | `durationMs` (default 6000)               |
| `stretchInk`     | Pickup: sets an **ally's** arm reach to `ARM_REACH_PX_STRETCHED` for 20 s (aim at them and use)   | —                                         |
| `rescueDrone`    | Summonable; flies to a dead/stranded player and carries them to the checkpoint                    | `cooldownMs`                              |
| `plate`          | Sizzle Street: an accumulator that checks a required set of carried ingredients (§6.6 W2)         | `recipeId`, `slots`                       |
| `signalRelay`    | Logic: AND/OR/NOT/delay over signals — lets authors build puzzles without code                    | `op`, `inputs[]`, `out`, `delayMs`        |

`signalRelay` deserves a note: it exists so that a level author can express
"both levers, within two seconds, opens the gate" as data. Without it, every
puzzle variant becomes a code change and the parallel authoring in §20 collapses.

### 6.3 Hazards

| `kind`      | Behaviour                                                              |
| ----------- | ---------------------------------------------------------------------- |
| `spikes`    | Static lethal surface (drawn as torn paper teeth)                      |
| `laser`     | Beam between two points; lethal; `onMs`/`offMs` cycle (≥ 700 ms period, §2.8) |
| `saw`       | Rotating lethal disc on a path                                          |
| `crusher`   | Kinematic body that kills on being pinned against geometry             |
| `heat`      | Volume; lethal after `graceMs` (hot pan — gives you time to panic)      |
| `void`      | Out-of-bounds volume (explicit, for levels with holes mid-map)          |
| `wind`      | Non-lethal but authored as a hazard: strong directional gust           |
| `crumble`   | Geometry that becomes `void` after being gripped                        |

**Rule:** a hazard must be visually distinct in monochrome. Every lethal thing is
drawn with the **torn** construction language (§2.6) plus a red-pen outline —
two channels.

### 6.4 Assist: beams, the drone, and the Studio Cat

Three escalating, entirely optional supports. The source has both the striped
assist beams and a cat that turns everyone into drones after repeated failure;
we keep both because they are excellent design and solve a real problem for a
drop-in web audience.

1. **Assist beams** — striped bars authored per level (`assistBeams`), always
   present, always grabbable, placed to make a hard traversal merely awkward.
   They cost the **Clock** objective (§7) if used, so skilled play still has a
   reason to ignore them. No prompt, no shame, just a visible option.
2. **Rescue Drone** — after a player has been dead or stranded for 20 s, a paper
   drone can be summoned (their own `useItem`) to lift them to the checkpoint.
   Cooldown 45 s. This is the fix for "one player is stuck behind a wall while
   three wait".
3. **Inkblot, the Studio Cat** — after **6 party wipes on the same checkpoint**,
   a cat's paw comes in from the top of the sheet and bats everyone; every player
   becomes a **flying drone** with simple directional control until the next
   checkpoint. It is presented as a joke, not a mercy: the cat is bored of
   watching. Levels completed with Inkblot's help are marked with a paw print on
   the world map and **do** count as cleared, but do **not** score the Clock
   objective. Configurable in Settings (`off` / `6 wipes` / `3 wipes`).

### 6.5 Authoring workflow and the editor

Levels are hand-authored JSON, which is fine for a machine and miserable for a
human. Ship a minimal in-repo editor at `/bums-rush?editor=1` (dev-only, gated
on `import.meta.env.DEV`) that:

- loads a level JSON, renders it with the real renderer, and lets you drag
  geometry/props with snapping to a 16 px grid,
- runs the real physics with a single test character so feel is checked in place,
- exports JSON matching the schema (round-trip stable — the export of an
  unmodified load is byte-identical, which is a test),
- shows the loader's assertions live (contrast, reachability, spawn overlap).

This is **not** a user-facing level editor in v1. User-generated levels are §22.

### 6.6 The eight worlds

Each world introduces mechanics, uses them, complicates them, and hands off.
Nine co-op levels each = **72**. Seven Showdown arenas each = **56** (§8).

| # | World             | Theme                       | New mechanics introduced                                          | Materials in play      |
| - | ----------------- | --------------------------- | ------------------------------------------------------------------ | ---------------------- |
| 1 | **Doodle Docks**  | Harbour, crates, cranes     | Grab, swing, chain, throw, carry; `crate`, `rope`, `swing`, `platformMoving` | paper, rubber   |
| 2 | **Sizzle Street** | A restaurant kitchen        | `conveyor`, `heat`, `grease`, `relic` carrying, `plate` recipes    | grease, paper          |
| 3 | **Big Tent Bother** | Circus                    | `popCannon`, `trampoline`, high `swing` trapezes, `poseOutline` focus | rubber, paper        |
| 4 | **Castle Clatter**| Medieval keep               | `lever`, `button`, `door`, `key`, `signalRelay` puzzles, `crusher` | paper, crumbly         |
| 5 | **Shuriken School** | Ninja dojo                | `crumble`, `saw`, timed `laser` gates, `nogrip` walls, stealth-ish dark rooms | nogrip, crumbly |
| 6 | **Chalk Peaks**   | Snowy mountain              | `ice`, `skiLift`, `wind`, falling-`platform` cornices               | ice, paper             |
| 7 | **Vacuum Ward**   | Space station               | `zeroG`, `thruster`, `magnet`, airlock `door` chains, drifting debris | nogrip, rubber       |
| 8 | **Marker Mosh**   | A rave in a stationery cupboard | Beat-synced `platformMoving` and `fan` pulses, `laser` grids on the bar, everything at once | all |

**Per-world beats.** Each world's nine levels follow the same shape, which is
the contract between the eight authoring agents:

| Level | Role                                                                  |
| ----- | --------------------------------------------------------------------- |
| 01    | **Teach.** The new mechanic alone, safe, no death possible in the first 20 s. Sticky-note tutorial. |
| 02    | **Use.** The mechanic with a real gap and a real fall.                 |
| 03    | **Combine.** The new mechanic + one from a previous world.             |
| 04    | **Twist.** The mechanic behaves unexpectedly (the conveyor reverses, the lift is broken). |
| 05    | **Breather.** Short, funny, wide, high objective density. Solo-viable. |
| 06    | **Escalate.** Two of the new mechanics interacting.                    |
| 07    | **Team gate.** `minPlayers: 2` — a genuine chain-required traversal.   |
| 08    | **Gauntlet.** Long, three checkpoints, everything the world has.       |
| 09    | **Set piece.** A single memorable spectacle (the crane collapses, the kitchen floods with ketchup, the rocket launches with you on it). |

**World details.**

**W1 · Doodle Docks.** Cream paper, blue ruled lines still visible, everything
drawn in biro. Cranes are pinned; crates are cut-outs; the sea is a scribble that
kills. Teaches, in order: aim (01), grab and swing (01), let go (02), grab a
friend (03 — `minPlayers` still 1, with a rope standing in for the friend when
solo), carry (04), throw a friend (07). The set piece (09) is a cargo crane that
tips as you climb it, turning the level 30° over 40 seconds.

**W2 · Sizzle Street.** The paper is a grease-spotted recipe card. Conveyors
carry ingredients; hot pans have a 1.2 s grace with an escalating sizzle; ketchup
is `grease` and coats anything that touches it (grip × 0.25 for 6 s, drawn as a
red smear on the hands). The recipe objectives — "Sashimi Three Ways", "The Vegan
Sandwich", "Friend Juice" — are `plate` props checking a carried set. 09 is a
flood: the level fills with ketchup from the bottom at 40 px/s.

**W3 · Big Tent Bother.** Bold circus red-and-yellow marker. Pop cannons need two
players (one holds the handle, one is the ammunition) which is the world's joke
and its lesson. Trapezes are long `swing` props with low damping so timing
matters. The most `poseOutline` objectives of any world (the outlines are
"circus poses" — a human pyramid needs three players and is the game's best
photograph).

**W4 · Castle Clatter.** Grey pencil on parchment tint. This is the puzzle
world: `signalRelay` builds two-lever gates, timed portcullises, and a
three-player pressure-plate sequence in 08. The crusher is a portcullis; the
`crumbly` material is old mortar. 09 is a catapult that fires the whole party
across a moat in one shot — you must be chained to survive it.

**W5 · Shuriken School.** Ink-wash, high contrast, deliberate negative space.
`nogrip` lacquered walls mean whole surfaces are off-limits — the first world
where "where can I grab" is the puzzle. Laser gates cycle on a 900 ms period
(safely above the flash floor). Dark rooms are lit by a carried lantern, which
means one player is holding the light and cannot grab with that hand.

**W6 · Chalk Peaks.** White paper, chalk-blue ink, everything slightly
snow-blurred. `ice` reduces grip to 0.45× so swings must be shorter and more
frequent. Ski lifts are moving grab points on a fixed path; wind gusts arrive on
a telegraphed 4 s cycle with visible drawn arrows. 09 is an avalanche chase — the
first and only level with a forced scroll, and it is explicitly excluded from the
`no-timed-input` claim's spirit by having no input timing requirement, only a
positional one.

**W7 · Vacuum Ward.** Cold grey graph paper. `zeroG` volumes remove the down that
every previous world taught; thrusters give a limited number of impulse charges.
Magnets pull heads but not hands, which makes anchoring feel wrong on purpose.
Airlocks are `door` chains that need one player to stay behind and operate them,
then be retrieved. 09 is a space-ship launch where the level accelerates.

**W8 · Marker Mosh.** Highlighter neon on black sugar-paper — the one world with
inverted values. Platforms and fans pulse **on the beat** of the world's track
(the level data carries `bpm`, and the pulse is driven from the audio clock, §14,
not from `Date.now()`). Everything from every world returns. 09 is the finale:
the party must chain across a collapsing dance floor while the whole sheet is
slowly torn away from the right edge.

### 6.7 Pacing, difficulty and the solo split

- **`minPlayers` distribution.** Per world: levels 01–06 and 09 are
  `minPlayers: 1` (40 of them site-wide, plus 09s where feasible); 07 and 08 are
  `minPlayers: 2`. Solo players see co-op-only levels greyed with a "needs 2 —
  find someone" button that goes straight to matchmaking (§9.7).
- **Checkpoint density.** One per 25–40 s of intended play; a level with no
  checkpoint may not exceed 45 s of intended play. `optional: true` checkpoints
  are additional ones that only appear under the Extra Checkpoints assist.
- **Par times.** `parSeconds` = 1.35 × a competent solo run for `minPlayers: 1`
  levels, 1.5 × a competent two-player run otherwise. Generous on purpose: the
  Clock objective should be earned by not dying, not by speedrunning.
- **No level fails on a clock.** This is the `no-timed-input` claim. Par times
  gate an *optional* objective; the avalanche in W6-09 is a moving lethal
  boundary, which is a hazard, not a timer.
- **First-session promise:** a brand-new player, solo, on a phone, reaches the end
  of W1-01 within 90 seconds of the page loading. If they don't, W1-01 is wrong.

---

## §7 Objectives, collectibles and the camera

Each level carries **exactly three** optional objectives, matching the source's
"two to three". They are cosmetic-progression drivers only; the level is
"cleared" by reaching the goal.

| Type       | Description                                                                            | Scored when                                          |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `clock`    | Finish under `parSeconds`                                                               | Goal reached, timer under par, **no assist beam or Inkblot used** |
| `haul`     | Carry N `relic` props to the goal (gold staples, in-fiction)                            | All N present at the goal when it triggers            |
| `pose`     | Find the hidden `poseOutline` and fit a character into it within `tolerance`            | Held for 600 ms                                       |
| `snapshot` | Photograph a specified situation with the equipped `camera`                             | Photo validated (below)                               |
| `recipe`   | Deliver a required ingredient set to a `plate` (W2 only)                                | Plate satisfied                                       |
| `flawless` | Reach the goal with zero deaths (party-wide)                                            | Goal reached, death counter 0                         |

Each level picks three; `clock` appears in ~every level, the rest vary by world.

**The camera.** An equippable item (`useItem` fires it) that turns "do something
silly" into a scoreable objective. Photo validation is a **predicate over the sim
state at the shutter frame**, not image analysis:

```ts
// e.g. "Get all four players in one shot, all off the ground, at least one upside down"
{ kind: 'snapshot', id: 'w3-04-pyramid',
  predicate: { allSeatsInFrame: true, minSeats: 3, allAirborne: true, anyInverted: true } }
```

Taken photos are rendered as **paper Polaroids** into the results screen and the
Scrapbook (§11.3), composited from the actual frame at shutter time (a
`drawImage` of the stage into a small offscreen canvas — cheap, and the paper
frame does the rest). Photos are **local-only** in v1 (IndexedDB, cap 50) — no
upload, no moderation surface, no `user-content` descriptor. Sharing a photo to
the feed is §22 and would need the existing upload-security path.

**Parcels (hidden gifts).** 3–5 `parcel` props hidden per world (40 total), each
unlocking a cosmetic. Finding one is a small ceremony: the parcel unwraps into a
sticker that slides onto the results card.

**Objective attribution in multiplayer** is spelled out in §10.5 — the short
version is that objectives are scored **for everyone present**, because the
alternative teaches four people to race each other for a collectible in a
co-operative game.

---

## §8 Showdown (versus)

The source: _"Take revenge on your underperforming co-op teammates in versus mode
through a series of frantic challenges"_ — 2–4 players, first to five wins,
across a rotating playlist of arenas and three round types.

### 8.1 Structure

- 2–4 players. Solo, or 2v2 teams (4 players only).
- A match is a sequence of **rounds**. Each round picks an arena and a round type
  from the playlist; **first to 5 wins** takes the match.
- Arenas are drawn from the **56** Showdown arenas (7 per world), filtered to
  those supporting the drawn round type and the current player count.
- Between rounds: a 6 s results card with a running tally, skippable by all.
- Match length target: **8–14 minutes**.

### 8.2 Round types

| Type          | Rule                                                                                          | Arena requirement            |
| ------------- | --------------------------------------------------------------------------------------------- | ---------------------------- |
| `race`        | First to the goal wins. Everyone spawns together.                                              | A traversal arena with a goal |
| `survive`     | Last one alive wins. A closing lethal boundary (rising ketchup / shrinking sheet) forces an end within 75 s. | Enclosed, single-screen  |
| `handle`      | A single `lever` spawns after 5 s; first to pull it wins. Its position rotates between 3 spots. | Compact, contested middle    |

Three types keep the mode fresh without becoming a second game. `survive` is
single-screen by design so we never need a split-screen renderer (§5).

### 8.3 Grabbing your enemies

The **whole appeal** is that co-op mechanics become weapons unchanged. No new
verbs: you can grab a rival's hand or head and you can let go of them over a pit.
Two balance rules only:

- **No infinite hold.** Gripping another *player* has a 3.5 s cap, then the grip
  auto-releases and that pair cannot re-grip for 1.5 s. Without this, one strong
  player pins another for a whole round.
- **Respawn invulnerability**: 1.2 s after respawn, a player cannot be gripped.

### 8.4 Ranked, casual and integrity

- **Casual** (default): all assists allowed, everything visible in the HUD.
- **Ranked**: assists **disabled** for all seats; Elo-lite rating per player
  stored on `BumsRushProfile.showdownRating` (start 1000, K=24, team matches
  average the team).
- Because the sim is host-authoritative (§9.1), a determined host could cheat.
  Therefore: **Showdown is explicitly not wager-eligible** — do not add
  `bums-rush` to `lib/wager/eligible-games.ts` — and ranked results are
  plausibility-checked server-side (§9.8). Ranked is a fun ladder, not a
  competitive integrity product, and the UI says so in one line.

---

## §9 Multiplayer architecture

This is the section to read twice.

### 9.1 Topology: host-authoritative simulation, server as room manager + relay

**Decision: one client (the host) runs the authoritative physics simulation. The
socket server manages rooms, seats and matchmaking, relays opaque snapshot and
input payloads without simulating anything, and validates only results.**

Why, explicitly:

1. **The hub cannot afford a physics sim.** `server/socket-server` hosts ~18
   games in **one Node process** on a VPS. A 60 Hz `matter-js` world per room,
   times N rooms, converts that process from I/O-bound to CPU-bound and takes
   Slice It, RMHType and the casino games down with it. That is a
   platform-architecture constraint, not a preference.
2. **Repo precedent is explicit.** `handlers/rochester-offensive.ts` documents
   itself as "a pure ROOM MANAGER + DUMB RELAY … it does NOT simulate the game",
   and that game is a competitive FPS. Bum's Rush is a co-op party game; the
   integrity bar is lower, not higher.
3. **Lockstep is a trap here.** `matter-js` is not bit-reproducible across
   browsers/CPUs (§3.7). Deterministic lockstep would desync in the field in
   ways nobody can reproduce.
4. **Distributed authority (each client sims its own character) breaks the core
   mechanic.** The entire game is players constrained to each other; split
   authority over a shared constraint produces rubber-banding exactly where the
   game is supposed to feel solid.

The cost is that the host has a latency advantage and could cheat. §8.4 and §9.8
bound that; for co-op it is irrelevant, which is where 90% of play will be.

### 9.2 Session model

```
Room  (id: 6-char code, or a matchmaking-assigned uuid)
 ├─ host: clientId            (authoritative simulator; migratable)
 ├─ mode: 'campaign' | 'showdown' | 'solo-ladder'
 ├─ level / arena state
 └─ seats: Seat[0..3]
      ├─ seatIndex   0..3   → colour + mark (§2.8)
      ├─ clientId          (which browser owns it)
      ├─ userId | null     (signed-out players can play; §10.4)
      ├─ localIndex        (which pad/keyboard on that client — couch co-op)
      └─ cosmetics, assists, ready
```

A **client** may own multiple seats (couch co-op). A **room** caps at 4 seats
regardless of how they're distributed, so "2 on the sofa + 2 online" is a
first-class configuration and needs no special code — it falls out of seats being
independent of clients.

Rooms are **in-memory** in the hub (like every other socket-server game); the
durable artefacts are the results rows in §10. A restart drops rooms, and the
client's reconnect path (§9.6) handles it by offering to re-host.

### 9.3 Event catalog

Prefix `br:`. Added to `SOCKET_RATE_LIMITS` in `server/socket-server/config.ts`,
which is also the allowlist of valid inbound events.

**Client → server:**

| Event                | Payload                                                         | Rate limit        |
| -------------------- | --------------------------------------------------------------- | ----------------- |
| `br:createRoom`      | `{ mode, private, levelId?, cosmetics, name }`                  | 10 / 60 s         |
| `br:joinRoom`        | `{ code, cosmetics, name }`                                     | 20 / 60 s         |
| `br:quickPlay`       | `{ mode, minPlayers, region? }`                                 | 20 / 60 s         |
| `br:listRooms`       | `{ mode }`                                                      | 30 / 60 s         |
| `br:claimSeat`       | `{ localIndex }`                                                | 20 / 60 s         |
| `br:releaseSeat`     | `{ seatIndex }`                                                 | 20 / 60 s         |
| `br:setCosmetics`    | `{ seatIndex, head, hat, gloves, ink }`                         | 20 / 60 s         |
| `br:setAssists`      | `{ seatIndex, assists }`                                        | 20 / 60 s         |
| `br:ready`           | `{ seatIndex, ready }`                                          | 60 / 60 s         |
| `br:selectLevel`     | `{ levelId }` (host only)                                       | 40 / 60 s         |
| `br:start`           | `{}` (host only)                                                | 30 / 60 s         |
| `br:input`           | **hot path** — see §9.4                                         | 2400 / 60 s (40/s)|
| `br:snapshot`        | **hot path, host only** — see §9.4                              | 1800 / 60 s (30/s)|
| `br:event`           | `{ t, kind, data }` — discrete host events (death, checkpoint, objective, item) | 300 / 60 s |
| `br:emote`           | `{ seatIndex, emoteId }`                                        | 30 / 60 s         |
| `br:result`          | host-signed level/round result (§9.8)                           | 60 / 60 s         |
| `br:hostHandoff`     | `{ toClientId }` (host only, voluntary)                         | 10 / 60 s         |
| `br:ping`            | `{ t }` — RTT probe                                             | 120 / 60 s        |
| `br:leave`           | `{}`                                                            | 20 / 60 s         |

**Server → client:** `br:room` (full room snapshot), `br:roomList`, `br:seat`
(your seat assignment), `br:start`, `br:input` (relayed to host), `br:snapshot`
(relayed to guests), `br:event`, `br:emote`, `br:hostChanged`, `br:peerJoined`,
`br:peerLeft`, `br:pong`, `br:error`, `br:kicked`.

**What the server actually validates.** It is a relay, but not a *dumb* one:

- Event name is in the rate-limit map; payload is size-capped (`br:snapshot` ≤ 2
  KB, `br:input` ≤ 256 B, everything else ≤ 1 KB).
- `br:snapshot` is **only accepted from the current host** and only broadcast to
  that host's room. This one check is what stops a guest from puppeting the room.
- `br:input` is only accepted from a client that owns the seat it claims.
- Seat claims respect the 4-seat cap and the room's mode.
- Room codes use the existing `config.ROOM_CODE_ALPHABET` / `generateRoomCode()`.
- Names/cosmetic ids are length- and allowlist-checked (cosmetic ids validated
  against a server-side copy of the cosmetic id list — a client cannot invent
  `head: '<img src=x>'`).

### 9.4 The hot path: input and snapshot formats

Both are **binary** (`ArrayBuffer`), not JSON. Socket.IO handles binary frames
natively and this cuts bandwidth ~4× versus JSON — which matters on a phone.

**Input packet** (client → host, **30 Hz**, one per owned seat, coalesced into
one message per client):

```
u8   seatCount
per seat:
  u8   seatIndex
  u16  frame            (host frame number this input targets, wrapping)
  i8   aimLX, aimLY     (-127..127 → -1..1)
  i8   aimRX, aimRY
  u8   gripL, gripR     (0..255 analog trigger)
  u8   buttons          (bitfield: emote, useItem, drop, tags, …)
```
= 11 bytes/seat + 1. **Each packet repeats the last 3 input frames** for loss
tolerance (packets are unreliable in practice even over TCP-ish transports
because of head-of-line delays); the host de-duplicates by `frame`.

**Snapshot** (host → guests, **20 Hz**):

```
u16  frame
u8   flags            (paused, respawning, cat-active, …)
u8   seatCount
per seat:
  u8   seatIndex, state (alive/dead/respawning/drone)
  i16  headX, headY     (world px, quantised to 1/4 px)
  i16  headVX, headVY   (quantised)
  i16  headAngle        (1/64 rad)
  i16  handLX, handLY, handRX, handRY
  u8   gripL, gripR     (0 = none, else target ref)
  u16  gripTargetL, gripTargetR   (body id, 0 = world)
u8   propCount
per dirty prop:
  u16  propId
  i16  x, y, angle
```

Arm segment positions are **not** transmitted. Guests re-derive them locally by
running the same arm solver against the authoritative head and hand positions —
a 4-segment IK-ish relaxation. Saves ~50% of the packet and is visually
indistinguishable, because the arm is a smoothed curve through two known
endpoints anyway.

**Bandwidth budget:** 4 seats × 23 B + ~20 dirty props × 7 B ≈ **240 B/snapshot**
→ **4.8 KB/s down** per guest at 20 Hz, **0.35 KB/s up**. Well inside a mobile
connection, and inside `MAX_HTTP_BUFFER_SIZE`.

**Delta encoding**: props are only sent when their transform changed by more than
1/4 px since the last acked snapshot. Every 20th snapshot is a **keyframe** (all
props) so a joiner or a lossy client resynchronises within 1 s.

### 9.5 Latency handling — what the player feels

Three techniques, in order of importance:

1. **Instant local arm rendering.** Your own arms render at your *local* aim
   vector immediately, every frame, regardless of network state. The head
   position comes from the authoritative stream, but the arm is the thing you
   are steering, so input feels instant. When the authoritative arm state
   arrives and disagrees, the local render blends to it over **80 ms**
   (`easeOutCubic`). Guests never see a snapping arm.
2. **Lag-compensated grab.** This is the one that decides whether online play is
   good. The host keeps a **250 ms ring buffer** of prop transforms and player
   hand positions (5 snapshots at 20 Hz). When a guest's input packet arrives
   with `frame = F` and a rising grip edge, the host resolves the grab query
   against the world **as it was at F** (clamped to 250 ms of rewind), then
   re-projects the resulting attachment point onto the target's *current*
   transform. You grab what you saw. Bounded rewind means a laggy player cannot
   grab something that no longer exists — beyond the clamp, the grab resolves
   against the current world and may miss.
3. **Interpolation buffer.** Guests render remote state **100 ms behind** the
   newest snapshot (two snapshots), extended adaptively up to 200 ms if measured
   jitter demands it, and contracted back slowly. Below the buffer, extrapolate
   with velocity for at most 120 ms, then freeze and show the reconnect chrome.

**No rollback, no prediction of the local body.** Deliberate: coupled-constraint
rollback with `matter-js` is not achievable at a quality worth the complexity,
and (1)+(2) get us most of the feel for a fraction of the risk. If playtesting
says otherwise, the fallback is *more* generous lag compensation, not rollback.

**Honest degradation.** Measured RTT is shown as a small paper "postmark" stamp
per seat (green/amber/red, plus a number in Settings). Above **120 ms** to the
host, that seat's grab assist auto-enables and a one-line note says why. Above
**300 ms** sustained for 10 s, the room offers a host migration to the
best-connected client.

### 9.6 Host migration, pause and reconnect

- **Host election**: on room creation, the creator. On host loss, the server
  picks the seat-owning client with the lowest median RTT to the server over the
  last 30 s (tie → lowest `seatIndex`).
- **Migration protocol**: server sends `br:hostChanged` with the last keyframe it
  relayed; the new host loads that keyframe into a fresh sim, freezes for 300 ms
  ("re-inking" wipe), then resumes. Play resumes from the **last checkpoint** if
  the keyframe is older than 2 s, because resuming mid-air from stale state is
  worse than a small rewind.
- **Voluntary handoff** exists so the host can leave gracefully (`br:hostHandoff`).
- **Reconnect grace: 90 s.** A dropped client's seats are held, greyed on the
  seat bar, and their characters become `paperweight`-frozen statues rather than
  ragdolls (so they can't be the reason everyone dies). After 90 s the seats are
  released.
- **Pause semantics**: in campaign, the host's pause pauses the sim for everyone
  (with an on-screen "PAUSED BY <name>" note) — this is a couch game and that is
  the couch behaviour. A guest's pause opens their **personal** menu without
  stopping the sim. In Showdown, nobody pauses the sim; the menu is always
  personal.
- Use `components/shared/ConnectionStatus` for the reconnect banner and peer-wait
  overlay — do not write a sixth one.

### 9.7 Getting into a game — matchmaking, codes, invites, party

"Seamless" is the requirement, so all five paths exist and all land in the same
`Room`:

1. **Quick Play** — one button on the title screen. `br:quickPlay` joins the
   oldest open room matching mode + player count, or creates one and waits.
   While waiting you are **already playing** the level solo — the joiner is
   sketched in when they arrive (§2.7). Nobody stares at a lobby.
2. **Room code** — 6 chars from `config.ROOM_CODE_ALPHABET` (no ambiguous
   glyphs), shown big on the lobby's paper card.
3. **Invite link** — `/bums-rush?room=ABC123`, handled by the route's search
   params. Follows the existing deeplink pattern; the code is a *join* code and
   carries no auth, so it's safe in a URL (unlike a party ticket, below).
4. **Party system** — register with the platform party contract so an existing
   RMH party can queue straight in:

   ```ts
   // server/socket-server/handlers/bums-rush.ts
   import { registerPartyGame } from '../party-contract';
   registerPartyGame('bums-rush', {
     maxPartySize: 4,
     async createRoomForParty(members) { /* create a private room, reserve seats */ },
     async seatWithTicket(socket, ticket) { /* verify + seat */ },
   });
   ```
   Tickets go through router state, **never the URL** (`lib/party/types.ts` is
   explicit about this).
5. **Couch** — press any button on a second pad (§4.6). No network at all if you
   never open a room.

### 9.8 Result validation and anti-cheat

The host reports results (`br:result`); the server persists them (§10). Since the
host is authoritative, the server applies **plausibility bounds** rather than
recomputation:

- Completion time ≥ a per-level `minPlausibleSeconds` (authored, = 0.55 × the
  developer best) and ≤ 2 h.
- Objective set is a subset of the level's three, and `clock` requires the
  reported time under `parSeconds`.
- Seats in the result must match seats the server saw in the room.
- Ranked Showdown additionally requires: round count consistent with the score,
  no round shorter than 3 s, and the host not winning > 85% of ranked rounds over
  a 20-match window (flag for review via the existing admin audit path).
- Anything failing bounds is **persisted as unranked** and logged; it is never
  silently dropped (a dropped clear is a support ticket).

Leaderboards (§11.5) show `clean` and `assisted` boards separately and are
**per level and per player count**, because a 4-player time and a solo time are
not the same record.

---

## §10 Saves and persistence

### 10.1 What is saved

| Thing                                        | Where             | Why                                          |
| -------------------------------------------- | ----------------- | -------------------------------------------- |
| Cosmetics owned + equipped                   | `BumsRushProfile` | Identity — must follow the account            |
| Bindings, assists, audio, camera settings    | `BumsRushProfile` | A rebound controller must survive a device change |
| Per-level best time, objectives, clear flags | `BumsRushLevelClear` | Progression + leaderboards                 |
| Parcels found, poses found, recipes made     | `BumsRushProfile` (bitsets) | Cheap, queried as a whole              |
| Showdown record + rating                     | `BumsRushProfile` + `BumsRushShowdownMatch` | Ladder                     |
| Photos (Scrapbook)                           | **IndexedDB, local only** | No upload surface in v1 (§7)           |
| Mid-level resume state                       | **not saved**     | Levels are ≤ 3 minutes; a resume system would cost more than it returns |

### 10.2 Prisma models

Own tables, not the shared `GameSave` blob — per `lib/game-saves/registry.ts`,
the shared table is for games whose save is one opaque JSON document. Ours is
queried by leaderboard, by level, and by achievement progress, so it needs
columns and indexes.

```prisma
model BumsRushProfile {
  id                String   @id @default(cuid())
  userId            String   @unique
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Equipped cosmetics (ids validated against the code-side catalog)
  head              String   @default("biro")
  hat               String?
  gloves            String   @default("mitten")
  ink               String   @default("seat-1")

  unlockedCosmetics String[] @default([])
  parcelsFound      String[] @default([])
  posesFound        String[] @default([])
  recipesMade       String[] @default([])

  bindings          Json?    // BindingSet[] — versioned, see §4.5
  settings          Json?    // assists, audio, camera, rumble, tags

  levelsCleared     Int      @default(0)
  deaths            Int      @default(0)
  metresSwung       Int      @default(0)

  showdownRating    Int      @default(1000)
  showdownWins      Int      @default(0)
  showdownLosses    Int      @default(0)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  clears            BumsRushLevelClear[]

  @@index([showdownRating])
}

model BumsRushLevelClear {
  id            String   @id @default(cuid())
  profileId     String
  profile       BumsRushProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  userId        String
  levelId       String                    // "w3-07"
  playerCount   Int                       // 1..4 — a solo record is not a 4p record
  bestMs        Int
  objectives    Int      @default(0)      // bitmask over the level's 3 objectives
  assisted      Boolean  @default(false)  // beams / Inkblot / assist settings used
  clears        Int      @default(1)
  firstClearAt  DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([userId, levelId, playerCount])
  @@index([levelId, playerCount, assisted, bestMs])   // the leaderboard index
}

model BumsRushShowdownMatch {
  id          String   @id @default(cuid())
  mode        String                       // 'casual' | 'ranked'
  teams       Boolean  @default(false)
  rounds      Int
  endedAt     DateTime @default(now())
  flagged     Boolean  @default(false)     // failed a §9.8 bound
  players     BumsRushShowdownPlayer[]

  @@index([endedAt])
}

model BumsRushShowdownPlayer {
  id            String   @id @default(cuid())
  matchId       String
  match         BumsRushShowdownMatch @relation(fields: [matchId], references: [id], onDelete: Cascade)
  userId        String?                    // null = signed-out guest
  seatIndex     Int
  roundsWon     Int      @default(0)
  won           Boolean  @default(false)
  ratingBefore  Int?
  ratingAfter   Int?

  @@index([userId])
}

model BumsRushRun {
  id           String   @id @default(cuid())
  levelId      String
  playerCount  Int
  durationMs   Int
  deaths       Int
  objectives   Int
  assisted     Boolean
  catUsed      Boolean  @default(false)
  userIds      String[]                    // everyone credited (§10.5)
  createdAt    DateTime @default(now())

  @@index([levelId, createdAt])
}
```

Add the back-relations on `User` (`bumsRushProfile BumsRushProfile?`) in the same
migration.

### 10.3 API routes

All under `app/routes/api/bums-rush/`, all wrapped in `defineHandler` from
`@/lib/api/handler.server` — that wrapper is the only place the session → rate
limit → zod → try/catch order is written down, so no hand-rolled handlers.

| Route                                | Methods    | Auth       | Notes                                              |
| ------------------------------------ | ---------- | ---------- | -------------------------------------------------- |
| `/api/bums-rush/profile`             | GET, PUT   | required   | Read/write the whole profile; PUT body is a zod schema mirroring §10.2, 64 KB cap |
| `/api/bums-rush/clear`               | POST       | required   | One level clear. Idempotent-ish: upserts on `(userId, levelId, playerCount)`, keeping the better time and the union of objectives |
| `/api/bums-rush/leaderboard`         | GET        | optional   | `?levelId&playerCount&assisted&cursor` — cursor-paginated, cached 60 s via `apiCache` |
| `/api/bums-rush/showdown`            | POST       | optional   | Match result; guests recorded with `userId: null` |

`rateLimit: 'write'` on the mutating ones. The socket handler writes results
through the **same** server-side functions in `lib/bums-rush/progress/save.server.ts`
so there is one persistence path, not two that drift.

### 10.4 Signed-out play, and the merge

Signing in must never be a wall in front of a game.

- **Signed out**: everything is playable. Profile + clears live in
  `localStorage` under `bums-rush:profile:v1` and `bums-rush:clears:v1`. Online
  multiplayer works (the socket hub allows anonymous connections); the guest gets
  a generated paper name ("Anonymous Biro").
- **On sign-in**: `createCloudSave` from `lib/game-saves/cloud-save.ts` with a
  **custom transport** pointed at `/api/bums-rush/profile` (this is precisely the
  case that helper's docs describe for own-table games).
- **Merge policy** (not last-write-wins — that eats progress):
  - cosmetics/parcels/poses/recipes → **union**
  - per-level clears → **best time wins**, objectives **union**, `assisted` is
    true only if both are
  - counters (deaths, metres) → **sum**, capped at plausible bounds
  - bindings/settings → **the local ones win** if the local set was modified more
    recently than the remote `updatedAt`; otherwise remote. Show a one-line toast
    saying which was kept, with an undo.
  - `showdownRating` → **remote wins** (guests have no rating).
- The merge runs **once** per sign-in, is idempotent, and is unit-tested (T12).

### 10.5 Attribution in multiplayer

The rule: **a level clear credits every seat present at the goal**, and each
seat's clear is filed against their own `playerCount`. Objectives likewise credit
everyone.

Two consequences worth stating so nobody "fixes" them:

- A four-player clear does **not** grant you the solo record. Records are per
  `playerCount`, so nobody is tempted to farm easy solo times by bringing three
  friends.
- Relics that one player carried credit the whole party. Bum's Rush is a
  co-operative game; making collectibles individual turns four friends into four
  competitors for a staple, which is the opposite of the design.

Guests (no `userId`) are simply not persisted; their local storage records the
clear so the experience is identical until they sign in.

---

## §11 Progression, unlocks, economy, achievements

### 11.1 The shape of progression

There is **no XP bar and no battle pass**. Progression is: you clear levels, you
find things, you get hats. That is the source's model and it is the right one for
a session that might be twelve minutes long.

Three parallel tracks, all visible on the world map:

1. **Clears** — 72 levels. Clearing a world unlocks the next and grants a head.
2. **Objectives** — 216 (72 × 3). Thresholds grant hats and gloves.
3. **Parcels** — 40 hidden. Each grants one specific cosmetic.

### 11.2 Unlock table

| Trigger                              | Reward                       |
| ------------------------------------ | ---------------------------- |
| First launch                          | Heads 1–3, mitten gloves, 4 seat inks |
| Clear world *N*                       | The world's head (§2.4)      |
| All objectives in a world             | That world's hat set (3 hats) |
| Each parcel                           | One specific cosmetic (40 total) |
| 10 / 25 / 50 / 72 levels cleared      | Hat, gloves, ink, hat        |
| 20 poses / 12 recipes / 30 parcels    | Heads 9, 7, 11               |
| 100% campaign (72 clears, 216 objectives, 40 parcels) | Head 16 "Inkblot" + the gold-ink cosmetic |
| First Showdown match                  | Boxing-glove gloves          |
| 25 Showdown wins                      | Crown (bent)                 |

Nothing is purchasable, nothing is time-limited, nothing expires.

### 11.3 The Scrapbook

The wardrobe screen doubles as a **Scrapbook**: a paper spread showing your
cosmetics as stickers, your camera photos as Polaroids, and a per-world page with
its levels, times, objective ticks and parcel silhouettes (unfound ones shown as
dotted outlines — visible progress, no location hints). It is the results screen
of the whole game and it is where the art direction pays off. DOM, not canvas —
so it is accessible, selectable and translatable.

### 11.4 Achievements (platform)

Twelve entries in `lib/achievements/catalog.ts`, `category: 'games'`,
`group: "Bum's Rush"`. Ids are permanent once shipped (the catalog's rule), so
they are written out here in full rather than left to the implementer:

| id                          | Name             | Description                                        | Tier     | Coins | Target |
| --------------------------- | ---------------- | -------------------------------------------------- | -------- | ----- | ------ |
| `games.bums_first_clear`    | Get a Grip       | Clear your first level.                            | bronze   | 10    | 1      |
| `games.bums_world_1`        | Dockhand         | Clear Doodle Docks.                                | bronze   | 20    | 1      |
| `games.bums_levels_25`      | Handy            | Clear 25 levels.                                   | silver   | 50    | 25     |
| `games.bums_levels_72`      | All Hands        | Clear every level.                                 | gold     | 150   | 72     |
| `games.bums_objectives_100` | Completionist-ish| Complete 100 optional objectives.                  | silver   | 60    | 100    |
| `games.bums_parcels_40`     | Unwrapped        | Find all 40 hidden parcels.                        | gold     | 120   | 40     |
| `games.bums_flawless_10`    | Unsplattered     | Clear 10 levels without a single death.            | silver   | 60    | 10     |
| `games.bums_chain_4`        | Human Rope       | Form a four-player chain.                          | bronze   | 20    | 1      |
| `games.bums_showdown_first` | Et Tu            | Win a Showdown match.                              | bronze   | 20    | 1      |
| `games.bums_showdown_25`    | Nemesis          | Win 25 Showdown matches.                           | gold     | 120   | 25     |
| `games.bums_cat`            | Bad Cat          | Get bailed out by Inkblot.                         | bronze   | 10    | 1      | (secret)
| `games.bums_deaths_500`     | Splat Artist     | Die 500 times.                                     | silver   | 40    | 500    |

Progress is reported through the existing engagement path (the
`engagement.progression` pg-boss queue in `server/jobs/`) — do **not** write
achievements inline from the socket handler; that is the pattern the jobs tier
exists to replace.

### 11.5 Leaderboards

Per level **and** per player count **and** per assist state (§9.8). Rendered on
the level card and in the Scrapbook. Cursor-paginated, cached 60 s. Friends-only
filter reuses the existing follow graph. Solo Ladder (§0.2) is simply the
`playerCount = 1` view rolled up across all solo-viable levels, ranked by summed
best times, with unfinished levels excluded from the sum and shown as gaps —
never as a penalty, so a partial ladder is still a rank.

### 11.6 Coins

Coins arrive only through achievements (the table above) and the platform's
existing per-game reward path. **No coin sink inside the game** in v1: cosmetics
are earned, so adding a purchase route would immediately make earning them feel
like the slow path. If the economy team wants Bum's Rush cosmetics in the site
shop later, that is a §22 conversation and needs its own design.

---

## §12 Mobile

Mobile is a design target, not a port. Roughly half of this site's sessions are
phones; a party game that only works with a gamepad would be a game most visitors
cannot play.

### 12.1 What mobile can and cannot do

| Capability                         | Phone / tablet                                          |
| ---------------------------------- | -------------------------------------------------------- |
| Full campaign, solo                | ✅                                                        |
| Full campaign, online co-op        | ✅                                                        |
| Showdown online                    | ✅                                                        |
| Couch co-op on one device          | ❌ — two people cannot share one phone's touchscreen. The device-join prompt is hidden on coarse-pointer-only devices, and the UI never advertises it |
| Gamepad on mobile                  | ✅ — Bluetooth pads work through the same Gamepad API path, and a tablet + pad is a great way to play |

### 12.2 The touch control model

The problem is exact: the game needs **two independent analog aims plus two
grabs**, and a phone has two thumbs. Three schemes, one default.

**A. Auto-Grab (default).** Each half of the screen belongs to one arm.

- Touch down anywhere in a half → a **relative** virtual stick origins at the
  touch point. Drag → aim that arm. Release → the arm goes limp *and* the hand
  lets go.
- **The hand grips automatically** whenever it contacts a grabbable while the
  finger is down, and holds until you lift or drag decisively away (> 60 px past
  the grip point, which reads as "pulling free").
- So: **finger down = reach and hold; finger up = let go.** One gesture per arm,
  which is exactly two thumbs.

This is a real simplification of the game's verb set and it is the right trade:
it preserves *aim* and *when to let go* — the two decisions the game is actually
about — and automates the one (grip timing) that a thumb cannot do well.

**B. Two-thumb + grab pads (advanced).** Two fixed virtual sticks in the lower
corners plus two grab buttons above them, tapped by the same thumbs. Faithful,
harder, available in Settings for players who want the full verb set.

**C. Tilt-assist (optional add-on).** Device tilt contributes ±20% to the aim
vector of whichever arm is currently held, off by default, purely an accessibility
and expressiveness option. Uses the existing gyro permission pattern from
`lib/neon-driftway/gyro.ts` — never request the permission unprompted.

**Touch details that decide whether it feels good:**

- Relative sticks, never absolute — the thumb should not have to find a spot.
- Dead radius 8 px, full-deflection radius 64 px, both settings-adjustable.
- Multi-touch: `touch-action: none` on the stage, and pointer capture per
  identifier so a stray palm cannot steal an arm.
- The virtual stick is drawn as a **drawing-compass arc** in the seat's ink,
  fading to 30% opacity after 2 s of no movement so it never fights the art.
- Haptics via `navigator.vibrate` where available, mapped to the §2.7 events at
  short durations (10–30 ms). Feature-detect; iOS Safari does not support it and
  must not warn.

### 12.3 Layout, viewport and safe areas

Everything here is the §12.1 viewport contract from `docs/design-language.md`,
applied:

- **Landscape is the intended orientation.** In portrait, show a paper card:
  _"Turn your phone sideways"_ with a drawn rotate arrow — and behind it, still
  render the level letterboxed so it never feels blocked. Do **not** lock
  orientation via the Screen Orientation API (it fails on iOS and breaks
  accessibility rotation locks).
- Level screen uses `.app-viewport` + `.app-stage-fit`/`.app-stage` (16:9). HUD
  in `.app-hud` so it is inset by `var(--safe-*)`.
- Title / world map / wardrobe / results use `.app-page` — they are documents,
  and using `.app-viewport` for them costs a phone ~110 px permanently (rule 6).
- **Rule 1 in practice:** the pause button, the seat bar and the touch sticks all
  add `var(--safe-top|bottom|left|right)`. Check in **landscape** — that is where
  the notch takes a long edge and where this game is played.
- No text entry in the level shell, so `--kb-inset` only matters on the lobby
  (room code) and wardrobe (search) screens; those mount `useKeyboardInset` and
  size with `calc(100dvh - var(--kb-inset, 0px))`.
- `gameSurfaceDpr()` caps the buffer at 2× (rule 4). On `perf-lite` devices
  (`lib/perf-tier.ts` → `isLowEndDevice()`), cap at 1.5× and drop the boil (§2.3).

### 12.4 Mobile performance

The mobile budget drives §17. Specifically for phones:

- Ink layers 0–2 and 5 are baked; only actors and FX redraw. A phone therefore
  draws ~4 heads, 8 arm curves, 8 hands and < 40 FX particles per frame.
- Prop bodies sleep aggressively (`matter-js` sleeping enabled, `sleepThreshold`
  30 frames).
- Off-screen props are excluded from the render pass by an AABB check against the
  camera frustum, and from the sim by `Sleeping` where the level marks them
  `staticWhenOffscreen`.
- Audio uses a small sprite sheet (§14) with at most 8 concurrent voices.
- Target: **60 fps on a 2022 mid-range Android**, degrading to a locked 30 fps
  (half-rate render, full-rate sim) rather than a variable frame rate, because
  variable is what feels broken.

---

## §13 Accessibility

The five claims in the capabilities entry (§1.2), plus everything that isn't a
claim but is still right.

| Area           | Commitment                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Input**      | Every action remappable (§4.5). Playable on keyboard alone, pad alone, or touch alone. One-handed mode (§4.7). No action requires simultaneous presses beyond two. No quick-time events anywhere. |
| **Timing**     | No level fails on a timer (§6.7). Par times gate optional objectives only. Slow-mo assist for solo/practice. |
| **Motion**     | `useReducedMotion` kills the boil, halves camera lookahead and zoom spring, zeroes shake, and replaces the page-turn wipe with a cut. |
| **Flashing**   | Structurally impossible to exceed 3 large flashes/second (§2.8); `flashSafe` is a required literal in level data. No photosensitivity interstitial needed — and therefore **no `flashing` descriptor**. |
| **Colour**     | Seat identity = colour + forehead mark + optional name tag (§2.8). Materials readable by fill pattern (§2.3). Ink/paper ≥ 7:1, loader-asserted. |
| **Audio**      | Every audio cue has a visual twin (grip click → hand pose change; tension warning → stroke thinning + rumble; countdown → drawn numerals). Separate volume sliders for music / SFX / UI. Playable fully muted. |
| **Text**       | All UI text is DOM, not canvas — so it scales with the browser's font size, is selectable, and is translated (§15). In-world sticky notes are the exception and carry an `aria-live` mirror in the HUD's screen-reader region. |
| **Screen reader** | The game canvas is not screen-reader playable and we do not pretend otherwise; the canvas carries an honest `aria-label` describing the level and current state, and all menus, the world map, the Scrapbook and Settings are fully navigable DOM with focus-visible rings. |
| **Difficulty** | Assist beams, Rescue Drone and Inkblot (§6.4) are always available, never gated, never scolded. |

Two things deliberately **not** claimed: `subtitles` (there is no speech to
subtitle — the holler is a wordless yell with a drawn bubble) and screen-reader
playability of the level itself. Per the honesty rule, we do not list what we
have not built.

---

## §14 Audio

**Design principle: the sound of paper.** Every sound is something you could make
with stationery, and that constraint keeps a 60-sound game coherent.

| Event                | Sound                                                    |
| -------------------- | -------------------------------------------------------- |
| Grip connect         | A pen click                                              |
| Grip slip            | A pencil skid on paper                                    |
| Grip near breaking   | Paper tearing, slowly, pitch rising with tension          |
| Swing                | Air-through-a-flipped-page whoosh, filtered by speed      |
| Impact               | A book dropped flat                                       |
| Death                | Paper crumpled into a ball, hard                          |
| Respawn              | A pen drawing a quick circle                              |
| Objective            | A highlighter squeak                                      |
| Parcel found         | Tape peeled + a small bell                                |
| Level clear          | The page turn                                             |
| Inkblot arrives      | A cat's chirrup + a pencil rolling off a desk             |

**Implementation.**

- Web Audio through the site's existing audio helpers in `lib/audio/`; one
  `AudioContext`, unlocked on the first user gesture (the "press any button"
  screen doubles as the unlock, which is why it exists in §4.1).
- One **sprite sheet** per world for SFX (a single decoded buffer, offsets in
  JSON) — decoding 60 individual files on a phone is a 2-second hitch.
- Max **8 concurrent voices**, with per-category limits (max 3 grips, 2 impacts)
  and stealing by oldest. Four players splatting simultaneously must not clip.
- Music: one loop per world, plus a Showdown loop and a menu loop. ~9 tracks.
  Crossfade 800 ms on world change, duck 6 dB under the clear jingle.
- **Marker Mosh drives visuals from the audio clock** (`AudioContext.currentTime`),
  not `performance.now()`, so beat-synced platforms cannot drift from the music.
  The level data carries `bpm` and `beatOffsetMs`.
- Everything respects the three sliders and a global mute; `document.hidden`
  suspends the context (a backgrounded tab making noise is a bug report).

---

## §15 i18n

All user-facing strings go through `t("key", { defaultValue })`, then
`pnpm i18n:extract`. Two namespaces (§1.2), both added to `NAMESPACES` in
`lib/i18n/config.ts` — **a JSON file dropped into `locales/en/` without that
entry is never loaded**, and every locale silently serves the English default.

Three traps specific to this game, all of them ones this repo has been bitten by:

1. **Level and world names are keys, not text.** The level schema's `name` field
   holds `bums.level.w3-07.name`, and the JSON never contains display English.
   Otherwise 72 level names live outside the i18n pipeline forever.
2. **Never put a `{/* … */}` JSX comment immediately before a `t()` call** —
   `i18next-parser` skips that call and the key never lands in `locales/`. Put the
   explanation above the component.
3. **Changing a shipped string's wording means a NEW key.** `defaultValue` is only
   used when a key is missing, so editing a default in place changes English and
   nothing else.

**Canvas text.** The in-world sticky notes are the only place text is drawn into
the canvas. They pull from the same `t()` catalogue, and the renderer must
measure and wrap rather than assuming English lengths — German tutorial text is
routinely 40% longer. Sticky notes auto-grow vertically and, past a limit, shrink
the font once and then scroll. **RTL** (`ar`, `ur`): sticky-note text aligns
right and the note's tape corner mirrors; the *world* does not mirror (a level is
geography, not a paragraph).

Numerals in the HUD (timer, counters) use `Intl.NumberFormat` for the active
locale.

---

## §16 Site integration checklist

Everything the game touches outside its own directories, in one list, so the
final integration ticket has nothing to discover:

- [ ] `lib/catalog/games/bums-rush.ts` + card art at `public/images/games/Bums-Rush.webp`
- [ ] `lib/game-capabilities.ts` entry (parity test will fail without it)
- [ ] `lib/i18n/config.ts` — two namespaces
- [ ] `lib/achievements/catalog.ts` — 12 entries
- [ ] `prisma/schema.prisma` — 5 models + `User` back-relation + migration
- [ ] `server/socket-server/index.ts` — register handlers + disconnect
- [ ] `server/socket-server/config.ts` — `br:*` rate limits
- [ ] `app/routes/bums-rush.tsx` + `app/routes/api/bums-rush/*`
- [ ] `app/globals.css` — `--bum-*` group + `@theme` aliases
- [ ] `data/bums-rush/levels/**` + `index.json`
- [ ] `locales/en/c-bums-rush.json`, `locales/en/r-bums-rush.json` (via extract)
- [ ] `pnpm docs:site` regenerated (catalog changed — the freshness gate checks this)
- [ ] `docs/README.md` — a row for this document
- [ ] **Not** `lib/wager/eligible-games.ts` (§8.4 — deliberate)
- [ ] **Not** `lib/game-saves/registry.ts` (own tables, §10.2 — deliberate)
- [ ] **Not** `app/routeTree.gen.ts` (generated)
- [ ] **Not** `components/Providers.tsx` (`THEME_EXCLUDED_ROUTES` derives itself)

---

## §17 Performance budgets

The budget is a **2022 mid-range Android at 60 fps**, because that is the
constraint that makes every other platform easy.

| Stage                   | Budget (mid phone) | Notes                                                    |
| ----------------------- | ------------------ | -------------------------------------------------------- |
| Physics step            | ≤ 3.5 ms           | 4 players (44 bodies) + ≤ 60 prop bodies                 |
| Arm solve (guests)      | ≤ 0.6 ms           | 8 arms × 4 segments, re-derived from endpoints           |
| Render — actors + FX    | ≤ 5.0 ms           | The only per-frame draw work                             |
| Render — blits          | ≤ 1.5 ms           | Baked layers                                             |
| Net encode/decode       | ≤ 0.4 ms           | Binary packets (§9.4)                                    |
| **Frame total**         | **≤ 11 ms**        | Leaves headroom inside 16.6 ms                            |

Hard caps enforced in code:

- ≤ 4 players, ≤ 120 total physics bodies per level (loader asserts).
- ≤ 120 FX particles, pooled, never allocated per frame.
- ≤ 40 death splats retained; oldest fade out.
- Zero allocations in the step and render hot paths — vectors are reused
  scratch objects. This is a review criterion, not a suggestion; GC pauses in a
  physics game read as input lag.
- Initial JS for `/bums-rush` ≤ **180 KB gzip** (the route is lazy-loaded already;
  `matter-js` is ~90 KB gzip and is the bulk of it). World 1 level data ships
  with it; worlds 2–8 fetch on demand.
- Time-to-playable on a cold mid-phone load: **≤ 3.5 s** on 4G.

Degradation ladder when frame time exceeds budget for 2 s (measured with a rolling
median, never a single frame):

1. Drop the boil (§2.3) → saves ~1.2 ms.
2. Halve FX particle cap.
3. Reduce DPR by one step (2 → 1.5 → 1).
4. Lock to 30 fps render with 60 Hz sim.

Each step is announced nowhere and reversed if the median recovers for 10 s.

---

## §18 File & module map

Exhaustive, so tickets in §20 can name files without collisions.

```
app/
  routes/
    bums-rush.tsx                        route (§1.3)
    api/bums-rush/
      profile.ts  clear.ts  leaderboard.ts  showdown.ts     (§10.3)

components/bums-rush/
  BumsRushGame.tsx                       root: shell switch, screen router, engine mount
  screens/
    TitleScreen.tsx  ModeSelect.tsx  WorldMap.tsx  LevelCard.tsx
    Lobby.tsx  RoomCodeCard.tsx  PauseMenu.tsx  ResultsCard.tsx
    ShowdownSetup.tsx  ShowdownRoundResults.tsx  ShowdownMatchResults.tsx
    Wardrobe.tsx  Scrapbook.tsx  SettingsScreen.tsx  BindingsScreen.tsx
    CreditsScreen.tsx                    (carries the §0.3 attribution line)
  hud/
    Hud.tsx  SeatBar.tsx  ObjectiveTray.tsx  EdgeIndicators.tsx
    TouchControls.tsx  DeviceJoinPrompt.tsx  AssistChip.tsx  PostmarkPing.tsx
    OrientationCard.tsx
  paper/
    PaperSheet.tsx  StickyNote.tsx  TapeButton.tsx  InkHeading.tsx
    DoodleArrow.tsx  PolaroidFrame.tsx  StickerShelf.tsx
  editor/
    LevelEditor.tsx  Inspector.tsx  Palette.tsx        (dev-only, §6.5)

lib/bums-rush/
  constants.ts        PHYSICS + tunables (§3.6)
  types.ts            shared types (seats, room, snapshot, level)
  cosmetics.ts        cosmetic id catalog (client + server share this)
  engine/
    world.ts          matter world setup, layers, sleeping
    character.ts      composite build, arm solver, aim forces (§3.1–3.2)
    grab.ts           attach/detach, break force, lag-comp hooks (§3.3)
    props.ts          the prop catalog implementations (§6.2)
    hazards.ts        (§6.3)
    signals.ts        signalRelay evaluation
    assist.ts         beams, drone, Inkblot (§6.4)
    step.ts           fixed-timestep accumulator (§3.7)
    camera.ts         framing, zoom, damping (§5)
    rng.ts            seeded PRNG (boil, arena rotation)
  render/
    renderer.ts       the frame; layer orchestration
    paper.ts          sheet baking, fibre noise, rules, margin
    ink.ts            stroke primitives, taper, double-pass
    boil.ts           the wobble field (§2.3)
    patterns.ts       material fill patterns
    actors.ts         heads, arms, hands, cosmetics
    fx.ts             splats, confetti, scribbles — pooled
    worldbake.ts      geometry/prop/decoration baking
  input/
    sources.ts        unified InputFrame producer
    gamepad.ts        polling, brand detection, deadzones, rumble (§4.1)
    keyboard.ts       8-way smoothing, split-keyboard (§4.2)
    touch.ts          Auto-Grab, two-stick, tilt (§12.2)
    bindings.ts       BindingSet, serialisation, migration (§4.5)
    devices.ts        device↔seat assignment, join/leave (§4.6)
  net/
    socket.ts         the singleton connection (per repo convention)
    protocol.ts       event names + zod/binary codecs (§9.3)
    snapshot.ts       encode/decode, delta, keyframes (§9.4)
    host.ts           authoritative loop, lag comp, result signing
    guest.ts          interpolation buffer, local arm blend (§9.5)
    migration.ts      host election + handoff (§9.6)
    lobby.ts          room lifecycle client-side
  levels/
    schema.ts  loader.ts  manifest.ts  validate.ts
  progress/
    save.ts           client save + merge (§10.4)
    save.server.ts    the single server-side persistence path (§10.3)
    objectives.ts     evaluation + photo predicates (§7)
    unlocks.ts        the §11.2 table
    leaderboard.ts
  audio/
    bus.ts  sfx.ts  music.ts  sprites.ts                (§14)
  __tests__/          (§19)

server/socket-server/handlers/bums-rush.ts               (§9.3, §9.7)

data/bums-rush/levels/
  index.json
  w1/w1-01.json … w1-09.json          (× 8 worlds)
  showdown/w1-a.json … (56 arenas)

prisma/schema.prisma                    (§10.2)
```

---

## §19 Testing plan

Colocated under `lib/bums-rush/__tests__/` (discovery is a glob — nothing to
register). The suite must stay inside the main `pnpm test` budget, so no test
runs a real 60-second simulation.

**Unit — must exist before the ticket that needs them closes:**

| Test                                | Asserts                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `physics-feel.test.ts`              | The four feel tests in §3.6, as headless sims with fixed input scripts   |
| `grab.test.ts`                      | Target priority order; break force; material scaling; latch persistence  |
| `level-schema.test.ts`              | Every shipped level parses; contrast ≥ 7; spawns ≥ minPlayers; goal in bounds; no prop/spawn overlap |
| `level-roundtrip.test.ts`           | Editor export of an unmodified load is byte-identical (§6.5)             |
| `snapshot-codec.test.ts`            | Encode→decode round-trips within quantisation error; delta+keyframe recovery; size bounds |
| `interp.test.ts`                    | Buffer behaviour under jitter, loss, and reorder; never renders ahead of authority |
| `lagcomp.test.ts`                   | A grab issued at frame F resolves against F's world; clamped past 250 ms |
| `bindings.test.ts`                  | Serialise/deserialise; v0→v1 migration; conflict detection               |
| `input-touch.test.ts`               | Auto-Grab engage/release thresholds; multi-touch identifier isolation    |
| `objectives.test.ts`                | Each objective type scores exactly when §7 says; photo predicates        |
| `save-merge.test.ts`                | §10.4 merge policy, including idempotency on repeated sign-in            |
| `unlocks.test.ts`                   | The §11.2 table is total and has no unreachable rewards                  |
| `cosmetics-parity.test.ts`          | Client cosmetic ids == server allowlist                                  |
| `showdown-rating.test.ts`           | Elo maths, team averaging, ranked-assist lockout                         |

**Integration:**

- `handler.test.ts` — a fake Socket.IO pair: create → join → claim seats → start
  → relay → result. Asserts snapshots from a non-host are rejected, seat caps
  hold, and host migration re-elects deterministically.
- API route tests for the four endpoints, including the leaderboard's index usage
  and the clear endpoint's better-time-wins upsert.

**Platform gates that must stay green** (these already exist; the game must not
regress them):

- `lib/__tests__/catalog.test.ts` — catalog/capabilities parity + icon name
- `lib/__tests__/design-consistency.test.ts` — no raw palette colours, no
  hardcoded radii, no `transition-all`, no `tailwindcss-animate`, no hand-rolled
  tab strips in the DOM screens
- `lib/__tests__/game-viewport-consistency.test.ts` — the `dvh` fallback pair,
  `.app-stage` usage, DPR clamping
- `lib/__tests__/game-capabilities.test.ts` — the honesty checks

**Manual pass before ship** (nothing automatable):

1. All three themes are irrelevant here (theme suppressed) — but check the game
   against the site's `light` and `high-contrast` **surrounding chrome** on the
   back-link and error boundary.
2. Landscape phone with a notch: pause button, seat bar and sticks all clear of
   the cutout.
3. Two pads + one keyboard on one machine, joining mid-level.
4. A 200 ms-RTT guest: is the grab still satisfying? This is the single most
   important subjective check in the project.
5. Full campaign world 1 on a phone, in German, with reduced motion on.

---

## §20 Work breakdown for subagents

Sixteen tickets. Each names its files, its dependencies, and what "done" means.
Tickets marked **∥** can run concurrently with their siblings — the whole point
of the data-driven level format and the file map above is to make the middle of
this graph wide.

### Phase 0 — foundation (serial, one agent)

**T1 · Registration & skeleton.**
Files: catalog entry, capabilities entry, route, i18n namespaces, `--bum-*` in
`globals.css`, empty `components/bums-rush/BumsRushGame.tsx` rendering a title
screen, card art placeholder.
Done when: `/bums-rush` loads, appears on `/games`, `pnpm check:consistency`
passes, `pnpm docs:site` regenerated, catalog parity test green.
**Blocks everything.**

**T2 · Prisma models + API routes.**
Files: schema models (§10.2), migration, four API routes (§10.3),
`lib/bums-rush/progress/save.server.ts`.
Done when: migration applies cleanly, `prisma-validate` and
`prisma-migrate-status` pass, route tests green.
Depends on: T1 (id only). ∥ with T3.

### Phase 1 — the game feels right (the risky part, do it early)

**T3 · Physics core.** ∥
Files: `lib/bums-rush/constants.ts`, `engine/{world,character,grab,step,rng}.ts`,
`__tests__/{physics-feel,grab}.test.ts`.
Done when: **the four feel tests in §3.6 pass**, headless, and a dev harness page
lets a human swing one character around a test level with a gamepad.
This ticket is the project's main technical risk. If the feel tests cannot be
satisfied with the §3.6 numbers, **retune the numbers and update §3.6** — do not
proceed to Phase 2 with a character that isn't fun alone.

**T4 · Render pipeline.**
Files: `render/*`, the paper/ink primitives.
Done when: the test level from T3 renders in full notebook style at ≤ 5 ms on a
mid phone, the boil respects `prefers-reduced-motion`, and the DPR path goes
through `gameSurfaceDpr()`.
Depends on: T3.

**T5 · Input layer.** ∥ with T4
Files: `input/*`, `hud/{TouchControls,DeviceJoinPrompt}.tsx`,
`screens/BindingsScreen.tsx`, tests.
Done when: the T3 harness is fully playable with (a) a gamepad, (b) keyboard
only, (c) touch Auto-Grab on a real phone; remapping persists across reload;
brand glyphs switch with the detected pad.
Depends on: T3.

### Phase 2 — content systems

**T6 · Level format + loader + editor.**
Files: `levels/*`, `components/bums-rush/editor/*`, tests.
Done when: a level JSON round-trips through the editor byte-identically, the
loader's assertions fire on deliberately broken fixtures, and one hand-authored
level (W1-01) plays end to end.
Depends on: T3, T4.

**T7 · Props, hazards, signals, assist.**
Files: `engine/{props,hazards,signals,assist}.ts`.
Done when: every `kind` in §6.2/§6.3 exists with a fixture level exercising it,
`signalRelay` composes AND/OR/NOT/delay, and Inkblot triggers at the configured
wipe count.
Depends on: T6.

**T8 · Camera, HUD, screens.**
Files: `engine/camera.ts`, `hud/*`, `screens/{Title,ModeSelect,WorldMap,LevelCard,Pause,Results}.tsx`.
Done when: four players spread across a wide level are all framed or
edge-indicated; the shell switches correctly between `.app-page` and
`.app-viewport`; the viewport consistency test is green.
Depends on: T4, T6.

### Phase 3 — the network (serial within itself, ∥ with content authoring)

**T9 · Socket handler + room lifecycle.**
Files: `server/socket-server/handlers/bums-rush.ts`, `index.ts` +
`config.ts` registration, `lib/bums-rush/net/{protocol,socket,lobby}.ts`,
`handler.test.ts`.
Done when: create/join/seat/start works between two browsers; a non-host's
`br:snapshot` is rejected; rate limits are in `config.ts`; party registration
seats a party.
Depends on: T1.

**T10 · Snapshot, host loop, guest interpolation, lag comp.**
Files: `net/{snapshot,host,guest,lagcomp}.ts` + tests.
Done when: two browsers play the same level with the bandwidth in §9.4 measured
and inside budget; a simulated 150 ms/2% loss link is still playable by the
manual check in §19.4.
Depends on: T9, T3.

**T11 · Host migration, reconnect, drop-in.**
Files: `net/migration.ts`, seat lifecycle in the handler, `ConnectionStatus`
wiring.
Done when: killing the host's tab mid-level re-elects within 2 s and resumes at
the checkpoint; a reconnecting client regains its seats inside 90 s; a fourth
player joins mid-level without a pause.
Depends on: T10.

### Phase 4 — persistence & progression (∥ with content)

**T12 · Saves, merge, progression, unlocks.**
Files: `progress/*`, `screens/{Wardrobe,Scrapbook}.tsx`, achievement entries.
Done when: guest→sign-in merge passes its tests including idempotency; unlocks
fire per §11.2; achievements report through the jobs queue, not inline.
Depends on: T2, T8.

**T13 · Accessibility & settings.**
Files: `screens/SettingsScreen.tsx`, `engine/assist.ts` wiring, reduced-motion
paths, contrast assertions, name tags, audio-cue twins.
Done when: **every string in the §1.2 `accessibility` array is demonstrably
implemented**, and the manual pass items 1, 2 and 5 in §19 are signed off. This
ticket owns the honesty of the capabilities entry.
Depends on: T5, T8.

### Phase 5 — content (the wide part: up to 8 concurrent agents)

**T14·W1 … T14·W8 · The eight worlds.** ∥∥∥∥∥∥∥∥
Each: 9 co-op levels + 7 Showdown arenas as JSON in `data/bums-rush/levels/wN/`,
plus the world's palette, music id, and level-name i18n keys.
Each agent gets: §6.1 (schema), §6.2/§6.3 (props/hazards), §6.6 (their world's
row and prose), §6.7 (pacing rules), and the editor from T6.
Done when: every level parses, is completable by a human within its `parSeconds`
× 1.5, has exactly three objectives, respects the level-role table in §6.6, and
`minPlayers` matches the §6.7 distribution.
Depends on: T6, T7. **These eight do not touch shared code** — that is the design
that lets them run at once.

**T15 · Audio.** ∥ with T14
Files: `audio/*`, sprite sheets, 9 music loops.
Done when: the §14 event table is covered, voice limits hold under a four-player
wipe, Marker Mosh's pulse is driven by the audio clock, and `document.hidden`
suspends.
Depends on: T4.

### Phase 6 — close out

**T16 · Showdown, integration, polish.**
Files: `screens/Showdown*.tsx`, `net` round flow, rating, §16 checklist.
Done when: the §16 checklist is fully ticked, the §0.4 definition of done holds,
`pnpm check:consistency --base main` is green, and the manual pass in §19 is
complete.
Depends on: everything.

**Dependency summary:**

```
T1 ──┬─ T2 ─────────────────────────────┬─ T12 ─┐
     └─ T3 ─┬─ T4 ─┬─ T6 ─ T7 ─ T14×8 ──┤       │
            │      └─ T8 ───────────────┼─ T13 ─┼─ T16
            ├─ T5 ─────────────────────┘       │
            └─ (T9 ─ T10 ─ T11) ───────────────┘
                                  T15 ─────────┘
```

---

## §21 Risks & open questions

| # | Risk                                                                                     | Mitigation / owner                                                     |
| - | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1 | **The character doesn't feel good.** Everything else is worthless if swinging is not fun. | T3 gates the project on four objective feel tests plus a human check *before* any content is authored. Retune §3.6 rather than proceeding. |
| 2 | **Online physics feels mushy** despite §9.5.                                              | Ship the lag-comp grab early (T10) and hold the 150 ms manual check as a release gate. Fallback is more generous compensation and auto-assist, **not** rollback. |
| 3 | **Host CPU on a phone.** A phone hosting four players may not hold 60 Hz.                  | Host election prefers desktop clients (detectable via `navigator.hardwareConcurrency` + coarse-pointer); a phone hosts only if it is the only client. Degradation ladder (§17) applies to the sim's substep count last, never first. |
| 4 | **72 levels is a lot of authoring.** It is the largest single cost here.                    | The data format + editor (T6) exist specifically to make eight agents productive in parallel; the level-role table (§6.6) means an author never faces a blank page. If content slips, ship **4 worlds (36 levels)** and treat 5–8 as a content drop — the world map is built to show locked worlds. |
| 5 | **Touch Auto-Grab may be too simplified** for players who know the source.                  | Scheme B (§12.2) ships alongside it, and the setting is one tap from the pause menu. |
| 6 | **`matter-js` performance** with four ragdolls + props on a mid phone.                      | Budgeted in §17 with hard body caps asserted by the loader; T3 must measure on a real device, not a desktop throttle. |
| 7 | **Showdown host advantage.** Unavoidable given §9.1.                                        | Ranked is explicitly not a competitive-integrity product (§8.4); not wager-eligible; plausibility bounds + review flags. |
| 8 | **Scope creep into a level editor for players.**                                            | Explicitly §22, not v1. The dev editor is `import.meta.env.DEV`-gated so it cannot ship by accident. |
| 9 | **§3.6 feel test 3's second clause did not survive contact with the engine.** The doc says a four-player chain "tears if the bottom player swings hard". Measured against the shipped tuning, a full-weight pump from the bottom player raises the top grip's load by **3%** (0.068 → 0.070 in matter force units), so no break force can separate rest from swing. The cause is upstream: `ARM_FORCE_MAX` had to fall five-fold (0.0055 → 0.0011) to stop feel test 1's 300px ledge being reachable by hauling on the stick without swinging at all, and a weak arm cannot load three players' worth of chain. | **Accepted, not worked around.** Grip failure is driven by the SURFACE instead — `MATERIALS.ice` scales break to 0.45, which tears a four-player chain that paper holds at 57%. The test asserts that, plus the load falling off down the chain. This makes "grip strength is finite and that is the drama" a property of *where you grabbed* rather than *how hard you swung*, which is a different game in a small but real way. Revisit if playtesting says the swing should matter: the lever is a stiffer arm with feel test 1 re-tuned around it (a longer ledge, or a lower `ARM_MAX_OFFSET`), not a lower break force. |

**Open questions for the humans, not blockers:**

1. **Card art** (`Bums-Rush.webp`) — needs a real illustration in the notebook
   style; a programmatic placeholder is fine for T1 but not for launch.
2. **Music** — 9 loops is a real commission. If that is not available, the
   fallback is 3 loops (menu / play / Showdown) with per-world instrumentation
   filters, which is worse but shippable.
3. **Do we want Bum's Rush cosmetics in the site shop?** §11.6 says no for v1;
   the economy team may disagree, and it is easier to add later than remove.
4. **Localised level names** — 72 names × 16 locales goes through the existing
   AI translate pipeline, but they are jokes, and jokes translate badly. Consider
   marking level names as `noTranslate` and shipping them in English everywhere,
   which is a legitimate choice for proper nouns.

---

## §22 Post-launch roadmap

Not in scope, listed so v1 does not accidentally foreclose them:

1. **World 9 — Manila Manor.** The haunted-manor world the source has and we cut
   for scope: hidden keys, lantern light, rooms that rearrange. The world map,
   the manifest and the unlock table are all built to take a ninth world without
   a migration.
2. **Daily Challenge.** One level, one modifier (ice everywhere / half gravity /
   one arm), one shared leaderboard, resets daily. Slots straight into the
   existing daily-puzzles surface.
3. **Photo sharing to the feed.** The Scrapbook's Polaroids posted as RMHarks.
   Needs the existing upload-security path and would add the `user-content`
   descriptor — hence deliberately out of v1.
4. **Player level editor + sharing.** The format and the dev editor already
   exist; what's missing is moderation, which is the actual cost.
5. **Spectator mode.** The snapshot stream is already a complete world state;
   a read-only viewer is mostly UI, and it makes the game streamable into Live
   Spaces.
6. **Discord Activity.** RMHbox already speaks Discord Activity OAuth; a 2–4
   player party game is the ideal second candidate.
7. **Cross-game cosmetics.** Hats that unlock from other RMH games, and vice
   versa — cheap, and it makes the catalogue feel like one place.

---

## Sources

Design research for this document, 2026-08-08:

- Steam store page for _Heave Ho 2_ (supplied as saved HTML by the requester; the
  store domain is egress-blocked from this environment) — official description,
  feature matrix, accessibility list, tags, platform support.
- [Game Informer — _Heave Ho 2_ review](https://gameinformer.com/review/heave-ho-2/silly-and-smart-go-hand-in-hand)
- [TheSixthAxis — _Heave Ho 2_ review](https://www.thesixthaxis.com/2026/07/29/heave-ho-2-review/)
- [Checkpoint Gaming — _Heave Ho 2_ hands-on preview](https://checkpointgaming.net/features/2026/05/heave-ho-2-hands-on-preview-more-chaos-more-fun/)
- [TheGamer — _Heave Ho 2_ review](https://www.thegamer.com/heave-ho-2-review/)
- [Quest Daily — _Heave Ho 2_ review](https://questdaily.com.au/review/review-heave-ho-2-co-op-chaos-pc/)
- [MKAU Gaming — _Heave Ho 2_ review](https://www.mkaugaming.com/all-review-list/heave-ho-2-steam-review/)
- [PowerUp! — _Heave Ho 2_ review](https://powerup-gaming.com/heave-ho-2-review-pc-friendship-is-temporary-hilarious-f-ups-are-forever/)
- [Final Weapon — _Heave Ho 2_ review](https://finalweapon.net/2026/07/19/heave-ho-2-review/)
- [MP1st — _Heave Ho 2_ review](https://mp1st.com/reviews/heave-ho-2-review-let-go-of-my-hand)
- [Nintendo Life — _Heave Ho_ (2019) review](https://www.nintendolife.com/reviews/switch-eshop/heave_ho)
- [Screen Rant — _Heave Ho_ (2019) review](https://screenrant.com/heave-ho-review/)
- [Wikipedia — _Heave Ho_](https://en.wikipedia.org/wiki/Heave_Ho)

Repository references: `CLAUDE.md`, `server/CLAUDE.md`,
[`docs/design-language.md`](../design-language.md) §12/§12.1/§13,
[`docs/page-consistency.md`](../page-consistency.md) §4,
[`docs/testing.md`](../testing.md), `lib/catalog/types.ts`,
`lib/game-capabilities.ts`, `lib/game-saves/registry.ts`,
`server/socket-server/party-contract.ts`, `server/socket-server/handlers/rochester-offensive.ts`.

# Competitive Feature Gaps — 2026-08-04

**Document type:** Feature generation, framed as parity analysis against comparable products
**Prepared:** 2026-08-04 (branch `claude/website-feature-gaps-1d528n`, base `4d3cbfe0`)
**Scope:** The whole platform — the arcade (20 games), the app tier (12 apps), the feed, the
economy, discovery, and the i18n/a11y substrate underneath all of it.
**Method:** Every claim below was checked against the tree at `4d3cbfe0`. Anything asserted as
missing was grepped for across `lib/`, `components/`, `app/`, `server/` and `prisma/schema.prisma`
before it was written down. Line anchors are given so the next reader can re-verify rather than
re-derive.

> **Why this document is not a repeat of the other five.** `docs/plans/` already contains
> ~60 specced features across five documents (07-15, 07-19, 07-20, 07-31, 08-03). Almost
> everything they proposed has either shipped or is tracked. Re-proposing them would be noise, so
> §2 lists the still-open backlog as a **pointer table** and this document spends its length
> somewhere else: on the places where RMH Studios is behind the specific products it is
> competing with — Steam and itch.io for the arcade, Twitch and YouTube for the watch tier,
> Anki and Quizlet for the study tier, Netflix and Spotify for recommendations, and the
> operator norms that any platform mixing chance mechanics with cash-out value is measured against.
>
> **The bias of the prior docs, stated plainly.** All five were written from the _social
> platform's_ point of view — feed, profile, communities, economy, creator tooling. The result
> is a site where the social tier is at or past parity with Bluesky, while **the 20 games are
> still 20 separate games sharing a nav bar**. Pillar A is the largest block here for that reason.

---

## §0 — Two live defects found while auditing

Neither of these is a feature. Both are shipping to production right now and both are cheap
to fix, so they go first.

### 0(a) — 18 shipped namespaces are not registered, so 16 locales silently serve English

`CLAUDE.md` §5 warns about exactly this failure mode: _"A new namespace must be added to
`NAMESPACES` in `lib/i18n/config.ts` — a JSON file dropped into `locales/en/` without that entry
is never loaded, and the UI silently falls back to its `defaultValue`s."_

It has happened 18 times. `locales/en/` holds 88 namespace files; `lib/i18n/config.ts:19`
registers 70. The 18 unregistered ones:

```
c-awards   c-circle   c-creator   c-history   c-layout   c-lists
c-predictions   c-profile-modules   c-saves   c-status   c-tournaments
c-wager   c-wishlist   games-hub   settings-appearance   settings-content
settings-notifications   theme-studio
```

Read that list against the plan docs: it is **almost exactly the feature set delivered from the
07-19 and 07-20 specs** — awards, close-friends circle, creator studio, history, lists,
predictions, profile modules, saves, tournaments, wagers, wishlists, theme studio, and three of
the rebuilt settings pages. Every one of those features was built with `t()` calls and every one
of those `t()` calls is currently resolving to its English `defaultValue` in Arabic, Hindi,
Japanese, Urdu and the other 12 shipped locales. The translation pipeline has been filling
`locales/<lang>/c-tournaments.json` for weeks and nothing has ever read it.

**Fix (S, under an hour):**

1. Add the 18 names to `NAMESPACES` in `lib/i18n/config.ts:19`.
2. Decide which belong in `CORE_NAMESPACES` (`lib/i18n/config.ts:27`) — `games-hub` and the
   three `settings-*` namespaces are navigated to from cold, the `c-*` ones are lazy.
3. Add the guard so it cannot recur — a test that reads `locales/en/` and asserts set equality
   with `NAMESPACES`:

```ts
// lib/__tests__/i18n-namespaces.test.ts
import { readdirSync } from 'node:fs';
import { NAMESPACES } from '@/lib/i18n/config';

it('every locales/en/*.json is registered in NAMESPACES', () => {
  const files = readdirSync('locales/en')
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.replace(/\.json$/, ''));
  expect(files.filter((f) => !NAMESPACES.includes(f as never))).toEqual([]);
  expect(NAMESPACES.filter((n) => !files.includes(n))).toEqual([]);
});
```

This is the highest value-per-minute change in the document: it turns on translations for
thirteen already-built features in one array edit.

### 0(b) — 16 locale directories exist on disk and ship to nobody

`locales/` has 32 language directories. `LOCALES` (`lib/i18n/config.ts:3`) ships 16:
`en zh ar hi es fr pt ru de ja ko it id vi tr ur`. The other 16 — `bn cs el fa fil mr ms nl pa
pl ro sv ta te th uk` — are translated, versioned, and unreachable. Bengali and Filipino in
particular are large audiences to be carrying the disk cost for and serving to no one.

**Fix (S, needs one product decision):** either promote them into `LOCALES` (each addition is a
lazy bundle, so the marginal cost is a build artifact, not a bundle regression) or delete the
directories and drop them from `scripts/` i18n targets. Carrying them half-wired is the only
option with no upside. If promoting: check RTL coverage — `fa` and `ur` are RTL and only `ar`/`ur`
are currently in the RTL set.

---

## §1 — The still-open backlog from prior docs (pointers, not re-specs)

Verified still absent at `4d3cbfe0`. **Do not re-spec these here** — the linked document already
has the design.

| Item                                                                                       | Spec lives in      | Still open?                                                                        |
| ------------------------------------------------------------------------------------------ | ------------------ | ---------------------------------------------------------------------------------- |
| Feature flags / kill switches / staged rollout                                             | 07-31 §4           | Yes — zero hits for `featureFlag\|killSwitch` anywhere                             |
| Public status & incident page                                                              | 07-31 §5           | Yes (a Go `status` service exists; no user-facing page)                            |
| Changelog / "what shipped" feed                                                            | 07-31 §6           | Yes                                                                                |
| Keyword / phrase / tag mutes                                                               | 07-31 §7           | Partly — `getMutedWords` exists for the feed; no settings surface for phrases/tags |
| Visibility tiers instead of binary ban                                                     | 07-31 §3           | Yes                                                                                |
| Age assurance + regional gating                                                            | 07-31 §1           | Yes — see D1, which assumes it                                                     |
| Semantic search / pgvector                                                                 | 07-31 §12          | Yes — search is Postgres FTS (`lib/search/posts.server.ts:68`)                     |
| OAuth 2.0 third-party apps                                                                 | 07-31 §11          | Yes                                                                                |
| Unified matchmaking + anti-cheat                                                           | 07-31 §10          | Yes — see A5/E1, which both want it                                                |
| Auctions / crafting / gift cards                                                           | 07-31 §8, §18, §22 | Yes                                                                                |
| Community rules, roles, per-community mod queue                                            | 08-03 §E1          | Yes                                                                                |
| TOTP + recovery codes, multi-account switching, signup abuse defence, media classification | 08-03 §D1–D4       | Yes                                                                                |
| axe in CI, visual-regression baseline                                                      | 08-03 §F2, §F3     | Yes                                                                                |

Everything in this document is **additional** to that list.

---

## §2 — Priority summary

Severity is "distance from the products users compare us to", not internal preference.
Effort: **S** ≤ 2 days · **M** ≤ 2 weeks · **L** > 2 weeks.

| #      | Feature                                                              | Compared against                    | Sev          | Effort |
| ------ | -------------------------------------------------------------------- | ----------------------------------- | ------------ | ------ |
| **0a** | **Register the 18 orphaned i18n namespaces**                         | own contract                        | **Critical** | **S**  |
| 0b     | Ship or delete the 16 orphan locales                                 | —                                   | Med          | S      |
| **D1** | **Player-protection suite (limits, reality checks, self-exclusion)** | any operator with cash-out + chance | **Critical** | **M**  |
| **A1** | **Game capability metadata + faceted arcade browse**                 | Steam, itch.io                      | **High**     | **M**  |
| **A2** | **Unified input layer — gamepad, remapping, shared touch controls**  | Steam, Poki, Xbox Cloud             | **High**     | **M**  |
| A3     | Assist & accessibility presets inside games (incl. photosensitivity) | modern console/PC titles            | High         | M      |
| **E1** | **Personalized recommendations ("because you played…")**             | Steam, Netflix, Spotify             | **High**     | **M**  |
| C3     | Deck import/export (Anki `.apkg`, Quizlet CSV, Markdown)             | Anki, Quizlet                       | High         | M      |
| A5     | Player-made content: track/level/loadout sharing                     | Steam Workshop, Mario Maker         | High         | L      |
| B1     | Clips from watch rooms and replays                                   | Twitch, YouTube Shorts              | Med          | M      |
| C1     | FSRS scheduler replacing SM-2                                        | Anki 23.10+                         | Med          | S      |
| C2     | Rich card types (cloze, image occlusion, audio, MCQ)                 | Anki, Quizlet                       | Med          | M      |
| A4     | Video previews / trailers on game cards                              | Steam, itch.io, App Store           | Med          | S      |
| B2     | Transcripts, chapters, search-inside-video                           | YouTube                             | Med          | M      |
| D2     | Playtime wellbeing for the arcade generally                          | Nintendo, Xbox, TikTok              | Med          | S      |
| B3     | RMHMusic: saved playlists, vote-to-skip, lyrics                      | Spotify Jam, JQBX                   | Med          | M      |
| F1     | i18n coverage gate in CI (generalises 0a)                            | own contract                        | Med          | S      |
| F2     | Per-game crash & performance telemetry                               | any game platform                   | Low          | S      |

---

# Pillar A — The arcade is 20 games, not a platform

**The thesis.** `lib/games.ts` is 372 lines and `GameInfo` (`lib/games.ts:1-28`) has **twenty
fields, all of which are marketing**: title, description, gradient, icon, colour, tags, image,
`authGate`. There is no field describing what a game _is_ — genre, how many players, what input
it needs, how long a session runs, whether it works on a phone, whether it flashes. Steam has
had all of that since 2013 and itch.io since launch, and every one of those fields does triple
duty: it powers filtering, it sets expectations before a load, and it feeds structured data.

Everything in this pillar falls out of that one absence.

---

## A1 — Game capability metadata + faceted arcade browse — **M**

### Competitor anchor

Steam's store page has "Single-player / Online Co-op / Full controller support / Remote Play on
Phone", a genre taxonomy, and accessibility feature tags (added 2024). itch.io has platform,
input method, accessibility, and average session length. Both surface them as **facets** in
browse. `/arcade` today is an unfiltered grid.

### What exists / the gap

- `lib/games.ts:1-28` — `GameInfo` as above. `tags: string[]` is a free-text marketing array
  (`['Watch Party', 'Real-time', 'Beta']`), not a controlled vocabulary, so it cannot be a facet.
- `lib/seo-catalog.ts` derives `head()` for every game root from this catalogue — so any field
  added here reaches SEO for free.
- Multiplayer support is discoverable only by reading each game's `lib/<game>/multiplayer.ts`.
  `lib/wager/eligible-games.ts` already maintains a _second_, hand-kept list of which games
  support head-to-head — a duplicate that A1 should absorb.

### Data model

None — this is a code catalogue, matching how `lib/achievements/catalog.ts:1-10` justifies
keeping definitions in code and only user rows in the DB. Extend the interface:

```ts
// lib/games.ts
export type GameGenre =
  | 'action'
  | 'puzzle'
  | 'racing'
  | 'rhythm'
  | 'strategy'
  | 'simulation'
  | 'party'
  | 'rpg'
  | 'card'
  | 'word'
  | 'arcade';

export type PlayerMode = 'single' | 'local-multi' | 'online-versus' | 'online-coop' | 'async';

export type InputMethod = 'keyboard' | 'mouse' | 'touch' | 'gamepad' | 'gyro';

export type AccessibilityFeature =
  | 'remappable-input' // A2
  | 'assist-mode' // A3
  | 'reduced-flashing' // A3 — photosensitivity
  | 'colorblind-safe'
  | 'subtitles'
  | 'no-timed-input'
  | 'screen-reader-hud';

export interface GameCapabilities {
  genre: GameGenre[];
  players: PlayerMode[];
  /** Concurrent players in one online session, when applicable. */
  maxPlayers?: number;
  input: { supported: InputMethod[]; required: InputMethod[] };
  /** Typical single session, minutes — sets expectations, powers "got 5 minutes?". */
  sessionMinutes: [min: number, max: number];
  /** Renderer class — drives the perf-tier warning and the mobile badge. */
  engine: '2d-canvas' | 'webgl' | 'dom';
  /** Lowest device tier that holds 30fps. Cross-checks lib/perf-tier.ts. */
  minPerfTier: 'low' | 'medium' | 'high';
  accessibility: AccessibilityFeature[];
  /** Honest content descriptors — feeds D1 age gating and parental controls. */
  descriptors?: ('gambling-mechanics' | 'flashing' | 'violence' | 'user-content')[];
  /** Does this game persist to the account? Cross-check with lib/game-saves/. */
  cloudSave: boolean;
  /** Replaces the hand-kept list in lib/wager/eligible-games.ts. */
  wagerEligible: boolean;
}
```

`GameInfo` gains `capabilities: GameCapabilities` — **required, not optional**, so the
typechecker forces all 20 games to be filled in and no new game can ship without it.

### Server / API

None. Static catalogue, filtered client-side; 21 rows never needs a query.

### UI surfaces

1. **`/arcade` facet rail** — a `<FilterRail>` on `.glass-pane` with genre, players, input,
   session length, "works on phone" (= `input.supported` includes `touch`), and accessibility
   checkboxes. State in the URL search params so a filtered arcade is linkable and SSR-able
   (TanStack Start `validateSearch` with a zod schema). Mobile: the rail collapses into a
   bottom sheet, matching the existing sheet pattern.
2. **Capability chips on the game card and game root** — a `<CapabilityChips>` primitive in
   `components/games/`, rendered from `capabilities`, using lucide icons (`Gamepad2`, `Users`,
   `Smartphone`, `Accessibility`, `Timer`).
3. **A "Playable now on this device" badge** — computed from `capabilities.input.required`
   against the actual device (`lib/breakpoint`, `navigator.maxTouchPoints`) and
   `minPerfTier` against `lib/perf-tier.ts`. This is the single highest-value chip: it stops a
   phone user loading a 3D WebGL game that needs a keyboard.

### SEO

`lib/seo-catalog.ts` gains a `VideoGame` JSON-LD builder in `lib/schema.ts` —
`gamePlatform`, `playMode` (`SinglePlayer`/`MultiPlayer`/`CoOp`), `genre`, `numberOfPlayers`.
Emitted via `jsonLdScript()` per CLAUDE.md §6. Facet URLs (`/arcade?genre=puzzle`) get a
`head()` with a facet-specific title/description and a self-canonical only for the
single-facet case; multi-facet combinations canonicalise to `/arcade` to avoid an index
explosion. Add the single-facet URLs to the sitemap via `lib/sitemap.ts`.

### i18n

Genre/mode/input labels are a new `games-hub` namespace concern — note that `games-hub` is one
of the 18 orphaned namespaces from §0(a), so **fix 0(a) first or these strings ship untranslated
on arrival**. Never translate the enum values themselves; translate labels keyed off them.

### Acceptance criteria

- All 20 games have `capabilities`; `pnpm exec tsc --noEmit` fails if one does not.
- `lib/wager/eligible-games.ts` is deleted and its consumers read `capabilities.wagerEligible`;
  a test asserts the set is unchanged from the old list.
- `/arcade?input=touch` returns only games playable on a phone, SSR'd, with a canonical.
- A test asserts every `minPerfTier` value is one `lib/perf-tier.ts` actually emits.

### Risks

Honesty decay — a game changes and the metadata doesn't. Mitigate with cross-checks that are
mechanical: `cloudSave` asserted against the presence of a `lib/game-saves` registration,
`input.supported` asserted against the A2 input-map registration once that lands.

---

## A2 — A unified input layer: gamepad everywhere, remapping, one touch control — **M**

### Competitor anchor

"Full controller support" is a Steam store facet because it is table stakes. Poki and CrazyGames
both ship a portal-level gamepad shim. Every console platform mandates remappable controls as an
accessibility requirement.

### What exists / the gap

- **Gamepad support exists in exactly one file on the site**:
  `components/game/GameCanvas.tsx:56-59` hardcodes Standard Gamepad button indices for a
  two-lane game, with detection at `:255-262`. No other game reads `navigator.getGamepads()`.
- **Touch controls are hand-rolled at least four times**:
  `components/void-breaker/VoidBreakerTouchControls.tsx`,
  `components/neon-driftway/NeonDriftwayTouchControls.tsx`,
  `components/velum2099/game/ui/MobileControls.ts`, plus ad-hoc handling in
  `components/altair/AltairShell.tsx`. Four different dead zones, four different button sizes,
  four different behaviours under `useReducedMotion`.
- **Nothing is remappable anywhere**, so a left-handed player, a one-handed player, or anyone on
  a non-QWERTY physical layout (AZERTY `ZQSD`!) cannot play the keyboard games at all. With 16
  shipped locales, the AZERTY case is not hypothetical.

### Design

A new `lib/input/` module — a **semantic action layer**, not a key layer. Games bind to actions
(`'thrust'`, `'left'`, `'fire'`, `'pause'`), never to `KeyW`.

```ts
// lib/input/actions.ts
export interface ActionDef {
  id: string; // 'thrust'
  labelKey: string; // i18n key
  /** Analog actions read -1..1; digital read 0|1. */
  kind: 'digital' | 'analog';
}

// lib/input/binding.ts
export interface Binding {
  keys: string[]; // KeyboardEvent.code — layout-independent
  gamepadButtons: number[]; // Standard Gamepad indices
  gamepadAxis?: { index: number; sign: 1 | -1; deadzone: number };
  touch?: { control: 'stick-left' | 'stick-right' | 'button'; slot: number };
}

export type InputMap = Record<string /* actionId */, Binding>;
```

Each game registers a default map:

```ts
// lib/void-breaker/input.ts
export const VOID_BREAKER_ACTIONS: ActionDef[] = [...];
export const VOID_BREAKER_DEFAULT_MAP: InputMap = {...};
```

and consumes it through one hook:

```ts
// lib/input/useGameInput.ts
const input = useGameInput('void-breaker', VOID_BREAKER_ACTIONS, VOID_BREAKER_DEFAULT_MAP);
// inside the rAF loop — no React state, no re-render:
if (input.pressed('fire')) fire();
const steer = input.axis('steer');
```

`useGameInput` returns a **stable ref-backed object**, polls `navigator.getGamepads()` once per
frame from a single shared poller (not one per game), merges keyboard/gamepad/touch into the
action state, and exposes `input.activeDevice` so the HUD can swap prompt glyphs between
keyboard and controller — the thing that makes controller support _feel_ supported.

### Data model

Reuse `LayoutPreference`-style storage rather than adding a model. A `UserInputMap` row is
justified only if maps must sync across devices; they should, so:

```prisma
model UserInputMap {
  id        String   @id @default(cuid())
  userId    String
  game      String   @db.VarChar(32)
  map       Json     // zod-validated InputMap; server rejects unknown action ids
  updatedAt DateTime @updatedAt
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, game])
  @@map("user_input_map")
}
```

Signed-out players get `localStorage` with the same shape and a one-time merge on login,
mirroring how `lib/game-saves/` already handles the anonymous→account transition (see
`lib/game-saves/__tests__/conflict.test.ts` for the precedent to follow).

### Server & API

- `app/routes/api/input/$game.ts` — `GET` (auth `'optional'`) and `PUT`
  (`rateLimit: 'write'`, zod body). `defineHandler` per CLAUDE.md §3.
- Validation rejects action ids not in the game's registered `ActionDef[]`, so a crafted map
  cannot inject arbitrary keys into the poller.

### UI surfaces

1. **`<TouchControls>`** in `components/game/` — one implementation, driven by the `touch`
   slots in the map: virtual sticks with configurable dead zone, buttons sized to the 44px
   minimum, `touch-action: none`, honouring `useReducedMotion` for the press animation and the
   `--app-*` token contract. Replaces all four bespoke implementations.
2. **Remap panel** — a shared `<InputSettings game="…">` opened from every game's pause menu and
   from a new `/settings/controls` page. Press-to-bind capture, conflict detection, per-device
   tabs (Keyboard / Controller / Touch), and Reset to defaults.
3. **Prompt glyphs** — `<InputPrompt action="fire" />` renders the current binding for the
   active device, so on-screen tutorials stop saying "press W" to a controller player.

### Migration path

Do not convert 20 games at once. Land the module, the API and the settings page; convert
**Void Breaker, Neon Driftway and Velum2099 first** (they have the most input surface and all
three already have bespoke touch code to delete). Each conversion is a self-contained PR that
deletes more than it adds. `capabilities.input` (A1) becomes derivable from the registered map
once a game is converted — assert that in a test.

### Acceptance criteria

- A Standard Gamepad drives Void Breaker end-to-end including menus and pause.
- Rebinding to AZERTY `ZQSD` persists across a logout/login on a different device.
- Exactly one `getGamepads()` poll loop exists site-wide (assert with a grep test).
- The four bespoke touch-control files are deleted.
- `jsx-a11y` warnings do not increase; virtual buttons carry `aria-label` and are excluded from
  the tab order (they are pointer-only).

### Risks

- **Frame budget.** The poller must not allocate per frame and must not trigger React renders.
  Enforce with a guardrail test in the style of `lib/__tests__/performance-guardrails.test.ts`.
- **iOS Safari gamepad quirks** — connection events fire late; poll defensively rather than
  relying on `gamepadconnected` alone (the existing code at `GameCanvas.tsx:257-262` already
  learned this; keep that behaviour).

---

## A3 — Assist & accessibility presets inside the games — **M**

### Competitor anchor

Celeste's assist mode is the canonical example and it is now an industry norm; _The Last of Us
Part II_ and _Forza_ set the ceiling. Xbox and PlayStation both ship accessibility tags in-store.
Steam added accessibility feature tags in 2024. The relevant floor is **not** "the site is
accessible" — that is already true — it is "the games are".

### What exists / the gap

The site tier is genuinely strong here: a high-contrast theme, a colour-vision mode with three
dichromacy variants (`lib/appearance/prefs.ts:35-67`), font scaling, density, reduce-motion and a
glass-degradation ladder, all applied by the boot script in `app/routes/__root.tsx:157`.

**None of it reaches a `<canvas>`.** A canvas game paints pixels; `--site-*`/`--app-*` tokens and
`data-color-vision` are invisible to it. So the accessibility work stops at the game frame, and
inside the frame there is no cross-game contract at all: `difficulty` appears in
`lib/forest-explorer/`, `lib/vega/WaveManager.ts`, `lib/laundry-sort/` and `lib/game/GameEngine.ts`
with four unrelated meanings, and there is no toggle anywhere for flashing.

**The photosensitivity point is the sharp one.** Void Breaker and Neon Driftway are neon,
high-contrast, strobing renderers (`lib/void-breaker/renderer.ts`, `lib/neon-driftway/renderer3d.ts`)
with no flash-reduction option and no warning. WCAG 2.2 §2.3.1 (three flashes or below threshold)
is a Level **A** criterion — the same level as alt text. This is the one item in the pillar with a
harm case attached, not just a parity case.

### Design

A shared preset store, read by games through one hook, with per-game opt-in support declared in
A1's `capabilities.accessibility`.

```ts
// lib/game/assist.ts
export interface AssistPrefs {
  reduceFlashing: boolean; // renderers clamp luminance delta per frame
  reduceScreenShake: boolean;
  highContrastHud: boolean; // HUD switches to an opaque, non-glass plate
  hudScale: 0.875 | 1 | 1.25 | 1.5;
  subtitles: boolean; // in-canvas caption line for game audio cues
  slowFactor: 1 | 0.75 | 0.5; // Celeste-style game-speed assist
  infiniteLives: boolean; // opt-in, excluded from leaderboards
  holdToToggle: boolean; // hold-inputs become toggles (motor accessibility)
  aimAssist: 0 | 1 | 2;
}
```

- Defaults **inherit from the site prefs**: `reduceFlashing` and `reduceScreenShake` default to
  the value of the global reduce-motion flag; `hudScale` defaults from `rmh-font-scale`;
  `highContrastHud` defaults on under the `high-contrast` theme. A player who has already told
  the site they need reduced motion should not have to tell each game.
- **Leaderboard integrity:** `slowFactor < 1`, `infiniteLives` and `aimAssist > 0` set an
  `assisted` flag on any submitted score. Assisted runs are **stored and shown to the player**
  and are excluded from ranked/wager/tournament boards. They are never blocked — blocking is what
  makes assist modes go unused. Extend `lib/game/score.ts` and the `GameReplay` submission path
  (`prisma/schema.prisma:5749`) with the flag.

### Server & API

Storage rides `AppearancePreference` (the model already exists) with a new `gameAssist Json?`
column, rather than a new table — these are user preferences and belong with the others.
`app/routes/api/account/assist.ts`, `defineHandler`, `rateLimit: 'write'`, zod.

### UI surfaces

1. **`/settings/appearance`** gains a "Games" section (the settings IA was just consolidated
   in 08-03 §C9 — extend it, don't add an eleventh page).
2. **Every game's pause menu** gets the same `<AssistPanel>`, so it is adjustable at the moment
   of frustration rather than three navigations away.
3. **A pre-launch interstitial for flashing games** — one time per user, dismissible, offering
   "reduce flashing" before the first frame renders. Gate on
   `capabilities.descriptors.includes('flashing')`.
4. **Assisted-run badge** on the player's own score rows, phrased neutrally.

### Renderer work (the real cost)

The store is small; the honest cost is the per-renderer implementation. Scope it to the games
that need it most, in order: Void Breaker, Neon Driftway, Velum2099, Synapse Storm, Slice It!.
For each: clamp per-frame luminance delta under `reduceFlashing`, gate shake on
`reduceScreenShake`, scale HUD by `hudScale`, and multiply the fixed timestep by `slowFactor`
(**never** the physics constants — only the accumulator, or determinism and replay compat break;
`GameReplay.version` at `prisma/schema.prisma:5749` exists precisely to catch this).

### Acceptance criteria

- With `reduceFlashing`, no full-screen luminance change exceeding the WCAG general-flash
  threshold more than 3×/second in any converted game — verified by sampling frames in a headless
  run, not by eye.
- `slowFactor: 0.5` produces a run that completes and submits with `assisted: true` and does not
  appear on the global board.
- Site-level reduce-motion propagates to a first-time game launch with no per-game setup.
- `capabilities.accessibility` (A1) is asserted against the assist features a game actually
  registers — no honesty decay.

### Effort

**M** for the framework + 5 games. Remaining games convert opportunistically.

---

## A4 — Video previews and trailers on game cards — **S**

### Competitor anchor

Steam autoplays a muted trailer on the store page and on hover in search. itch.io, the App Store,
Netflix and YouTube all do a variant. A static `.webp` is what a 2013 portal shipped.

### What exists / the gap

`GameInfo.imagePath` (`lib/games.ts:20`) is a single static image, reused for the card, the game
root and the OG card. `lib/video-optimize.server.ts` already exists (used for feed media), so the
encoding half is solved.

### Design

- `GameInfo` gains `previewPath?: string` (a 4–8s silent loop, ≤ 2 MB, `.webm` VP9 + `.mp4` H.264
  fallback) and `trailerPath?: string` (up to 60s, with audio, for the game root).
- **`<GamePreview>`** in `components/games/`: renders the poster `<img>` until the card is
  hovered/focused **and** the viewport is not coarse-pointer **and** `useReducedMotion()` is
  false **and** `navigator.connection.saveData` is not set — then swaps to `<video muted loop
playsInline preload="none">`. On touch, never autoplay; show a play affordance on the game
  root only. Preview loads use `preload="none"` and are cancelled on pointer-out, so a scroll
  past twelve cards fetches nothing.
- OG: `buildMeta` already owns the OG block (CLAUDE.md §6). Add `og:video` support there for game
  roots with a trailer, plus `VideoObject` JSON-LD from `lib/schema.ts`. Do not hand-roll tags in
  the route.
- Assets go through the existing `assets` Go service and the content-addressed immutable cache.

### Acceptance criteria

- No video bytes are requested on a cold `/arcade` load (assert in the bundle/perf guardrail
  suite).
- Preview never plays under reduce-motion or `save-data`.
- LCP on `/arcade` does not regress — the poster image is the LCP candidate and stays an `<img>`.

### Risks

Cost is production, not code: someone must record 20 previews. Ship the component with 3–4 games
and let `previewPath` stay optional; the card degrades to today's behaviour.

---

## A5 — Player-made content: tracks, levels and loadouts — **L**

### Competitor anchor

Steam Workshop, _Super Mario Maker_, _Trackmania_, _Geometry Dash_, Roblox. The pattern is the
platform's strongest retention loop: the content budget stops being the studio's problem, and
each creation is a share-shaped object that brings in its author's friends.

### What exists / the gap

The **substrate is already built** and pointed the wrong way — at private saves instead of shared
content:

- Neon Driftway persists tracks to the account (`5bacf074`, `d7c0ba57` — "Void Breaker's Forge and
  Neon Driftway's tracks follow the account"). Private.
- Slice It! has a song-upload path — there is even an achievement for it
  (`lib/achievements/catalog.ts`, `game.slice_it.upload`, "Upload your own song"). Private.
- Versecraft has `VersecraftWorld` and generated chapters. Private.
- `UserBuild` + `BuildVersion` + `BuildLike` + `BuildComment` + `BuildView` is a **complete
  publish/moderate/browse/like/comment pipeline** — for vibe-coded pages
  (`components/user-builds/`, `/user-builds`). Nothing reuses it for game content.

So this is less "build a workshop" than "point the workshop that exists at the game artefacts
that exist".

### Data model

```prisma
model GameCreation {
  id           String   @id @default(cuid())
  userId       String
  game         String   @db.VarChar(32)      // 'neon-driftway' | 'slice-it' | …
  kind         String   @db.VarChar(24)      // 'track' | 'level' | 'loadout' | 'chart'
  title        String   @db.VarChar(80)
  description  String?  @db.VarChar(500)
  /** Game-defined payload, zod-validated per (game, kind). Capped like GameReplay. */
  data         Json
  sizeBytes    Int
  /** Bumped when the game's format changes; old creations stay playable or are flagged. */
  formatVersion String  @db.VarChar(16)
  visibility   String   @default("public") @db.VarChar(8) // 'public'|'unlisted'|'private'
  status       String   @default("PENDING") @db.VarChar(12) // moderation: PENDING|APPROVED|REMOVED
  playCount    Int      @default(0)
  likeCount    Int      @default(0)
  clearCount   Int      @default(0)          // Mario Maker's "has anyone finished it?"
  firstClearById String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  user  User @relation(fields: [userId], references: [id], onDelete: Cascade)
  plays GameCreationPlay[]
  likes GameCreationLike[]

  @@index([game, kind, status, playCount(sort: Desc)])
  @@index([game, kind, status, createdAt(sort: Desc)])
  @@index([userId, createdAt(sort: Desc)])
  @@map("game_creation")
}

model GameCreationPlay {
  id         String   @id @default(cuid())
  creationId String
  userId     String
  cleared    Boolean  @default(false)
  score      Int?
  timeMs     Int?
  createdAt  DateTime @default(now())
  creation   GameCreation @relation(fields: [creationId], references: [id], onDelete: Cascade)
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([creationId, score(sort: Desc)])
  @@index([creationId, timeMs])
  @@unique([creationId, userId])
  @@map("game_creation_play")
}

model GameCreationLike {
  creationId String
  userId     String
  createdAt  DateTime @default(now())
  creation   GameCreation @relation(fields: [creationId], references: [id], onDelete: Cascade)
  user       User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@id([creationId, userId])
  @@map("game_creation_like")
}
```

### Server & API

- `app/routes/api/creations/index.ts` — `GET` (browse, `auth: 'optional'`, cursor paginated,
  facets by game/kind/sort) and `POST` (`rateLimit: 'write'`, zod per `(game, kind)` payload
  schema, size cap enforced server-side exactly as `GameReplay.sizeBytes` is).
- `app/routes/api/creations/$id.ts` — `GET` / `PATCH` / `DELETE`.
- `app/routes/api/creations/$id/play.ts` — `POST` records a play/clear. Idempotent per user via
  the unique constraint; increments the denormalised counters through the existing
  `lib/hot-counters.server.ts` path rather than a write per play.
- **Moderation is not optional.** Route new creations through
  `lib/moderation/auto-moderate.server.ts` for the title/description, and put uploaded audio
  (Slice It!) behind the same media pipeline the 08-03 doc's D4 proposes; until D4 exists,
  Slice It! uploads stay `unlisted`-only. A publish surface without classification is the single
  way this feature goes wrong.

### Per-game work

Each participating game needs (a) a serializer for its artefact, (b) a zod schema, (c) a
"publish" affordance in its own UI, and (d) a loader that plays a creation by id. Start with
**Neon Driftway tracks** — the format exists, the artefact is small and deterministic, and a track
is instantly legible in a card. Slice It! charts second (highest creative ceiling, needs D4
first). Versecraft worlds third.

### UI surfaces

- `/arcade/creations` — browse with facets (game, kind, sort: new / most played / hardest /
  unclear'd), reusing the `components/builds/` card grid rather than a new one.
- A **Creations tab on each game's root**, and a "Play a community track" entry in the game itself.
- The creation page: play button, author, play/clear counts, a per-creation leaderboard from
  `GameCreationPlay`, like, report, and an OG card via `ogCardPath('creation', id)`.
- Profile: a Creations module, slotting into the existing `ProfileLayout` module system.

### Economy integration

Coins on milestones only (first clear by someone else, 100 plays), routed through
`lib/economy/ledger.server.ts` with a per-creation cap so a creator cannot farm by spamming
creations. **No paid creations in v1** — that adds a marketplace, a payout duty and a fraud
surface on top of an already-L feature.

### Acceptance criteria

- A Neon Driftway track published on desktop is playable from a phone with no account link step.
- A removed creation 404s immediately and drops out of every list without a cache flush wait.
- Payload over the size cap is rejected server-side with a typed error, not truncated.
- A creation's format version mismatch shows "made in an older version" rather than a broken load.

### Risks

- **Format churn.** Every track format change risks orphaning creations. `formatVersion` plus a
  migration function per bump, with a test asserting every shipped version still loads.
- **Moderation load** — see above; this is the gating constraint, not the code.

---

# Pillar B — The watch and listen tier

## B1 — Clips: 15–60 seconds, from a watch room or a replay, straight into the feed — **M**

### Competitor anchor

Twitch clips are the highest-leverage growth feature Twitch ever shipped: they convert a
live-only, un-shareable moment into a portable, embeddable object. YouTube Shorts and Medal.tv
work the same way for games.

### What exists / the gap

- `SharedMoment` (`prisma/schema.prisma:5798`) shares _stat cards_ — achievement, rank, streak,
  wrapped stat. It carries a JSON payload, not media.
- `GameReplay` (`prisma/schema.prisma:5749`) stores a deterministic `{seed, inputs}` or
  `{snapshots}` replay with a version, plus `/replays/$id` and `embed.replay.$id` routes.
- RMHTube rooms have synced playback and a queue but no capture.
- So: **the two things worth clipping both exist and neither can be clipped.**

### Design — two sources, one object

```prisma
model Clip {
  id          String   @id @default(cuid())
  userId      String
  source      String   @db.VarChar(12)   // 'replay' | 'tube'
  sourceId    String                      // GameReplay.id | RmhTubeRoom video ref
  title       String   @db.VarChar(100)
  startMs     Int
  endMs       Int                         // enforced: endMs - startMs <= 60_000
  /** Poster frame, generated server-side. Clip playback is derived, not stored. */
  posterKey   String?
  viewCount   Int      @default(0)
  visibility  String   @default("public") @db.VarChar(8)
  createdAt   DateTime @default(now())
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([source, sourceId])
  @@index([userId, createdAt(sort: Desc)])
  @@map("clip")
}
```

The important decision: **a replay clip stores no video.** It stores a time window into an
existing deterministic replay, so a clip costs ~200 bytes and plays by running the replay engine
between `startMs` and `endMs`. Only the poster frame is rendered and stored. This is the whole
reason the feature is M and not L, and it is available _because_ replays are deterministic.

A tube clip stores a `{videoRef, start, end}` window into the third-party source and plays via
the existing player with a bounded range — no re-hosting, no copyright surface.

### Server & API

- `app/routes/api/clips/index.ts` — `POST` (`rateLimit: 'write'`, zod, 60s cap enforced
  server-side), `GET` browse.
- Poster generation runs on the Go `assets` service or a pg-boss job (`lib/jobs/`), never inline
  in the request.
- Clip creation from a replay validates that the replay is `public`/`unlisted` and that the
  window is inside `durationMs`.

### UI surfaces

- **"Clip that"** button in the replay player and in the RMHTube room chrome, opening a trim
  bar (`.glass-overlay`) prefilled with the last 30 seconds — the Twitch affordance: you clip
  _after_ the moment, not before.
- Clips render inline in the feed via the existing embed route pattern
  (`app/routes/embed.replay.$id.tsx` is the template), with an OG video card.
- A Clips tab on the profile and on each game's root ("best moments in Void Breaker this week",
  sorted by `viewCount`).

### Acceptance criteria

- A clip created from a replay plays identically on another account, on a phone, signed out.
- Clip payload cannot exceed 60s or extend past the source duration.
- Deleting the source replay cascades or tombstones the clip — no orphan players.

---

## B2 — Transcripts, chapters and search-inside-video — **M**

### Competitor anchor

YouTube's transcript panel, chapter markers and in-video search. For a watch-party product the
transcript is also the accessibility story: a synced room where one participant is deaf currently
has nothing.

### What exists / the gap

`lib/rmhtube/store.ts:30` has exactly one field: `captionsEnabled: boolean` — a pass-through
toggle for the embedded player's own captions. Nothing is stored, nothing is searchable, and the
room chrome cannot render a transcript. There is no chapter concept anywhere.

### Design

```prisma
model TubeTranscript {
  id         String   @id @default(cuid())
  videoRef   String   @unique @db.VarChar(200)  // provider:id — shared across rooms
  lang       String   @db.VarChar(8)
  source     String   @db.VarChar(12)           // 'provider' | 'generated'
  cues       Json                                // [{ startMs, endMs, text }]
  createdAt  DateTime @default(now())
  @@map("tube_transcript")
}

model TubeChapter {
  id        String @id @default(cuid())
  videoRef  String @db.VarChar(200)
  startMs   Int
  title     String @db.VarChar(120)
  createdById String?
  @@index([videoRef, startMs])
  @@map("tube_chapter")
}
```

Keyed by `videoRef`, **not** by room — one fetch serves every room that ever queues that video.

- **Ingest:** a pg-boss job pulls provider captions when available. Generated transcripts (for
  direct-URL media) are a phase 2 and need an explicit cost decision; do not ship ASR on day one.
- **All third-party fetches go through `lib/ssrf-guard.server`** per CLAUDE.md §8 — this is a
  user-supplied URL path.
- **Search:** transcript cues get a `tsvector` column and join the universal search index
  (`lib/search/universal.server.ts`) as a new hit type, so "search inside video" is a
  `websearch_to_tsquery` away using the machinery `lib/search/posts.server.ts:68` already proves out.

### UI surfaces

- A transcript panel in the room (`.glass-pane`), cue-synced with the player position,
  click-a-line-to-seek, with a search box scoped to the transcript.
- Chapter markers on the scrub bar; room hosts can add chapters, which persist per `videoRef`
  and benefit every later room.
- Deep links: `/rmhtube/room/x?t=1234` already-or-newly supported, plus copy-link-at-timestamp.

### Acceptance criteria

- Transcript renders and syncs within 250ms of a seek.
- A universal search for a phrase spoken in a queued video returns the video with the timestamp.
- Transcript panel is keyboard navigable and announced to screen readers as a list of timed cues.

---

## B3 — RMHMusic: saved playlists, vote-to-skip, lyrics — **M**

### Competitor anchor

Spotify Jam, JQBX and Discord listening parties. The three things a listening room is judged on
are: can we save what we just built, can the room overrule the host, and can we sing along.

### What exists / the gap

- `RmhMusicRoom` / `RmhMusicRoomMember` / `RmhMusicQueueItem` / `RmhMusicChatMessage`
  (`prisma/schema.prisma:2092+`) — a queue tied to a room, playing Spotify URIs via
  `lib/rmhmusic/spotify-player.ts`.
- **The queue dies with the room.** There is no `RmhMusicPlaylist`, while RMHTube has
  `RmhTubePlaylist` + `RmhTubePlaylistItem` and the site has `Playlist`/`PlaylistItem`
  (`/playlists`). Music is the only one of the three with no save.
- **Skip is host-only.** `lib/rmhmusic/events.ts:12` has `MUSIC_SKIP` and no vote event —
  whereas RMHTube has both `QUEUE_SKIP` and `QUEUE_VOTE_SKIP` (`lib/rmhtube/events.ts:35-36`)
  and tracks `skipVotes` in its store (`lib/rmhtube/store.ts:388-455`). The parity gap is
  internal: **copy RMHTube's own implementation.**
- No lyrics anywhere (`grep lyrics` returns one unrelated hit in Versecraft's word bank).

### Design

1. **`RmhMusicPlaylist` + `RmhMusicPlaylistItem`**, mirroring the RMHTube models exactly, plus
   "Save this queue as a playlist" and "Load a playlist into the queue". Collaborative flag so
   room members can add to a shared playlist.
2. **Vote-to-skip** — port `QUEUE_VOTE_SKIP` from `lib/rmhtube/` verbatim: threshold =
   `ceil(activeMembers / 2)`, host override retained, votes cleared on track change. Same store
   shape, same socket event naming convention.
3. **Lyrics** — a `lyricsRef` on the queue item and a provider-backed fetch behind
   `lib/ssrf-guard.server`, cached by track URI. Time-synced if the provider supplies it,
   static otherwise. **Licensing is the gate, not the code** — a lyrics provider needs a
   commercial agreement; if that is not wanted, ship a "no lyrics available" state and treat
   1 and 2 as the deliverable.
4. **Listening history → Wrapped.** Music plays currently write nothing to `HistoryEntry`
   (`prisma/schema.prisma:5854`), whose `entityType` comment already anticipates `'song'`.
   Wiring it in feeds `/wrapped` and `lib/recap.server.ts` for free.

### Acceptance criteria

- A queue saved as a playlist reloads into a new room in the same order.
- Vote-to-skip requires a majority of _active_ members and clears on track change.
- Every completed play writes a `HistoryEntry`, and `/wrapped` reflects music listening.

---

# Pillar C — The study tier is a 1987 algorithm with 2010 card types

## C1 — Replace SM-2 with FSRS — **S**

### Competitor anchor

`lib/rmhstudy/srs.ts:1-38` implements SM-2 — the SuperMemo 2 algorithm, published 1987, with the
classic `easeFactor` / `intervalDays` / `repetitions` triple and the `1 → 6 → interval × ease`
ladder (`:28-30`). Anki made **FSRS the default scheduler in 2024**; in Anki's own published
benchmarks FSRS reaches the same retention with materially fewer reviews. Anyone who has used
Anki in the last two years will notice.

### The gap, precisely

- `lib/rmhstudy/srs.ts:33` — the SM-2 ease update, including SM-2's well-known "ease hell"
  (repeated hard grades drive `easeFactor` to the 1.3 floor and never recover).
- `FlashcardReview` (`prisma/schema.prisma:2682`) stores exactly the SM-2 triple, so the schema
  is the algorithm.

### Design

FSRS models each card with **stability** (`S`, days until recall probability falls to 90%),
**difficulty** (`D`, 1–10) and **retrievability** (`R`), and schedules to a user-chosen desired
retention.

```prisma
model FlashcardReview {
  // … existing fields retained for rollback and for the migration window …
  stability     Float?   // FSRS S
  difficulty    Float?   // FSRS D
  lastReviewAt  DateTime?
  reps          Int      @default(0)
  lapses        Int      @default(0)
  state         String   @default("new") @db.VarChar(10) // new|learning|review|relearning
}

model RmhStudyProfile {
  // … existing …
  desiredRetention Float @default(0.9)   // user-tunable, 0.7–0.98
}
```

`lib/rmhstudy/fsrs.ts` — pure functions, same shape as today's `nextState`, so the call sites do
not change:

```ts
export function nextState(prev: FsrsState, grade: Grade, now: Date): FsrsState & { dueAt: Date };
```

**Migration** (the part that needs care): existing rows have no `S`/`D`. Seed them from the SM-2
state rather than resetting — `stability ≈ intervalDays`, `difficulty` derived from
`easeFactor` mapped onto 1–10 — so no user loses their schedule. Keep the SM-2 columns for one
release and put both schedulers behind a per-user flag so a bad rollout is a toggle, not a
migration rollback. (This is one of several places in this document that would be materially
safer if 07-31 §4, feature flags, existed first.)

### Acceptance criteria

- A property test: for any grade sequence, intervals are monotonic in stability and never
  negative or NaN.
- Migrated cards' next due dates land within ±20% of their pre-migration dates.
- Desired retention is user-adjustable and provably changes interval length in the expected
  direction.
- The 17 FSRS parameters live in one exported constant with a comment naming the source version.

---

## C2 — Rich card types: cloze, image occlusion, audio, MCQ — **M**

### Competitor anchor

Anki: cloze deletion, image occlusion (first-class since 24.06), audio/TTS, multiple note types
with arbitrary fields. Quizlet: term/definition plus images, audio, and generated MCQ/matching
modes. The gap is not subtle.

### What exists / the gap

`Flashcard` (`prisma/schema.prisma:2665`) is **`front: String` and `back: String`**. That's it.
No media, no card types, no fields. A language deck cannot have audio; a biology deck cannot
occlude a diagram; a definition deck cannot generate a multiple-choice drill.

### Design

Additive, non-breaking — existing cards remain valid as `kind: 'basic'`:

```prisma
model Flashcard {
  // … existing front/back retained: they are 'basic' and stay the fast path …
  kind    String @default("basic") @db.VarChar(16)  // basic|reverse|cloze|occlusion|audio|mcq
  /** Type-specific payload, zod-validated per kind. Null for 'basic'. */
  payload Json?
  /** Media ids from the existing Media pipeline — reuses upload + (future) classification. */
  mediaIds String[]
}
```

Payload shapes (`lib/rmhstudy/card-types.ts`, one zod schema per kind):

- `cloze` — `{ text: string }` with `{{c1::hidden}}` markers; **one card per cloze index**, which
  means the review unit is `(cardId, clozeIndex)`. This is the one schema consequence:
  `FlashcardReview`'s unique key becomes `[userId, cardId, subIndex]` with `subIndex` defaulting
  to 0. Do this in the same migration as C1 to avoid two schedule migrations.
- `occlusion` — `{ mediaId, shapes: [{x,y,w,h,label}] }`, rendered as absolutely-positioned masks
  over the image; reveal one at a time.
- `audio` — `{ mediaId, transcript? }`, front is a play button.
- `mcq` — `{ question, options: string[], correctIndex }`, or auto-generated by sampling three
  distractors from sibling cards in the deck (Quizlet's trick — costs no authoring).

### Server, storage & UI

- Media reuses the existing `Media` model (`prisma/schema.prisma`) and upload path, so quotas,
  SSRF guards and (once 08-03 §D4 lands) classification apply automatically. Deck media counts
  against the user's existing media quota.
- The editor gets a type picker; the cloze editor needs a "wrap selection as cloze" action
  (`Ctrl/Cmd+Shift+C`) or nobody will use it.
- The reviewer switches renderer by `kind`. **Accessibility:** occlusion masks need labels and a
  keyboard reveal order; audio cards need a visible transcript toggle; MCQ options must be a
  proper radio group, not clickable divs (`jsx-a11y` will catch the last one).
- **Deck sharing already exists** — `FlashcardDeck.isPublic` + `clonedFromId`
  (`prisma/schema.prisma` deck model) — so new card types reach the public deck library for free,
  which is what makes C2 worth more than its own weight.

---

## C3 — Import and export: Anki `.apkg`, Quizlet CSV, Markdown — **M**

### Competitor anchor

Every serious flashcard product imports from the others; it is the standard way users switch.
Anki's shared-deck library is the single largest corpus of study content in existence, and it is
a zip file with a SQLite database inside — mechanically importable.

### What exists / the gap

No import or export path of any kind. A user with a 4,000-card Anki collection cannot become a
user, and a user with 4,000 cards here cannot leave — which is also a **data-portability duty**
the 07-20 doc's §2.8 already asserts for every feature.

### Design

- **`.apkg` import** — unzip, read `collection.anki2` (SQLite), map notes/cards/note-types onto
  C2's card kinds (basic → basic, cloze → cloze, everything exotic → basic with fields joined and
  a warning), extract the `media` map, push files through the existing upload pipeline. Runs as a
  **pg-boss job**, never inline: a large collection is minutes of work and megabytes of media.
- **Quizlet / CSV / TSV import** — column mapping UI, delimiter sniffing, quote handling. Trivial
  next to `.apkg` and covers the largest share of real imports.
- **Markdown import** — `Front :: Back` per line, or `## Front` / body. This is the format power
  users actually keep decks in, and it costs almost nothing.
- **Export** — CSV and Markdown for everything; `.apkg` export only if round-tripping is a stated
  goal (writing valid Anki SQLite is materially harder than reading it — do not commit to it in v1).

### Server & API

```
POST /api/study/import       → creates an ImportJob, returns id      (rateLimit: 'upload')
GET  /api/study/import/$id   → { status, progress, warnings[], deckId? }
GET  /api/study/export?deckId=…&format=csv|md
```

Guards: file size cap enforced before parse; zip-bomb protection (entry count + uncompressed size
ratio limits) — a `.apkg` is attacker-supplied input and unzipping it is the risky step; media
count cap per import; per-user concurrent import limit of 1.

### UI

A `/rmhstudy` import wizard: drop file → preview first 10 cards with detected types → map/confirm
→ background job with progress → "N cards imported, M skipped (why)". The warnings list is the
part users judge the feature on; make it specific.

### Acceptance criteria

- A real Anki deck with cloze notes and media imports with cloze cards intact and images visible.
- A 50 MB `.apkg` does not block the request thread or exceed the memory budget.
- A malicious zip (deep nesting, huge expansion ratio) is rejected with a typed error.
- Export → import round-trips CSV and Markdown losslessly for basic and cloze cards.

---

# Pillar D — Responsible play

## D1 — Player-protection suite: limits, reality checks, cool-off, self-exclusion — **M, Critical**

> This is a product and risk recommendation, not legal advice. The point of the section is that
> the _code_ currently has none of the controls that comparable operators ship, and adding them is
> straightforward. Whether any given jurisdiction's rules apply is a question for counsel, and the
> answer materially depends on the redemption path described below.

### Why this is the highest-severity item in the document

The platform combines, today, all three legs of the thing regulators look at:

1. **Chance-based mechanics staked with a platform currency.** `lib/blackjack/`, `lib/roulette/`,
   `lib/holdem/`, `lib/baccarat/`, `lib/plinko.ts`, `lib/wheel/`, `DailyWheelSpin`, plus
   `House Always Wins` as a shipped game and a `game.casino.high_roller` achievement for
   _"Place a single bet of 1,000+ coins"_ (`lib/achievements/catalog.ts`).
2. **Player-versus-player staking with a rake.** `WagerMatch`, `Tournament`,
   `TournamentPayout`, and `lib/wager/constants.ts` — `WAGER_RAKE_BPS = 250` (2.5%) and
   `TOURNAMENT_RAKE_BPS = 500` (5%). The house takes a cut of staked funds.
3. **A path from coins back to value.** `RedemptionRequest` (`prisma/schema.prisma`) has
   `kind: RedemptionKind`, `fiatValueCents`, and `externalRef` documented as
   _"Stripe transfer id / shipment tracking"_, with `PAYOUT` and `MERCH` kinds. Coins also enter
   via Stripe memberships and `CoinStake` accrues them at interest.

That combination — buy in, stake on chance, cash out — is the definition most frameworks use.
Whatever the legal conclusion, the **operational** controls are absent:

| Control                                     | Present? | Evidence                                                                          |
| ------------------------------------------- | -------- | --------------------------------------------------------------------------------- |
| Per-bet cap                                 | Partial  | `MAX_WAGER_STAKE = 100_000` (`lib/wager/constants.ts:7`) — per _bet_, not per day |
| Daily/weekly stake limit                    | **No**   | no hits for `dailyLimit\|lossLimit\|spendLimit` anywhere                          |
| Loss limit                                  | **No**   | —                                                                                 |
| Session time limit / reality check          | **No**   | no hits for `realityCheck\|sessionLimit`                                          |
| Cool-off period                             | **No**   | no hits for `cool.?off`                                                           |
| Self-exclusion                              | **No**   | no hits for `selfexclu`                                                           |
| Activity statement (what did I stake/lose?) | **No**   | `CoinTransaction` exists but there is no player-facing summary                    |
| Age assurance                               | **No**   | 07-31 §1, still open                                                              |

`MAX_WAGER_STAKE = 100_000` with no aggregate cap means a player can lose an unbounded amount
per day in 100k increments, and nothing in the system notices or tells them.

### Design

**A single gateway.** Every coin outflow into a chance or stake surface goes through one
function — the same architectural move as `defineHandler` for API routes and
`lib/economy/ledger.server.ts` for coin movement. If limits are checked at each call site, one
call site will miss it.

```ts
// lib/protection/gate.server.ts
export type StakeSurface = 'casino' | 'wager' | 'tournament' | 'wheel' | 'staking';

export async function assertStakeAllowed(opts: {
  userId: string;
  surface: StakeSurface;
  amount: number;
}): Promise<void>; // throws a typed ProtectionError the UI renders as a limit dialog
```

Checks, in order: active self-exclusion → active cool-off → daily/weekly/monthly stake limit →
loss limit → session limit. Rolling windows computed from `CoinTransaction`, cached per user with
a short TTL and invalidated on write.

```prisma
model PlayerProtection {
  userId          String   @id
  dailyStakeCap   Int?
  weeklyStakeCap  Int?
  monthlyStakeCap Int?
  dailyLossCap    Int?
  sessionMinutes  Int?
  realityCheckMins Int?    @default(60)
  /** Set → all stake surfaces are blocked until this time. */
  coolOffUntil    DateTime?
  /** Set → permanent-until-support-reversal exclusion. */
  excludedAt      DateTime?
  excludedUntil   DateTime?
  updatedAt       DateTime @updatedAt
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@map("player_protection")
}

model ProtectionEvent {
  id        String   @id @default(cuid())
  userId    String
  kind      String   @db.VarChar(24)  // limit_set|limit_raised|cooloff|self_exclude|blocked_stake
  detail    Json
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, createdAt(sort: Desc)])
  @@map("protection_event")
}
```

**The asymmetry rule, which is the whole point:** lowering a limit takes effect **immediately**;
raising one takes effect after a **24-hour cooling period**. Self-exclusion cannot be reversed by
the user at all — it goes through support, logged in `AdminAuditLog`. Without that asymmetry the
limits are decorative, because the moment they bind is exactly the moment a player would raise them.

### Server & API

- `app/routes/api/protection/limits.ts` — `GET` / `PUT` (`defineHandler`, `rateLimit: 'write'`).
  The 24h delay on increases is enforced server-side; the client only displays it.
- `app/routes/api/protection/cooloff.ts` — `POST`, durations 24h / 7d / 30d.
- `app/routes/api/protection/exclude.ts` — `POST`, requires typed confirmation, writes
  `ProtectionEvent` and an admin notification.
- `app/routes/api/protection/statement.ts` — `GET`, a 7/30/90-day activity statement aggregated
  from `CoinTransaction`: staked, won, lost, net, time on stake surfaces.
- Wire `assertStakeAllowed` into `lib/wager/escrow.server.ts`, every casino game's bet handler,
  `lib/staking/staking.server.ts`, and the wheel-spin handler. A test asserts every stake surface
  calls the gate — enumerate them from `StakeSurface` and grep, in the style of the existing
  design-consistency test.

### UI surfaces

- **`/settings/play-limits`** — limits, cool-off, self-exclusion, and the activity statement, on
  `.glass-pane`. Plain language. No dark patterns: the confirm button for self-exclusion is not
  styled as a discouraged action.
- **Reality check** — a modal every `realityCheckMins` while on a stake surface: time elapsed,
  net position this session, Continue / Take a break. Default **on** at 60 minutes, because the
  default is the feature.
- **Blocked-stake state** — when the gate throws, show which limit was hit, when it resets, and a
  link to the statement. Never a generic error toast.
- **Net position visible at the table**, not just a balance. "Balance: 4,200" hides "down 8,000
  today".

### Interaction with other work

- Depends on nothing, but **07-31 §1 (age assurance)** is its natural pair — limits for adults,
  gating for minors — and **07-31 §23 (teen accounts)** should hard-disable every stake surface
  rather than rate-limit it.
- The activity statement is a partial answer to the data-portability duty in 07-20 §2.8.
- `capabilities.descriptors` from A1 marks which games are gambling-mechanic games, which is what
  a parental control would filter on.

### Acceptance criteria

- Every stake surface refuses a stake that would exceed a set daily cap, verified per surface.
- A limit increase does not take effect for 24h; a decrease takes effect on the next request.
- Self-exclusion blocks all stake surfaces and cannot be lifted through any user-facing route.
- Reality check fires on schedule and is not dismissible by navigation alone within a session.
- Activity statement figures reconcile exactly against `CoinTransaction` (property test).

---

## D2 — Playtime and wellbeing for the arcade generally — **S**

### Competitor anchor

Nintendo Switch Parental Controls, Xbox screen time, TikTok's daily limit and the "you've been
scrolling a while" nudge. Distinct from D1: this is about **time**, applies to all 20 games and
the feed, and carries no money risk — so it is a small, friendly feature rather than a compliance one.

### Design

- Extend `HistoryEntry` (`prisma/schema.prisma:5854`) usage — it already has `duration` and an
  `entityType` of `'game'` — with session accumulation, or add a light `PlaySession` row per
  (user, game, day). Prefer the latter: `HistoryEntry` is a resume pointer, not a time ledger, and
  overloading it makes both jobs worse.
- Settings: an optional daily arcade time budget and a break reminder interval.
- A gentle in-game toast at the interval (sonner, respects reduce-motion), and a soft warning at
  budget — **soft**, never a lockout, for a self-set limit with no money attached.
- A weekly "your week in the arcade" panel on `/progress` or `/recap`, feeding
  `lib/recap.server.ts` and `/wrapped`, which turns the wellbeing feature into a retention
  feature — the same trick Spotify Wrapped plays.
- Parental variant is deferred to 07-31 §23 (teen accounts); this is the self-directed half.

---

# Pillar E — Discovery

## E1 — Personalized recommendations: "because you played…" — **M**

### Competitor anchor

Steam's Discovery Queue and "More like this", Netflix's row structure, Spotify's Discover Weekly.
For a catalogue of 20 games and 12 apps, the job is not a deep-learning recommender — it is
"surface the four things this specific person hasn't tried yet", which is a SQL problem.

### What exists / the gap

- `listExplore` (`lib/explore.server.ts:122-180`) is **globally popular content with per-viewer
  filters applied**: cached trending tags, cached hot-post candidates re-sorted by `likeCount`,
  and a suggested-user pool filtered to exclude self/followed/hidden. There is nothing about what
  _this_ viewer has done — no affinity, no similarity, no history read.
- The feed has `FeedSignal`, so ranking machinery exists for posts.
- **Games have no recommendation surface at all.** `/arcade` is a static grid in catalogue order;
  a player who has put 40 hours into Void Breaker is shown Void Breaker in the same position as
  someone who has never opened it.
- The raw material is all there and unused: `HistoryEntry` (`:5854`), `GameSave`, `UserAchievement`,
  `EloRating`, `ArcadeStreak`, `SavedItem`, `WishlistEntry`, `GameReview`.

### Design — item-item collaborative filtering, computed offline

Do not build a real-time recommender. Compute a similarity matrix on a schedule; serve lookups.

1. **Interaction extraction** — a nightly job (`lib/jobs/`, pg-boss, or a Go `supervisor` worker
   alongside `recap`) builds a sparse user×item matrix from `HistoryEntry` (games, videos, songs,
   docs), `GameSave` presence, `UserAchievement` unlocks and `GameReview` ratings, with weights
   per signal type. Items are `game:*`, `app:*`, `tube:*`, `song:*`, `doc:*` — one namespace, so
   cross-media recommendations ("you liked this game, try this album") fall out for free.
2. **Similarity** — cosine similarity over co-occurrence with a popularity penalty
   (`|A∩B| / sqrt(|A|·|B|)`), top-K neighbours per item stored in:

```prisma
model ItemSimilarity {
  itemKey    String   @db.VarChar(48)
  neighborKey String  @db.VarChar(48)
  score      Float
  computedAt DateTime @default(now())
  @@id([itemKey, neighborKey])
  @@index([itemKey, score(sort: Desc)])
  @@map("item_similarity")
}
```

With ~40 items the whole matrix is trivial; it is designed to survive the catalogue growing and
to extend to per-creation recommendations once A5 lands. 3. **Serving** — `lib/recommend/recommend.server.ts`: take the viewer's recent items, union their
neighbours, subtract what they already play, rank, diversify (at most 2 per genre using A1's
`genre`), and cache per user for an hour. Signed-out and cold-start users fall back to
tag-similarity and global popularity — which is exactly what `listExplore` does today, so the
fallback is already written.

### UI surfaces

- **`/arcade` rows instead of one grid:** "Continue playing" (from `HistoryEntry`), "Because you
  played Void Breaker", "Popular with players like you", "New to you", "Quick — under 5 minutes"
  (from A1's `sessionMinutes`), "Playable on your phone" (from A1's `input`). Every row title is
  a `t()` key with an interpolated item name.
- **"More like this" on every game root, app root and video** — three cards, `.glass-fill`.
- `/explore` gains a personalized section above the global one, clearly labelled, with a "why am I
  seeing this?" affordance naming the source item. The 07-20 doc's Feature 15 (feed algorithm
  transparency) sets the precedent — match its posture.
- A **Discovery Queue**: five things you have not tried, one at a time, skip or try. Steam's
  version drives a startling share of its catalogue discovery, and it is a day of work on top of
  the endpoint.

### Acceptance criteria

- Recommendations never include an item the user has played in the last 30 days (except in
  "Continue playing").
- No recommendation row renders with fewer than 3 items — it falls back rather than showing a
  ragged row.
- Cold start (0 history) returns a sensible tag-based list, not an empty state.
- Serving is a single indexed query plus a cache hit; assert no N+1 in the guardrail suite.
- Recommendations respect blocks, mutes and `authGate`/`unlisted` flags — a hidden game never
  surfaces.

### Risks

- **Filter bubbles / staleness.** The diversity constraint and a small random exploration slot
  (~10%) are cheap insurance.
- **Privacy.** This reads behaviour to shape UI. Add an opt-out in `/settings/privacy` and honour
  it by falling back to global popularity; mention it in the privacy policy. The existing privacy
  settings page is the right home.

---

# Pillar F — Platform quality

## F1 — An i18n coverage gate in CI — **S**

Generalises §0(a) so it cannot happen a nineteenth time. Three assertions, one test file, wired
into `web-ci.yml`:

1. **Registration parity** — `locales/en/*.json` ↔ `NAMESPACES` set equality (the test in §0(a)).
2. **Locale parity** — every directory in `locales/` is either in `LOCALES` or on an explicit
   `PENDING_LOCALES` allowlist with a comment. Kills the §0(b) drift.
3. **Key coverage** — for each shipped locale, report the percentage of `en` keys present; fail
   below a floor (start at the current minimum minus 2% so it ratchets, never blocks day one).
   `pnpm i18n:coverage` already exists per the improvement plan — this makes it a gate.

A fourth, higher-value check if it is cheap: scan `.tsx` for the `{/* … */}`-before-`t()` pattern
that CLAUDE.md §5(b) documents as silently skipping extraction. That failure mode is invisible
today and the regex for it is short.

## F2 — Per-game crash and performance telemetry — **S**

`lib/client-errors.ts:1-20` captures uncaught errors and rejections site-wide with per-session
caps and dedupe — good, and it catches game crashes. What it does not do is **attribute** them: a
throw inside a rAF loop arrives with no game id, no `formatVersion`, no perf tier, no device
class, so "is Neon Driftway broken on mid-tier Android?" is unanswerable.

- Add an optional context to `reportClientError` — `{ game, renderer, perfTier, deviceMemory,
gamepadConnected }` — populated by a `<GameErrorBoundary>` that every game root already could wrap.
- Sample FPS at a low rate (p50/p05 over a session, one beacon at unload) into the existing
  `/api/rum` path, tagged by game. This is what makes A1's `minPerfTier` an evidence-based field
  instead of a guess, and it is the cheapest way to find out which of 20 games is quietly
  unplayable on the median phone.

---

# §3 — Sequencing

**Week 1 — the free wins.** §0(a) (18 namespaces) and §0(b) (orphan locales), then F1 so neither
recurs. Half a day, and it switches on translations for thirteen shipped features.

**Weeks 1–3 — D1, in parallel and ahead of everything else.** It is the only item with a risk
tail rather than a growth curve, and every week the stake surfaces run without it is a week of
exposure. Its dependency (07-31 §1, age assurance) can land alongside; the gateway does not
need it.

**Weeks 2–6 — Pillar A, in dependency order.** A1 first: it is the metadata layer three other
features read. Then A2 (input) and A4 (previews) in parallel — A4 is S and mostly asset work, A2
is the bigger engineering lift. Then A3, which consumes A1's `capabilities.accessibility` and
A2's remapping. **A3's photosensitivity work should be pulled forward out of that order if the
neon renderers are not going to be touched otherwise** — it is a WCAG Level A gap, which is a
different category from the rest of the pillar.

**Weeks 4–7 — E1.** It wants A1's genre/session metadata for its row structure and diversity
constraint, so it follows A1, but the extraction job and similarity matrix can be built in
parallel with the arcade work.

**Then pick a lane:**

- **Study** — C1 (S) then C3 (import, the adoption lever) then C2 (card types). C1 and C2 share a
  `FlashcardReview` migration; do them close together or do C1's migration with C2's key change
  included.
- **Watch** — B1 (clips) first; it is the only feature here that produces shareable objects that
  bring in new users, and the deterministic-replay trick makes it far cheaper than it looks.
  Then B2, then B3.
- **Arcade depth** — A5, the L. It is the highest ceiling in the document and it should not start
  until A1 exists and the media-classification work (08-03 §D4) is at least designed, because the
  Slice It! audio-upload path is a publish surface.

**The one thing to do out of order:** F2, the telemetry. It is S, and every performance claim in
A1, A3 and A4 is currently a guess. A week of real FPS data changes which games get converted first.

---

# §4 — Checked and found present

Listed so the next reader does not re-derive them.

- **Colour-vision modes** — deuteranopia / protanopia / tritanopia, with semantic colour
  remapping and a documented rationale (`lib/appearance/prefs.ts:35-67`), applied pre-hydration
  by the boot script (`app/routes/__root.tsx:157`). 07-31 §13 **shipped**.
- **Friends leaderboards** — `LeaderboardScope = 'global' | 'friends'` with a viewer-scoped cache
  and a signed-out fallback (`lib/leaderboard.server.ts:18-99`).
- **Deck sharing** — `FlashcardDeck.isPublic` + `clonedFromId` with provenance and a
  double-add guard. A public deck library already exists; C1–C3 make it worth browsing.
- **Vote-to-skip in RMHTube** — `QUEUE_VOTE_SKIP` + `skipVotes` state
  (`lib/rmhtube/events.ts:36`, `lib/rmhtube/store.ts:388-455`). B3 ports this to RMHMusic.
- **Deterministic replays with a compat version** — `GameReplay` (`prisma/schema.prisma:5749`),
  `/replays/$id`, `embed.replay.$id`. B1 is built on top of this and is cheap because of it.
- **Games are internationalised** — every sampled game directory (Void Breaker, Temple of Joy,
  Neon Driftway, Altair, Isleworks) uses `t()` throughout, with per-game `c-*` namespaces. The
  i18n problem in §0 is registration, not adoption.
- **Client error capture** — `lib/client-errors.ts` with session caps, dedupe and a
  never-throws guarantee. F2 adds attribution, not the pipeline.
- **Postgres full-text search** with `websearch_to_tsquery` + `ts_rank` and trigram fallback
  (`lib/search/posts.server.ts:66-83`). The gap is semantic, and that is 07-31 §12.
- **Per-bet wager caps and rake** — `lib/wager/constants.ts`. The gap is aggregate limits (D1).
- **A save-conflict contract for anonymous→account** — `lib/game-saves/__tests__/conflict.test.ts`,
  which A2's input maps should follow rather than reinvent.

---

# §5 — Explicitly not proposed

- **Hosting our own video (a real YouTube competitor).** RMHTube's model is synced playback of
  third-party media; that is a design choice with a favourable copyright and cost posture. B1 and
  B2 both preserve it — clips are time windows, transcripts are metadata. Uploading and
  transcoding user video would add a storage bill, a DMCA process and a classification duty for a
  product that is not asking for it.
- **A native mobile app.** `apple-app-site-association`, `assetlinks.json` and the deeplink routes
  suggest one has been considered. The PWA path (07-31 §24) gets most of the value; a native app
  is a second release train, a review process and a platform-fee negotiation, and nothing in this
  document requires it.
- **Real-money-in for wagers.** D1 argues for controls on the _existing_ system. Adding fiat
  buy-in to stake surfaces converts a compliance-shaped question into a licensing-shaped one.
- **A per-game achievement designer / user-authored achievements.** The catalogue-in-code model
  (`lib/achievements/catalog.ts:1-10`) is deliberate and its reasoning holds; user-authored
  achievements would need moderation and an anti-farming model for coin rewards.
- **ASR / generated transcripts in B2 phase 1.** Provider captions first. Generated transcripts
  are a per-minute cost on an unbounded queue and need their own budget decision.
- **A machine-learning recommender for E1.** With ~40 catalogue items, item-item collaborative
  filtering beats anything learned, is explainable ("because you played X"), and its cost does not
  scale with traffic.
- **Paid player-made content in A5.** A creation marketplace adds payouts, refunds, chargebacks
  and a fraud surface to a feature that is already L. Milestone coin rewards capture the
  motivation at a fraction of the risk.

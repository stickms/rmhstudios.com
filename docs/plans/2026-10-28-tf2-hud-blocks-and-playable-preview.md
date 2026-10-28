# TF2 HUD editor — blocks, and a preview you can play

Status: proposal. Nothing here is built. Supersedes nothing; extends
[`docs/tf2-hud-editor.md`](../tf2-hud-editor.md).

## Why

Making a HUD is slow because the editor treats every panel as an island. The
inspector, drag handles and scheme panel all edit one `.res` entry at a time,
so restyling "all the charge bars" (`hudmediccharge`, `huddemomancharge`,
`hudbowcharge`, every `huditemeffectmeter_*`) means touching a dozen files and
retyping the same colour, border, font, size and position in each. Those bars
sit together on screen, so their positions are related too, and nothing
captures that.

The second gap is feel. The preview is a still picture. Authors can't click a
button, hold a weapon, take damage or open the backpack to see whether the HUD
works as a HUD. The 3D parts of the game (model panels, the player) render as
labelled boxes.

## Goals

1. **Group related panels into blocks** that are edited once (look and layout),
   with per-panel exceptions that are visible, reversible and never silent.
2. **Make blocks nearly free to create.** Starter blocks and suggestions for the
   base HUD, "make block" from a multi-selection, no setup step.
3. **Play mode**: click buttons and tabs, drive a simulated match, see the HUD
   react, with real 3D players and items where the game draws them.
4. **Reuse the loadout builder's 3D and catalog code** instead of building a
   second viewer.

## Non-goals and anti-goals

- **The `.res` files stay the source of truth.** Export is plain, valid
  VDF that a HUD author could hand-edit. Blocks are an editing aid. A HUD that
  only works inside this editor is a failure even if it looks great.
- No new render path. Play mode drives the existing `TestState` → `Scene` →
  canvas pipeline.
- No hidden magic: a value written by a block is always visible in the file and
  the Changes view.
- Not a full Source engine: no network, physics or real game logic. The match
  simulator only produces plausible HUD state.

## What exists that we build on

- `kv/edit.ts` (`kvSet`, `kvRemove`, `kvAddBlock`): lossless text-to-text edits
  that keep comments, quoting and platform conditionals. Block application is a
  composition of these. No new writer.
- `layout/inverse.ts` (`shiftPosition`, `growSize`): turns a pixel move into a
  `.res` delta while keeping `r`/`c`/`f` anchoring prefixes. Moving a block uses
  this per member.
- `scene/build.ts`: `PanelNode` already carries `file`, `keyPath`, `control`,
  `name`, `rect` and `parentId`, enough to define selectors and measure
  proximity. `hitTest` and drag in `Preview.tsx` already do canvas picking.
- `fixtures.ts` / `game-state.ts` / `TestPanel`: class, weapon, health, uber,
  events and so on already gate which panels show.
- `pages.ts`: ~60 named HUD pages, the natural targets for button navigation.
- `project/model.ts`: the overlay stores arbitrary files, so a block sidecar
  file needs no schema change.
- Loadout viewer: `PlayerScene.tsx` (R3F canvas, already `alpha: true`),
  `Viewer3D.tsx` (single item), `ItemTile.tsx` (`ItemIcon`, quality/rarity
  colours), `worn.ts`, `lib/tf2-loadout/{use-catalog,use-models,use-anims,rarity}.ts`.
  The base already ships `econ/backpackpanel.res`, `itemmodelpanel.res`,
  `inspectionpanel*.res` and the loadout panels.

## Design

### 1. Blocks

A block is a named set of panels plus the properties they share.

```ts
interface Block {
  id: string;
  name: string; // "Charge meters"
  members: Member[]; // explicit refs: { file, name } (stable across edits)
  rule?: Selector; // optional: re-resolve members (e.g. name matches *charge*)
  shared: Record<string, string>; // wide, tall, fgcolor, font, border, ...
  layout?: BlockLayout; // see below
}
interface Member {
  file: string;
  name: string;
  pinned: string[]; // property keys this panel overrides
}
```

Stored in the overlay as `_rmh/blocks.json`: not a game file, so the engine
ignores it if it leaks into a zip. Export strips it by default. A "include
editor data" toggle keeps it so a HUD re-imports with blocks intact. Without
the sidecar, blocks can be re-suggested from the files (see Suggestions).

**Applying a block** is a pure function `applyBlock(files, block) → files`: for
each member, for each key in `shared` not in `member.pinned`, `kvSet` into the
member's entry (using the `_minmode` variant when the previewed mode needs it,
as the inspector already does). Unchanged values produce no diff, so applying
is idempotent and cheap.

**Exceptions are first-class.** In the inspector, a panel in a block shows each
shared property with a state chip: _inherited_ (follows the block) or
_override_ (pinned, with a reset button). Editing an inherited property asks
once, inline, not in a modal:

> Apply to **Charge meters** (6 panels) · Only this panel

The choice is remembered per session and changeable. "Only this panel" pins the
key. An override whose value later equals the block's is offered for un-pinning.

**Drift.** If someone edits a member's `.res` by hand (code view), the block
notices that its value differs from `shared` and shows "differs from block:
update block / pin as override / revert". This keeps the text editor a
legitimate way to work and avoids silent overwrite.

**Layout is a block property too**, because position is the tedious part:

- _Move_: dragging a block (its bounding box handle, or any member with
  Alt held) shifts every member by the same virtual delta via `shiftPosition`.
- _Arrange_: align left/top/centre, distribute evenly, "stack with gap N" along
  an axis, each computed from member rects and written back as xpos/ypos deltas
  that keep each member's own anchoring.
- _Anchor_: optional "pin all to the first member" using the existing
  `pin_to_sibling` keys, for blocks that must stay together across resolutions.
  Off by default because it changes how the HUD behaves in game.
- Members keep their own zpos and parent frames. Position in `hudlayout.res`
  versus the element file is resolved the same way the drag handler already
  resolves it.

**Scheme tokens.** Shared values can be scheme names (`TanLight`), so a block
recolour is just a name, and a whole-HUD recolour is a `clientscheme.res`
edit that the scheme panel already supports. A small "Theme" strip (accent,
text, background, font family, border style) writes these scheme entries and is
the HUD-wide counterpart to blocks. It is not a new storage format.

### 2. Making blocks cheap

1. **Built-in presets** (`lib/tf2-hud/blocks/presets.ts`): data, not UI. Glob
   rules over base file names, e.g. _Charge & effect meters_
   (`hud*charge`, `huditemeffectmeter*`, `hudrocketpack`, `huddemomanpipes`),
   _Health & ammo_, _Class/Engineer building panels_, _Scoreboard rows_, _Dialog
   buttons_. Shown as one-click suggestions the first time a file in the group
   is selected.
2. **Detected suggestions**: cluster the current page's nodes by control type,
   similar size, shared look (fgcolor/border/font) and proximity (rect gap), and
   offer "These 5 look alike: make a block". Pure function over `Scene`.
3. **Make block from selection**: shift-click and marquee select on the canvas
   (today: single select). Selection set lives in the store next to
   `selectedId`. The first member seeds `shared` from its current values; any
   key on which members disagree is marked _mixed_ and left alone until the user
   sets it.
4. **Copy to similar** (the cheap first step, ships before blocks): in the
   inspector, any property gets "Apply to all matching" using the same
   suggestion engine, without creating a persistent block.

### 3. Play mode

A toggle in `PreviewToolbar`. When on, the canvas stops being an editor
surface (no handles or drags) and becomes the HUD.

- **Buttons and navigation.** `Button`/`Label` panels with a `command` key map
  through `lib/tf2-hud/play/commands.ts` (a table from known TF2 commands such
  as `open_charinfo_loadout` or `showteammenu` to a `pages.ts` page id). Click
  navigates; unknown commands show a toast with the raw command so authors see
  what the game would run. Hover and armed colours (`armedFgColor`, the scheme's
  button states) are applied from hit-testing, which reuses `hitTest`.
- **Match simulator** (`lib/tf2-hud/play/sim.ts`): a small pure reducer over
  `TestState` driven by keys. Number keys switch weapon, mouse fires and
  decrements ammo, a key takes damage, one heals, uber and charge meters fill
  over time, the round timer counts down. It calls the same `setTest` the Test
  panel uses. The Test panel remains the manual override and shows the live
  values.
- **Animations** (phase 3b, biggest single item): the editor already lets
  authors edit `hudanimations_tf.txt` but never runs it, which is why
  low-health pulses and meter flashes can't be previewed. Parse the events and
  play `Animate` lines (position, size, colour, alpha with Linear/Accel/Deaccel/
  Bias interpolation) as per-node overrides applied during scene paint. Without
  this, Play mode shows the right state but not the motion.
- **Keyboard/accessibility**: Play mode is fully keyboard driven; the outline
  still lists every panel; a visible "Esc to exit Play" hint.

### 4. 3D and items, shared with the loadout viewer

The loadout code is close to reusable but not quite:

- `PlayerViewer.tsx` mixes data resolution (class body model, cosmetics →
  model URLs via `pickModel`, stance and animation clip selection) with a
  boxed UI styled with `--app-*` tokens and its own animation picker.
- `PlayerScene.tsx` is the pure renderer and already draws on a transparent
  canvas.
- `Viewer3D.tsx` renders one item, orbit controls included.

**Refactor, not copy.** Split without moving files:

1. Extract `usePlayerParts({ cls, worn, taunt, animation })` from
   `PlayerViewer` returning `{ body, parts, clip, status }`. `PlayerViewer`
   becomes a thin consumer. This is a behaviour-preserving refactor with the
   loadout builder as the regression check.
2. Add `loadout/embed.tsx` as the one public surface for other apps:
   `<PlayerStage>` (transparent, no chrome, optional camera preset, pointer
   passthrough), `<ItemStage>` (wraps `Viewer3D`), and re-exports of
   `ItemIcon`, `rarityBackground`, `useCatalog`. The HUD editor imports only
   from here, so the loadout internals can change without breaking it.
3. `useSampleLoadout(cls)` builds a plausible worn set from the catalog using
   `worn.ts`, so the HUD preview has a player without the user building one.
   Optionally "use my saved loadout" from the existing loadout API.

Where it shows up:

- **World backdrop.** A `WorldBackdrop` layer behind the HUD canvas shows the
  previewed class (`TestState.playerClass`, team tint) with its held weapon and
  idle or stance animation, replacing the flat arena gradient when WebGL and the
  model sync are available, falling back to today's backdrop otherwise (the
  loadout viewer's fallbacks already handle no-WebGL and missing models).
- **Model panels.** `scene/build.ts` already emits `DynamicOp` for model
  controls. Rather than draw labelled boxes, `Preview` mounts an HTML overlay
  positioned over each dynamic node's rect: `ItemStage` for item model panels
  (`econ/itemmodelpanel`, inspection), `PlayerStage` for class/loadout model
  panels. Capped at a few live WebGL canvases at once (the rest show the item
  icon), because each R3F canvas is a context.
- **Backpack, loadout, shop-like pages.** A fixture inventory from the catalog
  populates the slots of `backpackpanel`, the loadout panels and item
  inspection: `ItemIcon` in each cell, tier colours from `rarityBackground`,
  names and descriptions into the `%itemname%`-style variables the placeholder
  layer already substitutes. Clicking an item in Play mode opens the inspection
  page with that item's 3D model. There is no real shop in the game files we
  ship, so "shop" is the Mann Co. store-style item grid and item inspection, to
  be confirmed against which `.res` files the base actually contains.

## Approaches considered

1. **Blocks as live-linked overlay (recommended).** Persistent sidecar
   definition; edits fan out to `.res`; exceptions are pins. Matches how authors
   think ("all of these, except that one") and keeps the files normal. Cost: a
   second thing to keep consistent with the text (mitigated by drift detection).
2. **One-shot bulk edit ("copy to similar" only).** Much simpler, no persistent
   state, but you re-select the group every time and exceptions are not
   remembered. Kept as the first, shippable step because it is a subset of 1.
3. **A new HUD document model that compiles to `.res`.** The cleanest for
   blocks, but it makes the code view and imports lossy, breaks the
   preview-equals-file guarantee and strands existing HUDs. Rejected.

## Phases

Each phase ships on its own and is useful without the next.

- **P0, engine** (no UI): `lib/tf2-hud/blocks/{types,resolve,apply,suggest,
  arrange}.ts` and tests in `lib/tf2-hud/__tests__/blocks*.test.ts` covering
  idempotent apply, pinned keys, `_minmode` and platform conditionals,
  anchoring-prefix preservation on move, and round-trips through the existing
  zip import/export. Pure, fast to test.
- **P1, grouping UI:** multi-select on the canvas and outline; "copy to
  similar"; Blocks panel; inspector inherited/override chips with the inline
  apply-to choice; block move and arrange tools; presets and detected
  suggestions; drift prompts; sidecar save/strip on export.
- **P2, Play mode, 2D:** toggle, command table, hover/armed states, match
  simulator, outline/keyboard support.
- **P3a, shared 3D:** the `usePlayerParts` extraction and `embed.tsx`
  (loadout builder unchanged in behaviour), world backdrop, model-panel
  overlays, fixture inventory on backpack, loadout and inspection pages.
- **P3b, animations:** `hudanimations` parsing and playback.

Order rationale: P0 and P1 remove the stated pain (editing many values) and
don't depend on 3D or play. P3a can run in parallel with P2.

## Risks and open questions

- **Which properties are safe to share.** Position/size are relative to
  different parents and frames, so shared layout is expressed as deltas and
  alignments, never absolute values copied between panels. `shared` is limited
  to look-and-size properties by default; the UI says so.
- **Identity.** Panels are `file#name`, and renaming a panel in code orphans a
  member. Orphans are shown and one-click relinked; they are never deleted.
- **Cost of live canvases.** Many model panels means many WebGL contexts;
  hence the cap and icon fallback. If it still hurts, render all model panels
  into one offscreen R3F canvas and blit.
- **Model and catalog availability.** The 3D viewer depends on the model sync
  having run (`useModelIds` can be empty). Every 3D feature must degrade to
  today's rendering rather than block the editor.
- **Unverified here:** how many of the base's dynamic controls
  (`itemmodelpanel`, class model panels) the current `DYNAMIC` matcher in
  `scene/build.ts` catches, and which command strings the base buttons use.
  P2/P3a start with an inventory of both.
- **i18n and design gates.** New UI strings go through `c-tf2-hud`; new
  panels follow the editor's existing `ui.tsx` primitives (it has its own
  `--app-*`-style tier), and `pnpm check:consistency` runs per commit.
- **Docs.** `docs/tf2-hud-editor.md` gains Blocks and Play mode sections as
  each phase lands, replacing its "Not yet: animation playback, 3D model
  panels" note.

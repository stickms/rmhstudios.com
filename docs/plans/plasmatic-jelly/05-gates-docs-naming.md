# Plasmatic Jelly 05: gates, tests, docs and naming migration

Status: plan, 2026-10-23. Scope: the **rules** side of the Liquid Glass → Plasmatic
Jelly shift. Sibling plans cover the material, the soft-body physics, the arcs, and
coverage/a11y/perf. This plan covers what the repo **enforces**: the executable gates
in `lib/__tests__/`, the e2e scripts in `testing/e2e/`, the commit gate
(`scripts/check-consistency.sh`), the reference docs, the CLAUDE files, the
user-facing strings, and module/class naming.

Governing rule (root `CLAUDE.md`, "The commit gate"): _if a rule is genuinely wrong
for your change, change the rule in the same commit and say so._ Every gate edit
below therefore ships **in the same commit as the behaviour it admits**, never ahead
of it. A relaxed gate with no jelly code behind it is a hole, and it makes a later
regression look intended.

---

## 0. Decisions at a glance

| #   | Decision                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Keep `glass-*` as the role API.** `.glass-fill/pane/chrome/overlay/inset/scrim` name an elevation role, not an optic. 1,152 uses in 484 files. Five gates parse these names. No `jelly-*` alias classes.                                                                                             |
| D2  | **Nothing moves for the sake of a name, and nothing is shimmed.** The rim and haze engine evolves in place in `lib/liquid/glass/` (01-material). New services go in `lib/jelly/`: physics (02), arcs (03) and shared policy. 01's proposed `lib/liquid/jelly/flow-carriers.ts` should be `lib/jelly/flow-carriers.ts`, so there is one jelly directory. A module that jelly subsumes (for example `lib/liquid/runtime.ts`) is deleted, not re-exported. |
| D3  | **"Idle at rest" becomes "idle when nobody can see it", but only for named owners.** Exactly three jelly frame owners are sanctioned: the engine's ambient haze clock (`lib/liquid/glass/engine.ts`, 01 D4), `lib/jelly/physics.ts` (02, idle-at-rest), and `lib/jelly/arcs/renderer.ts` (03, live-arc-only). The ambient clock must stop for: hidden tab, no visible haze surface, degraded tier, user setting, and (see Q1) doze. CSS `infinite` animation is banned on the site tier except 01's sanctioned `.jelly-flow` carriers, which are attached only while visible. |
| D4  | **Content stays still. The host under the finger and skins may move.** The DOM transform on a host is allowed only on the host being pressed or dragged, is bounded, and settles to identity. Neighbour "nudges" are drawn on the engine canvas (the skin) and never move neighbour DOM. This keeps every existing "neighbours never move" e2e check with a narrower subject. |
| D5  | **No `backdrop-filter`, still.** The haze is drawn by the shader, with static CSS noise and tint as the fallback. R3 in `stacking-consistency` widens, because a host that can carry a transform is a containing block for `fixed` descendants, the same as a blurred one. |
| D6  | **A new contract doc, `docs/plasmatic-jelly-system.md`.** `liquid-glass-system.md` keeps its URL behind a "superseded" banner. `design.md`, `design-language.md`, `page-consistency.md`, root `CLAUDE.md`, `AGENTS.md`, `components/CLAUDE.md`, `lib/CLAUDE.md` and `components/radial/README.md` are rewritten in the cutover commit. |
| D7  | **Arcs and ambient motion get user switches.** The retired reduced-motion policy stays retired for the shared motion scheme. Perpetual ambient motion is different: under WCAG 2.2.2, auto-moving content that runs longer than 5s needs a pause. Arcs carry flash risk under WCAG 2.3.1. All new wording uses new i18n keys. |
| D8  | **`data-liquid-*` attributes migrate in phase 3.** That is 64 occurrences in 15 files. The jelly engine reads both spellings until a codemod lands, and after that a gate blocks the old spelling. The same phase removes 01's `html[data-material="jelly"]` flag and retires the dead blur tokens (`--site-glass-blur-*`, `--site-glass-saturate`). |

> **Sibling plans this reconciles:** 01-material (ambient clock in `engine.ts`, CSS
> `.jelly-flow` carriers, the `data-material` flag), 02-soft-body (`lib/jelly/physics.ts`
> plus its own rAF; it asks the gates owner to remove 41 framer `whileHover`/`whileTap`
> scale sites; it refers to this plan as "04"), and 03-arcs (`lib/jelly/arcs/renderer.ts`
> plus its own rAF, a flash ledger, and an `electricArcs` preference). Where they
> disagree with each other on a rule, §7 Q1 records the open question.

---

## 1. Inventory: gates, tests and doc rules that conflict with jelly

"Keep" means the rule still holds under jelly and only its wording or rationale changes.
"Change" means the assertion itself changes. Line numbers are as of `4893ea5e`.

### 1.1 Executable gates (`lib/__tests__/`, run by `check-consistency.sh` step 4)

| Where | Asserts today | Conflict | Proposed assertion |
| --- | --- | --- | --- |
| `raf-loop-allowlist.test.ts:5-17`, docblock `:56-65`, `ALLOW` `:165-170`, failure text `:398-404` | Every rAF file has a settle condition. The design tier is held to "idle-at-rest". `lib/liquid/glass/engine.ts` is described as "never a standing loop… a page at rest has no loop". | Jelly needs a standing ambient loop. | **Change.** (a) Rewrite the `engine.ts` entry's justification to 01 D4's stop conditions (30 Hz engaged, then the doze floor, then 0 Hz when hidden, when no haze surface is visible, or when degraded). Add `lib/jelly/physics.ts` (02, idle-at-rest) and `lib/jelly/arcs/renderer.ts` (03, live-arc-only), each in the commit that introduces it. Remove `lib/liquid/runtime.ts` if it is subsumed. (b) Rewrite the docblock standard into two tiers: "idle-at-rest" for everything, with a single "idle-when-unseen" exception for the engine's ambient clock. (c) Add a test that no other file under `lib/jelly/` or `lib/liquid/` calls rAF. (d) The failure message names both standards. Precedent for the wording: the `GlobeCursor.tsx` entry at `:172-180` ("the one standing loop on a site page, and it is standing only while…"). |
| `static-backdrop.test.ts:64-99` | No backdrop layer (`.site-aurora`, `.radial-backdrop`) animates. `.glass-liquid::after` never loops. | Not a direct conflict, because jelly motion lives inside surfaces. It is tempting to "just add an infinite keyframe for the haze". | **Keep, and widen** (see N3). The backdrop stays still: jelly moves, the room does not. Rename the describe block from "the liquid sheen" to "the material sheen". |
| `stacking-consistency.test.ts:268-307` (R3) | A component whose root is `glass-pane/chrome/overlay/scrim` portals its `fixed inset-0` descendants. `glass-fill` is exempt because "L1 has no blur". | Under D4 any role can carry a transform while pressed or dragged, and a transform is a containing block, so `.glass-fill` loses its exemption. | **Change.** `BLURRED_ROOTS` becomes `JELLY_HOSTS`, matching every `glass-*` role and `[data-jelly]`. Rename R3 to "nothing `fixed` inside a deformable host". Start the new offenders as a frozen, one-directional baseline, then drain it. The second test ("L1 still has no blur", `:297-307`) is kept and moved to read `app/jelly.css` as well as `app/liquid-glass.css`. |
| `design-consistency.test.ts:383-384, 635-645` (rule 7, floating UI ≥ L4) | A positioned, stacked, edge-anchored element on `glass-fill/pane` is a dropdown "with no backdrop blur". | The rule holds, but its rationale cites blur. | **Keep.** Change the message: L4 carries the opaque legibility floor **and** is excluded from neighbour nudges and arcs-under-text. |
| `design-consistency.test.ts:43-77, 492-530` (tab grammar) | Tab strips are `<LiquidTabs>`. | Naming only. | **Keep** (D1: `LiquidTabs` keeps its name, 84 importers). |
| `design-consistency.test.ts:905-912` `SECTION_LABEL_ALLOW` | Contains `app/routes/liquid-glass.tsx`. | The demo route moves to `/jelly` (§3.4). | **Change**: move the entry to the new file. This is a rename, not an addition, so say so in the commit, because the allowlist is one-directional. |
| `design-consistency.test.ts:952-988` (no debossed surfaces) | No `shadow-inner` or dark inset shadow. | None. Jelly depth is drawn by the shader, not by CSS shadows. | **Keep.** |
| `filter-cost-budget.test.ts:102-188` | No `filter:url()` on viewport layers, no filter chain after `url()`, no document-wide `cursor:none`. | Arcs or haze via an SVG `feTurbulence` filter would hit this. | **Keep.** The haze is shader-drawn (D5). Add `app/jelly.css` to `SHEETS`. |
| `handheld-tier.test.ts:56-180` | One handheld query, used by `globals.css` and `useLiquidBackground.ts`. | Jelly needs a handheld budget for ambient fps, arc count and the deform amplitude. | **Change**: add `lib/jelly/policy.ts` to the files that must carry the exact `HANDHELD_QUERY`. Do not invent a near-miss variant. |
| `fouc-contract.test.ts:164-186` | Every root visual token written after hydration is also written pre-paint. | A root class for the ambient/arcs settings (e.g. `html.jelly-still`) would flash. | **Change** (data, not logic): the pre-paint script in `__root.tsx` reads the new settings, so the existing assertion covers them automatically. Add a `retired…` style case only if a setting is later removed. |
| `fluid.test.ts:366-428` (`rippleWave`) | The ripple shape for the globe. | None. Jelly click pulses may **reuse** `rippleWave` rather than define a second wave. | **Keep.** Physics should import it. A second wave formula is drift (`design.md` §4). |
| `dough.test.ts:14` "exactly at rest until touched" | The globe's dough field. | Only if physics reuses `DoughBody` for ambient eddies. | **Keep** for the globe. Ambient eddies must be a separate, time-driven field, not an always-touched dough. |
| `lib/liquid/__tests__/hover-css.test.ts:14-30` and `lib/liquid/hover-css.ts:82-84` | The PostCSS plugin strips `transform/translate/rotate/scale` from a host's own `:hover` rules. | Jelly hosts **do** move on hover. | **Keep, and change the rationale.** Hover deformation is written by `lib/jelly/physics` as inline style on the host, which the plugin never sees. What the plugin forbids is a **hand-written CSS hover lift**, i.e. a per-component deformation outside the service. That is exactly N2. Update the docblock at `hover-css.ts:1-4`. |
| `lib/liquid/glass/__tests__/policy.test.ts:31-79` (as of `4893ea5e`: 24-slab admission; overlay → chrome → pane → cards → controls) | Admission order and the rim budget. | None for the rim; 01 keeps the cap of 24. | **Keep in place.** 01 adds the haze tiers (6 A + 10 B) and the clock tests to this file. |
| `lib/liquid/glass/__tests__/scene.test.ts` | Snapshot capture lifecycle. | Refraction is retained. | **Keep** if `scene.ts` is retained (likely). Moving it is optional, and D2 says don't. |

### 1.2 End-to-end scripts (`testing/e2e/`, run by hand and in review, not in CI)

| Where | Asserts today | Proposed |
| --- | --- | --- |
| `liquid-glass.mjs:120,123,188,216,269` `stationary(...)` | Off-target clicks, rapid clicks, drags and touch taps never move neighbouring surfaces (`peak < 0.01`). | **Keep the probe, narrow the subject**: neighbour **DOM** transforms stay identity (D4). Add a new probe: the **pressed host** deviates, peaks within bounds, and returns to identity within `JELLY.settleMs`. Rename to `jelly-interaction.mjs`. |
| `liquid-glass.mjs:154` "reduced motion keeps surfaces stationary" | Reduced motion means no host transform. | **Change**: with ambient off and under every degraded tier, no host transform and no arc canvas. |
| `liquid-glass-engine.mjs:296` "at rest the engine draws nothing" | No draws at rest. | **Change** into three checks: (1) while engaged, draws ≤ ambient cap × seconds; (2) after doze, no draws for 3s; (3) a hidden tab or degraded tier means no draws. Lines `:240,:256` ("returns to rest") stay as "cursor light returns to its ambient baseline", compared against an ambient-only reference frame rather than a frozen one. |
| `liquid-glass-engine.mjs:277` "optical tilt leaves the live DOM geometry unchanged" | Hover never changes a bounding box. | **Change**: hover may change the hovered host's box by ≤ the hover amplitude. Neighbours' boxes stay unchanged. |
| `ui-stability.mjs:178-185` "hover never moves/resizes content" | Card `transform === 'none'` on hover. | **Change**: the card **content layer** (the link and text) has an identity transform. The host may transform while hovered, within bounds. This needs the physics plan's host/skin split to give the content a measurable wrapper. If it doesn't, assert `getBoundingClientRect` drift ≤ amplitude. |
| `ui-stability.mjs:220-229` "native scroll has no card or slot transform" / "moves at document speed" | No transform while scrolling. | **Keep.** Jelly must not deform hosts on scroll (scroll-linked deformation is the class of cost `design.md` §4.2 forbids). |
| `ui-stability.mjs:286-300` "hover preserves resting colours and geometry" (9 controls) | No colour or geometry change on hover. | **Change** the `transform` column to "returns to identity after unhover + settle". Colours stay as asserted. |
| `frame-budget.mjs:66` `REST_FRAME_LIMIT = 2`, `:267` gate | A site page at rest produces ≤ 2 frames/s and no `infinite` animations. | **Change semantics.** "Rest" means after the doze threshold of no input, plus settle time (`GATE_SETTLE_MS = max(12000, dozeMs + 3000)`). The limit is either 2 (if Q1 lands as a 0 Hz doze) or the doze floor + 1 (if 01's 12 Hz floor stands). The `infinite` check excludes only the `jelly-drift`/`jelly-current` keyframes, and only on elements inside `.jelly-flow`. After doze, those animations must be `paused` (or the carriers detached). Add an `--engaged` mode: with synthetic pointer motion, frames/s ≤ 35 (30 Hz clock + 5) and browser CPU ≤ the coverage/perf plan's budget. |
| `glass-slab.mjs`, `glass-dispersion.mjs` | Rim alpha and dispersion. | **Keep.** The rims are retained. Repoint the imports when `renderer/shader` move. |

### 1.3 The commit gate itself

| Where | Today | Proposed |
| --- | --- | --- |
| `check-consistency.sh:274-276` `review_site` pointer effect | "Decorative light/waves belong to lib/liquid/runtime.ts". | Pointer string becomes "…belong to the jelly service (lib/jelly, docs/plasmatic-jelly-system.md)". |
| `check-consistency.sh:328-351` `GATE_TESTS` | 22 files. | Add `jelly-ownership`, `jelly-contract`, `site-infinite-animation`, `doc-pointers` and `handheld-tier` (the last is currently not in the list). |
| `check-consistency.sh:470-481` step 5 | "…once with reduced motion on." This is already stale, because the setting is retired. | Replace it with: "once with **ambient jelly off**, once in `.style-high-contrast` (ambient + arcs must be gone), and once after 15s untouched (the page must doze)." Add a review item: "Did a neighbour's **content** move? Only skins may." |
| `.claude/hooks/commit-gate.sh:41-46` | Points to `design-language.md` §0/§13 and `page-consistency.md` §3. | Unchanged. Those anchors survive the rewrite. N10 keeps the pointers honest. |

### 1.4 Prose rules that say the opposite of jelly

All of these are rewritten in the cutover commit (§4). Each is a sentence an agent will obey:

- `CLAUDE.md:152-162` (rule 4): "Clicks never push or bounce neighbouring surfaces",
  "Never add per-component pointer loops", "No `backdrop-filter`". The same text is in
  `AGENTS.md:16-26`, `components/CLAUDE.md:45-59` and `lib/CLAUDE.md:86-93`.
- `design.md:56-75` ("clicks never push or bounce"), `:128-142` ("Clicks and taps never
  emit waves… The background remains still"), `:234-240` ("Reduced motion stands the
  whole layer down", which already contradicts the retired-motion policy), and §10 item 4.
  Also stale today: `:58-60` "native backdrop frost".
- `docs/design-language.md:1-66` (title and both superseded banners), `:85-100` §0
  ("Taps never emit ripples"), §0 item 6, §5.1 tier table ("L2 (blur+noise)"), §5.1.1
  "Cursor reactivity is retired", §7 idle-at-rest, and §13 (the rAF and fluid bullets).
- `docs/liquid-glass-system.md:34-46` (whole "Interaction and layout" section: "no
  continuous resting loop", "clicks… never emit ripples").
- `docs/page-consistency.md:7-12, 190-200, 337-389` (the last line: "Click/tap feedback
  never emits a ripple").
- `locales/en/c-ui.json:43-48` (demo copy: "tapping keeps the surface still").

---

## 2. New gates to add

Each gate follows the house pattern (`design-language.md` §13, "Adding a rule"): a
source scan or a pure-function test in `lib/__tests__/`, an allowlist that only
shrinks, and a "scanned > N files" floor so a broken walker cannot pass vacuously.

| ID | File (new unless noted) | Rule | Why |
| --- | --- | --- | --- |
| **N1** | `lib/__tests__/jelly-contract.test.ts` | Tests the pure policy exported by `lib/jelly/policy.ts`. `jellyMode(env)` returns `{ambient, arcs, deform}`. **All three are off** for: `prefers-reduced-transparency`, `forced-colors`, `.style-high-contrast`, `.app-high-contrast`, `.perf-lite`, `print`, and `document.hidden`. `ambient` is off when the ambient setting is off or doze has elapsed. `arcs` is off when the arcs setting is off. Handheld gets reduced caps. Numeric upper bounds (the sibling plans' values sit at or below these): ambient clock ≤ 30 Hz engaged (01 D4); doze threshold ≥ 5 s and the doze floor ≤ the Q1 decision; haze canvases ≤ 16 (01 D3); arc flash ledger ≤ 3 onsets per 1000 ms (03 D7, WCAG 2.3.1); ambient arcs ≤ 1 per 2 s (03 D3); Tier E bodies ≤ 12, or 6 on coarse pointers (02 D7); host deform amplitude and settle time as exported by 02. The clock predicate is false when no haze surface intersects the viewport. N1 imports these constants from the owning modules (`lib/liquid/glass/policy.ts`, `lib/jelly/policy.ts`, `lib/jelly/arcs/*`), so it never restates them. | Turns "idle when unseen" and "degraded tiers kill motion and arcs" into code, not prose. The exact numbers belong to the physics, arcs and perf plans. This test pins **upper bounds** only, so those plans can tune below them. |
| **N2** | `lib/__tests__/jelly-ownership.test.ts` | (a) Only `lib/jelly/**`, `lib/liquid/**`, the mounting hooks (`hooks/useJelly*.ts`, `hooks/useLiquidInteractions.ts`) and `app/routes/jelly.tsx` may import `@/lib/jelly/(physics\|compose\|bridge\|arcs)`. Components consume jelly through role classes and `data-jelly*` attributes only. (b) Under `lib/jelly/` and `lib/liquid/`, only `lib/liquid/glass/engine.ts`, `lib/jelly/physics.ts` and `lib/jelly/arcs/renderer.ts` call `requestAnimationFrame` (the D3 owners), and `runtime.ts` until it is removed. (c) The degraded-tier selector string (`.reduce-transparency,.style-high-contrast,.perf-lite`) is declared once, as `DEGRADED_ROOT_SELECTOR` in `lib/jelly/policy.ts`, and nowhere else (it is duplicated today in `engine.ts:154` and `runtime.ts:32`). (d) No site-tier file writes `style.transform`, `style.scale` or `style.translate` inside a `pointermove`/`pointerdown` handler. The baseline is the current gesture surfaces (games are exempt via `FULLSCREEN_TIER_DIRS`, read from `design-consistency.test.ts` like the shell script does). | One physics, one arc service, one loop. This replaces "never add per-component pointer loops" with an enforceable statement. |
| **N3** | `lib/__tests__/site-infinite-animation.test.ts` (generalises `static-backdrop`) | No new `animation: … infinite` in site-tier CSS (`app/*.css`, `components/{ui,radial,feed,site}/**/*.css`). Seed a frozen baseline of today's 17 (loaders, skeleton drift, `dock-globe-shimmer`, `globe-current-halo`, …), with each entry justified. The list only shrinks. One **sanctioned** exception is listed by name: 01's `jelly-drift`/`jelly-current` keyframes, whose selectors must sit under `.jelly-flow`. The same file asserts that `.jelly-flow` is killed (`display:none` or `animation:none`) under every degraded root selector, and that it has a paused rule for the dozed state. | Ambient motion must come from an owner that has the visibility, doze and degradation switches. A free-standing CSS `infinite` keyframe has none of them, and is what `frame-budget --gate` exists to catch. |
| **N4** | extend `stacking-consistency.test.ts` R3 | Described in §1.1. | A transformed host traps `fixed` descendants. |
| **N5** | extend `design-consistency.test.ts` | **Hand-rolled surface**: in site-tier `className`, a `bg-site-surface` together with `border` and `rounded-site` on one element, with no `glass-*` role, fails. Use a frozen per-file count (the same debt-list pattern as the CSS hex/radius rule at `:773-835`). | `design.md` §3 already says "a tier class is not decoration you can inline". Under jelly the stakes go up: a hand-rolled box gets **no** jelly at all, which is now visibly inconsistent, where before it was merely less shiny. |
| **N6** | extend `stacking-consistency.test.ts` "L1 has no blur" → "no role has blur" | No `backdrop-filter` other than `none` in any `.glass-*`, `[data-jelly]` or `.app-glass` block in `app/jelly.css`, `app/liquid-glass.css` or `components/shared/app-theme.css`. | D5. "Hazy" is the most likely path back to frosted blur. |
| **N7** | `lib/__tests__/jelly-contract.test.ts` | Arc endpoints are only taken from admitted surfaces. Arcs never terminate inside `.glass-inset` (fields) or over text-bearing L4 overlays. `arcPolicy` rejects pairs further apart than `arc.maxDistancePx`. | Keeps arcs from crossing text the user is reading or typing. |
| **N8** | `lib/__tests__/doc-pointers.test.ts` | Every repo path quoted in a pointer string in `check-consistency.sh`, `commit-gate.sh`, and the failure messages of the gate tests exists on disk. | The cutover renames and deletes several files these pointers name (`lib/liquid/runtime.ts`, `liquid-glass-system.md` anchors). A dangling pointer is how an agent "fixes" a gate the wrong way. |
| **N9** | `check-consistency.sh` step 2 (added lines, **blocking** after phase 3) | No new `data-liquid-` attribute, no new import of `@/lib/liquid/(runtime\|glass/engine)`, and no new file named `liquid-*` / `useLiquid*`. Before phase 3 this is a `review`, not `blocking`. | D8: the old vocabulary stops growing. |
| **N11** | extend `design-consistency.test.ts` | No framer-motion `whileHover`/`whileTap` that animates `scale`/`x`/`y` in site-tier files. Start from a frozen baseline of 02's 41 sites and drain it. | 02 §3.3: two writers on `scale` (framer and jelly) fight. Same reasoning as `hover-css.ts`. |
| **N12** | `lib/__tests__/site-infinite-animation.test.ts` (same CSS walker) | Every jelly paint layer (`.jelly-flow`, `.jelly-haze-canvas`, the rim canvas) declares a **negative** `z-index` inside an isolated host. Nothing jelly paints at z ≥ 0 inside a host. The arc layer is the one body-level exception (03 D1), and it is `pointer-events:none`. | 01 §6 item 1 ("haze is under the text, always") asks the gates owner for this rule. |
| **N10** | `testing/e2e/jelly-interaction.mjs` and `frame-budget.mjs --engaged` | Covered in §1.2. Wire `frame-budget --gate` into `web-ci.yml`'s existing path-filtered e2e job, using the same path filter as `eversion-e2e`, extended with `lib/jelly/` and `app/jelly.css`. | Today no liquid e2e runs in CI. Jelly's main risk is a perpetual loop, and that can only be measured in a browser. |

The coverage/a11y plan owns which primitives must carry jelly. This plan only
requires that its list, once decided, becomes an N5-style assertion (for example
"every `components/ui/{button,card,dialog,…}.tsx` root carries a role class") rather
than prose.

---

## 3. Naming

### 3.1 Role classes: keep `glass-*` (recommended)

Options considered:

- **Rename to `jelly-*` with `glass-*` aliases.** Every selector becomes a pair, and
  the gates (`design-consistency` rule 7 regexes at `:383-384`, the stacking R3
  regex, engine admission, `app-theme.css`) must learn both names. The aliases never
  get removed, because 484 files would have to change in one commit.
- **Codemod rename.** A 484-file diff that conflicts with every open branch, and the
  `--base main` gate would review all of it as "added lines".
- **Keep (chosen).** The classes name an **elevation role**: fill, pane, chrome,
  overlay, inset, scrim. That is exactly what the gates key on. The docs define
  "glass role" as the role vocabulary and "jelly" as the material that renders every
  role. `.app-glass` keeps its name for the same reason.

Retire the dead modifiers instead of renaming them: `.glass-refract`,
`.glass-refract--prism` and `.glass-liquid` are already compatibility aliases
(`design-language.md:56-60`). Under jelly they become no-ops, and the material plan
deletes them. That is a deletion, not a rename.

### 3.2 Module layout

```
lib/jelly/                  NEW: owned by the material, physics and arcs plans
  policy.ts                 pure: jellyMode(), DEGRADED_ROOT_SELECTOR, OPT_OUT_SELECTOR, HANDHELD_QUERY
  selectors.ts, registry.ts, bus.ts, envelope.ts, lattice.ts   (02)
  physics.ts, compose.ts, bridge.ts                             (02; physics.ts = rAF owner)
  flow-carriers.ts          (01; proposed there as lib/liquid/jelly/, relocate here)
  arcs/{candidates,ledger,renderer}.ts                          (03; renderer.ts = rAF owner)
  __tests__/, arcs/__tests__/   auto-discovered (vitest glob; test-discovery.test.ts)
lib/liquid/glass/           KEPT: rim + haze engine evolves in place (01); engine.ts = ambient-clock rAF owner
hooks/useJellyPhysics.ts    (02) mounted in Providers.tsx beside useLiquidInteractions
app/jelly-material.css, app/jelly-arcs.css   (01, 03) imported from globals.css
```

These also stay where they are: `lib/liquid/optics.ts`,
`lib/liquid/globe-material.ts`, `lib/liquid/hover-css.ts` (the Vite PostCSS plugin
and `ui-stability.mjs` import it by path), `lib/liquid/glass/color.ts`, and
`lib/liquid/glass/scene*.ts`. Moving pure math for the sake of a name buys churn and
nothing else. `lib/liquid-gl` → `lib/liquid` already cost a silently dead test once
(`test-discovery.test.ts:5-12`).

These are deleted only when jelly subsumes them, with no re-exports:
`lib/liquid/runtime.ts` (the fallback cursor light, if the material plan replaces it)
and `lib/liquid/droplet.ts` (only if the morph goes). A re-export shim would keep the
old path "alive" for the rAF allowlist's stale-entry check, and lets new code import
the dead name.

Name collision: `components/radial/jelly-glass.ts` (the globe's gelatinous shader)
already uses "jelly". Keep it, since it is the same material family. In the new
contract doc, refer to it as "the globe's jelly coat" so `lib/jelly` and it are not
confused.

### 3.3 Components and hooks

`LiquidTabs`, `LiquidGlobe`, `GlassPane`, `liquid-morph`, `useLiquidBackground` and
`useLiquidLink` **keep their names**. They are component identities that gates and 84+
importers reference, not material claims. New jelly-specific primitives, if any, are
named `Jelly*`.

### 3.4 The demo route

Create `app/routes/jelly.tsx` (`/jelly`) as the material lab. `app/routes/liquid-glass.tsx`
becomes a `beforeLoad` redirect to `/jelly` with a `head()`, so it still passes the
commit gate's route checks. Effects:

- `SECTION_LABEL_ALLOW` moves its entry (§1.1).
- `pnpm docs:site` regenerates `docs/site-reference/pages.md`. The commit gate's docs
  freshness step fires on any `app/routes/` change.
- `routeTree.gen.ts` regenerates (expected; the gate warns, which is correct).

### 3.5 Attributes (phase 3)

| Today | After | Count |
| --- | --- | --- |
| `data-liquid-material="off"` | `data-jelly="off"` | 19 |
| `data-liquid-glass` (`lit`/`refract`/`off`) | `data-jelly-optics` | 16 |
| `data-liquid-motion="off"` | `data-jelly-motion="off"` (also disables deform and arcs for gesture subtrees) | 3 |
| `data-liquid-canvas`, `-surface`, `-scene`, `-static` | `data-jelly-canvas`, `-surface`, `-scene`, `-static` (engine-internal) | 26 |

Until the codemod lands, `lib/jelly/policy.ts` exports `OPT_OUT_SELECTOR`, which matches
both spellings. The codemod commit then flips N9 to blocking. `useFluidPress.ts:175`
and `lib/liquid/runtime.ts:9` contain hand-copied opt-out selectors. After the codemod,
both read the exported constant (N2c covers the duplication).

---

## 4. Docs plan

### 4.1 New contract: `docs/plasmatic-jelly-system.md`

It replaces `liquid-glass-system.md` as the implementation authority. Target ≤ 200 lines,
written in the same terse contract style. Sections:

1. **Status and what it supersedes.** It supersedes `liquid-glass-system.md`, and §5.1.1
   and §7 idle-at-rest in `design-language.md`.
2. **Material.** Haze, internal currents and eddies, the translucent body and the
   refracting rounded rim. What is shader-drawn, and the CSS fallback for each role.
   No `backdrop-filter`.
3. **Roles and budget.** The `glass-*` role table, with admission order, slab budget,
   handheld and `perf-lite` caps, and which roles get ambient, deform and arcs.
4. **Motion states.** A state machine: `engaged` (ambient at ≤ `ambientFps`) → `dozing`
   (eases to still after `dozeMs` with no input) → `still` → back to `engaged` on input
   or scroll end. Plus `unseen` (hidden tab or nothing admitted on screen) and
   `degraded`. This is the section the rAF allowlist and `frame-budget` cite.
5. **Soft body.** Host versus skin versus content. Amplitude bounds, settle time,
   hit-testing during deformation, and the neighbour nudge (skin only). The press
   layer (`useFluidPress`) is merged into it or bounded by it, as the physics plan
   decides.
6. **Arcs.** Proximity pairing, click arcs, concurrency, lifetime, the flash ceiling
   (< 3 Hz luminance flashes), and where arcs may not go (fields, text-bearing L4).
7. **The three loops.** The engine's ambient clock, physics, and the arc renderer: who may request frames, the frame cap, the
   visibility/intersection/doze gating, and the teardown guarantees.
8. **Degradation matrix.** Every condition × {ambient, deform, arcs, refraction, CSS
   fallback}. This is the table N1 tests.
9. **Accessibility.** WCAG 2.2.2 (the ambient switch and doze), 2.3.1 (arc flashes),
   high contrast, forced colours, keyboard (focus never deforms content), and screen
   readers (canvases are `aria-hidden`).
10. **Performance budgets and how they are measured.** `frame-budget --gate` (doze
    rest) and `--engaged`, the CPU budget, and the slab count.
11. **Ownership map.** File by file, mirroring §3.2.
12. **Validation.** Which unit gates and e2e scripts prove which section.

`docs/liquid-glass-system.md` keeps its path. A banner at the top reads "Superseded by
plasmatic-jelly-system.md (2026-…). Retained for the optics and snapshot lifecycle
history." Its sections that still hold (snapshot lifecycle, N-BK7 optics, globe) are
**moved** into the new doc and replaced by links, so there is one authority per fact.

### 4.2 Rewrites in the cutover commit

| File | Change |
| --- | --- |
| `design.md` | Title becomes "Radial Plasmatic Jelly". Rewrite §1 "Avant-garde glass" as "Plasmatic jelly", and fix the stale "native backdrop frost". In §3, rewrite "Light and pressure belong to the material" (clicks now emit arcs and pulses, content stays still) and "Budgets are real" (slabs, not blur). In §4, add cost rule 6: "ambient motion is one capped loop that dozes; never a CSS infinite keyframe". Replace the reduced-motion paragraph with the ambient/arcs switches. Update §10 items 3-4. Keep the **static backdrop** paragraph: jelly moves, the room does not. |
| `docs/design-language.md` | Title. Replace both banners (`:41-66`) with one "Current: plasmatic jelly" banner. Update the §0 interaction paragraph, §0 item 6 (degraded tiers, adding ambient/arcs) and §0 item 9. Update the §5.1 tier column (remove "blur+noise"), retire the modifier rows, and mark §5.1.1 superseded. In §7, add the motion-states summary and link the contract. In §11, update the do/don't list. In §13, add N1-N10 and rewrite the rAF and `fluid` bullets. |
| `docs/page-consistency.md` | Intro `:7-12`. Checklist `:190-200` (decorative responses come from the jelly service; `data-jelly-motion="off"` on gesture subtrees). Anti-patterns `:337-389`: replace "never emits a ripple" with "never moves neighbour **content**; feedback comes from the jelly service". |
| `CLAUDE.md` rule 4 **and** `AGENTS.md:16-26` | Replace the liquid-glass paragraph with about 8 lines: role classes unchanged; the jelly material, physics and arcs are owned by `lib/jelly` (one loop, idle when unseen); no `backdrop-filter`; no per-component deformation or arc code; content never moves except under the finger; read `docs/plasmatic-jelly-system.md`. `AGENTS.md` already differs from `CLAUDE.md`, so edit both by hand rather than copying one over the other. |
| `components/CLAUDE.md:34-59, 130-140` | Liquid material → jelly material. Attribute names (after phase 3). The fixed-descendant rule (N4). |
| `lib/CLAUDE.md:86-93` | Add a `jelly/` entry. Keep `liquid/` for the pure optics, hover and scene modules. |
| `components/radial/README.md:3-35` | Language name, and the "globe's jelly coat" disambiguation. |
| `docs/README.md` | Add the new contract to the reference table (`:44-48`). Add `liquid-glass-system.md` and the two `plans/2026-07-*-liquid-glass-*` docs to the stale/historical list (`:143-149`). Add a `plans/plasmatic-jelly/` row. |
| `docs/testing.md` | The `frame-budget` section (`:247-260`): doze semantics, `--engaged`, and the CI wiring (N10). |
| `docs/index.md:32` | "**Radial Avant-Garde Glass**" → "**Radial Plasmatic Jelly**". Add `plasmatic-jelly-system` to the Reference toctree after `design-language`. |

### 4.3 Translated and generated docs

- **Sphinx gettext** (`scripts/docs-i18n.sh`, `docs/translations.md`): only `index` and
  `developer-api/*` are in `TRANSLATED`. The design docs are English-only, so rewriting
  them costs nothing in translation. `docs/index.md:32` **is** translated. After
  editing it, run `scripts/docs-i18n.sh extract && scripts/docs-i18n.sh update`. That
  string becomes `fuzzy` in all 15 `docs/locale/*/LC_MESSAGES/index.po` and falls back
  to English until it is re-translated, which is the designed, graceful path. Commit
  the regenerated `.po` files in the same commit. Do **not** hand-edit `msgid`.
- **Generated docs** (`check-consistency.sh:425-433`): `docs:site:check` fires on
  `app/routes/` changes, so the route move (§3.4) must ship with `pnpm docs:site`
  output. `docs:api`/`sdk` are unaffected.
- `docs/plans/**` is globbed into the "Plans & design snapshots" toctree, so this plan
  directory publishes automatically.

---

## 5. User-facing strings (i18n)

Rule (root `CLAUDE.md` §5, enforced by `i18n-default-drift.test.ts`): **new wording
means a new key.** Editing a `defaultValue` in place changes English only, and fails the
drift gate if the catalog disagrees. Run `pnpm i18n:extract`, check `locales/en/<ns>.json`,
and let `i18n-translate.yml` fill the 15 locales. No new namespace is needed, so
`NAMESPACES` in `lib/i18n/config.ts` is unchanged.

**New keys, `settings-appearance`** (Appearance → a new "Jelly" group; the coverage/a11y plan owns the UI):

| Key | English |
| --- | --- |
| `jelly-section` | Jelly |
| `jelly-ambient` | Ambient motion |
| `jelly-ambient-desc` | Let surfaces drift and swirl gently while you use the site. They settle when you stop. |
| `jelly-arcs` | Electric arcs |
| `jelly-arcs-desc` | Show sparks between nearby surfaces and when you click. |
| `jelly-off-contrast` | High contrast is on, so surfaces stay still and arcs are hidden. |
| `jelly-off-transparency` | Your device is set to reduce transparency, so surfaces stay still and arcs are hidden. |
| `tilt-effects-desc-jelly` | Let the jelly catch light as you tilt your device. (Replaces `tilt-effects-desc`. Delete the old key and its 15 translations in the same commit, or the catalog test flags them as orphans.) |

**`theme-studio`**: `section-material-jelly` = "Jelly material" (replaces `section-material`).

**`c-ui` (the `/jelly` lab)**: new keys `jelly-intro`, `jelly-ambient-title`,
`jelly-ambient-description`, `jelly-squash-title`, `jelly-squash-description`,
`jelly-arcs-title`, `jelly-arcs-description` and `jelly-clear-rim`. Delete
`glass-intro`, `glass-stable-taps`, `glass-cursor-title`, `glass-cursor-description`,
`glass-clear-edge` and `glass-stable-surface` (`c-ui.json:43-48`) with the old demo.
These strings now describe the opposite behaviour.

**Dead keys to delete while there**: `feed.json:1272-1275` `settings-glass-clarity*`.
Nothing in `components/` or `app/` references them, and they describe "frosted glass".

**Unchanged on purpose**: "The Liquid Globe" (`feed.json:516`) and the four
`settings-appearance` eversion strings that name it. It is a proper noun for a
product object, and renaming it touches the eversion settings copy. That is an
owner decision, not part of this migration (open question Q2). Game and app copy
about glass or ripples (`c-rideshare`, `c-rmhfashion`, `c-rebar-rutabaga`,
`c-daily-puzzles`, `c-dunesday`) describes those apps' own objects and stays.

---

## 6. File-by-file implementation list and ownership

Phases are commit boundaries. Every gate change rides with the code that needs it.

**Phase 1: jelly lands beside liquid, opt-in on `/jelly` only.**

| Owner | Files |
| --- | --- |
| Material/physics/arcs plans | `lib/jelly/**` (incl. `__tests__/`), `app/jelly.css` |
| Gates (this plan) | `lib/__tests__/jelly-contract.test.ts` (N1, N7, pinned to `lib/jelly/policy.ts`); `lib/__tests__/jelly-ownership.test.ts` (N2); `raf-loop-allowlist.test.ts`, adding `lib/jelly/scheduler.ts` with the two-tier docblock; `handheld-tier.test.ts`, adding `policy.ts`; `filter-cost-budget.test.ts` `SHEETS` += `app/jelly.css` |
| Naming | `app/routes/jelly.tsx` (new lab); `c-ui` new keys + `pnpm i18n:extract`; `pnpm docs:site` |
| Docs | `docs/plasmatic-jelly-system.md` (draft, marked "phase 1: opt-in") |

**Phase 2: cutover.** One PR, which may be several commits, each passing the gate.

| Owner | Files |
| --- | --- |
| Material/physics | `components/Providers.tsx` (mount `useJellyServices`); delete `hooks/useLiquidInteractions.ts`, `lib/liquid/runtime.ts`, `lib/liquid/glass/{engine,renderer,shader,policy}.ts` and `lib/liquid/glass/__tests__/policy.test.ts`; `app/globals.css` import swap; `components/shared/app-theme.css` (`.app-glass` → jelly) |
| Gates | `raf-loop-allowlist.test.ts` (remove the two liquid entries); `stacking-consistency.test.ts` (N4 + N6, with baseline); `design-consistency.test.ts` (rule 7 message, N5 debt list, `SECTION_LABEL_ALLOW` move); `lib/__tests__/site-infinite-animation.test.ts` (N3) + `static-backdrop.test.ts` describe rename; `lib/__tests__/doc-pointers.test.ts` (N8); `lib/liquid/hover-css.ts` docblock; `scripts/check-consistency.sh` (pointer text, `GATE_TESTS`, step 5, N9 as review) |
| E2E | `testing/e2e/liquid-glass.mjs` → `jelly-interaction.mjs`; `liquid-glass-engine.mjs` → `jelly-engine.mjs`; `ui-stability.mjs`; `frame-budget.mjs` (doze + `--engaged`); `glass-slab.mjs`/`glass-dispersion.mjs` import paths; `.github/workflows/web-ci.yml` (N10 job and path filter) |
| Docs | §4.2 table in full; `liquid-glass-system.md` banner; `scripts/docs-i18n.sh extract/update` + `docs/locale/*/LC_MESSAGES/index.po` |
| Naming/i18n | `app/routes/liquid-glass.tsx` → redirect; `settings-appearance` and `theme-studio` new keys, old keys deleted; the Appearance panel wiring (with the coverage/a11y plan); pre-paint read of the two settings in `app/routes/__root.tsx` (the FOUC contract covers it) |

**Phase 3: vocabulary cleanup.**

| Owner | Files |
| --- | --- |
| Naming | Codemod `data-liquid-*` → `data-jelly-*` (15 files); `hooks/useFluidPress.ts:175` reads `OPT_OUT_SELECTOR`; `components/CLAUDE.md` attribute names |
| Gates | N9 flipped to `blocking` in `check-consistency.sh`; remove the dual-spelling branch from `OPT_OUT_SELECTOR`; drain the R3 and N5 baselines as files are touched |

**Conflict boundaries for parallel agents.** `lib/__tests__/*` and
`scripts/check-consistency.sh` belong to the gates owner. Other workstreams send their
numeric bounds as constants exported from `lib/jelly/policy.ts`, and the gates read
them. They do not edit the tests. `docs/plasmatic-jelly-system.md` has one owner,
with sections 2, 5 and 6 drafted by the material, physics and arcs plans
respectively. `CLAUDE.md` and `AGENTS.md` are edited once, at cutover, by the docs
owner.

---

## 7. Open questions for the owner

- **Q1. Doze.** "Always has underlying motion" read literally means never dozing. That
  fails `frame-budget --gate` and WCAG 2.2.2 unless the ambient switch defaults off.
  Recommendation: doze after 10s of no input or scroll, configurable in
  `policy.ts`. With `dozeMs = Infinity`, the frame-budget gate would have to change
  from "rest ≤ 2 fps" to "rest ≤ ambientFps", which is a deliberate reversal of the
  2026-10-08 audit and should be signed off as one.
- **Q2.** Should "The Liquid Globe" be renamed? (§5; recommend no.)
- **Q3.** Should `useFluidPress` be absorbed into jelly physics, or remain the press layer
  with jelly drawing on top? (Physics plan. N2(d)'s baseline depends on the answer.)

# Performance audit — CSS-native, low-level, and build parallelism — 2026-08-12

Triggered by: **"look specifically for things we do in JS that CSS or a
lower-level language could do better — and make builds faster and more
parallel."**

This is a different question from the previous passes, and it is worth saying
why. Every earlier audit asked *how much* work the site does — bytes, chunks,
queries, draw calls — and answered by removing work. This one asks *where* the
work runs. A `translateY` tween is not expensive because it is a tween; it is
expensive because it is a tween **on the main thread, in React, in JavaScript**,
when the compositor would have run it for free. Same output, different engine.

So nothing below is about doing less. It is about moving work down a level:
main-thread JS → CSS/compositor, and JS → WASM/Go for the handful of loops that
genuinely deserve a real machine.

Read the earlier passes first; their findings hold and are not revisited:

- [`performance-audit-2026-07-17.md`](performance-audit-2026-07-17.md) — DB
  indexes, FTS, first bundle split, SSR i18n.
- [`performance-audit-2026-07-30.md`](performance-audit-2026-07-30.md) —
  pollers, write amplification.
- [`performance-audit-2026-08-01.md`](performance-audit-2026-08-01.md) — the
  custom-property restyle; interaction latency.
- [`performance-audit-2026-08-04.md`](performance-audit-2026-08-04.md) —
  entry-chunk composition.
- [`performance-audit-2026-08-09.md`](performance-audit-2026-08-09.md) +
  [`loading-audit-2026-08-11/`](loading-audit-2026-08-11/index.md) — anonymous
  HTML cache, font blocking, the icon chunk.
- [`3d-performance-audit.md`](3d-performance-audit.md) — the WebGL tier.
- [`build-deploy-audit-2026-08-08.md`](build-deploy-audit-2026-08-08.md) — the
  CI/deploy pipeline as it stands.

---

## Method

**Static analysis** over the whole tree for the patterns that indicate
main-thread work with a declarative equivalent (`requestAnimationFrame`,
`IntersectionObserver`, `ResizeObserver`, forced-reflow reads,
`framer-motion` import shape).

**Measured** where a number was available:

- `pnpm build` phase timings, on this box (4 cores, 15 GB, warm `node_modules`).
- The Slice It beatmap pipeline, benchmarked directly against synthetic audio
  through the real `generateBeatmap` entry point (§2.1).

Two caveats, stated once. The build box is a 4-core sandbox running Node 22
against a repo that wants Node ≥24.18, so **absolute** build seconds are not
production numbers — the *ratios between phases* are what this audit uses.
And `pnpm images:variants` could not be measured at all: `sharp` hung at 0% CPU
on this environment's Node/libvips combination. That is an environment
artifact, not a repo finding, and §3.3 is written from the code rather than
from a stopwatch.

---

## Headline

The site is well past the easy wins — five prior passes took them. What is left
is a **systematic layering mistake**, not a list of slow files:

> The site has already built the CSS-native version of several of its own
> animation primitives, and then kept using the JavaScript ones.

`.u-reveal` (a zero-JS scroll-driven reveal, `app/globals.css:5560`) exists,
works, is `@supports`-guarded and reduced-motion-correct. It is used in **3**
files. `<Reveal>` — framer-motion, `whileInView`, an IntersectionObserver and a
rAF tween per element — is used in **34**, including **19 feed columns**, which
is the single hottest surface on the site. The good implementation lost to the
old one because nothing pointed the second at the first.

| #   | Finding                                                                     | Who pays                          | Tier |
| --- | --------------------------------------------------------------------------- | --------------------------------- | ---- |
| 1   | `<Reveal>` (JS) used 34× while the CSS equivalent `.u-reveal` is used 3×    | every feed column, every section  | P0   |
| 2   | `AnimatedCount` re-renders React **once per frame**, ×4 per feed card       | every feed scroll + every like    | P0   |
| 3   | 15 files import full `motion`, defeating `LazyMotion` for the whole app     | every page that loads one of them | P0   |
| 4   | `useReveal` is mounted on 12 pages and its target class has **0 consumers** | 12 pages, dead work               | P1   |
| 5   | Beatmap STFT: **2.9 s** per 15-min upload, single-threaded JS               | the jobs worker, per upload       | P1   |
| 6   | 12 chat surfaces hand-roll stick-to-bottom with a forced reflow per message | every chat/stream message         | P1   |
| 7   | `AnchoredMenu` measures + flips in JS; CSS anchor positioning does it       | every menu open                   | P2   |
| 8   | `vibe-builder` needlessly serializes ahead of the 66 s `vite build`         | every cold deploy                 | P2   |
| 9   | Textarea autosize by forced reflow; `field-sizing: content` is free         | per keystroke, 54 textareas       | P2   |
| 10  | ResizeObserver used for pure layout decisions container queries can make    | 35 files                          | P3   |

---

# Part 1 — Work the browser will do for free

## 1.1 · P0 — `<Reveal>` vs `.u-reveal`: the site already won this and didn't notice

**Where:** `components/motion/Reveal.tsx`, consumed by 34 files —
`components/feed/FeedColumn.tsx`, `NotificationsColumn.tsx`,
`MessagesColumn.tsx`, `RankedColumn.tsx`, and 15 more feed columns.

**What runs today.** Every `<Reveal>` mounts a framer-motion node. That node
registers an IntersectionObserver, and when the element crosses the threshold
framer drives `opacity` and `y` **from JavaScript, on the main thread, one
`requestAnimationFrame` callback per frame per element**. A feed column that
reveals eight children runs eight concurrent JS tweens during exactly the
gesture — the first scroll — that has the least frame budget to spare.

**What already exists.** `app/globals.css:5560-5585`:

```css
@keyframes u-reveal-in {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: none; }
}
@supports (animation-timeline: view()) {
  @media not (prefers-reduced-motion: reduce) {
    html:not(.reduce-motion) .u-reveal {
      animation: u-reveal-in linear both;
      animation-timeline: view();
      animation-range: entry 0% entry 46%;
    }
  }
}
```

This is strictly better on four axes, not one:

| | `<Reveal>` | `.u-reveal` |
| --- | --- | --- |
| Per-frame main-thread work | 1 rAF callback / element | **0** — compositor |
| JS shipped | framer-motion feature bundle | **0 bytes** |
| Behaviour pre-hydration | needs `data-reveal` noscript rule + a watchdog | correct on first paint |
| Scroll-linked | no — time-based, fires once | yes — tracks the scroller |

`<Reveal>` also carries `useRevealWatchdog` — a fail-open timer that exists
purely because an observer-driven reveal *can* leave content invisible. The CSS
version has no such failure mode: the hidden state only exists inside
`@supports`, so a browser without scroll timelines renders everything visible.
Deleting the watchdog is part of the win, not a side effect.

**The migration.** `Reveal`'s props map onto CSS cleanly. Keep the component —
so the 34 call sites don't change — and change its body:

```tsx
// components/motion/Reveal.tsx — CSS-driven, no framer node, no observer.
export function Reveal({ as: Tag = 'div', delay = 0, y = 16, className, children }: RevealProps) {
  return (
    <Tag
      data-reveal=""
      className={cn('u-reveal', className)}
      style={{ '--u-reveal-y': `${y}px`, '--u-reveal-delay': `${delay}s` } as CSSProperties}
    >
      {children}
    </Tag>
  );
}
```

…with the keyframe generalised to read the two custom properties it now takes:

```css
@keyframes u-reveal-in {
  from { opacity: 0; transform: translateY(var(--u-reveal-y, var(--site-reveal-distance))); }
  to   { opacity: 1; transform: none; }
}
```

Note the default: `--site-reveal-distance` (`globals.css:329`) is the site's one
reveal offset, declared alongside `--site-reveal-duration` and
`--site-reveal-ease` under the comment "one curve for the whole site (audit
SPA-003)". **Those three tokens should survive §1.4** — it is only the
`[data-reveal-armed]` machinery and the hook that go. Keeping them means the CSS
path inherits the curve the site already agreed on rather than reintroducing the
hardcoded `24px`/`translateY` that `.u-reveal` currently carries.

> **`--u-reveal-delay` needs care.** `animation-delay` is meaningless on a
> scroll timeline — there is no clock to delay against. A stagger on a
> view-timeline is expressed by shifting the *range*, not the delay:
> `animation-range: entry calc(0% + var(--u-reveal-stagger, 0%)) entry 46%`.
> Callers passing `delay={0.06}` for a cascade should move to
> `--u-reveal-stagger`. Note that the existing `.u-reveal-soft` already gets a
> natural cascade for free, because each child enters on its own geometry —
> for grids, prefer that over any explicit stagger.

**Sequencing.** Migrate the 19 feed columns first (hottest surface, most
uniform usage), then the marketing/section pages. `components/motion/__tests__/`
has coverage for both `Reveal` and `RevealGroup`; those tests assert the
rendered contract, so they should survive the swap and are the thing to run
first.

---

## 1.2 · P0 — `AnimatedCount` re-renders React on every animation frame

**Where:** `components/ui/AnimatedCount.tsx:52-69`, reached from
`components/feed/EngagementCount.tsx` → `RMHarkActions.tsx` (**4 per post**:
comments, reRMHarks, likes, views) and `CommentItem.tsx` (3 per comment).

```tsx
const step = (ts: number) => {
  // …
  const current = from + (target - from) * eased;
  displayRef.current = current;
  setDisplay(current);              // ← a React render. Every frame.
  if (t < 1) raf = requestAnimationFrame(step);
};
```

A 280 ms tween at 60 fps is **~17 React renders per count**. One like on a
visible post is 17 renders; an SSE burst that updates ten visible posts is up to
170 renders of feed subtrees, each one reconciling a button, its icon, and its
pill — to move a number by one.

**The CSS-native version.** A registered custom property of syntax `<integer>`
is animatable, and `counter()` renders it as text. The whole tween then lives in
the style engine with zero React involvement:

```css
@property --count {
  syntax: '<integer>';
  inherits: false;
  initial-value: 0;
}

.count-roll {
  counter-reset: n var(--count);
  /* The theme's own scalar, same one `duration-site` reads — a theme that wants
     a quick site gets a quick roll. `--ease-glass` (globals.css:219) is the
     site's standard settle curve. */
  transition: --count var(--site-transition-speed, 200ms) var(--ease-glass);
}
.count-roll::after {
  content: counter(n);
}
```

```tsx
// The value is written once, as a style. React renders once per real change.
<span className="count-roll tabular-nums" style={{ '--count': target } as CSSProperties} />
```

17 renders → **1**. The interruption behaviour that the current implementation
hand-rolls with `displayRef` comes free: `transition` on a custom property
retargets from the current computed value automatically.

**Two constraints, both real.**

1. `counter()` renders an integer, so the K/M collapse in `formatCount` cannot
   be applied mid-tween. That is not a regression — read
   `EngagementCount.tsx`'s own note: counts formatted with K/M "only visibly
   roll while they're small". Above 1,000 the display is static anyway, so the
   correct shape is: roll with CSS under 1,000, render the formatted string
   directly at or above it.
2. `content` on a pseudo-element is not exposed to assistive tech consistently.
   Keep the accessible value on the host: `aria-label={format(target)}` with
   `aria-hidden` on the visual pseudo-element, or render the formatted text in a
   visually-hidden span.

Given the pseudo-element caveat, the honest framing: this is a clear win for the
feed's engagement pills specifically, where the numbers are small and the render
volume is high. It is not worth forcing onto every `AnimatedCount` call site.

---

## 1.3 · P0 — 15 files import full `motion` and silently un-do `LazyMotion`

**Where:** `components/Providers.tsx:13` wraps the app in `<LazyMotion>`, and
`lib/motion-features.ts` exists solely to load `domMax` in an async chunk after
first paint. That is the correct setup. These 15 files defeat it:

```
components/pf2ecal/{Assistant,Sheet,RecapPanel,SessionSheet}.tsx
components/forest-explorer/story/{StoryGame,StoryNarration}.tsx
components/slice-it/{GameCanvas,GameOver,MainMenu,SongComments}.tsx
components/rmhbox/minigames/emoji-cinema/{EmojiCinemaGame,MovieReveal}.tsx
components/rmhbox/minigames/minimalist-masterpiece/MinimalistMasterpieceGame.tsx
components/radial/Parallax.tsx
components/vega/GameCanvas.tsx
```

Importing `motion` (rather than `m`) pulls the **entire** feature bundle into
whatever chunk that module lands in — which is exactly the payload
`lib/motion-features.ts` was written to defer. The 121 files that correctly use
`m as motion` get no benefit on any route that also loads one of these 15.

`components/radial/Parallax.tsx` is the worst of them: `radial` is the site
shell, so its chunk is on the critical path for every `_site` route.

**Fix** — mechanical, and every one of the 121 correct files carries the comment
to copy:

```diff
-import { AnimatePresence, motion } from 'framer-motion';
+// `m as motion`, not `motion`: `Providers` wraps the app in `LazyMotion`, and `m`
+// picks the feature bundle up from that context instead of shipping its own.
+import { AnimatePresence, m as motion } from 'framer-motion';
```

**Make it stick.** This regressed once and will again. The repo already has
`eslint-local-rules/` — this is a three-line `no-restricted-imports` entry, and
it belongs in the same commit as the fix:

```js
// eslint.config.mjs
'no-restricted-imports': ['error', {
  paths: [{
    name: 'framer-motion',
    importNames: ['motion'],
    message: "Import `m as motion` — `motion` defeats the LazyMotion split in components/Providers.tsx.",
  }],
}],
```

---

## 1.4 · P1 — `useReveal` is mounted on 12 pages and does nothing

**Where:** `hooks/useReveal.ts:47`.

```ts
const targets = Array.from(root.querySelectorAll<HTMLElement>('.site-reveal'));
if (targets.length === 0) return;
```

`.site-reveal` appears in **zero** `.tsx` files. It exists in `globals.css`
(`5147`, `5154`) and in this hook's own doc comment, and nowhere else. So on
`app/routes/__root.tsx`, `components/rmh-capital/Layout.tsx`,
`components/rmh-pmc/Layout.tsx`, `components/library/*` and the rest of the 12
consumers, the hook runs a `querySelectorAll` across the whole subtree on mount
and returns.

This is the identical failure `hooks/useSpatialParallax.ts` documents in its own
header — "a selector that never matches is a slower `querySelector` and a false
suggestion that the surface exists" — which means the pattern has now recurred
and is worth a gate rather than another one-off fix.

**Fix:** delete `hooks/useReveal.ts`, its 12 call sites, and the
`[data-reveal-armed] .site-reveal` rules at `globals.css:5141-5158`. §1.1
replaces the capability with the CSS path.

**Gate it:** the added-lines scan in `scripts/check-consistency.sh` is the right
home for a check that every class-name string literal passed to
`querySelectorAll` in `hooks/` matches at least one occurrence in
`components/**` or `app/**`.

---

## 1.5 · P1 — 12 chat surfaces force a synchronous reflow per message

**Where:**

```
components/rmhvibe/{ThinkingStream,VibeProgress}.tsx
components/feed/{GroupChatView,PersonaChatColumn}.tsx
components/rmhbox/minigames/{undercover-agent/GameLog,emoji-cinema/GuessLog}.tsx
components/{assistant/ConciergePanel,rideshare/RideChat,spaces/SpaceRoom}.tsx
components/{rmhmusic/ChatPanel,rmhcalculator/ReasoningStream,rmh-farming-sim/ChatBox}.tsx
```

All twelve are variations on:

```tsx
useEffect(() => {
  if (el) el.scrollTop = el.scrollHeight;   // reading scrollHeight = forced layout
}, [messages]);
```

Reading `scrollHeight` inside an effect forces the browser to flush pending
layout **synchronously**, before paint. On a streaming surface —
`ThinkingStream`, `VibeProgress`, `ReasoningStream` all append on every token —
that is a forced reflow per token.

The repo has already solved this properly once. `hooks/useStickToBottom.ts` is
108 lines of exactly the right logic, and its header documents both bugs the
naive version has (measures too late; misses late-loading embeds). It has **2**
consumers, both in `components/rmhtube/`.

**Fix:** adopt `useStickToBottom` in the other twelve. This is a correctness fix
first — the hook's own docs describe the "chat doesn't scroll when images or
GIFs are embedded" report that all twelve still have — and a performance fix
second.

**Where CSS can take over entirely.** For an append-only log with no
scroll-to-read requirement (`ThinkingStream`, `VibeProgress`, `GuessLog`), the
whole hook is replaceable:

```css
.log-stream {
  display: flex;
  flex-direction: column-reverse;   /* newest first in DOM order, rendered bottom-up */
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

`column-reverse` pins a scroller to its bottom edge natively: the browser holds
the scroll anchor at the "start" (visually the bottom), so appended content
stays in view with no JS, no measurement, and no reflow. It requires reversing
the array at render, and it is worth knowing that scroll-position restoration
behaves differently — so use it for logs, not for conversations the user
scrolls back through.

---

## 1.6 · P2 — `AnchoredMenu` does in JS what CSS anchor positioning does natively

**Where:** `components/ui/anchored-menu.tsx` (276 lines) +
`lib/anchored-placement.ts` (86) + `hooks/useMenuViewportFit.ts` (156) +
`lib/viewport-fit.ts` (31) — **549 lines** whose job is: portal to `<body>`,
measure the trigger, pick a side, flip if it doesn't fit, cap the height.

The component's own header states the two reasons it exists. Both are now
platform features:

| `anchored-menu.tsx` says | Platform answer |
| --- | --- |
| "It portals to `<body>`" — to escape `.radial-frame`'s stacking context | `popover` renders in the **top layer**, above every stacking context, with no portal and no `z-index` |
| "It measures before it commits to a side" — flip + height cap | `position-try-fallbacks` flips declaratively; `position-area` + the `anchor-size()` function cap it |

```css
/* trigger */
.anchored-trigger { anchor-name: --menu-anchor; }

@supports (anchor-name: --a) and (position-area: block-end) {
  .anchored-menu {
    position: absolute;              /* top layer via [popover] — no z-index needed */
    position-anchor: --menu-anchor;
    position-area: block-end span-inline-start;
    position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;
    /* The height cap the component computes by hand today, declaratively.
       `.glass-overlay` already declares a `max-block-size` as a last-line
       viewport guard; this file is unlayered, so the tighter cap still wins —
       exactly as anchored-menu.css notes today. */
    max-block-size: var(--anchored-menu-max-h, 60vh);
    margin-block-start: 0.5rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
```

```tsx
<button popoverTarget="user-menu" className="anchored-trigger">…</button>
<div popover="auto" id="user-menu" className="anchored-menu glass-overlay">…</div>
```

`popover="auto"` also brings light-dismiss, Escape handling, and one-open-at-a-time
semantics — more logic the component currently owns.

**Why this is P2 and not P0.** The payoff is code deletion and a
measurement-free open, not per-frame savings: a menu opens once per interaction,
so the JS cost is a one-off layout read, not a sustained tax. It is also the
riskiest change in this document — `useMenuViewportFit` encodes hard-won mobile
keyboard/zoom behaviour (`KEYBOARD_MIN_INSET_PX`, `ZOOM_WIDTH_SLACK_PX`) that
`position-try-fallbacks` does **not** replicate, because the visual viewport is
not the containing block. Keep the fit pass under `@supports not (...)` and for
the on-screen-keyboard case regardless. Do this one behind a real device pass,
after §1.1–§1.5.

---

## 1.7 · P2 — Textarea autosize by forced reflow

**Where:** `components/rmhcalculator/ScientificCalculator.tsx:101-107`, the
clearest instance of a pattern the repo's 54 textarea-bearing components repeat
in various forms.

```tsx
useEffect(() => {
  const el = inputRef.current;
  if (!el) return;
  el.style.height = 'auto';                  // write  → invalidates layout
  el.style.height = `${el.scrollHeight}px`;  // read   → forces synchronous layout
}, [expression]);
```

Write-then-read-then-write is the canonical layout-thrash shape, and it runs on
**every keystroke**.

```css
@supports (field-sizing: content) {
  .autosize-field {
    field-sizing: content;
    min-block-size: 2.5rem;
    max-block-size: 40vh;   /* past this, overflow-y: auto takes over as before */
  }
}
```

One declaration, zero JS, zero forced reflows — the browser sizes the control
during its own layout pass. Keep the effect inside `@supports not
(field-sizing: content)` for older engines rather than deleting it outright.

Apply it in `components/ui/textarea.tsx` so the whole tier inherits it, then
remove the per-component effects.

---

## 1.8 · P3 — ResizeObserver where a container query would do

35 files construct a `ResizeObserver`. Most are legitimate — a canvas needs its
backing-store size in JS, and `components/studio/**`, `lib/*/renderer3d.ts`,
`FeedList.tsx`'s virtualizer all genuinely need a number.

But several observe an element **only to decide a layout**, which means a
resize → JS callback → `setState` → React render → style → layout round trip
where CSS would have done it in the same layout pass it was already running:

- `components/versecraft/DialogueScreen.tsx:207` and
  `GeneratedDialogueScreen.tsx:146` — observing a box's height to feed it back
  into layout.
- `components/radial/WheelCard.tsx:152` — `setClamped(el.scrollHeight - el.clientHeight > 1)`,
  i.e. "did my text overflow". This is a forced reflow to answer a question CSS
  can answer with `line-clamp` plus a `:has()` check, or by simply always
  rendering the affordance and letting `text-overflow` decide.

The repo has **5** `@container` usages in 40,682 lines of CSS, which is the real
signal here: container queries are not yet part of the vocabulary.

```css
.dialogue-shell { container-type: inline-size; container-name: dialogue; }

@container dialogue (inline-size < 32rem) {
  .dialogue-body { --dialogue-columns: 1; }
}
```

Treat this as a standing direction rather than a single change: **when a new
component needs to know its own size to pick a layout, reach for
`container-type` first, and only fall back to `ResizeObserver` when a real
number has to cross into JS.**

---

## 1.9 · P3 — `content-visibility` is used on 3 surfaces and earns its keep on more

`content-visibility: auto` currently covers the feed card (`globals.css:4787`),
the pf2e calendar (`pf2ecal.css:238`) and the roadmap
(`RoadmapSection.tsx:968`) — all three with a correct
`contain-intrinsic-size: auto <h>`, which is the part people get wrong.

The same treatment is unclaimed on the other long, card-shaped, mostly-offscreen
lists: `components/news/NewsList.tsx`, `components/library/LibraryCollections.tsx`,
`components/feed/RelatedPosts.tsx`, and the settings pages. The pattern to copy
verbatim, including the `auto` (not fixed) intrinsic size that lets the browser
remember real heights:

```css
.list-cull {
  content-visibility: auto;
  contain-intrinsic-size: auto 280px;   /* card height + gap */
}
```

Two rules from the existing implementations that must come along, or this
regresses scroll instead of fixing it: the `content-visibility: visible` escape
during scroll-restore (`globals.css:4796`) and the `app/router.tsx:20` note
about the document resizing under a restored scroll position.

---

# Part 2 — Work that should not be in JavaScript at all

## 2.1 · P1 — The beatmap analyser: measured, and the fix is parallelism before it is WASM

**Where:** `lib/slice-it/beatmap/` — 2,915 lines implementing a full MIR
pipeline (STFT → log-band spectrogram → SuperFlux onsets → comb-filter tempo →
Ellis DP beat tracking → charting ×4 difficulties), including a hand-written
radix-2 Cooley–Tukey FFT (`fft.ts`) with a real-input packing optimisation
(`RealFFT`).

**Measured** on this box (Node 22, 4 cores), driving the real `generateBeatmap`
entry point with synthetic 44.1 kHz audio:

| Track length | `computeSpectrogram` (STFT) | Full `generateBeatmap` | STFT share |
| --- | ---: | ---: | ---: |
| 4 min | 552 ms | **795 ms** | 69% |
| 15 min | 1,895 ms | **2,948 ms** | 64% |

The 15-minute case is 77,516 frames × 63 bands.

**First, credit where it is due.** This is not naive code. The twiddle factors
and bit-reversal permutation are precomputed per size, the real-input packing
halves the transform length, the window is applied inside the FFT to avoid a
per-frame copy, and the filterbank is a flat `Float32Array` with an index table.
A WASM port of the *same algorithm* would win maybe **2–4×** — V8 compiles this
kind of monomorphic `Float64Array` loop well, and anyone promising 10× has not
read `fft.ts`.

**So the bigger multiplier is not instruction speed — it is cores.** The STFT
loop in `spectrum.ts:121-135` is embarrassingly parallel: every frame reads a
disjoint window of the input and writes a disjoint row of the output. It is
currently pinned to one thread of one process.

**Recommended shape, in order:**

**(a) Parallelise the STFT across `worker_threads` — no new language.** Split
the frame range N ways over a `SharedArrayBuffer`; each worker owns its own
`RealFFT` instance and writes its own rows. On the production VPS this is a
**4–8×** win on 64–69% of the pipeline for perhaps 80 lines of TypeScript, and
it keeps one implementation serving both the jobs worker and the in-tab
fallback.

```ts
// lib/slice-it/beatmap/spectrum.parallel.ts — sketch
const shared = new SharedArrayBuffer(frames * bands * 4);
const out = new Float32Array(shared);
const chunk = Math.ceil(frames / workerCount);

await Promise.all(
  Array.from({ length: workerCount }, (_, w) =>
    runWorker({ shared, samples, from: w * chunk, to: Math.min(frames, (w + 1) * chunk) }),
  ),
);
```

**(b) Only then consider WASM,** and only for the FFT + filterbank inner loop —
not the orchestration. The reason to prefer WASM over a Go rewrite here is
specific: `beatmap/index.ts` explicitly keeps this pipeline dependency-free so a
tab can generate a chart for legacy songs. A WASM module is **one artifact that
serves both runtimes**; a Go service serves only the server and leaves the
browser fallback on the current JS path, i.e. two implementations of a numerical
pipeline that must agree bit-for-bit or produce different charts. That is the
kind of divergence this repo's own §5.2 rewrite exists to avoid.

**(c) Do not move this to the Go supervisor fleet** despite the fleet existing
and being the obvious-looking home. Same reason as (b), plus: the fleet's six
workers are event-driven and long-lived, while this is a bursty CPU job already
correctly queued through pg-boss (`lib/slice-it/analysis-queue.server.ts`). The
queue is the right abstraction and it is already in place.

**What is already correct and should not be touched:** analysis is queued, not
inline — `app/routes/api/slice-it/songs/upload.ts:457` enqueues after the
commit, and the O3 work moved charting out of the request path entirely. The
3-second figure is worker time, not user-facing latency.

## 2.2 · Other low-level candidates, ranked honestly

| Candidate | Verdict |
| --- | --- |
| `lib/slice-it/beatmap` STFT | **Yes** — §2.1. Measured, parallel, hot. |
| `lib/voice/peaks.ts` waveform peaks | **No** — runs once per recording over a small buffer. |
| `fuse.js` in `CommandPalette` | **No** — the corpus is the site catalog (~50 entries). Below the WASM call overhead. |
| `modern-screenshot` in `EpubReader` | **Maybe, later** — DOM→raster in JS is genuinely slow, but it is user-initiated, once, with a spinner. Measure before acting. |
| `lib/laundry-sort/solver.ts` (1,165 lines) | **No** — a puzzle solver run once per level, not per frame. |
| `lib/synapse-storm/generator.ts` (1,116 lines) | **No** — same shape. Generation is a one-off. |
| Game loops (`lib/altair/engine/**`, `void-breaker`) | **No** — bound by draw calls and GPU fill rate, not by JS arithmetic. See [`3d-performance-audit.md`](3d-performance-audit.md); a WASM rewrite optimises the half that isn't the bottleneck. |
| Image processing | **Already native** — `sharp`, `@napi-rs/canvas`, `@resvg/resvg-js`. |
| Audio decode | **Already WASM** — `@audio/decode` / `wasm-audio-decoders`, externalized in `vite.config.ts`. |

The honest summary of Part 2: **there is exactly one worthwhile WASM candidate
in this codebase, and its first fix isn't WASM.** The repo already reaches for
native code where native code pays (`sharp`, `resvg`, `napi-rs`, the WASM audio
decoders); the remaining JS hot loops are either one-shot or GPU-bound. Adding a
WASM toolchain for anything in the "No" rows would buy build complexity and no
user-visible time.

---

# Part 3 — Build and deploy

## 3.1 · Measured phases

`pnpm build`, warm `node_modules`, 4-core sandbox:

| Phase | Wall | Notes |
| --- | ---: | --- |
| `build-vibe-packages` | **5.2 s** | 16 vendor bundles (drei 4,016 KB, p5 1,456 KB, pixi 967 KB, three 744 KB) |
| `images:variants` | *unmeasurable here* | `sharp` hung — environment, not repo (§3.3) |
| `vite build` | **66 s** | three serial Rolldown passes, below |
| `esbuild` (6 server bundles) | **0.54 s** | |

Inside the 66 s `vite build`, three passes run **serially**:

| Pass | Modules | Time |
| --- | ---: | ---: |
| client | 9,205 | 23.2 s |
| SSR | 5,962 | 24.1 s |
| Nitro server | 11,455 | 12.9 s |

26,622 module transforms total. The client→SSR ordering is a genuine dependency
(SSR needs the client manifest) and is Vite/Nitro's to schedule, not ours — flagged
for awareness, not as an action.

The headline number for planning: **`esbuild` finishes the entire realtime/worker
tier in half a second**, and `vite build` is 99% of the build. Any build-time
effort spent anywhere but the Vite pass is misdirected.

## 3.2 · P2 — `vibe-builder` serializes ahead of `vite-builder` for no reason

**Where:** `Dockerfile:158-200`.

```dockerfile
FROM prisma-generate AS vibe-builder
RUN pnpm run build-vibe-packages          # 5.2 s of bundling

FROM prisma-generate AS vite-builder
COPY public ./public/
COPY --exclude=go-services … . .
COPY --from=vibe-builder /app/public/vibe-packages ./public/vibe-packages   # ← the edge
RUN … vite build                          # the long pole
```

That last `COPY --from` makes BuildKit hold the entire `vite-builder` stage —
the build's critical path — until `vibe-builder` has finished. The comment
explains it: the files "must exist before `vite build` so Nitro folds it into
`.output/public`".

**But nothing in the Vite module graph reads them.** `public/vibe-packages/*.js`
are standalone browser bundles referenced by **string path** at runtime, by
generated vibe pages (`lib/rmhvibe/vibe-packages.ts`, served through
`app/routes/api/vibe/pkg/$file.ts`). Vite's only involvement is copying
`public/` into `.output/public/` verbatim.

**Fix:** drop the edge and copy the bundles straight into the final image
alongside the Vite output, where they end up anyway:

```diff
 FROM prisma-generate AS vite-builder
 COPY public ./public/
 COPY --exclude=go-services … . .
-COPY --from=vibe-builder /app/public/vibe-packages ./public/vibe-packages
 RUN … vite build

 FROM node:24.18.0-alpine AS runner
 COPY --from=vite-builder --chown=app:nodejs /app/.output ./.output
+# Standalone browser bundles — referenced by string path at runtime, never part
+# of the Vite graph. Copied here rather than into vite-builder so vibe-builder
+# runs fully parallel with the build's long pole instead of gating it.
+COPY --from=vibe-builder --chown=app:nodejs /app/public/vibe-packages ./.output/public/vibe-packages
```

`vibe-builder` then runs concurrently with `vite-builder` on the same BuildKit
graph that already parallelises `server-builder` and `go-builder`.

**One thing must move with it.** The Vite stage currently validates
`.output/public/vibe-packages/react.js`. That assertion has to move to the
`runner` stage (or become a `build-vibe-packages.yml` check), or the decoupling
trades a serialization for a silent-breakage risk — which is a bad trade, not a
faster build.

**Expected saving:** the wall-clock of `build-vibe-packages` on a cold cache.
5.2 s here; more on a constrained CI runner bundling 4 MB of drei. Modest, and
worth taking because it is a two-line change with no runtime surface.

## 3.3 · `images:variants` — read the code, not the stopwatch

Could not be measured (`sharp` hung at 0% CPU under this environment's Node 22).
From `scripts/gen-image-variants.ts`, two things are already right and worth
recording so nobody "optimises" them away:

- It is **idempotent** — "a variant whose file is newer than its source is left
  alone, so re-runs in a warm Docker layer cost nothing." So this phase is only
  ever cold-cache cost.
- The manifest (`lib/images/variants.gen.ts`) is committed while the variants
  are gitignored, which is what keeps `OptimizedImage` from ever emitting a
  `srcSet` that 404s.

The one improvement available: the resize loop is sequential over 88 masters,
and `sharp` releases the event loop into libvips' own thread pool. Mapping the
per-image work over a small `Promise.all` pool (`os.availableParallelism()`)
would use the cores the runner already has. Low priority — it only pays on a
cold layer — but it is the same *shape* as §2.1, and worth doing for the same
reason.

## 3.4 · CI is already parallel; leave it alone

`web-ci.yml` runs `typecheck` / `test` / `build` / `audit` as four independent
jobs, which is what [`build-deploy-audit-2026-08-08.md`](build-deploy-audit-2026-08-08.md)
§4 changed it to. The Dockerfile already parallelises `server-builder`,
`vibe-builder` (modulo §3.2) and `go-builder` against the Vite stage. The GHCR
cache export is conditional. There is no remaining structural serialization in
the pipeline other than §3.2.

**Do not** re-litigate `output.codeSplitting.minSize` — `vite.config.ts:169-192`
records it as measured and rejected, with numbers.

---

# Part 4 — Execution order

Sequenced so each step is independently shippable and the risky ones come last.

| Step | Change | Effort | Risk | Payoff |
| --- | --- | --- | --- | --- |
| 1 | §1.3 — `m as motion` in 15 files + the eslint rule | 1 h | none | bundle, every route |
| 2 | §1.4 — delete `useReveal` / `.site-reveal` | 1 h | none | dead work on 12 pages |
| 3 | §1.1 — `Reveal` → `.u-reveal`, feed columns first | 1 d | low | **main-thread, feed scroll** |
| 4 | §1.2 — `AnimatedCount` → `@property` in the feed pill | 0.5 d | low | 17 renders → 1 |
| 5 | §3.2 — un-serialize `vibe-builder` | 30 m | low | cold deploy |
| 6 | §1.5 — adopt `useStickToBottom` in 12 surfaces | 1 d | low | correctness + reflow |
| 7 | §1.7 — `field-sizing` in `components/ui/textarea.tsx` | 0.5 d | low | per-keystroke reflow |
| 8 | §2.1(a) — parallelise the STFT over `worker_threads` | 2 d | medium | 4–8× on 65% of the pipeline |
| 9 | §1.9 / §1.8 — `content-visibility` + container queries | ongoing | low | scroll on long lists |
| 10 | §1.6 — `AnchoredMenu` → anchor positioning | 3 d | **high** | −549 lines |
| 11 | §2.1(b) — WASM the FFT inner loop | 3 d | medium | 2–4× on what's left |

Steps 1–5 are roughly a week and carry essentially all of the runtime win.

**Every one of these is a UI commit**, so `docs/design-language.md` §0 and
`docs/page-consistency.md` apply, and `pnpm check:consistency` gates each. Two
gate interactions to expect specifically:

- The CSS added in §1.1/§1.2/§1.7 must go through the real tokens — the snippets
  above use `--site-transition-speed`, `--ease-glass`, `--site-reveal-distance`
  and `--site-reveal-ease`, all of which exist in `globals.css` today. A
  hardcoded radius or a raw palette colour fails the added-lines scan. (Note
  there is no `--site-space-*` scale — spacing is Tailwind utilities plus
  `--site-page-gutter` / `--site-section-gap`.)
- §1.1 and §1.6 both touch motion behaviour, so the three themes and the
  `reduce-motion` / `perf-lite` paths need a real look. `@supports` guards are
  mandatory, matching how `globals.css:5570` already writes them.

---

## Appendix — checked and found already correct

Recorded so the next audit does not spend time here:

- **Scroll-driven CSS exists and is written correctly** — `globals.css:5570`,
  `5599`, `5620` and `radial.css:2073` all use `@supports (animation-timeline: …)`
  with reduced-motion fallbacks. The problem is adoption (§1.1), not quality.
- **`content-visibility` is used correctly where used** — `contain-intrinsic-size:
  auto <h>`, not a fixed height, plus a scroll-restore escape.
- **`lib/perf-tier.ts`** — the `perf-lite` tier is capability-read, applied once,
  and deliberately excludes iPhones with a documented reason. Correct.
- **`hooks/useLiquidBackground.ts`** — pointer reactivity already removed;
  writes to `.site-aurora`, not `<html>`, with the inheritance cost documented.
- **`components/ui/RelativeTime.tsx`** — one shared ticker for all instances,
  hydration-safe via `useSyncExternalStore`. Textbook.
- **`manualChunks`** — React pinned, everything else left to rolldown, with the
  reasoning for why force-chunking made things worse (`vite.config.ts:143-167`).
- **Native code where it pays** — `sharp`, `@napi-rs/canvas`, `@resvg/resvg-js`,
  and WASM audio decoders are all already in place and externalized correctly.
- **`esbuild` server bundles** — 0.54 s for six services. Nothing to win.

# Slice It — the chart editor

A full design for the beatmap editor referenced as `C1` in
[`plans/2026-08-06-slice-it-feature-ideas.md`](./plans/2026-08-06-slice-it-feature-ideas.md).

Today every chart in Slice It is generated and never edited. The analyser is
good — SuperFlux onsets, comb-filtered tempo, Ellis DP beat tracking, nested
density budgets (see [`slice-it.md`](./slice-it.md)) — and it is still a
machine guessing at a song. The editor is the surface where a human corrects
that guess, and it is the single change that turns the game from a toy into a
platform: `C2` (multiple charts per song), `L4` (follow uploaders), `L6` (the
uploader dashboard) and `R10` (a ranked pool) all presuppose charts have
authors.

**This document is written to be implemented from.** Every section carries the
actual types, the actual component signatures and the actual SQL. Adapt paths;
do not paste blindly.

---

## §0 — Design constraints

Five things constrain every decision below. They are not negotiable.

1. **Generated charts must never be destroyed by editing.** `Song.analysisData`
   stays exactly what it is: the generated fallback. Hand edits live in a new
   `Chart` row. A regeneration (`C8`) can then always run without asking whether
   it is about to overwrite three hours of someone's work.
2. **Nested difficulties are an invariant, not a convention.** `slice-it.md` is
   explicit: "A pattern learned on Normal is still there on Hard with more
   between the notes." Easy ⊆ Normal ⊆ Hard ⊆ Expert. The editor **enforces**
   this, because a human editing four independent lists will break it within
   ten minutes and never notice.
3. **The editor is a client of the same engine the game uses.** Playtest is
   `GameEngine` on the edited chart, not a second simulation. Two renderers
   that disagree about where a note is means the editor is lying.
4. **Neumorphism is the game's identity.** Slice It uses the scoped
   `--slice-*` palette and the `.neumorphic` / `.neumorphic-inset` shadow
   pair, not the site's `--site-*` glass tokens. The editor is inside that
   world. §12 is the full specification.
5. **The timeline is a canvas, not DOM.** A four-minute Expert chart is
   ~1200 notes. As `<div>`s that is a layout catastrophe; the game already
   proved the canvas path works and the 07-30 audit already tuned it
   (`canvasGlowEnabled()`, hoisted `getComputedStyle`).

---

## §1 — Data model

### 1.1 The `Chart` model

```prisma
/// A playable chart. One row per (song, difficulty, key count, author).
///
/// `Song.analysisData` remains the generated fallback and is NOT migrated into
/// this table — a song with no Chart row plays exactly as it does today. That
/// keeps the editor additive: nothing breaks for the ~all songs that never get
/// hand-edited, and regeneration (C8) can overwrite `analysisData` freely
/// because no human work is in it.
model Chart {
  /// UUIDv7 — append-heavy, and the repo's new-table policy wants a
  /// time-sortable PK rather than cuid() (see lib/CLAUDE.md §Database).
  id String @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid

  songId String
  song   Song   @relation(fields: [songId], references: [id], onDelete: Cascade)

  authorId String
  author   User   @relation("ChartAuthor", fields: [authorId], references: [id])

  difficulty String @db.VarChar(16) // 'easy' | 'normal' | 'hard' | 'expert'
  /// 2 today. G2 (4K/6K) is the reason this is a column and not an assumption.
  keys       Int    @default(2)

  /// Display name — "Expert", but also "Expert (Vocal)" for an alternate take.
  name String @db.VarChar(64)

  /// The note list. Shape is `Slice[]`, NOT the `Record<Difficulty, Slice[]>`
  /// that `analysisData` uses: one row is one difficulty, so the record wrapper
  /// would be a single-key object on every row.
  notes Json

  /// Timing points (C6) and scroll-velocity points (G10). Null falls back to
  /// the song's single `bpm`, which is what every generated chart uses today.
  timingPoints Json?
  svPoints     Json?

  /// SHA-256 over the canonicalised note list — C12. Leaderboard rows carry it
  /// so a chart edit is visible as a chart edit rather than as everyone's
  /// scores silently becoming incomparable.
  chartHash String @db.Char(64)

  /// Computed difficulty rating (C3). Null until the rater has run.
  rating Float?

  /// 'draft' → only the author can see or play it.
  /// 'public' → in the library, own leaderboard.
  /// 'ranked' → contributes to global rating (R10).
  status String @db.VarChar(16) @default("draft")

  /// True when this row was seeded from the generator and has not been edited
  /// since. Drives the "Auto" badge and lets C8 regenerate it in place.
  isGenerated Boolean @default(true)

  /// BEATMAP_VERSION the seed came from, so C8 can find stale generated rows.
  generatorVersion Int?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  revisions ChartRevision[]
  scores    SongLeaderboard[]

  @@unique([songId, authorId, difficulty, keys, name])
  @@index([songId, status])
  @@index([authorId, updatedAt(sort: Desc)])
}

/// Autosave + undo across sessions + a restore path. Append-only.
///
/// Bounded by a trigger-free sweep in the jobs worker rather than by a count
/// check on write: keeping the last 50 per chart means the sweep is one
/// DELETE ... WHERE id NOT IN (...) per chart per day, not a read-modify-write
/// on the hot path of every autosave.
model ChartRevision {
  id      BigInt @id @default(autoincrement())
  chartId String @db.Uuid
  chart   Chart  @relation(fields: [chartId], references: [id], onDelete: Cascade)

  /// Full note list. Charts are small (a 1200-note Expert is ~90 KB of JSON,
  /// ~12 KB gzipped); a diff format would be a correctness liability for a
  /// space saving nobody needs at this scale.
  notes Json

  /// 'autosave' | 'manual' | 'publish'
  kind      String   @db.VarChar(16)
  label     String?  @db.VarChar(120)
  createdAt DateTime @default(now())

  @@index([chartId, createdAt(sort: Desc)])
}
```

`SongLeaderboard` gains the chart pointer that `R1` needs:

```prisma
model SongLeaderboard {
  // ... existing fields ...

  /// Null for rows set on the generated `analysisData` chart before the editor
  /// existed. Nullable rather than backfilled: those runs genuinely were on a
  /// chart with no id, and inventing one would be a lie the board carries.
  chartId   String? @db.Uuid
  chart     Chart?  @relation(fields: [chartId], references: [id], onDelete: SetNull)

  /// C12. Set even when chartId is null (hash the generated chart), so an
  /// edit that changes the notes is detectable on legacy rows too.
  chartHash String? @db.Char(64)

  /// R1: the board splits on these, so a `normal` PB stops overwriting an
  /// `expert` record.
  difficulty String @db.VarChar(16) @default("normal")
  modPool    String @db.VarChar(16) @default("standard")

  @@unique([chartId, difficulty, modPool, userId], name: "chart_diff_pool_user")
}
```

### 1.2 The editor's own types

These are **client-side only** — they never cross the wire. The wire shape is
`Slice[]`, unchanged from `lib/slice-it/types.ts`.

```ts
// lib/slice-it/editor/types.ts

import type { Slice, Difficulty, SliceType } from '@/lib/slice-it/types';

/** A note plus the editor state that is never persisted. */
export interface EditorNote extends Slice {
  /** Selection state. Kept on the note rather than in a Set so the renderer
   *  needs one pass, not a pass plus N lookups. */
  selected?: boolean;
  /** True when this note came from the generator and has not been touched.
   *  Drives the "auto" tint (§7.3) so an author can see what they have and
   *  have not reviewed. */
  auto?: boolean;
  /** Set by the linter (§9). Rendered as a warning ring. */
  issues?: LintIssue[];
}

export interface LintIssue {
  code:
    | 'unhittable-jack' // same lane faster than INPUT_COOLDOWN_MS
    | 'too-early' // inside the first 2s, before the player can react
    | 'hold-too-short' // shorter than its own release window
    | 'density-spike' // above the tier's readable ceiling
    | 'empty-stretch' // >8s with nothing
    | 'off-grid' // not near any subdivision of the beat
    | 'nesting-violation'; // present at a lower tier but not a higher one
  severity: 'error' | 'warning';
  message: string;
}

/** One difficulty's editable state. */
export interface EditorChart {
  difficulty: Difficulty;
  keys: number;
  name: string;
  notes: EditorNote[];
  /** Set when the in-memory notes differ from what was last saved. */
  dirty: boolean;
  /** Null until the rater runs (C3). */
  rating: number | null;
}

export type SnapDivision = 1 | 2 | 3 | 4 | 6 | 8 | 12 | 16 | 24 | 32;

export type EditorTool =
  | 'select' // box select, drag, the default
  | 'place' // click to add a note of `placeType`
  | 'erase' // click/drag to remove
  | 'hold' // drag to author a LONG note
  | 'timing'; // edit timing points / SV points
```

---

## §2 — Routes and file layout

```
app/routes/slice-it/edit.$songId.tsx          Editor shell (full-screen, no _site)
app/routes/api/slice-it/charts.ts             GET list / POST create
app/routes/api/slice-it/charts/$id.ts         GET / PATCH / DELETE one chart
app/routes/api/slice-it/charts/$id/publish.ts POST — draft → public
app/routes/api/slice-it/charts/$id/revisions.ts GET history / POST restore
app/routes/api/slice-it/charts/$id/generate.ts  POST — the auto modes (§8)

components/slice-it/editor/
  ChartEditor.tsx        Shell: layout, keyboard bus, autosave loop
  Timeline.tsx           The canvas. §4.
  TimelineRuler.tsx      Bars/beats/time, section markers
  Waveform.tsx           Waveform + onset overlay canvas. §6.
  Toolbar.tsx            Tools, snap, playback rate, zoom
  DifficultyTabs.tsx     Four tabs + nesting indicator. §7.
  NoteInspector.tsx      Selected-note properties
  AutoPanel.tsx          The generate modes. §8.
  LintPanel.tsx          Issues list, click to jump. §9.
  ShortcutSheet.tsx      The `?` overlay
  MinimapStrip.tsx       Whole-song density strip

lib/slice-it/editor/
  types.ts               Above
  store.ts               Zustand + the command stack. §3.
  commands.ts            Every mutation as an undoable command. §5.
  snap.ts                Beat grid ↔ time. §5.4
  nesting.ts             The subset invariant. §7.2
  lint.ts                Shared with C11's upload-time linter. §9.
  hash.ts                Canonical chart hash (C12).
```

The route is **top-level, not under `_site/`** — same as `/slice-it` itself.
Per the repo's routing convention, pages under `_site/` get the radial shell;
full-screen surfaces are top-level and intentional.

```tsx
// app/routes/slice-it/edit.$songId.tsx
import { createFileRoute, redirect } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import sliceItCss from '@/components/slice-it/slice-it.css?url';

const ChartEditor = lazy(() =>
  import('@/components/slice-it/editor/ChartEditor').then((m) => ({ default: m.ChartEditor })),
);

export const Route = createFileRoute('/slice-it/edit/$songId')({
  head: () => ({ links: [{ rel: 'stylesheet', href: sliceItCss }] }),
  // The editor is ~180 KB of canvas code nobody browsing the site needs. It is
  // lazy for the same reason `/discord/*` keeps the Discord SDK out of the
  // shared entry chunk (see lib/discord-activity.ts).
  component: EditorPage,
});

function EditorPage() {
  const { songId } = Route.useParams();
  return (
    <div className="slice-theme min-h-dvh">
      <Suspense fallback={<EditorSkeleton />}>
        <ChartEditor songId={songId} />
      </Suspense>
    </div>
  );
}
```

---

## §3 — Editor state

One store, separate from `useSliceItStore` — the game store persists settings
and holds run state, and mixing an undo stack into it would put a 50-entry
command history behind the same `partialize` that writes keybinds to disk.

```ts
// lib/slice-it/editor/store.ts
'use client';

import { create } from 'zustand';
import type { Difficulty } from '@/lib/slice-it/types';
import type { EditorChart, EditorNote, EditorTool, SnapDivision } from './types';
import type { Command } from './commands';

interface EditorState {
  /* ── Document ─────────────────────────────────────────────────────── */
  songId: string;
  chartId: string | null;
  /** All four difficulties, always. The nesting invariant (§7.2) is a
   *  cross-difficulty property, so the editor cannot hold one at a time. */
  charts: Record<Difficulty, EditorChart>;
  active: Difficulty;

  /* ── View ─────────────────────────────────────────────────────────── */
  /** Seconds at the playhead. The single source of truth for scroll — the
   *  timeline derives its window from this, never the other way round. */
  playhead: number;
  /** Pixels per second. Zoom. */
  zoom: number;
  playing: boolean;
  playbackRate: number;
  /** Loop markers for A/B practice inside the editor (P1's mechanism). */
  loop: { start: number; end: number } | null;

  /* ── Tools ────────────────────────────────────────────────────────── */
  tool: EditorTool;
  snap: SnapDivision;
  /** Off lets you place a note anywhere. On by default: off-grid notes are
   *  the single most common way a hand-edited chart stops feeling like the
   *  song, and the generator drops them for exactly that reason. */
  snapEnabled: boolean;
  placeType: EditorNote['type'];

  /* ── History ──────────────────────────────────────────────────────── */
  undoStack: Command[];
  redoStack: Command[];
  /** Bumped on every mutation. The autosave loop watches this rather than
   *  deep-comparing the note list every tick. */
  revision: number;
  lastSavedRevision: number;

  /* ── Actions ──────────────────────────────────────────────────────── */
  apply: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  setActive: (difficulty: Difficulty) => void;
  setPlayhead: (seconds: number) => void;
  // … setters for the view/tool fields
}

const HISTORY_LIMIT = 200;

export const useEditorStore = create<EditorState>()((set, get) => ({
  // … initial values

  /**
   * Every mutation goes through here. Nothing sets `charts` directly.
   *
   * That is the whole reason undo works: a command knows how to invert itself,
   * so the stack holds intentions rather than snapshots. Snapshotting 1200
   * notes on every note placement would be 90 KB per keystroke.
   */
  apply: (command) =>
    set((state) => {
      const charts = command.apply(state.charts);
      return {
        charts,
        undoStack: [...state.undoStack, command].slice(-HISTORY_LIMIT),
        redoStack: [],
        revision: state.revision + 1,
      };
    }),

  undo: () =>
    set((state) => {
      const command = state.undoStack.at(-1);
      if (!command) return state;
      return {
        charts: command.invert(state.charts),
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, command],
        revision: state.revision + 1,
      };
    }),

  redo: () =>
    set((state) => {
      const command = state.redoStack.at(-1);
      if (!command) return state;
      return {
        charts: command.apply(state.charts),
        undoStack: [...state.undoStack, command],
        redoStack: state.redoStack.slice(0, -1),
        revision: state.revision + 1,
      };
    }),
}));

/** Non-reactive read, matching `sliceItState()` in the game store. */
export const editorState = () => useEditorStore.getState();
```

### 3.1 Autosave

```ts
// components/slice-it/editor/ChartEditor.tsx (excerpt)

/**
 * Autosave on a timer, not on every change.
 *
 * Saving per mutation means a PATCH per note placement — a 200-note editing
 * session is 200 round trips, and a dropped one mid-drag leaves the server
 * holding half a gesture. The timer batches to a consistent document.
 */
useEffect(() => {
  const timer = setInterval(() => {
    const { revision, lastSavedRevision } = editorState();
    if (revision === lastSavedRevision) return;
    void saveChart({ kind: 'autosave' });
  }, 20_000);
  return () => clearInterval(timer);
}, []);

// And on the way out, because a closed tab is the common case, not the rare one.
useEffect(() => {
  const onHide = () => {
    const { revision, lastSavedRevision } = editorState();
    if (revision !== lastSavedRevision) {
      // `keepalive` survives the unload; a normal fetch does not.
      navigator.sendBeacon?.(`/api/slice-it/charts/${chartId}/autosave`, serialise());
    }
  };
  document.addEventListener('visibilitychange', onHide);
  return () => document.removeEventListener('visibilitychange', onHide);
}, [chartId]);
```

---

## §4 — The timeline

A vertical scrolling canvas: time runs bottom (now) to top (later), matching
the game's own note approach so an author reads the editor the way they read
the playfield.

### 4.1 Rendering

```tsx
// components/slice-it/editor/Timeline.tsx (excerpt)

/**
 * Canvas, for the same reason `GameCanvas.tsx` is: an Expert chart is ~1200
 * notes and a DOM node per note is a layout pass per frame.
 *
 * Theme colours are resolved once per theme change, NOT per frame —
 * `getComputedStyle()` flushes pending style and layout, and the 07-30
 * performance audit removed exactly this pattern from the game's draw loop
 * (1 + N forced recalcs per frame). Same mistake, same fix.
 */
function draw(ctx: CanvasRenderingContext2D, view: ViewWindow, theme: EditorTheme) {
  const { startTime, endTime, height, width } = view;
  ctx.clearRect(0, 0, width, height);

  // Bottom-to-top: t=startTime at the bottom edge.
  const y = (t: number) => height - ((t - startTime) / (endTime - startTime)) * height;

  drawBeatGrid(ctx, view, theme, y); // §4.2
  drawSections(ctx, view, theme, y); // C5 boundaries, if present
  drawNotes(ctx, view, theme, y); // §4.3
  drawSelectionBox(ctx, view, theme);
  drawPlayhead(ctx, view, theme);
  drawHitHighlights(ctx, view, theme); // §4.4 — the playtest overlay
}
```

### 4.2 The beat grid

The grid is drawn from the timing map (`C6`), falling back to the song's single
BPM when a chart has no timing points — which is every generated chart today.

```ts
// lib/slice-it/editor/snap.ts

import type { TimingPoint } from '@/lib/slice-it/types';

/** Beat number at a time, across tempo changes. */
export function beatAt(time: number, points: TimingPoint[]): number {
  if (points.length === 0) return 0;
  let beats = 0;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const next = points[i + 1];
    if (next && next.time <= time) {
      beats += ((next.time - point.time) * point.bpm) / 60;
      continue;
    }
    return beats + ((time - point.time) * point.bpm) / 60;
  }
  return beats;
}

/** Inverse: the time of a (possibly fractional) beat. */
export function timeAtBeat(beat: number, points: TimingPoint[]): number {
  /* … */
}

/**
 * Snap a time to the nearest subdivision.
 *
 * The generator quantises to `{0, ¼, ⅓, ½, ⅔, ¾}` of a beat and DROPS anything
 * further than 55 ms (or 18% of a beat) from every subdivision, because those
 * are reverb tails and vocal consonants. The editor offers finer divisions than
 * the generator uses, because a human placing a 1/16 roll deliberately is not
 * the same thing as an onset detector firing on a reverb tail.
 */
export function snapTime(time: number, division: SnapDivision, points: TimingPoint[]): number {
  const beat = beatAt(time, points);
  const snappedBeat = Math.round(beat * division) / division;
  return timeAtBeat(snappedBeat, points);
}

/** Grid line colour by metric weight — downbeat > beat > subdivision. */
export function gridWeight(beat: number, meter = 4): 'measure' | 'beat' | 'sub' {
  const epsilon = 1e-6;
  if (Math.abs(beat % meter) < epsilon) return 'measure';
  if (Math.abs(beat % 1) < epsilon) return 'beat';
  return 'sub';
}
```

### 4.3 Note rendering, and quantisation colour

This is where `G8` lands. The charter computes each note's snapped subdivision
and currently throws it away; the editor needs it, so persisting it pays for
itself twice.

```ts
// components/slice-it/editor/Timeline.tsx (excerpt)

/**
 * Quantisation colouring — the genre standard (StepMania note colours), and the
 * single change that makes a dense chart readable at a glance.
 *
 * Derived from the note's position on the beat grid rather than stored, so it
 * stays correct when a timing point moves under it.
 */
const QUANT_COLORS: Record<number, string> = {
  1: '#ef4444', // quarter  — red
  2: '#3b82f6', // eighth   — blue
  3: '#a855f7', // triplet  — purple
  4: '#eab308', // sixteenth— yellow
  6: '#ec4899', // 1/24
  8: '#f97316', // 1/32
};

function quantOf(note: EditorNote, points: TimingPoint[]): number {
  const beat = beatAt(note.time, points);
  for (const division of [1, 2, 3, 4, 6, 8] as const) {
    if (Math.abs(beat * division - Math.round(beat * division)) < 0.02) return division;
  }
  return 16; // off-grid: rendered grey with an `off-grid` lint issue
}

function drawNotes(ctx, view, theme, y) {
  for (const note of visibleNotes(view)) {
    const cx = laneCenterX(note.lane, view);
    const cy = y(note.time);

    // LONG notes draw their tail first so the head sits on top of it.
    if (note.type === 'LONG' && note.duration) {
      ctx.fillStyle = theme.holdTrail;
      ctx.fillRect(cx - 14, y(note.time + note.duration), 28, cy - y(note.time + note.duration));
    }

    // The neumorphic note: a soft raised pill. Two shadows, light and dark,
    // exactly as `.neumorphic` does in CSS — see §12.
    ctx.save();
    ctx.shadowColor = theme.shadowDark;
    ctx.shadowBlur = theme.glow ? 8 : 0; // canvasGlowEnabled() tier
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = QUANT_COLORS[quantOf(note, view.timingPoints)] ?? theme.textMuted;
    roundRect(ctx, cx - 18, cy - 7, 36, 14, 7);
    ctx.fill();
    ctx.restore();

    // Generated-and-untouched notes are tinted back, so an author can see at a
    // glance what they have reviewed and what the machine still owns. This is
    // what makes the "auto" modes in §8 legible.
    if (note.auto) {
      ctx.globalAlpha = 0.55;
      /* redraw fill flat */
      ctx.globalAlpha = 1;
    }

    if (note.selected) drawSelectionRing(ctx, cx, cy, theme);
    if (note.issues?.length) drawIssueRing(ctx, cx, cy, note.issues, theme);
  }
}
```

### 4.4 Hit highlights

Two distinct things wear this name, and the editor wants both.

**(a) Live playtest hits.** While playtesting, the note that was just resolved
flashes with its judgement colour and the judgement text rises off it — the
editor's version of what `pushFeedback` does in game. This is what tells an
author "that note is unhittable" without leaving the editor.

```ts
/**
 * Playtest hit overlay.
 *
 * The engine already records `hit` and `hitTime` on a resolved slice —
 * `types.ts` documents them as "runtime render state, never stored" — so the
 * editor reads the same fields the game's own fade-out uses rather than
 * inventing a parallel channel.
 */
function drawHitHighlights(ctx, view, theme) {
  const now = performance.now();
  for (const note of view.notes) {
    if (!note.hit || !note.hitTime) continue;
    const age = (now - note.hitTime) / 1000;
    if (age > HIT_FLASH_SEC) continue;

    const alpha = 1 - age / HIT_FLASH_SEC;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = JUDGEMENT_COLORS[note.judgement ?? 'MISS'];
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(laneCenterX(note.lane, view), yOf(note.time), 16 + age * 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

const JUDGEMENT_COLORS = {
  MARVELOUS: '#22d3ee',
  PERFECT: '#3b82f6',
  GREAT: '#22c55e',
  GOOD: '#eab308',
  BAD: '#f97316',
  MISS: '#ef4444',
} as const;
```

**(b) Aggregate hit heatmap.** Once `O1` exists, a published chart carries
per-note miss rates from real players. The editor renders them as a heat tint
behind the note — an author opening their chart sees immediately which bar
everyone fails, which is information nothing in the game currently surfaces.

```ts
/** Miss-rate tint. Only present for published charts with play data. */
function drawMissHeat(ctx, note, missRate: number, y: number) {
  if (missRate < 0.15) return; // below this it is noise, not signal
  ctx.fillStyle = `rgba(239, 68, 68, ${Math.min(0.55, missRate)})`;
  ctx.beginPath();
  ctx.arc(laneCenterX(note.lane), y, 26, 0, Math.PI * 2);
  ctx.fill();
}
```

**(c) Hover and proximity highlight.** The note under the cursor lifts (a
larger neumorphic shadow, matching how `.neumorphic` reads as raised), and
every note at the same timestamp in another lane highlights with it — so an
author editing one half of a chord can see the other half.

---

## §5 — Editing operations

### 5.1 The command pattern

```ts
// lib/slice-it/editor/commands.ts

import type { Difficulty } from '@/lib/slice-it/types';
import type { EditorChart, EditorNote } from './types';

type Charts = Record<Difficulty, EditorChart>;

/**
 * Every mutation is a Command with an inverse.
 *
 * The alternative — snapshotting the whole note list per edit — is 90 KB per
 * keystroke on an Expert chart and makes a 200-step history 18 MB of live
 * objects. Commands hold the delta, which for the common case (place one note)
 * is one object.
 */
export interface Command {
  readonly label: string;
  apply(charts: Charts): Charts;
  invert(charts: Charts): Charts;
  /** Optional: merge with the previous command so a 40-frame drag is ONE undo
   *  step rather than forty. */
  mergeWith?(previous: Command): Command | null;
}

export function placeNote(difficulty: Difficulty, note: EditorNote): Command {
  return {
    label: 'Place note',
    apply: (charts) => withNotes(charts, difficulty, (notes) => insertSorted(notes, note)),
    invert: (charts) =>
      withNotes(charts, difficulty, (notes) => notes.filter((n) => n.id !== note.id)),
  };
}

export function deleteNotes(difficulty: Difficulty, removed: EditorNote[]): Command {
  const ids = new Set(removed.map((n) => n.id));
  return {
    label: removed.length === 1 ? 'Delete note' : `Delete ${removed.length} notes`,
    apply: (charts) =>
      withNotes(charts, difficulty, (notes) => notes.filter((n) => !ids.has(n.id))),
    invert: (charts) =>
      withNotes(charts, difficulty, (notes) => removed.reduce(insertSorted, notes.slice())),
  };
}

export function moveNotes(
  difficulty: Difficulty,
  ids: string[],
  deltaTime: number,
  deltaLane: number,
): Command {
  const shift = (sign: number) => (charts: Charts) =>
    withNotes(charts, difficulty, (notes) =>
      sortByTime(
        notes.map((n) =>
          ids.includes(n.id)
            ? {
                ...n,
                time: n.time + sign * deltaTime,
                lane: n.lane + sign * deltaLane,
                auto: false,
              }
            : n,
        ),
      ),
    );

  return {
    label: 'Move notes',
    apply: shift(1),
    invert: shift(-1),
    /** A drag emits one of these per pointermove. Merging collapses them so
     *  Ctrl+Z undoes the gesture, not the last frame of it. */
    mergeWith(previous) {
      if (previous.label !== 'Move notes') return null;
      const p = previous as ReturnType<typeof moveNotes> & { _ids?: string[] };
      if (JSON.stringify(p._ids) !== JSON.stringify(ids)) return null;
      return moveNotes(difficulty, ids, deltaTime + (p as any)._dt, deltaLane + (p as any)._dl);
    },
  };
}

/** Notes are kept time-sorted at all times — the renderer binary-searches the
 *  visible window and the engine assumes ordering. */
function insertSorted(notes: EditorNote[], note: EditorNote): EditorNote[] {
  const index = lowerBound(notes, note.time);
  return [...notes.slice(0, index), note, ...notes.slice(index)];
}
```

### 5.2 The operation set

Everything a chart editor is expected to have. Each maps to a `Command`.

| Operation             | Binding                   | Notes                                                     |
| --------------------- | ------------------------- | --------------------------------------------------------- |
| Place note            | Click (place tool)        | Snapped unless `snapEnabled` is off                       |
| Place hold            | Drag (hold tool)          | Head at press, tail at release, both snapped              |
| Delete                | `Del` / right-click       | Multi-select aware                                        |
| Select                | Click                     | `Shift` extends, `Ctrl` toggles                           |
| Box select            | Drag (select tool)        | Time × lane rectangle                                     |
| Select all in section | `Ctrl+A` twice            | First press = visible window, second = whole chart        |
| Move                  | Drag / arrows             | `↑↓` = one snap unit, `←→` = lane                         |
| Nudge (unsnapped)     | `Alt+↑↓`                  | 1 ms, for fixing a note the grid disagrees with           |
| Copy / cut / paste    | `Ctrl+C/X/V`              | Paste lands at the playhead, preserving relative timing   |
| Paste mirrored        | `Ctrl+Shift+V`            | Lane-flipped — `M1`'s transform, as an editing tool       |
| Duplicate             | `Ctrl+D`                  | Copy + paste one measure later                            |
| Mirror selection      | `H`                       | In place                                                  |
| Change type           | `1`–`7`                   | STANDARD / MOVING / LONG / SILENT / SPEED / BOMB / SWITCH |
| Quantise selection    | `Q`                       | Snap existing notes to the current division               |
| Scale timing          | `Ctrl+Shift+S`            | Stretch a selection's spacing — for a mis-tracked tempo   |
| Insert / remove time  | `Ctrl+I` / `Ctrl+Shift+I` | Shift everything after the playhead                       |
| Undo / redo           | `Ctrl+Z` / `Ctrl+Y`       | 200 deep, drags merged                                    |

### 5.3 Multi-note selection and the lane constraint

```ts
/**
 * Lane moves clamp rather than wrap.
 *
 * Wrapping would mean dragging a 2-lane selection left off the edge silently
 * turns lane 0 into lane 1 — a chord becomes a jack and the author does not
 * see it happen. Clamping makes the edge feel like an edge.
 */
function clampLane(lane: number, keys: number): number {
  return Math.max(0, Math.min(keys - 1, lane));
}
```

---

## §6 — Waveform, onsets and structure

The analyser already computes everything this panel needs and discards it. The
editor is the reason to keep it.

```ts
// lib/slice-it/beatmap/index.ts — additions to the analysis result

export interface AnalysisArtefacts {
  /** Peak envelope for the waveform, ~200 samples/second. ~48 KB for a
   *  4-minute track; small enough to persist with the chart, which is what
   *  makes the editor open instantly instead of re-decoding the audio. */
  envelope: Float32Array;
  /** Detected onsets with strength, BEFORE the 55 ms quantisation filter drops
   *  them. The dropped ones are exactly what a human editor wants to see: they
   *  are the notes the generator considered and rejected. */
  onsets: { time: number; strength: number; kept: boolean }[];
  /** Section boundaries — C5. */
  sections: { start: number; end: number; label: string; energy: number }[];
}
```

Rendered as three stacked strips beside the timeline:

```
┌──────────┬─────────────────────────────┬──────────┐
│ waveform │        note timeline        │  onsets  │
│ envelope │  (the editable surface)     │  ghosts  │
└──────────┴─────────────────────────────┴──────────┘
```

**Onset ghosts** are the highest-value part. Every detected onset the generator
did _not_ chart renders as a faint outline at its time and estimated lane.
Clicking one promotes it to a real note. This turns "the generator missed the
snare on the second bar" from a manual placement into one click, and it is only
possible because the analyser's rejected candidates are kept.

```tsx
/** Click a ghost to promote it. The most-used interaction in the editor. */
function onGhostClick(onset: DetectedOnset) {
  editorState().apply(
    placeNote(active, {
      id: crypto.randomUUID(),
      time: onset.time,
      lane: suggestLane(onset), // reuses the charter's frequency-band logic
      type: 'STANDARD',
      auto: false,
    }),
  );
}
```

---

## §7 — Difficulties

### 7.1 The tab strip

Four tabs, always visible, each showing its note count, computed rating (`C3`)
and a dot when it has unsaved changes.

**Do not hand-roll the tab strip.** `lib/__tests__/design-consistency.test.ts`
fails the build on hand-rolled tab strips. Use the shared primitive; the
neumorphic treatment comes from the `--slice-*` palette, not from bespoke
markup.

### 7.2 The nesting invariant

```ts
// lib/slice-it/editor/nesting.ts

/**
 * Easy ⊆ Normal ⊆ Hard ⊆ Expert.
 *
 * `slice-it.md`: "Difficulties are nested: Expert is selected from all
 * candidates, Hard from Expert, Normal from Hard, Easy from Normal. A pattern
 * learned on Normal is still there on Hard with more between the notes."
 *
 * That property is what makes the difficulty ladder teach anything, and a human
 * editing four independent lists breaks it within ten minutes without noticing.
 * So the editor enforces it rather than documenting it.
 */
export const TIER_ORDER = ['easy', 'normal', 'hard', 'expert'] as const;

export interface NestingViolation {
  difficulty: Difficulty;
  noteId: string;
  time: number;
  /** The tier that is missing this note. */
  missingFrom: Difficulty;
}

export function checkNesting(charts: Record<Difficulty, EditorChart>): NestingViolation[] {
  const violations: NestingViolation[] = [];
  for (let i = 0; i < TIER_ORDER.length - 1; i++) {
    const lower = charts[TIER_ORDER[i]];
    const higher = charts[TIER_ORDER[i + 1]];
    const higherKeys = new Set(higher.notes.map(noteKey));
    for (const note of lower.notes) {
      if (!higherKeys.has(noteKey(note))) {
        violations.push({
          difficulty: TIER_ORDER[i],
          noteId: note.id,
          time: note.time,
          missingFrom: TIER_ORDER[i + 1],
        });
      }
    }
  }
  return violations;
}

/** Identity for nesting purposes: same time (to 1 ms) and same lane. */
const noteKey = (note: EditorNote) => `${Math.round(note.time * 1000)}:${note.lane}`;
```

Three enforcement modes, author's choice per session:

- **Cascade (default).** Placing a note on Normal also places it on Hard and
  Expert; deleting from Expert also deletes from Hard, Normal and Easy. The
  invariant cannot break because the edit propagates.
- **Warn.** Edits are free; violations render as a lint issue and a badge on
  the offending tab.
- **Off.** For alternate charts (`C2`) that are deliberately not a ladder — a
  "Vocal" Expert next to a "Drums" Expert are siblings, not tiers.

```ts
/** Cascade a placement upward through the tiers above `difficulty`. */
export function cascadePlace(difficulty: Difficulty, note: EditorNote): Command[] {
  const from = TIER_ORDER.indexOf(difficulty);
  return TIER_ORDER.slice(from).map((tier) =>
    placeNote(tier, { ...note, id: crypto.randomUUID() }),
  );
}

/** Cascade a deletion downward — a note removed from Expert cannot survive
 *  below it, because below is a subset. */
export function cascadeDelete(difficulty: Difficulty, notes: EditorNote[]): Command[] {
  const to = TIER_ORDER.indexOf(difficulty);
  return TIER_ORDER.slice(0, to + 1).map((tier) => deleteNotes(tier, notes));
}
```

### 7.3 The `auto` tint

Every note carries `auto: boolean`. Generated notes start `true`; any command
that touches a note sets it `false`. Rendered at 55% opacity (§4.3).

This is what makes §8 comprehensible: an author can see, at a glance, the
boundary between what they have curated and what the machine still owns — and
the auto modes below operate on exactly that boundary.

---

## §8 — Auto-generate modes

The request this section answers: _"an 'auto' generate mode if people only want
to change existing notes for example."_ Most authors do not want to chart a
four-minute song from an empty timeline. They want the generator's chart, with
the six places it got wrong fixed.

So generation is not a one-time seed. It is an operation available at any time,
at four scopes, and it **never touches a note the author has edited** unless
they ask it to.

```ts
// lib/slice-it/editor/generate.ts

export type GenerateScope =
  /** Whole chart, discard everything. The "start over" button. */
  | { kind: 'replace-all' }
  /** Regenerate only notes still marked `auto`. Author edits survive intact.
   *  THE DEFAULT — it is what "re-run the generator on the parts I have not
   *  touched" means, and it is the mode most sessions use. */
  | { kind: 'auto-only' }
  /** Regenerate a time range. Everything outside it is untouched. */
  | { kind: 'range'; start: number; end: number; preserveEdited: boolean }
  /** Fill gaps: add notes where the generator found onsets and the chart has
   *  nothing, without moving or removing anything that exists. Purely
   *  additive, so it can never lose work. */
  | { kind: 'fill-gaps'; minGapSeconds: number };

export interface GenerateOptions {
  scope: GenerateScope;
  difficulty: Difficulty | 'all';
  /** −2…+2, the C10 density bias. 0 is the generator's own budget. */
  densityBias: number;
  /** Respect the nesting invariant when regenerating multiple tiers. */
  cascade: boolean;
  /** Seeded, so the same options twice produce the same chart — the generator
   *  is already deterministic ("Everything arbitrary is seeded") and the editor
   *  must not be the thing that breaks that. */
  seed: number;
}
```

### 8.1 The merge

`auto-only` is the interesting one, and the whole design rests on it:

```ts
/**
 * Regenerate, preserving author work.
 *
 * The rule is simple and has to stay simple, because an author needs to be able
 * to predict it: a note with `auto: false` is the author's and is never moved,
 * retyped or removed. Everything else is the generator's and is replaced
 * wholesale.
 *
 * The subtle part is collisions. A regenerated note landing within
 * INPUT_COOLDOWN_MS of an author's note in the same lane is unhittable — the
 * engine's own per-lane debounce would swallow it. So generated notes yield.
 */
export function mergeGenerated(
  existing: EditorNote[],
  generated: EditorNote[],
  options: GenerateOptions,
): EditorNote[] {
  const kept = existing.filter((note) => !note.auto);
  const guard = INPUT_COOLDOWN_MS / 1000;

  const accepted = generated.filter((candidate) => {
    if (options.scope.kind === 'range') {
      const { start, end } = options.scope;
      if (candidate.time < start || candidate.time > end) return false;
    }
    // Yield to author notes that would swallow this one.
    return !kept.some(
      (note) => note.lane === candidate.lane && Math.abs(note.time - candidate.time) < guard,
    );
  });

  return sortByTime([...kept, ...accepted.map((n) => ({ ...n, auto: true }))]);
}
```

### 8.2 Where it runs

Generation is CPU-bound — `slice-it.md` measures a 4-minute track at about a
second, and the 08-06 commits took the analyser 31–37% faster on top of that.
But the audio is already decoded in the editor, and re-uploading it to
regenerate would be absurd.

So: **the editor re-charts in the browser from cached analysis artefacts.** The
expensive half (decode → STFT → onsets → tempo → beat track) ran once at upload
and its output is persisted (§6). Re-charting is only the charting pass —
selection against a density budget — which is milliseconds.

```ts
// The charter is already browser-safe: `lib/slice-it/beatmap/charter.ts` has no
// Node imports (the esbuild server bundle compiles this tree directly, per
// constants.ts's header). Same code, called from the editor.
import { chartFromOnsets } from '@/lib/slice-it/beatmap/charter';

async function regenerate(options: GenerateOptions): Promise<EditorNote[]> {
  const artefacts = await loadArtefacts(songId); // cached; see §6
  return chartFromOnsets(artefacts.onsets, artefacts.tempo, {
    difficulty: options.difficulty,
    densityBias: options.densityBias,
    seed: options.seed,
  }).map((slice) => ({ ...slice, auto: true }));
}
```

A full re-analysis (different stem separation, a corrected BPM) still goes
server-side through `/api/slice-it/charts/$id/generate`, which queues the job —
see `O3`.

### 8.3 The panel

```
┌─ AUTO ──────────────────────────────────┐   .neumorphic
│  Scope    ( ) Replace everything         │
│           (•) Untouched notes only       │   ← default
│           ( ) This section  1:12 – 1:48  │
│           ( ) Fill gaps only             │
│                                          │
│  Density  [──────●───────]  +0           │   .neumorphic-inset track
│  Tiers    [x] Easy [x] Normal [x] Hard   │
│           [x] Expert   [x] Keep nested   │
│                                          │
│  247 generated · 31 yours (kept)         │
│  ▸ Preview        ▸ Apply                │
└──────────────────────────────────────────┘
```

**Preview before apply, always.** The timeline shows the proposed result with
added notes in green and removed notes struck through, and nothing is committed
until Apply. A regenerate that silently ate an author's work once is a feature
they will never press again.

---

## §9 — Linting and validation

The linter is shared with `C11` (upload-time validation), so a hand-authored
chart and a generated one are held to the same standard. It runs in a worker on
a debounce, not synchronously on every edit — a 1200-note chart is O(n) per
rule and there are eight rules.

```ts
// lib/slice-it/editor/lint.ts

import { INPUT_COOLDOWN_MS, HIT_WINDOWS } from '@/lib/slice-it/constants';
import type { LintIssue } from './types';

const NPS_CEILING: Record<Difficulty, number> = {
  easy: 2.5,
  normal: 4,
  hard: 6.5,
  expert: 10,
};

export function lintChart(
  chart: EditorChart,
  points: TimingPoint[],
  duration: number,
): Map<string, LintIssue[]> {
  const issues = new Map<string, LintIssue[]>();
  const add = (id: string, issue: LintIssue) => issues.set(id, [...(issues.get(id) ?? []), issue]);

  const guard = INPUT_COOLDOWN_MS / 1000;
  const lastByLane = new Map<number, EditorNote>();

  for (const note of chart.notes) {
    /* Unhittable jack — the engine's own per-lane debounce would swallow the
     * second press, so this note cannot be hit no matter how good the player
     * is. Error, not warning: it is not a taste question. */
    const previous = lastByLane.get(note.lane);
    if (previous && note.time - previous.time < guard) {
      add(note.id, {
        code: 'unhittable-jack',
        severity: 'error',
        message: `${Math.round((note.time - previous.time) * 1000)} ms after the previous note in this lane; the input cooldown is ${INPUT_COOLDOWN_MS} ms.`,
      });
    }
    lastByLane.set(note.lane, note);

    /* Nothing in the first two seconds — the player has not seen the playfield
     * yet, and a note there reads as the game starting broken. */
    if (note.time < 2) {
      add(note.id, {
        code: 'too-early',
        severity: 'warning',
        message: 'Before the player can react.',
      });
    }

    /* A hold shorter than its own release window cannot be released correctly:
     * the head and tail judgements overlap. */
    if (note.type === 'LONG' && (note.duration ?? 0) < HIT_WINDOWS.GOOD * 2) {
      add(note.id, {
        code: 'hold-too-short',
        severity: 'error',
        message: 'Shorter than its release window.',
      });
    }
  }

  /* Density spikes, over a one-second sliding window. */
  for (const [id, nps] of slidingDensity(chart.notes)) {
    if (nps > NPS_CEILING[chart.difficulty] * 1.6) {
      add(id, {
        code: 'density-spike',
        severity: 'warning',
        message: `${nps.toFixed(1)} notes/sec here; the ${chart.difficulty} ceiling is ${NPS_CEILING[chart.difficulty]}.`,
      });
    }
  }

  return issues;
}
```

The lint panel lists issues grouped by code with a count, and clicking one
seeks the playhead to it. **Errors block publish; warnings do not** — the same
split `C11` proposes for uploads.

---

## §10 — Playtest

Playtest is `GameEngine` on the edited chart. Not a second implementation:
two renderers that disagree about note position is exactly the bug an editor
exists to prevent.

```tsx
/**
 * Playtest from the playhead.
 *
 * `engine.loadMap()` takes the same `BeatMap` shape the game does, so the
 * editor builds one from the working notes and hands it over. Scores are
 * discarded — `useSubmitScore` is never called from here, and the engine is
 * constructed with a flag that makes that structural rather than a convention:
 * a run started in the editor must not be able to reach the leaderboard.
 */
function startPlaytest(from: number) {
  const chart = editorState().charts[editorState().active];
  const engine = new GameEngine({ submitting: false });

  engine.loadMap({
    id: `editor:${songId}`,
    name: song.title,
    artist: song.artist,
    audioUrl: song.audioUrl,
    bpm: song.bpm ?? 120,
    slices: chart.notes.map(stripEditorFields), // drop selected/auto/issues
  });

  engine.seek(from); // P1's transport, shared with practice mode
  engine.start();
}
```

Three playtest affordances the editor needs beyond the game's:

- **Play from playhead** (`Space`) — never from the start. An author fixing a
  bar at 2:40 must not sit through 2:40 of song.
- **Loop the selection** (`Ctrl+Space`) — plays the selected range on repeat,
  so a pattern can be iterated on in place. Same A/B loop mechanism as `P1`.
- **Return to edit at the same position.** Stopping a playtest puts the
  playhead where the audio stopped, not back where it started.

Playtest results feed the hit highlights in §4.4(a), which is the loop: place a
note, play the bar, see the judgement land on it, adjust.

---

## §11 — API

All routes wrap `defineHandler` from `@/lib/api/handler.server` — it does the
session check → rate limit → zod `safeParse` → try/catch order, and is the only
place that order is written down in code.

```ts
// app/routes/api/slice-it/charts/$id.ts
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { ChartPatchZ } from '@/lib/slice-it/editor/api-schemas';
import { chartHashOf } from '@/lib/slice-it/editor/hash';
import { lintChart } from '@/lib/slice-it/editor/lint';

export const Route = createFileRoute('/api/slice-it/charts/$id')({
  server: {
    handlers: {
      PATCH: defineHandler(
        {
          body: ChartPatchZ,
          // Autosave fires every 20s per open editor; a session is ~90 writes
          // an hour. Scoped to the user, not the IP — two people editing on one
          // campus connection must not share a bucket, which is the mistake
          // `/api/slice-it/score` documents having fixed.
          rateLimit: { limit: 120, windowMs: 60_000, prefix: 'slice-chart-patch', scope: 'user' },
        },
        async ({ userId, params, body }) => {
          const chart = await prisma.chart.findUnique({
            where: { id: params.id },
            select: { id: true, authorId: true, status: true, songId: true },
          });
          if (!chart) return Response.json({ error: 'Not found' }, { status: 404 });
          if (chart.authorId !== userId) {
            return Response.json({ error: 'Not yours' }, { status: 403 });
          }

          // The server re-derives the hash. A client-supplied one would let an
          // edited chart claim an unedited chart's identity, which is exactly
          // what C12 exists to make impossible.
          const chartHash = chartHashOf(body.notes);

          // Errors block the write on a PUBLISHED chart; a draft may hold
          // anything, because a draft is a work in progress by definition.
          if (chart.status !== 'draft') {
            const issues = lintChart(body, body.timingPoints ?? [], body.duration);
            const errors = [...issues.values()].flat().filter((i) => i.severity === 'error');
            if (errors.length > 0) {
              return Response.json({ error: 'Chart has errors', issues: errors }, { status: 422 });
            }
          }

          const updated = await prisma.$transaction(async (tx) => {
            const row = await tx.chart.update({
              where: { id: chart.id },
              data: {
                notes: body.notes,
                timingPoints: body.timingPoints ?? undefined,
                svPoints: body.svPoints ?? undefined,
                chartHash,
                isGenerated: false,
              },
              // Explicit select: `notes` is the chart and returning it on every
              // autosave doubles the round trip's payload for nothing. The
              // 08-06 security pass fixed exactly this shape on two
              // `prisma.song.update()` calls that were returning `analysisData`.
              select: { id: true, chartHash: true, updatedAt: true },
            });

            await tx.chartRevision.create({
              data: { chartId: chart.id, notes: body.notes, kind: body.kind ?? 'autosave' },
            });

            return row;
          });

          return Response.json(updated);
        },
      ),
    },
  },
});
```

The zod schemas bound the payload — a chart is user input reaching a `Json`
column, and the note cap is what stops a 40 MB array:

```ts
// lib/slice-it/editor/api-schemas.ts
import { z } from 'zod';
import { SLICE_TYPES, DIFFICULTIES, MAX_SONG_DURATION_SEC } from '@/lib/slice-it/constants';

const SliceZ = z.object({
  id: z.string().max(64),
  time: z.number().min(0).max(MAX_SONG_DURATION_SEC),
  type: z.enum(SLICE_TYPES),
  lane: z.number().int().min(0).max(5),
  duration: z.number().min(0).max(60).optional(),
  speedMultiplier: z.number().min(0.1).max(8).optional(),
});

export const ChartPatchZ = z.object({
  // 20 notes/second × 900 seconds is the analyser's own MAX_NOTES_PER_SECOND
  // ceiling over the longest permitted track. Anything past it is not a chart.
  notes: z.array(SliceZ).max(18_000),
  timingPoints: z
    .array(
      z.object({
        time: z.number().min(0),
        bpm: z.number().min(20).max(400),
        meter: z.number().int().min(1).max(16),
      }),
    )
    .max(2_000)
    .optional(),
  svPoints: z
    .array(z.object({ time: z.number().min(0), multiplier: z.number().min(0.1).max(8) }))
    .max(2_000)
    .optional(),
  kind: z.enum(['autosave', 'manual', 'publish']).optional(),
});
```

---

## §12 — The neumorphic UI specification

**This is not the site's glass design language.** Slice It uses the scoped
`--slice-*` palette on a `.slice-theme` wrapper with the soft-shadow
neumorphic treatment defined in `components/slice-it/slice-it.css`. The editor
lives inside that world; a `.glass-pane` in here would look like a bug.

### 12.1 The two shadow primitives

Already in `slice-it.css` and used unchanged:

```css
.neumorphic {
  background: var(--slice-bg);
  box-shadow:
    9px 9px 16px var(--slice-shadow-dark),
    -9px -9px 16px var(--slice-shadow-light);
  border-radius: 20px;
}

.neumorphic-inset {
  background: var(--slice-bg);
  box-shadow:
    inset 6px 6px 10px var(--slice-shadow-dark),
    inset -6px -6px 10px var(--slice-shadow-light);
  border-radius: 15px;
}
```

The rule that makes neumorphism read correctly: **raised = interactive,
inset = a container or a value.** A button is `.neumorphic`; the track it
slides along is `.neumorphic-inset`; a panel holding controls is
`.neumorphic`; the timeline the notes sit in is `.neumorphic-inset`.

### 12.2 Editor-specific additions

Append to `components/slice-it/slice-it.css` — the editor gets no separate
stylesheet, because a second file means a second set of shadow values that
drift from these.

```css
/* Pressed state. Neumorphism's affordance is depth, so "active" is the
   raised surface becoming inset — the button physically goes down. */
.neumorphic-pressed {
  background: var(--slice-bg);
  box-shadow:
    inset 4px 4px 8px var(--slice-shadow-dark),
    inset -4px -4px 8px var(--slice-shadow-light);
  border-radius: 15px;
}

/* Toolbar buttons: smaller radius and shadow so a row of them does not read as
   a row of pillows. Scale the offsets with the element, not a fixed 9px. */
.neumorphic-sm {
  background: var(--slice-bg);
  box-shadow:
    4px 4px 8px var(--slice-shadow-dark),
    -4px -4px 8px var(--slice-shadow-light);
  border-radius: 12px;
}

/* The timeline well. Inset, because notes sit *inside* it. */
.editor-timeline {
  background: var(--slice-bg);
  box-shadow:
    inset 8px 8px 14px var(--slice-shadow-dark),
    inset -8px -8px 14px var(--slice-shadow-light);
  border-radius: 18px;
}

/* Selected tool / active difficulty tab. Neumorphism has no borders to
   highlight, so selection is the accent colour plus the pressed depth. */
.neumorphic-active {
  color: var(--slice-primary);
  box-shadow:
    inset 4px 4px 8px var(--slice-shadow-dark),
    inset -4px -4px 8px var(--slice-shadow-light);
}

@media (prefers-reduced-motion: reduce) {
  .neumorphic,
  .neumorphic-sm,
  .neumorphic-pressed {
    transition: none;
  }
}
```

### 12.3 Canvas-side neumorphism

The timeline is a canvas, so the shadows are drawn, not styled. The values
mirror the CSS so a note and a button look like the same material:

```ts
/** The CSS `.neumorphic` pair, in canvas terms. */
function neumorphicFill(ctx: CanvasRenderingContext2D, draw: () => void, theme: EditorTheme) {
  if (!theme.glow) {
    // Degradation tier — `canvasGlowEnabled()` is false on low-end devices and
    // under reduced motion, and the 07-30 audit found blurred shadows were this
    // renderer's dominant cost (~10 activations per frame against ~15
    // rasterising ops). Flat fill, same geometry.
    draw();
    return;
  }
  ctx.save();
  ctx.shadowColor = theme.shadowDark;
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 3;
  draw();
  ctx.shadowColor = theme.shadowLight;
  ctx.shadowOffsetX = -3;
  ctx.shadowOffsetY = -3;
  draw();
  ctx.restore();
}
```

### 12.4 Layout

```
┌───────────────────────────────────────────────────────────────┐
│ ◀ Song title — Artist        [Easy][Normal][Hard][Expert]  ⌘S │  .neumorphic
├──────┬────────────────────────────────────────┬───────────────┤
│      │                                        │  ┌─ AUTO ──┐  │
│ wave │            T I M E L I N E             │  └─────────┘  │
│ form │         .editor-timeline               │  ┌─ NOTE ──┐  │
│  +   │                                        │  └─────────┘  │
│ onset│         (canvas, vertical scroll)      │  ┌─ LINT ──┐  │
│ ghost│                                        │  └─────────┘  │
│      │                                        │               │
├──────┴────────────────────────────────────────┴───────────────┤
│ ▶ 1:42.318   [select][place][hold][erase]  1/4 ▾  ⊙ snap  🔍 │  .neumorphic
├───────────────────────────────────────────────────────────────┤
│ ▁▂▅█▅▂▁▁▂▅█████▅▂▁▁▂▃▅▂▁  minimap: whole-song density         │
└───────────────────────────────────────────────────────────────┘
```

Dark mode comes free: every value above is a `--slice-*` variable and
`.dark .slice-theme` / `.slice-theme.dark` already redefine the whole palette,
including inverting the shadow pair (`--slice-shadow-light: #222228`).

### 12.5 What CI enforces

`lib/__tests__/design-consistency.test.ts` fails the build on hand-rolled tab
strips, raw palette colours, hardcoded radii, `transition-all`, and
`tailwindcss-animate` classes (that plugin is not installed, so those compile
to nothing). The editor is not exempt. Use the shared `components/ui/`
primitives for tabs, sliders, selects and dialogs, and let the `--slice-*`
palette provide the skin.

---

## §13 — Keyboard shortcuts

Every one is remappable, and the sheet is on `?`. Bindings that collide with
the browser (`Ctrl+W`, `Ctrl+T`) are deliberately unused.

| Key               | Action                        | Key             | Action                    |
| ----------------- | ----------------------------- | --------------- | ------------------------- |
| `Space`           | Playtest from playhead        | `1`–`7`         | Note type                 |
| `Ctrl+Space`      | Loop selection                | `Q`             | Quantise selection        |
| `Esc`             | Stop / deselect               | `H`             | Mirror selection          |
| `↑` `↓`           | Playhead ± one snap unit      | `Ctrl+Z` / `Y`  | Undo / redo               |
| `PgUp` `PgDn`     | ± one measure                 | `Ctrl+C/X/V`    | Copy / cut / paste        |
| `Home` `End`      | Start / end of chart          | `Ctrl+Shift+V`  | Paste mirrored            |
| `Ctrl+↑` `Ctrl+↓` | Zoom                          | `Ctrl+D`        | Duplicate one measure on  |
| `[` `]`           | Snap division finer / coarser | `Ctrl+A`        | Select visible → all      |
| `S`               | Toggle snap                   | `Del`           | Delete selection          |
| `M`               | Toggle metronome              | `Alt+↑` `Alt+↓` | Nudge 1 ms (ignores snap) |
| `T`               | Toggle assist tick            | `Ctrl+S`        | Save revision             |
| `,` `.`           | Previous / next onset ghost   | `Ctrl+Enter`    | Publish                   |
| `Tab`             | Next difficulty               | `?`             | Shortcut sheet            |

Implemented as one keydown listener on the editor root with a command map, not
per-component handlers — a shortcut that works only when the timeline has focus
is a shortcut that appears broken.

```ts
/** Never swallow keys destined for a text field. */
function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}
```

---

## §14 — Accessibility

The editor is a canvas, which means none of it is accessible by default. The
minimum that makes it usable:

- **Every operation has a keyboard path.** §13 is not a convenience layer; it
  is the accessible interface. Nothing may be mouse-only.
- **The note list is also a list.** A visually-hidden, virtualised
  `role="listbox"` of the current difficulty's notes, kept in sync with the
  canvas, so a screen reader can navigate notes by time and lane and the
  selection state is announced.
- **Focus is visible on the canvas.** The focused note draws a ring; the
  canvas itself takes `tabindex={0}` and an `aria-label` describing the
  playhead position.
- **Announce edits.** An `aria-live="polite"` region reports "Note added, lane
  1, bar 12 beat 3" — the same information the canvas shows.
- **Respect `useReducedMotion`.** No playhead smoothing, no animated
  transitions on the neumorphic depth changes.
- **Colour is never the only channel.** Quantisation colour (§4.3) is
  reinforced by note shape, and lint severity by an icon, not just a ring
  colour — the same requirement `A3` puts on the game's lane palettes.

---

## §15 — Testing

```
lib/slice-it/editor/__tests__/
  commands.test.ts    apply∘invert === identity, for every command, on a
                      generated chart. This is the property that makes undo
                      trustworthy and it is cheap to assert exhaustively.
  nesting.test.ts     cascadePlace/cascadeDelete preserve Easy ⊆ … ⊆ Expert
                      under random edit sequences.
  snap.test.ts        beatAt/timeAtBeat round-trip across tempo changes;
                      snapTime is idempotent (snapping twice = snapping once).
  generate.test.ts    mergeGenerated never drops a note with auto:false — the
                      one guarantee the whole auto-mode design rests on.
  lint.test.ts        Each rule fires on a crafted chart and stays silent on a
                      generated one (a generated chart must lint clean, or the
                      generator and the linter disagree about the game).
  hash.test.ts        chartHashOf is stable under key order and array identity,
                      and changes when any note moves by 1 ms.
```

Add the directory to `vitest.config.ts` alongside the existing
`lib/slice-it/__tests__/**/*.test.ts` entry.

The load-bearing test is `commands.test.ts`. An editor whose undo is subtly
wrong loses work, and losing work once is how an editor stops being used.

---

## §16 — Implementation phases

Each phase ships something usable; none is a prerequisite refactor.

| Phase | Scope                                                                                                             | Unlocks                      |
| ----- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **1** | `Chart` + `ChartRevision` models. Seed rows from `analysisData` on demand. Read-only timeline with the beat grid. | Charts have identity (`C12`) |
| **2** | Place / delete / move / select, the command stack, undo, autosave. Snap. Quantisation colour.                     | The editor exists            |
| **3** | Difficulty tabs, the nesting invariant, cascade mode.                                                             | Four difficulties editable   |
| **4** | Playtest via `GameEngine`, hit highlights, loop selection.                                                        | The feedback loop closes     |
| **5** | Auto-generate modes, the merge, preview-before-apply.                                                             | "Fix the six wrong notes"    |
| **6** | Waveform, onset ghosts, sections. Requires persisting analysis artefacts.                                         | Charting stops being blind   |
| **7** | Lint panel, publish gating, `status` transitions.                                                                 | `C11`, feeds `R10`           |
| **8** | Timing points + SV editing (`C6`, `G10`). Miss heatmap overlay (`O1`).                                            | Tempo-changing tracks work   |

Phases 1–4 are the editor. 5 is the one this document was asked for. 6–8 are
what make it better than the generator rather than merely equal to it.

---

## §17 — Open questions

Written down rather than decided, because each needs a product call:

1. **Who may author a chart for someone else's song?** The uploader owns the
   audio. The 08-06 security pass settled the analogous question for
   `patch-analysis` — a stranger may chart a song that has **none**, but may
   not replace one that already plays. The natural extension is that anyone may
   author an _alternate_ chart (`C2`) while the uploader's stays default, but
   that is a policy choice with moderation consequences (`L9`).
2. **Does an edit invalidate existing scores?** `chartHash` makes the change
   _visible_; whether the board resets, forks or annotates is separate. Forking
   (old hash keeps its board, new hash starts one) loses the least and is the
   most confusing to explain.
3. **Do hand-authored charts enter the ranked pool automatically?** `R10` says
   no — lint clean plus a play threshold plus review. Worth confirming before
   the editor makes it urgent.
4. **Collaborative editing.** Deliberately out of scope. The realtime tier
   could carry it, but operational-transform on a note list is a project, not a
   phase, and single-author editing is what the genre actually does.

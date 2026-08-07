# Slice It! — feature & update ideas (2026-08-06)

**162 numbered ideas** for the rhythm game, drawn from what the genre's
reference implementations do and Slice It! does not: osu!/osu!mania, StepMania
& DDR, Beatmania IIDX, Sound Voltex, Etterna & Quaver, Beat Saber, Clone Hero,
Taiko no Tatsujin, Muse Dash, Arcaea, Cytus, Friday Night Funkin', Rhythm
Doctor, A Dance of Fire and Ice, Rocksmith, Crypt of the NecroDancer, Guitar
Hero and Groove Coaster.

This is a **catalogue, not a roadmap.** Nothing here is scheduled. The
numbering is stable so an agent can be pointed at `R3` or `G11` and know
exactly what it means without re-deriving anything.

Every entry was checked against the code first. The **Gap** line is a
verifiable fact about specific files as of this date — if a Gap line is wrong,
the idea is wrong, and the fix is to delete the entry rather than build it.

> **Revised 2026-08-06 (second pass)** against `fb34b5f0` (real-time clock,
> input latency, score integrity) and `d4185549` (four security fixes, a 31–37%
> faster analyser). Those two commits shipped `R7` outright and moved four
> other entries; §0.2 lists every change. The chart editor (`C1`) now has its
> own full design doc: [`../slice-it-chart-editor.md`](../slice-it-chart-editor.md).

---

## §0 — How to read this

| Field         | Meaning                                                                            |
| ------------- | ---------------------------------------------------------------------------------- |
| **Gap**       | What is true in the repo today. Names the file that proves the feature is missing. |
| **Build**     | The change, concretely enough to start from.                                       |
| **Sketch**    | Code. Repo-idiomatic, meant to be adapted — paths and names are real.              |
| **Prior art** | Which rhythm game already does this, so the design question is "which variant".    |
| **Touches**   | Files and directories the work lands in.                                           |
| **Size**      | `S` ≤ 2 days · `M` ≤ 2 weeks · `L` > 2 weeks                                       |

### Section index

| §   | IDs      | Theme                                            |
| --- | -------- | ------------------------------------------------ |
| 1   | `G1–G14` | Note vocabulary and the core loop                |
| 2   | `C1–C12` | Charting and the beatmap pipeline                |
| 3   | `P1–P10` | Practice, training and improvement               |
| 4   | `A1–A10` | Accessibility and comfort                        |
| 5   | `H1–H10` | HUD, feedback and the results screen             |
| 6   | `M1–M10` | Modifiers and mutators                           |
| 7   | `S1–S12` | Solo game modes                                  |
| 8   | `N1–N12` | Multiplayer and competitive play                 |
| 9   | `R1–R10` | Ranking, scoring integrity and replays           |
| 10  | `L1–L18` | The song library, lookup and creator tools       |
| 11  | `X1–X14` | Platform integration, social and Discord         |
| 12  | `V1–V12` | Presentation, cosmetics and identity             |
| 13  | `I1–I10` | Input, hardware and device support               |
| 14  | `O1–O8`  | Telemetry, content operations and infrastructure |

### Conventions every idea assumes

Not restated per entry — these are the repo's rules
([`/CLAUDE.md`](../../CLAUDE.md)), and an idea that violates one is wrong:

- Any value both a client and the server could disagree about (a hit window, a
  modifier's score weight, a lobby cap) belongs in
  [`lib/slice-it/constants.ts`](../../lib/slice-it/constants.ts), which is
  imported verbatim by the esbuild server bundle and must stay free of browser
  and Node imports.
- API routes wrap in `defineHandler` from `@/lib/api/handler.server`.
- Anything touching Prisma / `node:*` / secrets lives in a `*.server.ts` file.
- Every user-facing string goes through `t("key", { defaultValue })`, then
  `pnpm i18n:extract`. Slice It!'s namespace is `r-slice-it`; it is already in
  `NAMESPACES`, so no registry change is needed for strings added to it.
- Slice It! is one of the games with a **bespoke visual identity** — it uses
  the scoped `--slice-*` palette on a `.slice-theme` wrapper with the
  `.neumorphic` / `.neumorphic-inset` soft-shadow pair, not the site's glass
  tokens. New in-game surfaces follow that palette; new _site_ surfaces (a
  chart hub page under `_site/`) follow `--site-*` and the glass elevation
  classes. [`../slice-it-chart-editor.md`](../slice-it-chart-editor.md) §12 is
  the full neumorphic specification.
- Wire events go in [`lib/slice-it/net/events.ts`](../../lib/slice-it/net/events.ts)
  with a zod schema on both directions; the handler tests in
  `lib/slice-it/__tests__/` are the contract.
- Scoring changes touch `lib/slice-it/scoring.ts`, which is shared by the
  engine, `/api/slice-it/score` **and** `lib/slice-it/integrity.ts`. Changing
  one side alone makes every submission implausible.

---

## §0.1 — What already exists (do not re-propose)

Checked in the code on 2026-08-06, after `fb34b5f0` and `d4185549`.

**Gameplay.** Two lanes; seven note types (`STANDARD`, `MOVING`, `LONG`,
`SILENT`, `SPEED`, `BOMB`, `SWITCH`); six judgements (`MARVELOUS` → `MISS`)
with rate-scaled windows; combo-multiplied scoring; hold ticks accrued **per
second of audio** (`HOLD_TICK_POINTS_PER_SECOND`, clamped by
`HOLD_TICK_MAX_STEP_SEC`) rather than per frame; a hold release bonus; letter
grades SS→F; four nested difficulties; eight modifiers; pause; per-lane input
debounce. Input is judged against **the event's own `timeStamp`**, reconstructed
into audio position and clamped at 100 ms, so main-thread latency is no longer
charged to the player.

**Score integrity** (`lib/slice-it/integrity.ts`, new). Four layers: duration
bounds (~120× tighter since hold accrual became time-based), internal
consistency between score/accuracy/combo/notes, an HMAC-signed run receipt
(`lib/slice-it/run-token.server.ts`) proving the song had time to play, and a
**timing-distribution check** — the engine keeps a Welford mean/variance of hit
offsets and submits count/mean/stdDev, which flags (never rejects) a
distribution too tight to be human.

**Charting.** Full server-side analysis — SuperFlux onsets, comb-filtered
autocorrelation tempo with a log-normal prior, Ellis DP beat tracking,
subdivision quantisation with a 55 ms drop threshold, density-budgeted nested
difficulties, frequency-driven lane assignment, seeded and reproducible,
versioned by `BEATMAP_VERSION`. **31–37% faster** as of `d4185549` (900 s of
audio: 3027 ms → 1895 ms) via a real-input FFT and precomputed filterbank
weights, verified against the complex transform to 1e-9 in `fft.test.ts`.

**Uploads & storage.** Content-hash dedupe, 50 MB / 15-minute ceilings enforced
by a **container-header duration probe** (`lib/audio/probe.ts`) _before_
`decode()` allocates, `Content-Length` gating on the multipart body, global
10 GB + per-account 1 GB quotas, object storage with a local fallback, and
`getObjectRange`/`getObjectSize` so a range request no longer reads the whole
object.

**Multiplayer.** 8-player lobbies, join codes, quickplay, public browse, chat,
kick, ready-up, rematch, per-seat modifiers with a multiplayer clamp,
server-owned absolute-timestamp timers, two disconnect grace windows, a
room-wide pause with a 3-pause cap, seats keyed by `userId`. Live scores now
report every 200 ms against a 250 ms server tick, broadcast `volatile` so a
stalled client drops stale frames instead of replaying them, and tweened
client-side. `persistResults` applies the same plausibility ceiling
`/api/slice-it/score` does.

**Library & platform.** Server-side search and sort, likes, comments, play
counts, per-song leaderboards with cursor paging and a self-row, a global
career board, three achievements, one arcade quest, Arcade Pass result
reporting, keybind/volume/hit-sound/offset settings with a calibration screen,
gamepad support, a canvas-2D glow degradation tier, and `slice:*` rate rules on
every wire event in `server/socket-server/config.ts`.

## §0.2 — What the 08-06 commits changed in this document

| Entry | Change                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `R7`  | **Shipped.** `lib/slice-it/integrity.ts` is the statistical anti-cheat this proposed, including the timing-distribution check. Rewritten as the review surface it lacks. |
| `P6`  | **Half shipped.** The engine now keeps a Welford mean/stdDev and submits it. Nothing shows it to the player. Narrowed to display.                                        |
| `H1`  | **Cheaper.** `recordOffset()` already retains the signed offset the error bar needs; the renderer is all that is missing.                                                |
| `R8`  | **Reframed.** `integrity.ts` documents its own ceiling as loose on holds; replay re-simulation is now the named way to close that specific hole.                         |
| `O3`  | **Numbers updated.** Analysis is 31–37% faster and probe-guarded, and still runs inline in the upload route.                                                             |
| `C8`  | **Rules changed.** `patch-analysis` now lets a stranger chart a song with _no_ chart, but never replace one that plays. Regeneration must respect that.                  |
| `G13` | `HOLD_TICK_POINTS` is now `HOLD_TICK_POINTS_PER_SECOND`; the frame-rate exploit it referenced is fixed.                                                                  |
| `O7`  | **Unchanged and still true.** `songs/$id.ts` still selects the whole `analysisData` blob — all four difficulties.                                                        |

---

## §1 — Note vocabulary and the core loop (`G1–G14`)

### G1 — A health gauge, opt-in, worth a multiplier

**Gap.** `lib/slice-it/engine.ts:595` still publishes `health: 100` as a
literal. The field exists on the wire (`ScoreReport.health`) and is rendered by
the multiplayer sidebar; nothing ever moves it. The only fail state is Sudden
Death, which `forMultiplayer()` strips — with a comment that is the whole design
brief for this entry: _"dying at 12 seconds and then watching four minutes of
other people's scores is not a game mode anyone chose."_

**Build.** A gauge in the engine, exposed as a **modifier that is off by
default** and pays a score multiplier when on. That resolves the multiplayer
problem without a special case: a player who wants the tension opts in and gets
paid for it; a player who wants to finish the song does nothing and the game
behaves exactly as it does today. Multiplayer keeps its existing clamp — the
gauge is allowed, but `failMode` clamps to `'survive'` (drain to zero costs
your multiplier, not your run), so nobody spectates for four minutes.

**Sketch.**

```ts
// lib/slice-it/constants.ts
export const HEALTH_MAX = 100;
/** Drain per judgement. GREAT is deliberately ~neutral: the gauge should
 *  punish missing, not punish being imperfect. */
export const HEALTH_DELTA: Record<Exclude<HitResult, 'NONE'>, number> = {
  MARVELOUS: +1.2,
  PERFECT: +1.0,
  GREAT: +0.2,
  GOOD: -1.5,
  BAD: -3,
  MISS: -6,
};
export const MODIFIER_BONUSES = {
  // … existing
  /** Opt-in gauge. Worth less than Strict Timing (0.25) because it costs
   *  consistency rather than precision. */
  healthGauge: 0.2,
} as const;

// lib/slice-it/types.ts
export interface Modifiers {
  // … existing
  /** Off by default. On, the run can fail (solo) or lose its multiplier (MP). */
  healthGauge: boolean;
}

// lib/slice-it/modifiers.ts
export const DEFAULT_MODIFIERS: Modifiers = { /* … */ healthGauge: false };

/**
 * Multiplayer keeps the gauge but never lets it end a run.
 *
 * Same reasoning that drops Sudden Death: the cost of dying in a race is not
 * losing, it is sitting out the remaining three minutes of a song everyone
 * else is still playing.
 */
export function forMultiplayer(modifiers: Modifiers): Modifiers {
  return applyExclusions({
    ...modifiers,
    speed: Math.max(MULTIPLAYER_MIN_SPEED, modifiers.speed),
    suddenDeath: false,
    // gauge stays on if chosen; the engine reads `failMode` to decide what
    // hitting zero means.
  });
}
```

```ts
// lib/slice-it/engine.ts
private health = HEALTH_MAX;
private failMode: 'fail' | 'survive' = 'fail';

private applyHealth(result: HitResult): void {
  if (!this.modifiers.healthGauge) return;
  this.health = Math.max(0, Math.min(HEALTH_MAX, this.health + HEALTH_DELTA[result]));
  if (this.health > 0) return;
  if (this.failMode === 'fail') { this.status = 'FAILED'; return; }
  // Multiplayer: the run continues, the multiplier does not.
  this.gaugeBroken = true;
}

// publish() stops lying:
health: this.modifiers.healthGauge ? this.health : HEALTH_MAX,
```

Score side — a broken gauge forfeits the bonus rather than the run:

```ts
// lib/slice-it/scoring.ts
export function calculateScoreMultiplier(modifiers, opts?: { gaugeBroken?: boolean }): number {
  // …
  if (modifiers.healthGauge && !opts?.gaugeBroken) mult += MODIFIER_BONUSES.healthGauge;
  return mult;
}
```

**Prior art.** IIDX groove gauge (normal/hard/ex-hard/assisted), DDR life bar,
osu! HP drain, Beat Saber energy — and IIDX's "easy gauge" is precisely this
opt-in/opt-out framing.
**Touches.** `engine.ts`, `constants.ts`, `types.ts`, `modifiers.ts`,
`scoring.ts`, `HUD.tsx`, `integrity.ts` (the ceiling reads the multiplier).
**Size.** M

### G2 — Four-key and six-key lane modes

**Gap.** Two lanes is hard-coded: `Slice.lane` is documented as "0 = top/left,
1 = bottom/right", the charter alternates between exactly two, `Keybinds` has
`lane1`/`lane2`, and `GameCanvas` has two gamepad button arrays.

**Build.** Lane count as a chart property, generated alongside 2K from the same
onset list — the charter's frequency banding already produces the information a
4-lane assignment needs and currently collapses it to a binary.

**Sketch.**

```ts
// lib/slice-it/types.ts
export interface BeatMap {
  // …
  /** 2 today. Charts without it are 2K, which is every chart that exists. */
  keys?: 2 | 4 | 6;
}

// lib/slice-it/beatmap/charter.ts
/**
 * Lane assignment generalised from a binary to N bands.
 *
 * The existing rule — bass-dominant to lane 0, bright to lane 1 — is this
 * function with keys=2. The playability overrides (max 2 consecutive same-lane,
 * per-tier minimum gap) are unchanged and still run after.
 */
function assignLane(centroidHz: number, keys: number): number {
  // Log-spaced, because pitch perception is: a 4K split at 200/800/3200 Hz
  // divides the spectrum evenly by ear, not by Hz.
  const t = Math.log2(clamp(centroidHz, 30, 11_000) / 30) / Math.log2(11_000 / 30);
  return Math.min(keys - 1, Math.floor(t * keys));
}

// lib/slice-it/store.ts — Keybinds becomes indexed
export interface Keybinds {
  lanes: string[];
} // v3 migration fills from lane1/lane2
```

**Prior art.** osu!mania (4K/7K), Quaver, Etterna, DDR.
**Touches.** `beatmap/charter.ts`, `types.ts`, `store.ts`, `GameCanvas.tsx`.
**Size.** L

### G3 — Chords as a first-class chart element

**Gap.** The charter enforces "no more than 2 consecutive notes in one lane"
and a per-tier same-lane gap, but nothing deliberately places two notes on the
_same timestamp in different lanes_. Simultaneous hits happen by accident.

**Build.** A chord pass promoting strong onsets to two-lane hits, budgeted
separately from note density, and judged as one unit with an inter-hand
tolerance so a 12 ms spread is not a `GREAT` and a `MARVELOUS`.

**Sketch.**

```ts
// lib/slice-it/beatmap/charter.ts
const CHORD_STRENGTH_PERCENTILE = 0.9;
/** Chords per tier, as a fraction of that tier's note budget. */
const CHORD_BUDGET: Record<Difficulty, number> = {
  easy: 0,
  normal: 0.03,
  hard: 0.08,
  expert: 0.15,
};

function promoteChords(
  notes: Slice[],
  onsets: Onset[],
  tier: Difficulty,
  rng: () => number,
): Slice[] {
  const threshold = percentile(
    onsets.map((o) => o.strength),
    CHORD_STRENGTH_PERCENTILE,
  );
  const budget = Math.floor(notes.length * CHORD_BUDGET[tier]);
  let spent = 0;
  return notes.flatMap((note) => {
    if (spent >= budget) return note;
    const onset = onsetAt(onsets, note.time);
    // Downbeats only: a chord off the beat reads as a mistake, not an accent.
    if (!onset || onset.strength < threshold || !isDownbeat(note.time)) return note;
    spent++;
    return [note, { ...note, id: `${note.id}c`, lane: 1 - note.lane }];
  });
}
```

```ts
// lib/slice-it/engine.ts — judge a chord as one unit
/** Two hands are never simultaneous. Anything inside this is one gesture. */
const CHORD_TOLERANCE_SEC = 0.035;

private resolveChord(first: Slice, result: HitResult): void {
  const partner = this.slices.find(
    (s) => s.id !== first.id && Math.abs(s.time - first.time) < 1e-3 && !s.hit,
  );
  if (!partner) return;
  // The partner inherits the head's judgement if hit inside the tolerance,
  // so a chord is one judgement in the histogram, not two.
  partner.pendingChordResult = result;
}
```

**Prior art.** Every 4K game; IIDX chord charts; Clone Hero.
**Touches.** `beatmap/charter.ts`, `engine.ts`. **Size.** M

### G4 — Directional slices

**Gap.** A "slice" is a keypress. `SliceType` has no direction, and touch input
resolves to a lane, not a gesture — which leaves the game's name describing
something it does not simulate.

**Build.** An optional `direction` on `Slice`, satisfied by a swipe on touch, a
stick flick on gamepad, or a modifier key on keyboard. Chart-flagged so it is
opt-in and never breaks a keyboard-only player.

**Sketch.**

```ts
// lib/slice-it/types.ts
export type SliceDirection = 'up' | 'down' | 'left' | 'right';
export interface Slice {
  // …
  /** Present only on charts with `requiresDirection`. */
  direction?: SliceDirection;
}

// lib/slice-it/engine.ts
/**
 * Direction is checked only when the note asks for it, so an undirected chart
 * costs nothing and a directed one degrades to lane-only on a device that
 * cannot express direction (a single-key keyboard binding).
 */
submitInput(lane: number, direction?: SliceDirection): void {
  const slice = this.getTargetedSlice(lane);
  if (!slice) return;
  if (slice.direction && direction && slice.direction !== direction) {
    // Wrong direction is a BAD, not a MISS: the player was on time and on lane.
    return this.resolve(slice, 'BAD', lane);
  }
  // … normal judgement
}
```

```ts
// components/slice-it/GameCanvas.tsx — swipe classification
function directionOf(dx: number, dy: number): SliceDirection | undefined {
  // 24px dead zone; below it the gesture was a tap, and treating a jittery tap
  // as a swipe is worse than ignoring direction.
  if (Math.hypot(dx, dy) < 24) return undefined;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
}
```

**Prior art.** Beat Saber cut direction, Muse Dash, Groove Coaster, Taiko
don/ka.
**Touches.** `types.ts`, `constants.ts`, `engine.ts`, `GameCanvas.tsx`.
**Size.** L

### G5 — Judged hold releases

**Gap.** `HOLD_RELEASE_POINTS` is a flat 100 for releasing inside the window
(`constants.ts`). Release timing is binary, so long notes contribute no accuracy
signal and there is nothing to improve at.

**Build.** Run the release through `judge()` like a tap with a wider window
scale, and fold it into the accuracy denominator.

**Sketch.**

```ts
// lib/slice-it/constants.ts
/** Releases are judged more leniently than heads: letting go is a less precise
 *  motor action than pressing, and punishing it equally makes LN charts feel
 *  arbitrary rather than hard. */
export const RELEASE_WINDOW_SCALE = 1.5;

// lib/slice-it/engine.ts
submitRelease(lane: number): void {
  const held = this.heldByLane.get(lane);
  if (!held?.duration) return;
  const delta = this.audioTime() - (held.time + held.duration);
  const result = judge(delta, this.timingScale * RELEASE_WINDOW_SCALE);

  // Counts toward accuracy like any other judgement — that is the point. The
  // denominator grows by one, so an LN chart's accuracy is comparable to a
  // tap chart's rather than being inflated by unjudged tails.
  this.hitPoints += accuracyWeight(result);
  this.notesResolved += 1;
  this.stats.judgements[result] += 1;
  this.score += pointsFor(result, this.combo, this.multiplier);
}
```

**Prior art.** osu!mania LN release judgement, Etterna, IIDX charge notes.
**Touches.** `scoring.ts`, `constants.ts`, `engine.ts`. **Size.** S

### G6 — Rolls and repeat notes

**Gap.** Sustained energy — a drum fill, a cymbal swell — either charts as a
run of taps or gets dropped by the 55 ms quantisation filter. There is no note
that means "keep hitting".

**Build.** A `ROLL` type scored on hits-per-second inside its window rather
than on individual timing. The onset detector already produces the signal: a
region where flux stays above the adaptive threshold longer than a beat _is_ a
roll.

**Sketch.**

```ts
// lib/slice-it/constants.ts
export const SLICE_TYPES = [, /* … */ 'ROLL'] as const;
/** Points per hit inside a roll. Low, because a roll is many hits. */
export const ROLL_HIT_POINTS = 25;
/** Hits per second needed for full credit. Above this, no extra reward —
 *  otherwise the optimal play is a turbo controller. */
export const ROLL_TARGET_HPS = 8;

// lib/slice-it/beatmap/charter.ts
function detectRolls(flux: Float32Array, threshold: Float32Array, hop: number, beatSec: number) {
  const rolls: { time: number; duration: number }[] = [];
  let runStart = -1;
  for (let i = 0; i < flux.length; i++) {
    const above = flux[i] > threshold[i];
    if (above && runStart < 0) runStart = i;
    if (!above && runStart >= 0) {
      const duration = ((i - runStart) * hop) / SAMPLE_RATE;
      if (duration > beatSec) rolls.push({ time: (runStart * hop) / SAMPLE_RATE, duration });
      runStart = -1;
    }
  }
  return rolls;
}
```

```ts
// lib/slice-it/engine.ts — a roll caps its own reward
private resolveRoll(roll: Slice): void {
  const hps = roll.rollHits! / roll.duration!;
  const ratio = Math.min(1, hps / ROLL_TARGET_HPS);
  this.score += Math.floor(ROLL_HIT_POINTS * roll.rollHits! * ratio * this.multiplier);
  // Accuracy weight is proportional, so a half-hearted roll is a GOOD, not a MISS.
  this.hitPoints += Math.round(100 * ratio);
  this.notesResolved += 1;
}
```

**Prior art.** Taiko drumrolls, DDR rolls, IIDX, StepMania `Roll` notes.
**Touches.** `beatmap/charter.ts`, `constants.ts`, `engine.ts`. **Size.** M

### G7 — Chart-native mines

**Gap.** `BOMB` exists only as a **modifier** — `BOMB_CONVERSION_RATE` converts
5% of eligible notes at runtime. The charter never places one deliberately, so
a bomb never lands anywhere musically meaningful.

**Build.** Place mines at rests the chart wants you _not_ to hit — the gap
after a phrase end, the off-beat inside a syncopated run. Keep the modifier as
a density multiplier over chart-native mines.

**Sketch.**

```ts
// lib/slice-it/beatmap/charter.ts
/**
 * A mine is only meaningful where a player is likely to press anyway. The two
 * places that is true: the beat immediately after a run ends (momentum), and
 * the off-beat inside a syncopated pattern (expectation).
 */
function placeMines(notes: Slice[], beats: number[], tier: Difficulty, rng: () => number): Slice[] {
  if (tier === 'easy') return []; // never on easy
  const mines: Slice[] = [];
  for (let i = 1; i < notes.length; i++) {
    const gap = notes[i].time - notes[i - 1].time;
    const runEnded = gap > beatLength(beats, notes[i].time) * 1.5;
    if (!runEnded || rng() > MINE_RATE[tier]) continue;
    const t = notes[i - 1].time + beatLength(beats, notes[i - 1].time);
    if (t >= notes[i].time) continue; // never inside the next note
    mines.push({ id: `m${i}`, time: t, lane: notes[i - 1].lane, type: 'BOMB' });
  }
  return mines;
}
```

**Prior art.** DDR mines, StepMania, Beat Saber bombs.
**Touches.** `beatmap/charter.ts`. **Size.** S

### G8 — Quantisation colouring

**Gap.** Every note renders identically. `charter.ts` snaps onsets to
`{0, ¼, ⅓, ½, ⅔, ¾}` of the beat and then **throws the subdivision away** — the
single highest-value readability signal the analyser produces, discarded one
function before it could be used.

**Build.** Keep the snapped subdivision on `Slice` and colour the note by it.
Nearly free; the data exists already.

**Sketch.**

```ts
// lib/slice-it/types.ts
export interface Slice {
  // …
  /** Denominator of the beat subdivision this note snapped to: 1 = on the
   *  beat, 2 = eighth, 3 = triplet, 4 = sixteenth. Set by the charter, which
   *  currently computes and discards it. */
  quant?: number;
}

// lib/slice-it/beatmap/charter.ts — inside the existing snap loop
const SUBDIVISIONS = [0, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4] as const;
const QUANT_OF: Record<number, number> = { 0: 1, 0.25: 4, [1 / 3]: 3, 0.5: 2, [2 / 3]: 3, 0.75: 4 };

const nearest = SUBDIVISIONS.reduce((a, b) => (Math.abs(phase - b) < Math.abs(phase - a) ? b : a));
slice.quant = QUANT_OF[nearest]; // ← one line; everything else already ran
```

```ts
// components/slice-it/GameCanvas.tsx
/** StepMania's palette, which two decades of players already read fluently. */
const QUANT_COLORS: Record<number, string> = {
  1: '#ef4444',
  2: '#3b82f6',
  3: '#a855f7',
  4: '#eab308',
};
const noteColor = (s: Slice) => QUANT_COLORS[s.quant ?? 1] ?? COLORS.slice.DEFAULT;
```

**Prior art.** StepMania note colours (the genre standard), Etterna, Quaver.
**Touches.** `beatmap/charter.ts`, `types.ts`, `GameCanvas.tsx`. **Size.** S

### G9 — Scroll speed as a player setting

**Gap.** No scroll-speed setting exists — not in `store.ts`, not in the
settings panel. Note approach speed is whatever the renderer does, so a 90 BPM
chart and a 175 BPM chart are read at wildly different visual densities and the
player cannot correct for it.

**Build.** A persisted `scrollSpeed` with two modes: constant rate (notes
always travel N screen-heights per second — the modern default) and BPM-locked
(speed scales with tempo). Purely visual; must not touch scoring.

**Sketch.**

```ts
// lib/slice-it/store.ts (persisted, version 3)
scrollSpeed: number; // 1.0 = current behaviour
scrollMode: 'constant' | 'bpm';

// components/slice-it/GameCanvas.tsx
/**
 * Approach distance in seconds — how far ahead of the judgement line a note is
 * visible. This is the number players actually tune ("green number" in IIDX),
 * so surface it in ms next to the slider rather than an abstract multiplier.
 */
function approachSeconds(bpm: number, speed: number, mode: 'constant' | 'bpm'): number {
  const base = BASE_APPROACH_SEC / speed; // constant: BPM-independent
  return mode === 'constant' ? base : base * (120 / bpm); // bpm: beat-distance fixed
}

// The note's y is a pure function of it — no other geometry changes.
const progress = (currentTime - (slice.time - approach)) / approach;
```

**Prior art.** Universal. osu!mania scroll speed, StepMania `x-mod`/`c-mod`,
IIDX green number, Clone Hero highway speed.
**Touches.** `store.ts`, `MainMenu.tsx`, `GameCanvas.tsx`. **Size.** S

### G10 — Scroll-velocity gimmicks

**Gap.** `SliceType.SPEED` carries a `speedMultiplier` on a single note. There
is no timeline of scroll-velocity changes, so a chart cannot slow for a
breakdown or accelerate into a drop.

**Build.** An `svPoints` array on `BeatMap`, applied as a piecewise-constant
multiplier on the note-position integral.

**Sketch.**

```ts
// lib/slice-it/chart.ts
export interface SvPoint {
  time: number;
  multiplier: number;
}

/**
 * Position is the INTEGRAL of velocity, not velocity itself.
 *
 * Multiplying the current note's distance by the SV at its own time is the
 * obvious implementation and it is wrong: notes on either side of an SV change
 * would swap order. Precompute the cumulative distance at each SV point once
 * per chart, then a note's position is a lookup plus one multiply.
 */
export function buildSvIntegral(
  points: SvPoint[],
): { time: number; distance: number; mult: number }[] {
  let distance = 0;
  return points.map((point, i) => {
    const previous = points[i - 1];
    if (previous) distance += (point.time - previous.time) * previous.multiplier;
    return { time: point.time, distance, mult: point.multiplier };
  });
}

export function distanceAt(time: number, integral: ReturnType<typeof buildSvIntegral>): number {
  const i = upperBound(integral, time) - 1;
  if (i < 0) return time;
  return integral[i].distance + (time - integral[i].time) * integral[i].mult;
}
```

**Prior art.** osu!mania SV, Quaver, IIDX soflan, Arcaea.
**Touches.** `types.ts`, `chart.ts`, `GameCanvas.tsx`. **Size.** M

### G11 — Downscroll, upscroll and playfield layout

**Gap.** Playfield orientation is fixed by the renderer. Lane 0 is documented
as "top/left", lane 1 as "bottom/right" — one hard-coded geometry.

**Build.** A `playfield` setting: scroll direction, judgement-line position as
a percentage, playfield width. All persisted, all visual-only.

**Sketch.**

```ts
// lib/slice-it/store.ts
playfield: {
  direction: 'down' | 'up' | 'left' | 'right';
  /** Judgement line as a fraction of the field, from the scroll origin. */
  linePosition: number; // 0.1–0.5
  width: number; // 0.5–1.0 of the canvas
}

// components/slice-it/GameCanvas.tsx
/**
 * One transform, applied once per frame, instead of four code paths.
 *
 * Every direction is the "down" case rotated, so the note-drawing code never
 * learns about orientation — which is what stops upscroll from becoming a
 * second renderer that drifts out of sync with the first.
 */
function applyOrientation(ctx: CanvasRenderingContext2D, dir: Direction, w: number, h: number) {
  const quarter = { down: 0, left: 1, up: 2, right: 3 }[dir];
  ctx.translate(w / 2, h / 2);
  ctx.rotate((quarter * Math.PI) / 2);
  ctx.translate(-h / 2, -w / 2); // note the swap on odd quarters
}
```

**Prior art.** osu!mania, Quaver, Etterna, FNF (upscroll by default).
**Touches.** `store.ts`, `GameCanvas.tsx`, `MainMenu.tsx`. **Size.** M

### G12 — Note-attack sound feedback (key sounds)

**Gap.** `hitSound` is a single global sample played per hit
(`engine.ts:430`). Every note in every song sounds the same.

**Build.** Per-note sound assignment from the note's own frequency band — the
charter already computes bass-dominant versus bright-dominant to assign lanes,
so the same signal picks a sample.

**Sketch.**

```ts
// lib/slice-it/types.ts
export interface Slice { /* … */ sound?: 'low' | 'mid' | 'high' }

// lib/slice-it/beatmap/charter.ts — reuses the centroid already computed for lanes
slice.sound = centroidHz < 250 ? 'low' : centroidHz < 2000 ? 'mid' : 'high';

// lib/slice-it/engine.ts
/**
 * Samples are pre-decoded at load, not fetched per hit. A `fetch` on the audio
 * path is a frame hitch, and a frame hitch in a rhythm game is a missed note.
 */
private playHit(slice: Slice): void {
  const variant = this.keySounds ? (slice.sound ?? 'mid') : 'default';
  this.audio.playBuffer(this.hitBuffers[variant], this.sfxVolume);
}
```

**Prior art.** IIDX/BMS key sounds, Taiko don/ka pitch, Rhythm Doctor.
**Touches.** `beatmap/charter.ts`, `engine.ts`, `lib/audio/AudioManager`.
**Size.** M

### G13 — Combo tiers with mechanical weight

**Gap.** Combo multiplies score linearly and without bound — `pointsFor(result,
combo, multiplier)` in `scoring.ts` — so a 400-note chart's last note is worth
400× its first. Score is dominated by chart length, not performance. (The
frame-rate exploit that used to compound this is fixed: hold accrual is now
`HOLD_TICK_POINTS_PER_SECOND`.)

**Build.** Cap the combo multiplier at a tier ceiling and rebalance base points
upward. This makes scores comparable across song lengths, which is the
precondition for `R2`. **Breaking** — needs a board generation and a
recalculated `maxPlausibleScore`.

**Sketch.**

```ts
// lib/slice-it/constants.ts
/** Combo → multiplier. Beat Saber's ×1–×8 shape: fast early growth so a
 *  beginner feels it, hard ceiling so length stops deciding the leaderboard. */
export const COMBO_TIERS: readonly { at: number; mult: number }[] = [
  { at: 0, mult: 1 },
  { at: 10, mult: 2 },
  { at: 25, mult: 4 },
  { at: 50, mult: 6 },
  { at: 100, mult: 8 },
];
export const COMBO_MAX_MULT = 8;

// lib/slice-it/scoring.ts
export function comboMultiplier(combo: number): number {
  let mult = 1;
  for (const tier of COMBO_TIERS) if (combo >= tier.at) mult = tier.mult;
  return mult;
}

export function pointsFor(result: HitResult, combo: number, multiplier: number): number {
  if (result === 'MISS' || result === 'NONE') return 0;
  return Math.floor(HIT_POINTS[result] * comboMultiplier(combo) * multiplier);
}

/**
 * The ceiling becomes LINEAR in note count instead of quadratic, which
 * tightens it enormously — the triangular-number term was why the bound had to
 * be so loose. `integrity.ts` inherits the improvement for free.
 */
export function maxPlausibleScore(durationSeconds: number, modifiers): number {
  const notes = Math.max(64, Math.ceil(duration * MAX_NOTES_PER_SECOND));
  return Math.ceil(
    (HIT_POINTS.MARVELOUS * COMBO_MAX_MULT * notes + HOLD_RELEASE_POINTS * notes) *
      calculateScoreMultiplier(modifiers),
  );
}
```

**Prior art.** DDR/ITG combo tiers, Beat Saber ×1–×8, Guitar Hero streak.
**Touches.** `scoring.ts`, `constants.ts`, `score.ts`, `integrity.ts`.
**Size.** M

### G14 — Section-aware note density

**Gap.** The density budget is a single notes-per-second target per difficulty
spread over the whole track. A quiet intro and a maximal chorus get the same
budget, so intros are over-charted and drops under-charted.

**Build.** Spend the budget proportionally to per-section onset energy (using
`C5`'s boundaries), with a floor and a ceiling.

**Sketch.**

```ts
// lib/slice-it/beatmap/charter.ts
/**
 * Redistribute a global note budget across sections by energy.
 *
 * The floor matters more than the ceiling: a section allocated zero notes reads
 * as the chart having crashed, even when the music genuinely is near-silent.
 */
function budgetBySection(
  total: number,
  sections: Section[],
  tier: Difficulty,
): Map<Section, number> {
  const energySum = sections.reduce((sum, s) => sum + s.energy * (s.end - s.start), 0);
  const out = new Map<Section, number>();
  for (const section of sections) {
    const span = section.end - section.start;
    const share = (section.energy * span) / energySum;
    out.set(
      section,
      clamp(
        Math.round(total * share),
        Math.ceil(span * MIN_NPS[tier]),
        Math.floor(span * NPS_CEILING[tier]),
      ),
    );
  }
  return out;
}
```

**Prior art.** Every hand-charted game; osu!'s spread guidelines.
**Touches.** `beatmap/charter.ts`. **Size.** M

---

## §2 — Charting and the beatmap pipeline (`C1–C12`)

The analyser is the strongest part of the game. These are the things it cannot
do because nothing above it exists.

### C1 — A chart editor

**Gap.** Charts are generated and never edited. There is no editor, no manual
note placement, and `patch-analysis` is the only write path — which since
`d4185549` accepts a chart only for a song that has **none**.

**Build.** Fully specified in
[`../slice-it-chart-editor.md`](../slice-it-chart-editor.md): a `Chart` model
beside `Song.analysisData` (never overwriting it), a canvas timeline with
quantisation colour and hit highlights, the command-pattern undo stack, the
nesting invariant enforced across all four difficulties, playtest through the
real `GameEngine`, onset ghosts from the analyser's rejected candidates, the
linter, and the four **auto-generate scopes** — including `auto-only`, which
regenerates the machine's notes and never touches one a human edited.

**Sketch.** The load-bearing guarantee, in full:

```ts
// lib/slice-it/editor/generate.ts
/**
 * A note with `auto: false` is the author's and is never moved, retyped or
 * removed. Everything else is the generator's and is replaced wholesale.
 *
 * Generated notes yield on collision: one landing within INPUT_COOLDOWN_MS of
 * an author's note in the same lane is unhittable — the engine's own per-lane
 * debounce would swallow it.
 */
export function mergeGenerated(existing: EditorNote[], generated: EditorNote[]): EditorNote[] {
  const kept = existing.filter((note) => !note.auto);
  const guard = INPUT_COOLDOWN_MS / 1000;
  const accepted = generated.filter(
    (c) => !kept.some((n) => n.lane === c.lane && Math.abs(n.time - c.time) < guard),
  );
  return sortByTime([...kept, ...accepted.map((n) => ({ ...n, auto: true }))]);
}
```

**Prior art.** osu! editor, StepMania/ArrowVortex, Quaver editor, Moonscraper.
**Touches.** See the editor doc §2 for the full file layout. **Size.** L

### C2 — Multiple charts per song

**Gap.** `Song.analysisData` is one JSON blob holding one generated chart set.
One song has exactly one interpretation, forever.

**Build.** The `Chart` model from the editor doc §1.1, with `analysisData` kept
as the generated fallback. The details panel gains a chart picker; leaderboards
key on `chartId` (`R1`).

**Sketch.**

```ts
// lib/slice-it/songs.server.ts
/**
 * Charts for a song, newest first, with the generated fallback synthesised as a
 * row when none exist. Callers never branch on "does this song have charts" —
 * there is always at least one.
 */
export async function chartsForSong(songId: string, userId: string | null) {
  const rows = await prisma.chart.findMany({
    where: { songId, OR: [{ status: { in: ['public', 'ranked'] } }, { authorId: userId ?? '' }] },
    select: {
      id: true,
      difficulty: true,
      keys: true,
      name: true,
      rating: true,
      status: true,
      chartHash: true,
      author: { select: userDisplaySelect },
    },
    orderBy: [{ status: 'asc' }, { rating: 'desc' }],
  });
  return rows.length > 0 ? rows : [generatedFallbackRow(songId)];
}
```

**Prior art.** osu! beatmap sets, StepMania packs, Clone Hero alternates.
**Touches.** `prisma/schema.prisma`, `songs.server.ts`, `SongDetailsPanel.tsx`.
**Size.** L

### C3 — A computed difficulty rating

**Gap.** Difficulty is one of four names. Two `expert` charts can be an order
of magnitude apart, and `SONG_SORTS` (`recent`/`popular`/`liked`/`title`/
`duration`) offers no way to find something at your level.

**Build.** A numeric rating computed at analysis time from the chart itself:
peak and sustained NPS, jack density, burst length, hold overlap, and the
subdivision mix from `G8`.

**Sketch.**

```ts
// lib/slice-it/rating.ts  (browser-safe: the editor rates live as you type)
/**
 * Weights are a starting point, not a result. Calibrate them against the
 * clear-rate data from R9 once it exists — every mature rating system in the
 * genre was tuned against play data, not derived from first principles.
 */
const W = { peakNps: 0.35, sustainedNps: 0.25, jacks: 0.2, bursts: 0.1, holds: 0.1 };

export function rateChart(notes: Slice[], duration: number): number {
  const peak = maxOverWindow(notes, 1.0); // hardest second
  const sustained = percentileOverWindow(notes, 8.0, 0.9); // hardest sustained 8s
  const jacks = countJacks(notes) / Math.max(1, notes.length);
  const bursts = longestRun(notes, 0.12) / 16;
  const holds = notes.filter((n) => n.type === 'LONG').length / Math.max(1, notes.length);

  const raw =
    W.peakNps * peak +
    W.sustainedNps * sustained +
    W.jacks * jacks * 20 +
    W.bursts * bursts * 8 +
    W.holds * holds * 6;

  // Compressed to a 1–20 scale: linear NPS reads as "13 is twice 6.5", which is
  // not how difficulty is experienced at the top of the range.
  return Math.round(Math.min(20, 2.2 * Math.pow(raw, 0.78)) * 10) / 10;
}

/** Same-lane consecutive notes — the pattern most under-weighted by raw NPS. */
function countJacks(notes: Slice[]): number {
  let n = 0;
  for (let i = 1; i < notes.length; i++) {
    if (notes[i].lane === notes[i - 1].lane && notes[i].time - notes[i - 1].time < 0.2) n++;
  }
  return n;
}
```

**Prior art.** osu! star rating, Etterna MSD, Quaver difficulty, IIDX levels.
**Touches.** `beatmap/charter.ts`, new `lib/slice-it/rating.ts`,
`prisma/schema.prisma`, `SongLibrary.tsx`. **Size.** M

### C4 — Stem separation for melody-aware charts

**Gap.** The analyser charts the mixed signal. Lane assignment splits by
frequency band, which approximates "drums versus everything else" and fails
whenever a bassline and a kick share a band.

**Build.** A Go worker step running source separation and handing the charter
four stems: drums drive the rhythm skeleton, vocals and lead drive melodic
notes.

**Sketch.**

```go
// go-services/supervisor/stems/worker.go
// Separation is minutes of CPU, not the ~2s the rest of analysis takes, so it
// is a queued job that PATCHes the chart when done — never inline with upload.
type StemJob struct {
    SongID   string
    AudioKey string
}

func (w *Worker) Handle(ctx context.Context, job StemJob) error {
    stems, err := w.separator.Run(ctx, job.AudioKey) // drums/bass/vocals/other
    if err != nil {
        // A failure must leave the mixed-signal chart in place: a song with a
        // worse chart is fine, a song with no chart is broken.
        log.Warn(ctx, "stem separation failed, keeping mixed chart", "song", job.SongID)
        return nil
    }
    return w.api.PatchAnalysis(ctx, job.SongID, chartFromStems(stems))
}
```

**Prior art.** Rock Band/Clone Hero per-instrument charts, Rocksmith.
**Touches.** `go-services/supervisor/`, `lib/slice-it/beatmap/`. **Size.** L

### C5 — Section detection

**Gap.** The analyser produces onsets, a tempo and a beat grid. It has no
notion of structure, so nothing downstream can reason about "the chorus".

**Build.** A self-similarity matrix over the log-frequency filterbank output
that `spectrum.ts` already computes, with novelty peak-picking for boundaries.
Feeds `G14`, `P2`, `H5`, `L7`, `V3`.

**Sketch.**

```ts
// lib/slice-it/beatmap/sections.ts
/**
 * Foote's novelty: correlate a checkerboard kernel along the diagonal of the
 * self-similarity matrix. Peaks are where the music stops sounding like what
 * came before.
 *
 * Computed on BEAT-synchronous frames, not raw STFT frames — a 4-minute track
 * is ~50k STFT frames (a 2.5-billion-cell matrix, impossible) and ~500 beats
 * (250k cells, trivial). The beat grid is already tracked, so this is free.
 */
export function detectSections(bands: Float32Array[], beats: number[]): Section[] {
  const frames = beats.map((t) => meanBandsAround(bands, t));
  const ssm = cosineSimilarityMatrix(frames);
  const novelty = correlateCheckerboard(ssm, KERNEL_SIZE);
  const peaks = pickPeaks(novelty, { minDistance: 8 /* beats */ });

  return peaks.map((p, i) => ({
    start: beats[p],
    end: beats[peaks[i + 1] ?? beats.length - 1],
    energy: meanEnergy(bands, beats[p], beats[peaks[i + 1] ?? beats.length - 1]),
    label: '', // labelled by rank: the highest-energy repeated section is "chorus"
  }));
}
```

**Prior art.** osu! kiai time, Guitar Hero star-power phrases.
**Touches.** `beatmap/spectrum.ts`, new `beatmap/sections.ts`. **Size.** M

### C6 — A real timing map instead of one BPM

**Gap.** `BeatMap.bpm` is a single number and `Song.bpm` a single nullable
float. The DP beat tracker already produces a full beat sequence that handles
drift — and the result is collapsed to one average tempo.

**Build.** Persist the beat sequence as `timingPoints`. Everything that divides
by a global BPM (subdivision snapping, `P4`'s metronome, the editor grid)
becomes correct on tempo-changing tracks, which today are charted against an
average that fits neither half.

**Sketch.**

```ts
// lib/slice-it/types.ts
export interface TimingPoint {
  time: number;
  bpm: number;
  meter: number;
}

// lib/slice-it/beatmap/tempo.ts
/**
 * Compress the tracked beat sequence into timing points.
 *
 * One point per beat would be technically correct and useless — the editor
 * would render 500 draggable markers on a metronomic track. Emit a point only
 * where the inter-beat interval actually changes.
 */
export function timingPointsFrom(beats: number[], toleranceBpm = 1.5): TimingPoint[] {
  const points: TimingPoint[] = [];
  let currentBpm = 0;
  for (let i = 1; i < beats.length; i++) {
    const bpm = 60 / (beats[i] - beats[i - 1]);
    if (Math.abs(bpm - currentBpm) > toleranceBpm) {
      points.push({ time: beats[i - 1], bpm: round(bpm, 2), meter: 4 });
      currentBpm = bpm;
    }
  }
  return points;
}
```

**Prior art.** osu! timing points, StepMania BPM changes, Clone Hero sync track.
**Touches.** `beatmap/tempo.ts`, `beatmap/index.ts`, `types.ts`. **Size.** M

### C7 — Preview points

**Gap.** The library plays nothing. `SongLibrary.tsx` renders metadata cards;
the only way to hear a track is to start a run.

**Build.** A `previewStart`, defaulted to the highest-energy section boundary
from `C5`, and a 20-second preview served by range request — which
`d4185549` made cheap by adding `getObjectRange` (previously a range read
fetched the whole object).

**Sketch.**

```ts
// components/slice-it/SongLibrary.tsx
/**
 * One shared <audio> element for the whole grid, not one per card: thirty
 * elements each holding a connection is how a library page stalls.
 */
const preview = usePreviewPlayer();

<button
  onPointerEnter={() => preview.play(song.id, song.previewStart)}
  onPointerLeave={() => preview.stop()}
  // Touch has no hover, so previewing there is an explicit tap on the art.
  onFocus={() => preview.play(song.id, song.previewStart)}
/>;

// lib/slice-it/usePreviewPlayer.ts
function play(songId: string, start: number) {
  // 250 ms debounce — sweeping the cursor across a grid must not fire thirty
  // range requests.
  clearTimeout(timer.current);
  timer.current = setTimeout(() => {
    el.src = `/api/slice-it/songs/stream/${songId}#t=${start},${start + 20}`;
    void el.play();
  }, 250);
}
```

**Prior art.** osu! song select previews, Beat Saber, Muse Dash.
**Touches.** `beatmap/`, `SongLibrary.tsx`. **Size.** S

### C8 — Chart regeneration on demand

**Gap.** `BEATMAP_VERSION` gates charts, but since `d4185549` the only
self-service upgrade path is gone for songs that already play: a stranger may
chart a song with **no** chart, and replacing a working chart is the uploader's
or an admin's call. Songs charted at version N stay at version N.

**Build.** An explicit "regenerate" action for the uploader and admins, plus a
rate-limited backfill in the Go supervisor for stale generated charts. Respect
the new ownership rule: never regenerate a chart with `isGenerated: false`,
because that one has a human in it.

**Sketch.**

```ts
// server/jobs/slice-regen.ts
/**
 * Only ever touches charts nobody has edited. `isGenerated` is the flag the
 * editor clears on first edit, and it is the whole safety property here.
 */
export async function backfillStaleCharts(limit = 25) {
  const stale = await prisma.chart.findMany({
    where: { isGenerated: true, generatorVersion: { lt: BEATMAP_VERSION } },
    select: { id: true, songId: true, difficulty: true },
    orderBy: { updatedAt: 'asc' },
    take: limit,
  });

  for (const chart of stale) {
    const next = await analyseSong(chart.songId);
    if (!next) continue; // analysis failed: keep the old chart
    await prisma.chart.update({
      where: { id: chart.id },
      data: {
        notes: next[chart.difficulty],
        generatorVersion: BEATMAP_VERSION,
        chartHash: chartHashOf(next[chart.difficulty]),
      },
      select: { id: true }, // never return the notes blob
    });
  }
}
```

**Prior art.** osu! ranking-criteria re-checks; Beat Saber map re-uploads.
**Touches.** `go-services/supervisor/`, `server/jobs/`, chart API. **Size.** M

### C9 — Import external chart formats

**Gap.** Every chart is generated by our own analyser. There is no import path,
so decades of community charting is unreachable.

**Build.** Parsers for `.sm`/`.ssc`, `.osu` and `.chart`, mapping onto `Slice`,
behind an uploader-supplied audio file. Conversions are marked as such and stay
out of the ranked pool (`R10`) unless verified.

**Sketch.**

```ts
// lib/slice-it/import/osu-mania.ts
/**
 * osu!mania column x is `floor(x * keys / 512)` — the playfield is 512 units
 * wide regardless of key count. Getting this wrong silently shifts every note
 * one lane, which reads as "the import is bad" rather than "the constant is".
 */
export function parseOsu(text: string): ImportedChart {
  const keys = Number(/CircleSize:\s*(\d+)/.exec(text)?.[1] ?? 4);
  const notes: Slice[] = [];

  for (const line of section(text, 'HitObjects')) {
    const [x, , time, type, , extra] = line.split(',');
    const lane = Math.floor((Number(x) * keys) / 512);
    const isHold = (Number(type) & 128) !== 0;
    notes.push({
      id: `i${notes.length}`,
      time: Number(time) / 1000,
      lane,
      type: isHold ? 'LONG' : 'STANDARD',
      ...(isHold ? { duration: (Number(extra.split(':')[0]) - Number(time)) / 1000 } : {}),
    });
  }
  return { keys, notes: sortByTime(notes), source: 'osu' };
}
```

**Prior art.** Quaver imports osu!; Etterna imports osu!/SM; Clone Hero.
**Touches.** new `lib/slice-it/import/`, upload route. **Size.** L

### C10 — Uploader density override

**Gap.** The uploader has no influence on their chart. Density budgets are
per-tier constants; if the analyser over-charts a sparse ambient track, the only
recourse is deletion.

**Build.** A `densityBias` (−2…+2) applied as a multiplier to the tier budgets,
with a live re-chart preview. The most common upload complaint becomes a slider.

**Sketch.**

```ts
// lib/slice-it/beatmap/charter.ts
/**
 * Exponential, not linear: −1 should mean "noticeably sparser" and −2 "half as
 * many", which linear steps of 0.25 do not deliver at the sparse end.
 */
export function biasedBudget(base: number, bias: number): number {
  return base * Math.pow(1.45, clamp(bias, -2, 2));
}
```

**Prior art.** Beat Saber auto-mapper settings, Audiosurf presets.
**Touches.** `beatmap/charter.ts`, `SongDetailsPanel.tsx`. **Size.** S

### C11 — Chart linting

**Gap.** Nothing checks a generated chart for playability before a player sees
it. The only rules are the two inline lane constraints in the assigner.

**Build.** A lint pass shared with the editor (see the editor doc §9):
unhittable jacks, notes inside the first 2 seconds, holds shorter than their
release window, density spikes, empty stretches, off-grid notes.

**Sketch.** The rule that is not a taste question:

```ts
// lib/slice-it/editor/lint.ts — shared by the upload route and the editor
/**
 * A note less than INPUT_COOLDOWN_MS after the previous note in the same lane
 * cannot be hit: the engine's own per-lane debounce swallows the second press.
 * Error, not warning — no player skill changes the outcome.
 */
if (previous && note.time - previous.time < INPUT_COOLDOWN_MS / 1000) {
  add(note.id, {
    code: 'unhittable-jack',
    severity: 'error',
    message: `${Math.round((note.time - previous.time) * 1000)} ms after the previous note in this lane.`,
  });
}
```

**Prior art.** osu! AiMod, Quaver's validator, ArrowVortex checks.
**Touches.** `lib/slice-it/editor/lint.ts`, upload route. **Size.** S

### C12 — Deterministic chart hashing

**Gap.** `Song.contentHash` hashes the **audio**, per uploader. Nothing
identifies a _chart_, so two players cannot prove they played the same notes,
and a leaderboard cannot tell that a regeneration changed the chart under it.

**Build.** A stable `chartHash` over the canonicalised note list plus
`BEATMAP_VERSION`, recorded on every leaderboard row and replay. Prerequisite
for `R1`, `R3`, `R8` and `R10`.

**Sketch.**

```ts
// lib/slice-it/editor/hash.ts
/**
 * Canonical form, then SHA-256.
 *
 * Two things must be true or the hash is worthless: key order cannot matter
 * (JSON.stringify of an object literal is insertion-ordered), and floats must
 * be quantised (0.1+0.2 !== 0.3, and a note that round-trips through the DB as
 * 1.2340000000000002 must hash the same as the 1.234 that was written).
 */
export function chartHashOf(notes: Slice[], version = BEATMAP_VERSION): string {
  const canonical = notes
    .map((n) =>
      [
        Math.round(n.time * 1000), // ms, integer
        n.lane,
        n.type,
        n.duration ? Math.round(n.duration * 1000) : 0,
      ].join(':'),
    )
    .sort() // order-independent
    .join('|');
  return sha256(`v${version}|${canonical}`);
}
```

**Prior art.** osu! beatmap MD5, Etterna chart keys, GrooveStats hashes.
**Touches.** `beatmap/index.ts`, `prisma/schema.prisma`, `score.ts`. **Size.** S

---

## §3 — Practice, training and improvement (`P1–P10`)

### P1 — Practice mode

**Gap.** No seek and no loop exist in the engine — `start()`, `pause()`,
`resume()` and `reset()` are the whole transport. Speed below 1.0× is supported
but hard-rejected by the score route (`RANKED_MIN_SPEED`), which is right for
ranking and leaves slow practice with no home.

**Build.** A practice mode with a seek bar, A/B loop markers, a 0.5× speed
slider and an explicit unranked banner. Add `mode` to the run rather than making
the score route lenient.

**Sketch.**

```ts
// lib/slice-it/engine.ts
/**
 * Seeking has to reset per-note render state, not just the clock. A slice
 * carries `hit`/`hitTime` as runtime state; seeking backwards past a note that
 * still says `hit: true` means it never re-arms and the player watches it pass.
 */
seek(seconds: number): void {
  this.audio.seek(seconds);
  this.startedAt = this.now() - seconds * 1000;
  for (const slice of this.slices) {
    if (slice.time >= seconds) { slice.hit = false; slice.hitTime = undefined; }
  }
  this.processed = new Set([...this.processed].filter((id) => timeOf(id) < seconds));
  this.combo = 0;   // a combo across a seek is not a combo
}

update(): void {
  // … existing
  if (this.loop && this.audioTime() >= this.loop.end) this.seek(this.loop.start);
}
```

```ts
// lib/slice-it/useSubmitScore.ts
/**
 * Structural, not conventional: a practice run cannot reach the leaderboard
 * because the hook that submits refuses to, not because the UI hides a button.
 */
if (run.mode === 'practice') return { status: 'unranked' as const };
```

**Prior art.** osu! practice/test play, StepMania, Clone Hero, Rocksmith.
**Touches.** `engine.ts`, `useStartRun.ts`, `useSubmitScore.ts`,
`GameCanvas.tsx`. **Size.** M

### P2 — Failed-section drilling

**Gap.** Nothing records _where_ in a chart you missed. `RunStats` keeps a
judgement histogram and totals; timestamps are discarded at the end of the run.

**Build.** Keep per-note results with timestamps for the last run, bucket them
by section (`C5`), and offer "drill the worst section" — a loop at a chosen
speed that ratchets up as accuracy improves.

**Sketch.**

```ts
// lib/slice-it/engine.ts — the engine already computes this; it just discards it
private noteLog: { time: number; result: HitResult; offset: number }[] = [];

// `recordOffset()` (shipped in fb34b5f0 for integrity) is called on every hit
// already. Appending one row there is the entire data-collection change.

// lib/slice-it/drill.ts
export function worstSection(log: NoteLog[], sections: Section[]): Section | null {
  return sections
    .map((s) => ({ s, acc: accuracyIn(log, s.start, s.end) }))
    .filter((x) => x.acc.notes >= 8)        // ignore a section with three notes
    .sort((a, b) => a.acc.value - b.acc.value)[0]?.s ?? null;
}

/** Rocksmith's ratchet: succeed twice, speed up; fail, slow down. */
export function nextRate(rate: number, cleared: boolean): number {
  return clamp(cleared ? rate + 0.1 : rate - 0.1, 0.5, 1.0);
}
```

**Prior art.** Rocksmith Riff Repeater (the canonical implementation), Clone
Hero practice, Yousician.
**Touches.** `engine.ts`, `GameOver.tsx`, new `lib/slice-it/drill.ts`.
**Size.** M

### P3 — Autoplay

**Gap.** There is no way to watch a chart played correctly. A player who cannot
read a pattern has no reference, and there is no attract mode.

**Build.** An autoplay run resolving each note as `MARVELOUS` at its exact
time, usable as an in-menu "watch" and as a menu-background attract loop.

**Sketch.**

```ts
// lib/slice-it/engine.ts
/**
 * Autoplay resolves in `update()`, not by synthesising input events — a fake
 * keydown would go through the same latency reconstruction as a real one and
 * land a fraction late, which is exactly the artefact autoplay must not have.
 */
update(): void {
  if (this.autoplay) {
    const now = this.audioTime();
    for (const slice of this.upcoming(now)) {
      if (slice.hit || slice.time > now) break;
      if (slice.type === 'BOMB') { slice.hit = true; continue; }  // never slice a bomb
      this.resolve(slice, 'MARVELOUS', slice.lane);
    }
  }
  // … existing
}
```

Autoplay must be structurally unable to submit — same guard as `P1`.

**Prior art.** osu! auto mod, StepMania autoplay, IIDX demo.
**Touches.** `engine.ts`. **Size.** S

### P4 — Assist tick and metronome

**Gap.** The only audio feedback is `hitSound` on a successful hit. A player
who is systematically early hears nothing that tells them so.

**Build.** Two toggles: a **metronome** on the beat grid (needs `C6` to be
right on tempo-changing tracks) and an **assist tick** on every note's exact
time regardless of whether you hit it.

**Sketch.**

```ts
// lib/slice-it/engine.ts
/**
 * Scheduled ahead on the audio clock, never fired from `update()`.
 *
 * A tick triggered when the frame loop notices the time has passed inherits the
 * frame's jitter — a metronome that wobbles by a frame is worse than none,
 * because the player calibrates against it.
 */
private scheduleTicks(fromSec: number, horizonSec = 2): void {
  for (const beat of this.beatsBetween(fromSec, fromSec + horizonSec)) {
    this.audio.scheduleBuffer(this.tickBuffer, this.audioStartTime + beat / this.rate);
  }
}
```

**Prior art.** osu! metronome, StepMania assist tick, DDR.
**Touches.** `engine.ts`, `store.ts`, `MainMenu.tsx`. **Size.** S

### P5 — Automatic offset calibration

**Gap.** `CalibrationScreen.tsx` exists and `audioOffset` persists (±500 ms),
but calibration is a manual slider — the player guesses, plays, guesses again.
Nothing applies their measured error, **even though `fb34b5f0` now computes it**:
the engine keeps a Welford mean of hit offsets for `integrity.ts`.

**Build.** After any run, if the mean offset is consistently non-zero across
enough notes, offer a one-tap "apply suggested offset". The single highest-value
QOL change in the document, and the measurement now already exists.

**Sketch.**

```ts
// components/slice-it/GameOver.tsx
/**
 * The engine's timing summary is already computed and already submitted with
 * the score (`getTimingSummary()`, added for integrity.ts). Reading it here
 * costs nothing.
 *
 * Thresholds: 8 ms is inside the MARVELOUS window (20 ms) and not worth
 * chasing; below 30 samples the mean is noise. A wide stdDev means inconsistent
 * play, not a wrong offset — suggesting a shift there would make it worse.
 */
const timing = engine?.getTimingSummary();
const suggest =
  timing && timing.count >= 30 && Math.abs(timing.meanMs) > 8 && timing.stdDevMs < 60
    ? Math.round(-timing.meanMs)
    : null;

{suggest !== null && (
  <button className="neumorphic px-4 py-2" onClick={() => setAudioOffset(audioOffset + suggest)}>
    {t('apply-offset', {
      defaultValue: 'You hit {{dir}} by {{ms}} ms on average — apply offset?',
      dir: suggest < 0 ? 'late' : 'early',
      ms: Math.abs(suggest),
    })}
  </button>
)}
```

**Prior art.** osu! offset wizard, Etterna auto-calibration, Quaver.
**Touches.** `GameOver.tsx`, `store.ts`. **Size.** S

### P6 — Timing error statistics, shown

**Gap.** `fb34b5f0` added the measurement — the engine keeps a Welford
mean/variance and `getTimingSummary()` returns `{count, meanMs, stdDevMs}`,
submitted with the score for `integrity.ts`. **The player never sees any of
it.** The results screen shows score, multiplier, max combo, accuracy and a
grade.

**Build.** Surface mean error and standard deviation (the genre calls the latter
**unstable rate**, ×10 of stdDev in ms) on the results screen with a hit
distribution plot. The pipeline exists end to end; this is a renderer.

**Sketch.**

```tsx
// components/slice-it/GameOver.tsx
/**
 * Unstable rate is stdDev × 10 by convention (osu!), which puts a typical run
 * in the 60–200 range instead of 6–20 — a scale players already read.
 */
const ur = (timing.stdDevMs * 10).toFixed(0);
const bias = timing.meanMs > 0 ? t('early') : t('late');

<div className="neumorphic-inset px-4 py-3">
  <dl className="grid grid-cols-2 gap-2 text-sm">
    <dt>{t('unstable-rate', { defaultValue: 'Unstable rate' })}</dt>
    <dd className="font-mono">{ur}</dd>
    <dt>{t('timing-bias', { defaultValue: 'Bias' })}</dt>
    <dd className="font-mono">
      {Math.abs(timing.meanMs).toFixed(1)} ms {bias}
    </dd>
  </dl>
</div>;
```

Per-note offsets are needed for the histogram itself; keep them client-side (the
submission deliberately sends three numbers, not samples — see `integrity.ts`).

**Prior art.** osu! unstable rate (the reference), Etterna, Quaver.
**Touches.** `GameOver.tsx`, `engine.ts` (expose the sample buffer locally).
**Size.** S

### P7 — Adaptive difficulty warm-up

**Gap.** Difficulty is chosen once per run from four names. Nothing responds to
how the player is doing.

**Build.** A warm-up session: start at the last-cleared tier, step up on a clean
clear, step down on a fail, across a queue of songs, picking the next chart by
`C3`'s numeric rating rather than the four buckets.

**Sketch.**

```ts
// lib/slice-it/session.ts
/**
 * Target a ~75% clear rate: high enough to feel like progress, low enough that
 * the ladder is still climbing. Overshoot correction is asymmetric on purpose —
 * failing should drop you further than clearing raises you, or a plateau reads
 * as a wall.
 */
export function nextRating(current: number, cleared: boolean, accuracy: number): number {
  if (!cleared) return Math.max(1, current - 1.2);
  if (accuracy > 0.97) return current + 0.8;
  if (accuracy > 0.9) return current + 0.4;
  return current;
}
```

**Prior art.** NecroDancer progression, Muse Dash course mode, Rocksmith.
**Touches.** new `lib/slice-it/session.ts`, `MainMenu.tsx`. **Size.** M

### P8 — A weakness profile

**Gap.** Nothing is aggregated across runs. `Player.totalScore` and
`gamesPlayed` are the only career state; there is no record of what a player is
good or bad at.

**Build.** Classify each note by pattern type at chart time and aggregate
per-player accuracy per type across runs. Show it as a radar and use it to
recommend charts targeting the weakest axis.

**Sketch.**

```ts
// lib/slice-it/patterns.ts
export type Pattern = 'jack' | 'trill' | 'stream' | 'chord' | 'hold' | 'burst' | 'isolated';

/**
 * Classified once, at chart time, and stored on the note — not recomputed per
 * run. The classification is a property of the chart, and doing it per
 * submission would be the same work N times.
 */
export function classify(notes: Slice[], i: number): Pattern {
  const prev = notes[i - 1],
    next = notes[i + 1];
  if (notes[i].type === 'LONG') return 'hold';
  if (prev && Math.abs(prev.time - notes[i].time) < 1e-3) return 'chord';
  const gapBefore = prev ? notes[i].time - prev.time : Infinity;
  if (gapBefore > 0.5) return 'isolated';
  if (prev && prev.lane === notes[i].lane) return 'jack';
  if (prev && next && next.lane === prev.lane && gapBefore < 0.16) return 'trill';
  return gapBefore < 0.1 ? 'burst' : 'stream';
}
```

```prisma
/// One row per player per pattern. Small, and updated with an upsert on submit.
model SlicePatternStat {
  userId    String
  pattern   String @db.VarChar(16)
  hitPoints Float  @default(0)   // running accuracy-weight sum
  notes     Int    @default(0)
  @@id([userId, pattern])
}
```

**Prior art.** Etterna's skillset breakdown, osu!'s pp decomposition.
**Touches.** `prisma/schema.prisma`, new `lib/slice-it/patterns.ts`, `score.ts`.
**Size.** L

### P9 — Race your own personal best

**Gap.** The leaderboard shows a number after the fact. During a run there is no
reference point — you cannot tell mid-song whether you are ahead of your PB.

**Build.** Store a sampled score curve alongside the leaderboard row and draw it
as a ghost line against your live score, reusing the multiplayer sidebar's
existing live-score rendering with a synthetic opponent.

**Sketch.**

```ts
/**
 * One sample per second, quantised to a Uint32Array. A 15-minute track is 900
 * samples = 3.6 KB — small enough to store on the leaderboard row and load with
 * it, which is what makes the ghost appear instantly rather than after a fetch.
 */
export function sampleCurve(log: { time: number; score: number }[], duration: number): number[] {
  const out = new Array(Math.ceil(duration)).fill(0);
  let j = 0,
    last = 0;
  for (let s = 0; s < out.length; s++) {
    while (j < log.length && log[j].time <= s) last = log[j++].score;
    out[s] = last; // step function: score never decreases within a second
  }
  return out;
}
```

```prisma
model SongLeaderboard {
  /// Sampled score curve for the ghost. Null on rows set before P9.
  scoreCurve Json?
}
```

**Prior art.** Beat Saber score ghost, Trackmania ghosts, DDR EX pace.
**Touches.** `prisma/schema.prisma`, `score.ts`, `MultiplayerSidebar.tsx`,
`HUD.tsx`. **Size.** M

### P10 — A tutorial

**Gap.** A new player's first screen is a song library and a settings panel with
keybinds, two volume sliders, a hit-sound picker and a calibration button.
Nothing explains a `MARVELOUS`, a hold, a bomb or a lane.

**Build.** A short scripted chart on a bundled track introducing one mechanic at
a time, ending in the calibration screen so offset is set before the first real
run.

**Sketch.**

```ts
// data/slice-it/tutorial.json — a hand-authored chart, not a generated one
{
  "steps": [
    { "at": 0,  "prompt": "tutorial.lane-a", "notes": [{ "time": 2, "lane": 0, "type": "STANDARD" }] },
    { "at": 8,  "prompt": "tutorial.lane-b", "notes": [{ "time": 10, "lane": 1, "type": "STANDARD" }] },
    { "at": 16, "prompt": "tutorial.hold",   "notes": [{ "time": 18, "lane": 0, "type": "LONG", "duration": 1.5 }] },
    { "at": 24, "prompt": "tutorial.bomb",   "notes": [{ "time": 26, "lane": 1, "type": "BOMB" }] }
  ]
}
```

```ts
/**
 * Gate the first-play achievement on finishing or explicitly skipping, so
 * "On Beat" means the player played rather than that the route rendered.
 */
if (!hasSeenTutorial && !skipped) return <Tutorial onDone={markSeen} onSkip={markSeen} />;
```

**Prior art.** Every rhythm game ships one; Rhythm Doctor's is best in class.
**Touches.** new `components/slice-it/Tutorial.tsx`, `data/`. **Size.** M

---

## §4 — Accessibility and comfort (`A1–A10`)

`lib/game-capabilities.ts:173` declares Slice It!'s `accessibility` array as
**empty** and its descriptors as `['flashing', 'user-content']`. That is an
accurate self-assessment, and it is the gap.

### A1 — No-fail and assist modes

**Gap.** With `G1` there is a fail state; without it only Sudden Death. Either
way there is no assist tier — no way for a player who cannot clear a chart to
see the end of it.

**Build.** `noFail` and `assist` (0.75× speed, full visuals), both explicitly
unranked and surfaced in the modifier panel rather than buried in settings.

**Sketch.**

```ts
// lib/slice-it/modifiers.ts
/**
 * Assist mods live in their own group and never carry a bonus — the framing
 * matters. A mod that makes the game easier and pays nothing is a setting; one
 * that pays a penalty is a punishment for needing it.
 */
export const ASSIST_MODIFIERS = ['noFail', 'assist', 'tapHolds', 'lenientTiming'] as const;

export function isRanked(modifiers: Modifiers): boolean {
  if (modifiers.speed < RANKED_MIN_SPEED) return false;
  return !ASSIST_MODIFIERS.some((key) => modifiers[key]);
}

// lib/game-capabilities.ts
'slice-it': { /* … */ accessibility: ['assist-mode', 'no-fail'] },
```

**Prior art.** IIDX assisted clear, DDR no-recover, Celeste's assist framing.
**Touches.** `modifiers.ts`, `constants.ts`, `game-capabilities.ts`. **Size.** S

### A2 — A photosensitivity mode

**Gap.** The game declares `descriptors: ['flashing']` and offers nothing to
turn the flashing off. `canvasGlowEnabled()` degrades blur for _performance_,
which is a different axis — a fast machine still gets the full flash.

**Build.** A `reducedFlash` setting capping luminance delta per frame, disabling
combo flashes and hit-burst particles and forcing `spin` off. Default from
`prefers-reduced-motion`, honoured independently of the performance tier.

**Sketch.**

```ts
// components/slice-it/GameCanvas.tsx
/**
 * WCAG 2.3.1 is three flashes per second. Rather than counting flashes, cap how
 * much the frame's mean luminance may move — that bounds the same hazard and
 * needs no history beyond the previous frame.
 */
const MAX_LUMA_DELTA = 0.12;

function flashAlpha(requested: number, previousLuma: number, targetLuma: number): number {
  if (!reducedFlash) return requested;
  const delta = Math.abs(targetLuma - previousLuma);
  return delta <= MAX_LUMA_DELTA ? requested : requested * (MAX_LUMA_DELTA / delta);
}

// Particles and combo bursts are skipped entirely rather than dimmed: a dim
// flash at 60 Hz is still a flash.
if (reducedFlash) {
  /* no burst, no shake, no palette pulse */
}
```

**Prior art.** WCAG 2.3.1; Beat Saber reduced debris; Muse Dash effect toggles.
**Touches.** `GameCanvas.tsx`, `store.ts`, `hooks/useReducedMotion`. **Size.** S

### A3 — Colour-blind-safe lane palettes

**Gap.** `GameCanvas.tsx:26` hard-codes `lane1: '#3b82f6'` (blue) and
`lane2: '#f472b6'` (pink), with bombs at `#ef4444` (red). Red bombs against pink
notes is a deuteranopia problem, and the palette is not configurable.

**Build.** Three or four named palettes validated against protanopia,
deuteranopia and tritanopia, plus a shape differentiator on bombs so colour is
never the only channel carrying "do not hit this".

**Sketch.**

```ts
// lib/slice-it/palettes.ts
export const LANE_PALETTES = {
  default: { lanes: ['#3b82f6', '#f472b6'], bomb: '#ef4444' },
  /** Blue/orange survives all three dichromacies — the safest two-hue pair. */
  deuteranopia: { lanes: ['#0072b2', '#e69f00'], bomb: '#000000' },
  tritanopia: { lanes: ['#d55e00', '#009e73'], bomb: '#000000' },
  /** Luminance-only, for anyone the hue pairs still fail. */
  monochrome: { lanes: ['#f5f5f5', '#4a4a4a'], bomb: '#000000' },
} as const;

/**
 * Shape is the redundant channel: a bomb is drawn as a spiked polygon, never a
 * pill, so "do not hit this" survives every palette and every form of
 * colour-blindness. WCAG 1.4.1 in a canvas.
 */
function drawSlice(ctx, slice, palette) {
  if (slice.type === 'BOMB') return drawSpiked(ctx, palette.bomb);
  return drawPill(ctx, palette.lanes[slice.lane]);
}
```

**Prior art.** osu! skinning, Beat Saber colour schemes, DDR arrow colours.
**Touches.** `GameCanvas.tsx`, `slice-it.css`, `store.ts`. **Size.** S

### A4 — Deaf and hard-of-hearing support

**Gap.** The entire feedback loop is audio. Hit confirmation is a sample; there
is no visual beat reference.

**Build.** A visual metronome pulsing the judgement line on each beat (`C6`'s
timing map), a stronger visual hit confirmation, and an optional spectrum strip
so the music is visible. Also makes the game playable with sound off, which is a
much larger audience than the accessibility framing implies.

**Sketch.**

```ts
/**
 * Pulse from the beat grid, not from the audio amplitude: amplitude lags the
 * beat by the attack time of whatever is playing, so an amplitude-driven pulse
 * is visibly late on anything with a soft attack.
 */
function beatPulse(now: number, beats: number[]): number {
  const beat = previousBeat(beats, now);
  const age = now - beat;
  return Math.max(0, 1 - age / 0.12); // 120 ms decay
}
```

**Prior art.** Beat Saber beat indicators; DDR cabinet accessibility patches.
**Touches.** `GameCanvas.tsx`, `HUD.tsx`. **Size.** M

### A5 — One-handed play as a supported configuration

**Gap.** `oneTrack` collapses both lanes onto one — mechanically exactly what a
one-handed player needs — and is filed as a _challenge modifier_ worth `+0.15`,
which frames it as a handicap taken on for credit.

**Build.** Keep the modifier; add an accessibility framing presenting the same
mechanic without the challenge language, alongside single-key binds and a touch
layout with one large target.

**Sketch.**

```tsx
/**
 * Same mechanic, two doors. The modifier panel keeps "One Track (+0.15×)"; the
 * accessibility panel offers "One-handed" with no multiplier language at all,
 * setting the identical flag.
 */
<Toggle
  checked={modifiers.oneTrack}
  onChange={(v) => setModifiers({ ...modifiers, oneTrack: v })}
  label={t('one-handed', { defaultValue: 'One-handed play' })}
  description={t('one-handed-desc', {
    defaultValue: 'Every note arrives on a single lane.',
  })}
/>
```

**Prior art.** Beat Saber one-handed modes; AbleGamers guidance.
**Touches.** `MainMenu.tsx`, i18n, `game-capabilities.ts`. **Size.** S

### A6 — Automatic output-latency detection

**Gap.** `audioOffset` is a manual ±500 ms slider. Bluetooth headphones add
100–300 ms and the player has no way to know that is what is wrong.

**Build.** Read `AudioContext.outputLatency`/`baseLatency` through
`getAudioContext()` and pre-seed the offset, warning when the detected latency
is large enough that a wired device is worth suggesting. Combine with `P5` for
the residual.

**Sketch.**

```ts
// lib/shared/platform.ts
/**
 * `outputLatency` is the real number and is Firefox/Chrome-only; `baseLatency`
 * is the processing buffer and is everywhere but much smaller. Prefer the
 * former, fall back to the latter, and treat 0 as "unknown" rather than "none"
 * — Safari reports 0 and it is not true.
 */
export function outputLatencyMs(): number | null {
  const ctx = getAudioContext();
  const latency = (ctx as AudioContext).outputLatency || ctx.baseLatency || 0;
  return latency > 0 ? Math.round(latency * 1000) : null;
}

// CalibrationScreen.tsx
const detected = outputLatencyMs();
if (detected !== null && detected > 80) {
  // Bluetooth territory. Say so — the number alone means nothing to a player.
  showHint(
    t('bluetooth-latency', {
      defaultValue: 'Your audio output adds {{ms}} ms. Wired headphones will feel much tighter.',
      ms: detected,
    }),
  );
}
```

**Prior art.** osu! device latency compensation; Rock Band calibration.
**Touches.** `lib/shared/platform.ts`, `CalibrationScreen.tsx`. **Size.** S

### A7 — Motion sensitivity controls

**Gap.** The `spin` modifier rotates the entire playfield, and the only global
control is the site-wide reduced-motion hook — which the modifier does not
consult.

**Build.** Make `spin` respect `useReducedMotion` by refusing to enable _with an
explanation_, not a silent no-op, and add per-effect intensity sliders.

**Sketch.**

```tsx
/**
 * A silent no-op is the worst outcome: the player toggles spin, sees nothing
 * happen, and concludes the game is broken. Refuse visibly.
 */
const reduced = useReducedMotion();

<Toggle
  checked={modifiers.spin && !reduced}
  disabled={reduced}
  label={t('spin', { defaultValue: 'Spin' })}
  description={
    reduced
      ? t('spin-blocked', { defaultValue: 'Disabled: your system requests reduced motion.' })
      : undefined
  }
/>;
```

**Prior art.** Genre-wide "no video / no effects" toggles.
**Touches.** `GameCanvas.tsx`, `modifiers.ts`, `MainMenu.tsx`. **Size.** S

### A8 — Haptic hit feedback

**Gap.** `lib/shared/platform.ts` wraps haptics and the game never calls it. On
mobile, hits produce no tactile confirmation at all.

**Build.** A short vibration on hit scaled by judgement, with an intensity
setting and an off switch.

**Sketch.**

```ts
// lib/slice-it/engine.ts
/**
 * Durations are short and distinct rather than proportional — the hand cannot
 * resolve 8 ms from 11 ms, so a linear scale is felt as one buzz. Miss is the
 * longest because it is the one you need to notice without looking.
 */
const HAPTIC_MS: Record<HitResult, number> = {
  MARVELOUS: 6, PERFECT: 6, GREAT: 10, GOOD: 14, BAD: 18, MISS: 28, NONE: 0,
};

private feedbackHaptic(result: HitResult): void {
  if (!this.haptics) return;
  // Fire-and-forget: vibration must never be awaited on the audio path.
  vibrate(HAPTIC_MS[result] * this.hapticIntensity);
}
```

**Prior art.** Arcade cabinet feedback; Cytus, Arcaea, Phigros.
**Touches.** `engine.ts`, `lib/shared/platform.ts`. **Size.** S

### A9 — Adjustable judgement windows

**Gap.** `HIT_WINDOWS` is fixed, scaled only by rate and `STRICT_TIMING_FACTOR`
(0.7). There is a way to make the game harder and none to make it easier.

**Build.** A `LENIENT_TIMING_FACTOR` as an unranked modifier — the mirror of
Strict Timing — plus per-judgement window display in settings.

**Sketch.**

```ts
// lib/slice-it/constants.ts
/** The mirror of STRICT_TIMING_FACTOR. Unranked, because widened windows are
 *  not comparable — not because they are illegitimate. */
export const LENIENT_TIMING_FACTOR = 1.4;

// lib/slice-it/scoring.ts
export function timingScale(
  modifiers: Pick<Modifiers, 'strictTiming' | 'lenientTiming' | 'speed'>,
): number {
  const factor = modifiers.strictTiming
    ? STRICT_TIMING_FACTOR
    : modifiers.lenientTiming
      ? LENIENT_TIMING_FACTOR
      : 1;
  const speed = Number.isFinite(modifiers.speed) && modifiers.speed > 0 ? modifiers.speed : 1;
  return factor * speed;
}
```

Settings shows the resulting windows in ms, so the abstraction is visible:

```tsx
{
  Object.entries(HIT_WINDOWS).map(([name, seconds]) => (
    <Row key={name} label={name} value={`±${(seconds * scale * 1000).toFixed(0)} ms`} />
  ));
}
```

**Prior art.** osu! OD/Easy, StepMania timing windows, IIDX easy gauge.
**Touches.** `constants.ts`, `scoring.ts`, `modifiers.ts`. **Size.** S

### A10 — Chart content warnings

**Gap.** Uploads carry title, artist, album, description and cover. Nothing
declares strobing visuals, loud dynamic range or explicit lyrics, and the
game-level `flashing` descriptor is all-or-nothing.

**Build.** Uploader-declared flags plus an automatic loudness/strobe estimate
from analysis, shown on the card and honoured by `A2` (which can pre-emptively
engage on flagged charts).

**Sketch.**

```ts
// lib/slice-it/beatmap/index.ts
/**
 * A proxy for strobing: sustained high note density drives the renderer's
 * flash rate, so notes-per-second above the WCAG three-per-second threshold for
 * a sustained stretch is the automatic signal. Conservative on purpose — a
 * false "may flash" costs a badge, a false "safe" costs a seizure.
 */
export function estimateFlashRisk(notes: Slice[]): boolean {
  return maxOverWindow(notes, 3.0) > 3.0;
}
```

**Prior art.** Steam content descriptors; Beat Saber map flags.
**Touches.** `prisma/schema.prisma`, upload route, `SongLibrary.tsx`. **Size.** S

---

## §5 — HUD, feedback and results (`H1–H10`)

### H1 — An early/late hit-error bar

**Gap.** `judge()` takes `Math.abs(deltaSeconds)`, so the judgement discards the
sign. **`fb34b5f0` changed the arithmetic around it** — the engine now
reconstructs the press's audio position from the event `timeStamp` and passes
the signed offset to `recordOffset()` for the Welford statistics. The signed
delta is therefore already computed, already accurate, and never drawn.

**Build.** A hit-error bar under the judgement line: a tick per hit at its
signed offset, fading over ~2 seconds, with a moving-average marker. The fastest
feedback loop for timing that exists, and now nearly free.

**Sketch.**

```ts
// lib/slice-it/engine.ts — a ring buffer beside the Welford accumulator
private readonly recentOffsets = new Float32Array(64);
private offsetHead = 0;

private recordOffset(offsetSeconds: number): void {
  // … existing Welford update for integrity.ts
  this.recentOffsets[this.offsetHead++ % 64] = offsetSeconds;
}

/** Newest-first, for the renderer. Fixed-size, so no allocation per frame. */
getRecentOffsets(): Float32Array { return this.recentOffsets; }
```

```ts
// components/slice-it/GameCanvas.tsx
/**
 * The bar spans ±BAD (the widest window), so a tick's position is directly
 * comparable to the judgement it produced. Scaling to ±GREAT would look
 * livelier and would clip every GOOD to the edge, which teaches nothing.
 */
function drawErrorBar(ctx, engine, theme, w: number, y: number) {
  const halfWidth = w * 0.18;
  const scale = halfWidth / (HIT_WINDOWS.BAD * engine.timingScale);

  ctx.fillStyle = theme.shadowDark;
  ctx.fillRect(w / 2 - halfWidth, y, halfWidth * 2, 3); // the track

  const offsets = engine.getRecentOffsets();
  for (let i = 0; i < offsets.length; i++) {
    const offset = offsets[i];
    if (offset === 0) continue;
    ctx.globalAlpha = 0.25 + 0.75 * (i / offsets.length);
    ctx.fillStyle = JUDGEMENT_COLORS[judge(offset, engine.timingScale)];
    ctx.fillRect(w / 2 + offset * scale - 1, y - 6, 2, 15);
  }
  ctx.globalAlpha = 1;

  // The mean marker is the actionable part: a tick cloud tells you your spread,
  // the marker tells you which way to move your offset (see P5).
  ctx.fillStyle = theme.textColor;
  ctx.fillRect(w / 2 + (engine.getTimingSummary().meanMs / 1000) * scale - 1, y - 10, 2, 23);
}
```

**Prior art.** osu! hit error bar, Etterna, Quaver, IIDX timing display.
**Touches.** `engine.ts`, `GameCanvas.tsx`. **Size.** S

### H2 — Distinct combo-break feedback

**Gap.** A miss produces a text popup through `pushFeedback`. Breaking a
300-combo and missing the first note of the song look and sound identical.

**Build.** A combo-break sound, a brief desaturation of the playfield, and a
larger visual for breaking a long combo — all respecting `A2`.

**Sketch.**

```ts
// lib/slice-it/engine.ts
/** Below this a break is not news; the player is still learning the chart. */
const COMBO_BREAK_THRESHOLD = 25;

private breakCombo(): void {
  const lost = this.combo;
  this.combo = 0;
  if (lost < COMBO_BREAK_THRESHOLD) return;
  this.audio.play(asset('/music/slice-it/sounds/combobreak.ogg'), this.sfxVolume);
  // Intensity scales with what was lost, so a 400-combo break lands harder.
  this.effects.push({ kind: 'combo-break', at: this.now(), magnitude: Math.min(1, lost / 300) });
}
```

```ts
// components/slice-it/GameCanvas.tsx — desaturate, do not flash
const fx = engine.effects.at(-1);
if (fx?.kind === 'combo-break' && !reducedFlash) {
  const age = (performance.now() - fx.at) / 400;
  if (age < 1) ctx.filter = `saturate(${1 - 0.7 * (1 - age) * fx.magnitude})`;
}
```

**Prior art.** IIDX/DDR combo-break sound, osu! `combobreak.wav`.
**Touches.** `engine.ts`, `GameCanvas.tsx`. **Size.** S

### H3 — A real results screen

**Gap.** `GameOver.tsx` shows score, multiplier, max combo, accuracy and a
grade. `RunStats.judgements` — the histogram the engine keeps, documented in
`types.ts` as being "for the results screen" — is still not rendered, and
neither is the timing summary `fb34b5f0` added.

**Build.** The judgement histogram, `P6`'s timing distribution, the delta
against your previous best, accuracy over time, per-section accuracy (`C5`), and
the grade with its next threshold. This is where a player decides whether to
retry, and it currently gives them five numbers.

**Sketch.**

```tsx
// components/slice-it/GameOver.tsx
/**
 * Bars are scaled to the largest count, not to the note total: on a good run
 * MARVELOUS dwarfs everything and a total-scaled chart is one bar and five
 * slivers, which hides exactly the distribution the player came to read.
 */
const counts = stats.judgements;
const peak = Math.max(...Object.values(counts));

<dl className="neumorphic-inset space-y-1 px-4 py-3">
  {(['MARVELOUS', 'PERFECT', 'GREAT', 'GOOD', 'BAD', 'MISS'] as const).map((j) => (
    <div key={j} className="flex items-center gap-2">
      <dt className="w-24 text-xs" style={{ color: JUDGEMENT_COLORS[j] }}>
        {j}
      </dt>
      <div
        className="h-2 rounded-full"
        style={{ width: `${(counts[j] / peak) * 100}%`, background: JUDGEMENT_COLORS[j] }}
      />
      <dd className="ml-auto font-mono text-xs">{counts[j]}</dd>
    </div>
  ))}
</dl>;

{
  /* The most motivating single number on the screen. */
}
{
  previousBest !== null && (
    <p className={score > previousBest ? 'text-emerald-500' : 'text-slice-text-muted'}>
      {score > previousBest
        ? t('new-best', { defaultValue: 'New best, +{{delta}}', delta: score - previousBest })
        : t('best-delta', {
            defaultValue: '{{delta}} from your best',
            delta: previousBest - score,
          })}
    </p>
  );
}
```

**Prior art.** osu! results screen, IIDX result graph, Etterna's eval screen.
**Touches.** `GameOver.tsx`. **Size.** M

### H4 — Live grade and accuracy pace

**Gap.** `HUD.tsx` renders score, speed and a combo counter (above 5×) — and
**no accuracy at all**, despite the engine tracking it continuously and the
grade being defined purely by it. A player has no idea what grade they are on
course for until the results screen.

**Build.** Live accuracy, a live grade, and a "misses remaining for grade X"
readout.

**Sketch.**

```tsx
// components/slice-it/HUD.tsx
/**
 * How many more MISSes can this run take and still hold `grade`?
 *
 * Accuracy is `hitPoints / (notes * 100)`, so with `remaining` notes left the
 * best reachable accuracy is `(hitPoints + remaining*100) / (total*100)`.
 * Solve for how many of those may be worth zero.
 */
function missesAllowed(hitPoints: number, resolved: number, total: number, target: number): number {
  const best = hitPoints + (total - resolved) * 100;
  return Math.max(0, Math.floor((best - target * total * 100) / 100));
}

const grade = gradeFor(accuracy);
const next = GRADE_THRESHOLDS.find((g) => g.min > accuracy);

<div className="neumorphic-inset px-3 py-1 text-right">
  <span className="font-mono text-lg">{(accuracy * 100).toFixed(2)}%</span>
  <span className="soft-glow-text ml-2 text-xl font-bold">{grade}</span>
  {next && (
    <span className="block text-[10px] text-slice-text-muted">
      {t('misses-for-grade', {
        defaultValue: '{{n}} misses left for {{grade}}',
        n: missesAllowed(hitPoints, resolved, total, next.min),
        grade: next.grade,
      })}
    </span>
  )}
</div>;
```

**Prior art.** osu! live grade, DDR live score, Beat Saber rank display.
**Touches.** `HUD.tsx`, `engine.ts`. **Size.** S

### H5 — A song progress bar with structure

**Gap.** There is no progress indication during a run at all.

**Build.** A thin progress bar with section markers from `C5` and a marker where
your previous best run ended if it failed. Doubles as the seek surface in `P1`.

**Sketch.**

```tsx
/**
 * Inset track, raised playhead — the neumorphic depth rule (see the editor doc
 * §12.1): a container is inset, the thing you can grab is raised.
 */
<div className="neumorphic-inset relative h-2 w-full rounded-full">
  {sections.map((s) => (
    <span
      key={s.start}
      className="absolute top-0 h-full w-px bg-slice-shadow-dark"
      style={{ left: `${(s.start / duration) * 100}%` }}
    />
  ))}
  <span
    className="absolute inset-y-0 left-0 rounded-full bg-slice-primary"
    style={{ width: `${(currentTime / duration) * 100}%` }}
  />
</div>
```

**Prior art.** osu! song progress, Clone Hero, Muse Dash.
**Touches.** `HUD.tsx`. **Size.** S

### H6 — Quick restart and skip

**Gap.** Restarting means returning to the menu, reselecting the song and
waiting for the countdown; there is no hotkey and no way to skip a long intro.

**Build.** A hold-to-restart key and a skip button during any lead-in longer
than ~5 seconds. Both disabled in multiplayer.

**Sketch.**

```ts
/**
 * HOLD, not press. A tap-to-restart bound near the lane keys costs someone a
 * 300-combo the first time they fat-finger it, and they will not come back to
 * find out whether it was their fault.
 */
const RESTART_HOLD_MS = 600;

useEffect(() => {
  let timer: number | undefined;
  const down = (e: KeyboardEvent) => {
    if (e.key !== '`' || isMultiplayer || timer) return;
    timer = window.setTimeout(() => {
      engine.reset();
      engine.start();
      timer = undefined;
    }, RESTART_HOLD_MS);
  };
  const up = () => {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}, [engine, isMultiplayer]);
```

```ts
/** Skip to 2s before the first note, never into it. */
const leadIn = slices[0].time;
if (leadIn > 5) showSkip(() => engine.seek(leadIn - 2));
```

**Prior art.** osu! backtick retry and skip button, Clone Hero, Etterna.
**Touches.** `GameCanvas.tsx`, `engine.ts`. **Size.** S

### H7 — Full-combo and perfect indicators

**Gap.** Nothing marks an in-progress full combo. The player finds out at the
results screen.

**Build.** A persistent FC indicator while nothing has been missed, a distinct
one for all-`MARVELOUS`, and an end-of-run celebration for each (reuse
`hooks/useCelebration`). Record the flags on the leaderboard row.

**Sketch.**

```ts
// lib/slice-it/engine.ts — derived, never a separate flag that can desync
get isFullCombo(): boolean {
  return this.stats.judgements.MISS === 0 && this.stats.judgements.BAD === 0;
}
get isPerfect(): boolean {
  return this.stats.notesResolved > 0 &&
    this.stats.judgements.MARVELOUS === this.stats.notesResolved;
}
```

```prisma
model SongLeaderboard {
  /// Denormalised from the run so the badge survives into the board without a
  /// join back to a run row that may not exist (R6 is not a prerequisite).
  isFullCombo Boolean @default(false)
  isPerfect   Boolean @default(false)
}
```

**Prior art.** DDR/ITG FC lamps, IIDX clear lamps, osu! SS.
**Touches.** `engine.ts`, `HUD.tsx`, `prisma/schema.prisma`, `score.ts`.
**Size.** S

### H8 — Clear lamps in the library

**Gap.** `SliceSong` carries `userPlays` — the count of your plays and nothing
about how they went. Your own library gives no sense of what you have
conquered.

**Build.** A per-chart lamp on every card: failed / cleared / full combo /
perfect, in the genre's standard escalation. Derived from the leaderboard row
plus `H7`'s flags.

**Sketch.**

```ts
// lib/slice-it/songs.server.ts
/**
 * One extra include on a query that already joins the user's likes and plays —
 * `songSelect` is where those live, so this adds a join, not a round trip.
 */
scores: userId
  ? { where: { userId }, select: { score: true, accuracy: true, isFullCombo: true, isPerfect: true, difficulty: true } }
  : false,

export type Lamp = 'none' | 'failed' | 'cleared' | 'fc' | 'perfect';

export function lampOf(row: { isPerfect: boolean; isFullCombo: boolean; cleared: boolean } | null): Lamp {
  if (!row) return 'none';
  if (row.isPerfect) return 'perfect';
  if (row.isFullCombo) return 'fc';
  return row.cleared ? 'cleared' : 'failed';
}

const LAMP_COLORS: Record<Lamp, string> = {
  none: 'transparent', failed: '#ef4444', cleared: '#22c55e',
  fc: '#3b82f6', perfect: '#eab308',
};
```

**Prior art.** IIDX clear lamps (the canonical version), DDR score lamps.
**Touches.** `songs.server.ts`, `types.ts`, `SongLibrary.tsx`. **Size.** S

### H9 — Judgement popup customisation

**Gap.** `pushFeedback` renders a fixed text popup at a fixed place in a fixed
style. On dense charts it is visual noise obscuring the notes behind it.

**Build.** Settings for popup position, size, opacity and which judgements show
at all (many players hide everything above `GREAT`), plus combo-counter
position.

**Sketch.**

```ts
// lib/slice-it/store.ts
hud: {
  /** Judgements at or below this rank are shown; better ones are silent.
   *  Hiding MARVELOUS/PERFECT is the common expert setting — on a good run the
   *  popups are constant and carry no information. */
  showJudgementsBelow: HitResult;
  judgementScale: number; // 0.5–1.5
  judgementOpacity: number; // 0.2–1
  comboPosition: 'center' | 'left' | 'right' | 'hidden';
}

// lib/slice-it/engine.ts
const RANK: Record<HitResult, number> = {
  MARVELOUS: 0,
  PERFECT: 1,
  GREAT: 2,
  GOOD: 3,
  BAD: 4,
  MISS: 5,
  NONE: 6,
};
if (RANK[result] < RANK[this.hud.showJudgementsBelow]) return; // no popup
```

**Prior art.** osu! skinning, StepMania themes, Quaver's HUD editor.
**Touches.** `store.ts`, `GameCanvas.tsx`, `MainMenu.tsx`. **Size.** S

### H10 — A shareable results card

**Gap.** `app/routes/api/og/replay/$id.ts:17` already special-cases
`game === 'slice-it'` for an OG card, but nothing in the game produces the
replay record it renders from, so the path is unreachable from gameplay.

**Build.** Write a run summary on submission and point the existing OG card at
it, with a share button on the results screen that posts to the feed (`X5`) or
copies a link.

**Sketch.**

```ts
// app/routes/api/slice-it/score.ts — after the leaderboard upsert
/**
 * Only new bests get a card. A card per run would mean a share URL per attempt
 * and an OG render queue full of runs nobody will look at.
 */
if (isNewBest) {
  await prisma.gameResult.create({
    data: {
      game: 'slice-it',
      userId,
      // The card route already reads `d.track`; keep that key.
      data: {
        track: `${song.title} — ${song.artist}`,
        score,
        accuracy,
        grade: gradeFor(accuracy),
        maxCombo,
        difficulty: modifiers.difficulty,
        mods: activeModifierKeys(modifiers),
        judgements: body.judgements ?? null,
      },
    },
    select: { id: true },
  });
}
```

**Prior art.** osu! score screenshots, ScoreSaber cards, Wrapped-style shares.
**Touches.** `score.ts`, `lib/og/`, `GameOver.tsx`. **Size.** S

---

## §6 — Modifiers and mutators (`M1–M10`)

### M1 — Mirror

**Gap.** No lane transform of any kind exists. `oneTrack` collapses lanes and
`switching` moves individual notes, but the chart's left-right structure is
immutable.

**Build.** Swap lanes across the whole chart. No difficulty change, so **no
score bonus**; its value is that it turns every chart into a second chart for
practice and breaks memorised muscle patterns.

**Sketch.**

```ts
// lib/slice-it/chart.ts — applied in the same pass that already rewrites notes
/**
 * Deliberately absent from MODIFIER_BONUSES. Mirror is not harder, and paying
 * for it would make it a free multiplier on every chart — which is how a
 * leaderboard becomes a list of people who remembered to press M.
 */
export function applyMirror(slices: Slice[], keys: number): Slice[] {
  return slices.map((s) => ({ ...s, lane: keys - 1 - s.lane }));
}
```

**Prior art.** IIDX MIRROR, DDR mirror, osu!mania mirror, StepMania.
**Touches.** `chart.ts`, `modifiers.ts`. **Size.** S

### M2 — Random and S-Random

**Gap.** No permutation exists. `switching` converts 15% of notes to
lane-changers, which is a different mechanic: it changes what a note _does_, not
which lane the chart uses.

**Build.** `random` (a seeded per-chart lane permutation — meaningful at 4K from
`G2`, degenerate at 2K where it equals mirror-or-nothing) and `sRandom`
(per-note, which does change difficulty and takes a bonus).

**Sketch.**

```ts
// lib/slice-it/chart.ts
/**
 * Seeded from (songId, difficulty, modifiers) like every other randomised
 * transform here — `chart.ts` already documents that PRNG. A run must be
 * reproducible or R3's replays cannot be verified against it.
 */
export function applyRandom(slices: Slice[], keys: number, rng: () => number): Slice[] {
  const permutation = shuffle([...Array(keys).keys()], rng);
  return slices.map((s) => ({ ...s, lane: permutation[s.lane] }));
}

/**
 * S-Random randomises per note, which destroys chart structure and genuinely
 * raises difficulty — hence a bonus. Chords must move together or a chord
 * becomes two unrelated notes.
 */
export function applySRandom(slices: Slice[], keys: number, rng: () => number): Slice[] {
  const byTime = groupBy(slices, (s) => Math.round(s.time * 1000));
  return [...byTime.values()].flatMap((group) => {
    const lanes = shuffle([...Array(keys).keys()], rng).slice(0, group.length);
    return group.map((s, i) => ({ ...s, lane: lanes[i] }));
  });
}
```

**Prior art.** IIDX RANDOM/S-RANDOM/R-RANDOM — the deepest modifier system in
the genre.
**Touches.** `chart.ts`, `modifiers.ts`, `constants.ts`. **Size.** S

### M3 — A family of visibility mods

**Gap.** `invisible` is one thing: notes fade out before the hit line. The genre
has four distinct visibility mods and they train different skills.

**Build.** Split into `fadeOut` (current behaviour), `fadeIn`, `flashlight` and
`laneCover` (the practical one — how players tune effective reading distance).
Keep `invisible` as an alias for `fadeOut` so persisted settings survive.

**Sketch.**

```ts
// lib/slice-it/modifiers.ts — migration, not a breaking rename
/**
 * Store v3: `invisible: true` becomes `visibility: 'fadeOut'`. Dropping the old
 * key without this means every existing player's mod set silently resets.
 */
migrate: (persisted, version) => {
  const state = (persisted ?? {}) as Record<string, any>;
  if (version < 3) {
    state.modifiers = {
      ...state.modifiers,
      visibility: state.modifiers?.invisible ? 'fadeOut' : 'none',
    };
  }
  return state;
},
```

```ts
// components/slice-it/GameCanvas.tsx
/** Alpha as a function of how far the note has travelled. One function, four
 *  modes — which is what stops them becoming four render paths. */
function noteAlpha(progress: number, mode: VisibilityMode, coverAt: number): number {
  switch (mode) {
    case 'fadeOut':
      return progress < 0.65 ? 1 : Math.max(0, 1 - (progress - 0.65) / 0.2);
    case 'fadeIn':
      return progress < 0.35 ? 0 : Math.min(1, (progress - 0.35) / 0.2);
    case 'flashlight':
      return Math.abs(progress - 1) < 0.18 ? 1 : 0;
    case 'laneCover':
      return progress < coverAt ? 0 : 1; // V10 tunes coverAt
    default:
      return 1;
  }
}
```

**Prior art.** IIDX SUDDEN+/HIDDEN+/lane cover, osu! HD/FL, DDR appearance.
**Touches.** `modifiers.ts`, `constants.ts`, `GameCanvas.tsx`. **Size.** M

### M4 — Chart-level double time

**Gap.** `speed` changes playback rate, which shifts pitch and compresses the
chart uniformly. There is no way to make a chart _denser_ without making the
song faster.

**Build.** A `doubleTime` mutator regenerating the chart from the existing onset
candidates at double density while audio plays at 1.0×. A budget change, not new
analysis.

**Sketch.**

```ts
// lib/slice-it/chart.ts
/**
 * Draws from the SAME candidate pool the nested difficulties are selected from,
 * so a doubled Hard is a denser chart of the same song rather than a different
 * interpretation of it. Requires the candidate list to be persisted with the
 * chart (see C1 §6's artefacts) — without it, this needs a re-analysis.
 */
export function applyDoubleTime(candidates: Slice[], current: Slice[], tier: Difficulty): Slice[] {
  const budget = current.length * 2;
  return selectByStrength(candidates, budget, {
    minSameLaneGap: MIN_GAP[tier] * 0.6, // relaxed, or the budget cannot be spent
  });
}
```

**Prior art.** osu! DT/HR; Etterna rates versus higher difficulties.
**Touches.** `beatmap/charter.ts`, `chart.ts`, `modifiers.ts`. **Size.** M

### M5 — Holds as taps

**Gap.** `LONG` notes require sustained input, a real barrier for some switch
and adaptive controllers and for one-handed phone play.

**Build.** A `tapHolds` accessibility modifier converting `LONG` to a tap at its
head. Unranked, and grouped with `A1`'s assist family.

**Sketch.**

```ts
// lib/slice-it/chart.ts
/**
 * The tail is dropped, not converted to a second tap: converting would ADD
 * notes, making an accessibility mod harder than the chart it simplifies.
 */
export function applyTapHolds(slices: Slice[]): Slice[] {
  return slices.map((s) =>
    s.type === 'LONG' ? { ...s, type: 'STANDARD' as const, duration: undefined } : s,
  );
}
```

**Prior art.** osu!mania NoLN converts; accessibility patches across the genre.
**Touches.** `chart.ts`, `modifiers.ts`. **Size.** S

### M6 — Perfect-or-die

**Gap.** `suddenDeath` ends the run on a miss. There is no tier above it, and
top players clear Sudden Death routinely.

**Build.** `perfectionist` — anything below `PERFECT` ends the run. Same
exclusion group, correspondingly large bonus.

**Sketch.**

```ts
// lib/slice-it/engine.ts — one branch beside the existing sudden-death check
private checkFailConditions(result: HitResult): void {
  if (this.modifiers.perfectionist && result !== 'MARVELOUS' && result !== 'PERFECT') {
    return this.fail('perfectionist');
  }
  if (this.modifiers.suddenDeath && result === 'MISS') return this.fail('suddenDeath');
}

// lib/slice-it/modifiers.ts — mutually exclusive with suddenDeath
export function applyExclusions(modifiers: Modifiers): Modifiers {
  if (modifiers.switching && modifiers.oneTrack) modifiers = { ...modifiers, switching: false };
  // Perfectionist strictly implies sudden death; holding both would double-pay.
  if (modifiers.perfectionist && modifiers.suddenDeath) {
    modifiers = { ...modifiers, suddenDeath: false };
  }
  return modifiers;
}
```

**Prior art.** osu! Perfect mod, DDR Marvelous-only challenge.
**Touches.** `modifiers.ts`, `engine.ts`, `constants.ts`. **Size.** S

### M7 — Modifier presets

**Gap.** Eight toggles and a speed slider are set individually every session and
persisted as one blob. Switching between "my practice setup" and "my ranked
setup" means re-toggling everything.

**Build.** Named presets saved locally with a few stock ones, applied from the
song details panel and the lobby's per-seat panel.

**Sketch.**

```ts
// lib/slice-it/store.ts
presets: {
  id: string;
  name: string;
  modifiers: Modifiers;
}
[];

/** Stock presets are computed from DEFAULT_MODIFIERS, never written as
 *  literals — a new modifier field added later would otherwise be missing from
 *  every stock preset and silently default to `undefined`. */
export const STOCK_PRESETS = [
  { id: 'ranked', name: 'Ranked default', modifiers: { ...DEFAULT_MODIFIERS } },
  { id: 'practice', name: 'Practice', modifiers: { ...DEFAULT_MODIFIERS, speed: 0.8 } },
  {
    id: 'challenge',
    name: 'Challenge',
    modifiers: { ...DEFAULT_MODIFIERS, strictTiming: true, bombs: true },
  },
];
```

**Prior art.** osu! mod presets, Beat Saber modifier profiles.
**Touches.** `store.ts`, `MainMenu.tsx`, `MultiplayerLobby.tsx`. **Size.** S

### M8 — A weekly modifier roulette

**Gap.** `MODIFIER_BONUSES` makes stacking rewarding, so the leaderboard
converges on one optimal stack per player and the other combinations are never
seen.

**Build.** A weekly rotating **fixed** modifier set on one featured chart with
its own board.

**Sketch.**

```ts
// lib/slice-it/weekly.ts
/**
 * Derived from the ISO week, so every client computes the same set with no
 * coordination and no table. Same trick S1 uses for the daily.
 */
export function weeklyModifiers(weekKey: string): Modifiers {
  const rng = seededRandom(hash(`slice-weekly:${weekKey}`));
  const pool = ['bombs', 'switching', 'spin', 'strictTiming', 'oneTrack'] as const;
  const chosen = shuffle([...pool], rng).slice(0, 2);
  return { ...DEFAULT_MODIFIERS, ...Object.fromEntries(chosen.map((k) => [k, true])) };
}
```

**Prior art.** IIDX/SDVX weekly courses, osu! mod tournaments.
**Touches.** ties into `S1` and `X4`. **Size.** M

### M9 — Rebalanced modifier economics

**Gap.** Bonuses are hand-chosen constants (invisible 0.20, strictTiming 0.25,
the rest 0.15) with no data behind them. `SPEED_BONUS_PER_X` is 0.5, so 2.0×
speed is worth +0.5 — less than invisible plus bombs, despite being far harder.

**Build.** Once `P6` and `O1` exist, recompute each bonus from its measured
effect on accuracy across the population, and document the derivation next to
the numbers. Belongs with `G13` in one scored migration.

**Sketch.**

```ts
/**
 * The estimator: a modifier's bonus should be proportional to the accuracy it
 * costs the same players who also play without it. Paired within player, so it
 * measures the modifier rather than measuring who uses it.
 */
export function estimateBonus(paired: { withMod: number; without: number }[]): number {
  const meanDrop = mean(paired.map((p) => p.without - p.withMod));
  // 0.02 accuracy ≈ 0.15 multiplier, calibrated so today's `bombs` is unchanged
  // — a rebalance that moves every number at once cannot be evaluated.
  return round(meanDrop * 7.5, 2);
}
```

**Prior art.** osu!'s repeated pp reworks; Etterna's MSD revisions.
**Touches.** `constants.ts`, `docs/slice-it.md`. **Size.** M

### M10 — Per-chart modifier legality

**Gap.** Every modifier is legal on every chart. `forMultiplayer()` is the only
restriction and it is global rather than per-chart.

**Build.** Let a chart declare mods that break it — `spin` where readability
depends on lane position, `oneTrack` on a chord-heavy chart (`G3`). Declared,
not silently enforced: the UI greys them out with a reason.

**Sketch.**

```ts
// lib/slice-it/types.ts
export interface BeatMap {
  /** Modifier keys this chart declares incompatible, with a reason shown in
   *  the UI. Advisory for solo; enforced in ranked submission. */
  incompatible?: { key: keyof Modifiers; reason: string }[];
}

// lib/slice-it/modifiers.ts
export function legalFor(modifiers: Modifiers, map: BeatMap): Modifiers {
  let out = modifiers;
  for (const { key } of map.incompatible ?? []) {
    if (typeof out[key] === 'boolean' && out[key]) out = { ...out, [key]: false };
  }
  return applyExclusions(out);
}
```

**Prior art.** osu! unranked mod combinations; Beat Saber per-map requirements.
**Touches.** `types.ts`, `modifiers.ts`, `MainMenu.tsx`. **Size.** S

---

## §7 — Solo game modes (`S1–S12`)

### S1 — A Slice It! daily challenge

**Gap.** `lib/quests/arcade.ts:123` has one Slice It! arcade challenge — "Score
5,000" — which any chart satisfies. No fixed song, no fixed modifiers, no
single-attempt rule, no separate board.

**Build.** One chart per day chosen deterministically from the date (identical
for everyone, needs no coordination), fixed modifiers, one ranked attempt, its
own resetting board. Feeds the existing Arcade Pass through `reportGameResult`.

**Sketch.**

```ts
// lib/slice-it/daily.server.ts
/**
 * Deterministic from the day key, so no table decides the song and every
 * process agrees without talking. The eligible pool is bounded to charts with
 * enough plays to be known-good — a daily on a broken chart is a wasted day for
 * everyone.
 */
export async function dailyChart(dayKey = arcadeDayKey()): Promise<Chart> {
  const pool = await prisma.chart.findMany({
    where: { status: { in: ['public', 'ranked'] }, song: { isPublic: true, plays: { gte: 25 } } },
    select: { id: true, songId: true, difficulty: true },
    orderBy: { id: 'asc' }, // stable ordering is load-bearing for the index
  });
  return pool[hash(`slice-daily:${dayKey}`) % pool.length];
}

/** One attempt. The unique constraint is the rule, not a UI check. */
// @@unique([dayKey, userId]) on SliceDailyEntry
```

**Prior art.** osu! daily challenge, Beat Saber daily, Wordle-style dailies.
**Touches.** `lib/quests/arcade.ts`, new `lib/slice-it/daily.server.ts`,
`prisma/schema.prisma`. **Size.** M

### S2 — Courses

**Gap.** A run is one song. There is no way to chain charts and no state that
survives between them.

**Build.** 3–5 charts back to back on **one shared health gauge** (`G1`), scored
cumulatively, no retries between songs. The shared gauge is what makes it a mode
rather than a playlist.

**Sketch.**

```ts
// lib/slice-it/course.ts
export interface CourseState {
  charts: string[];
  index: number;
  /** Carries across songs — the defining mechanic. Course gauge always fails,
   *  even though G1 defaults to off: opting into a course IS opting in. */
  health: number;
  cumulativeScore: number;
}

export function advance(
  state: CourseState,
  run: RunStats & { health: number },
): CourseState | 'failed' {
  if (run.health <= 0) return 'failed';
  return {
    ...state,
    index: state.index + 1,
    // Partial recovery between songs, so one bad chart is survivable and two
    // are not. No recovery at all makes a 5-song course a 1-song course.
    health: Math.min(HEALTH_MAX, run.health + COURSE_RECOVERY),
    cumulativeScore: state.cumulativeScore + run.score,
  };
}
```

**Prior art.** DDR Nonstop/Challenge, IIDX Dan courses, SDVX skill analyser.
**Touches.** new `lib/slice-it/course.ts`, `prisma/schema.prisma`,
`MainMenu.tsx`. **Size.** L

### S3 — A skill-certification ladder

**Gap.** There is no notion of a player's level. `Player.totalScore` measures
volume, not ability, and the four difficulty names are per-chart.

**Build.** Dan-style certification: fixed courses (`S2`) at ascending tiers,
pass or fail on the gauge, awarding a persistent badge shown on the profile and
in lobbies. Uses `C3`'s rating to keep tiers honest across charts.

**Sketch.**

```ts
// lib/slice-it/dan.ts
/**
 * Fixed setlists, not generated ones. A certification whose contents change is
 * not a certification — the whole value is that "4th Dan" means the same thing
 * to two people who earned it a year apart.
 */
export const DAN_COURSES = [
  { id: 'dan-1', name: '1st Dan', minRating: 4, charts: ['…', '…', '…'] },
  { id: 'dan-2', name: '2nd Dan', minRating: 6, charts: ['…', '…', '…'] },
  // …
] as const;

// prisma: one row per (userId, danId), created on first pass and never updated.
```

**Prior art.** IIDX Dan (kaiden), DDR grades, SDVX skill analyser.
**Touches.** `S2`'s models, profile showcase, `lib/achievements/`. **Size.** L

### S4 — Endless survival

**Gap.** No mode has an end condition other than the song ending.

**Build.** Auto-queued charts of ascending rating on one gauge that drains
faster over time, scored on how far you get.

**Sketch.**

```ts
/**
 * Difficulty and drain escalate together. Escalating only difficulty means a
 * strong player never dies; only drain means the mode is a timer with music.
 */
export function endlessStep(n: number, baseRating: number) {
  return {
    targetRating: baseRating + Math.log2(n + 1) * 1.5,
    drainMultiplier: 1 + n * 0.08,
  };
}
```

**Prior art.** Muse Dash endless, Cytus survival, NecroDancer dailies.
**Touches.** `lib/slice-it/session.ts`, `MainMenu.tsx`. **Size.** M

### S5 — A campaign

**Gap.** No single-player structure at all — no unlocks, no progression, no
reason to play chart B after chart A.

**Build.** A curated arc over bundled tracks, each stage gated on a clear
condition (clear → FC → FC with a modifier), unlocking cosmetics (`V6`) rather
than charts so the library stays fully open.

**Sketch.**

```ts
// data/slice-it/campaign.json
{
  "chapters": [{
    "id": "ch1",
    "stages": [
      { "chartId": "…", "goal": { "kind": "clear" },                      "reward": "skin.neon" },
      { "chartId": "…", "goal": { "kind": "accuracy", "min": 0.9 },        "reward": "coins:50" },
      { "chartId": "…", "goal": { "kind": "fc", "modifiers": ["bombs"] },  "reward": "hitsound.taiko" }
    ]
  }]
}
```

```ts
/** Goals are evaluated from RunStats alone — no goal may need data the run
 *  does not already produce, or every new goal type is a schema change. */
export function meetsGoal(goal: Goal, stats: RunStats, mods: Modifiers): boolean {
  switch (goal.kind) {
    case 'clear':
      return stats.notesResolved > 0;
    case 'accuracy':
      return stats.accuracy >= goal.min;
    case 'fc':
      return (
        stats.judgements.MISS === 0 &&
        (goal.modifiers ?? []).every((m) => mods[m as keyof Modifiers])
      );
  }
}
```

**Prior art.** FNF weeks, Muse Dash chapters, Guitar Hero career.
**Touches.** new `lib/slice-it/campaign.ts`, `data/`, `prisma/schema.prisma`.
**Size.** L

### S6 — Per-chart missions

**Gap.** Every chart offers exactly one goal: a higher number. There is nothing
to chase on a chart you have already maxed.

**Build.** Three generated objectives per chart derived from the chart's own
shape, with completion state per player and coins on first completion via
`awardCoins`.

**Sketch.**

```ts
// lib/slice-it/missions.ts
/**
 * Derived from the chart, so a chart with no holds never asks for a hold
 * mission — a mission that cannot be completed is worse than no mission.
 * Seeded by chartHash, so everyone sees the same three.
 */
export function missionsFor(chart: Slice[], hash: string): Mission[] {
  const rng = seededRandom(hashCode(hash));
  const pool: Mission[] = [
    { kind: 'accuracy', min: 0.95 },
    { kind: 'combo', min: Math.floor(chart.length * 0.5) },
    ...(chart.some((n) => n.type === 'LONG') ? [{ kind: 'no-hold-drops' } as Mission] : []),
    ...(hasSections(chart) ? [{ kind: 'fc-section', section: 'chorus' } as Mission] : []),
  ];
  return shuffle(pool, rng).slice(0, 3);
}
```

**Prior art.** Beat Saber campaign missions, Rocksmith challenges, Arcaea goals.
**Touches.** `prisma/schema.prisma`, `score.ts`, `SongDetailsPanel.tsx`.
**Size.** M

### S7 — A boss-chart mode

**Gap.** Nothing in the game presents a chart as an opponent.

**Build.** Face a scripted score line — `P9`'s pace bar with a target curve
instead of your PB — escalating through the chart and beaten section by section.
Losing a section costs gauge.

**Sketch.**

```ts
/**
 * The boss curve is generated from the chart's own achievable score, not from a
 * fixed number: a boss that is trivial on a short chart and impossible on a
 * long one is not a difficulty setting.
 */
export function bossCurve(chart: Slice[], tier: number): number[] {
  const perfect = cumulativePerfectScore(chart);
  const target = [0.72, 0.85, 0.94][tier] ?? 0.94;
  return perfect.map((p) => Math.floor(p * target));
}
```

**Prior art.** FNF opponent structure, Taiko boss songs, Everhood.
**Touches.** `P9`'s infrastructure, `engine.ts`. **Size.** M

### S8 — Setlists and playlists

**Gap.** The library sorts and searches and nothing collects. No favourites
list, no queue, no user grouping. `SongLike` exists — likes are a signal, not a
collection surface.

**Build.** User-made ordered setlists, private or shared, playable end to end,
plus a "play liked songs" shortcut. Shareable by URL, which makes them the
low-effort `S2`.

**Sketch.**

```prisma
model SliceSetlist {
  id        String  @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  ownerId   String
  name      String  @db.VarChar(80)
  isPublic  Boolean @default(false)
  /// Ordered chart ids. An array column rather than a join table: a setlist is
  /// read whole, written whole, and its order IS the data — a join table would
  /// need a position column and a reorder transaction to express the same thing.
  chartIds  String[] @db.Uuid
  createdAt DateTime @default(now())
  @@index([ownerId, createdAt(sort: Desc)])
}
```

**Prior art.** StepMania packs, osu! collections, Beat Saber playlists (the
single most-used community feature).
**Touches.** `prisma/schema.prisma`, `SongLibrary.tsx`, new API routes.
**Size.** M

### S9 — Random and roulette selection

**Gap.** Song selection is search, sort and scroll. Nothing picks for you.

**Build.** A random button with constraints (rating range from `C3`, duration,
unplayed-only, liked-only) plus a roulette that also randomises modifiers.

**Sketch.**

```ts
// app/routes/api/slice-it/songs.ts — a `random=1` branch on the existing route
/**
 * Random by offset, not `ORDER BY random()`: the latter sorts the whole
 * filtered set to take one row, which on a large library is a full scan per
 * button press.
 */
const total = await prisma.chart.count({ where });
if (total === 0) return Response.json({ song: null });
const [pick] = await prisma.chart.findMany({
  where,
  take: 1,
  skip: Math.floor(Math.random() * total),
  select: chartSelect,
});
```

**Prior art.** IIDX/DDR random select, osu! random (`F2`), Muse Dash.
**Touches.** `SongLibrary.tsx`, `app/routes/api/slice-it/songs.ts`. **Size.** S

### S10 — Score attack with tiered targets

**Gap.** Grades are pure accuracy thresholds (`GRADE_THRESHOLDS`), identical on
every chart, saying nothing about how you compare to what is achievable _here_.

**Build.** Per-chart target tiers derived from the population's score
distribution, so "top 10% on this chart" is a visible, chaseable goal alongside
the absolute grade.

**Sketch.**

```sql
-- Recomputed nightly per chart; percentiles are stable enough that live
-- computation would be a per-request sort for a number that moves weekly.
SELECT
  percentile_cont(0.50) WITHIN GROUP (ORDER BY score) AS p50,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY score) AS p90,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY score) AS p99
FROM "song_leaderboard"
WHERE "chartId" = $1 AND "modPool" = 'standard';
```

**Prior art.** Arcaea/Cytus grade goals, GrooveStats percentile ranks.
**Touches.** `lib/slice-it/rating.ts`, `Leaderboard.tsx`, a nightly job.
**Size.** M

### S11 — Marathon mode

**Gap.** `MAX_SONG_DURATION_SEC` caps a track at 15 minutes and every run is one
track.

**Build.** A continuous session chaining charts with no menu return —
crossfaded, scored cumulatively, ending when you stop. Distinct from `S2` in
that nothing is gated.

**Sketch.**

```ts
/**
 * Preload the next chart during the current one's outro. Decoding audio between
 * songs is a two-second silence, and a two-second silence is where a player
 * decides to stop.
 */
useEffect(() => {
  if (remainingSeconds > 20) return;
  void prefetchChart(queue[index + 1]);
}, [remainingSeconds, index]);
```

**Prior art.** DDR Nonstop, StepMania marathons, Audiosurf playlists.
**Touches.** `engine.ts`, `useStartRun.ts`. **Size.** M

### S12 — Time attack

**Gap.** No mode is bounded by wall-clock time, so no session has a predictable
length — which is what a player with ten minutes actually wants.

**Build.** "As many charts as you can in N minutes", scored on cumulative
accuracy, clock paused between charts. Fits the existing
`sessionMinutes: [3, 20]` metadata.

**Sketch.**

```ts
/**
 * The clock stops on menus. Counting menu time makes the optimal strategy
 * "pick fast", which is not the skill being tested.
 */
const elapsed = useRef(0);
useEffect(() => {
  if (!playing) return;
  const started = performance.now();
  return () => {
    elapsed.current += performance.now() - started;
  };
}, [playing]);
```

**Prior art.** Arcade credit structures; Muse Dash time trials.
**Touches.** `lib/slice-it/session.ts`, `MainMenu.tsx`. **Size.** M

---

## §8 — Multiplayer and competitive play (`N1–N12`)

The lobby server is the most carefully built part of the codebase — server-owned
timers, absolute timestamps, seats keyed by `userId`, two grace windows, a pause
cap, and since `fb34b5f0` a 200 ms report interval against a 250 ms `volatile`
broadcast with client-side tweening. It supports exactly one mode.

### N1 — Spectating

**Gap.** `MAX_LOBBY_PLAYERS` is 8 and there is no ninth role. The load timeout
already produces spectators implicitly — "after the timeout the match starts and
the straggler spectates" — but a spectator has no view.

**Build.** An explicit spectator seat receiving the `slice:scores` stream
without occupying a player slot. The wire data already exists and is already
`volatile`; what is missing is a role and a renderer.

**Sketch.**

```ts
// server/socket-server/handlers/slice-it.ts
/**
 * Spectators join a separate socket.io room. The score broadcast already
 * targets the lobby room; adding `:spec` means one extra emit rather than a
 * filter over the roster on every tick.
 */
const specRoom = (code: string) => `${ROOM_PREFIX}${code}:spec`;

socket.on(C2S.SPECTATE, ({ code }) => {
  const lobby = lobbies.get(code);
  if (!lobby) return error(socket, 'not-found');
  void socket.join(specRoom(code));
  // Spectators get the snapshot immediately; they missed the state transitions
  // that built it.
  socket.emit(S2C.LOBBY, snapshot(lobby));
});

// In the score tick, alongside the existing player broadcast:
io.to(specRoom(code)).volatile.emit(S2C.SCORES, scores);
```

**Prior art.** osu! multiplayer spectating, Beat Saber spectator mode.
**Touches.** socket handler, `net/events.ts`, `MultiplayerSidebar.tsx`.
**Size.** M

### N2 — Teams

**Gap.** `FinalStanding` and the live-score broadcast are flat lists of
individuals. There is no grouping concept in the lobby model.

**Build.** A `team` field on the seat, team totals in standings, host-side
balance control. The cheapest genuinely new mode given the existing
infrastructure — the scoring is a sum.

**Sketch.**

```ts
// lib/slice-it/net/events.ts
export interface LobbyPlayer {
  /* … */ team?: 'a' | 'b' | null;
}

export interface MatchResults {
  standings: FinalStanding[];
  /** Present only in team mode. Computed server-side so two clients cannot
   *  disagree about who won. */
  teams?: { team: 'a' | 'b'; score: number; accuracy: number }[];
}
```

**Prior art.** osu! team vs, DDR team battle, Beat Saber multiplayer.
**Touches.** `net/events.ts`, socket handler, `MultiplayerLobby.tsx`. **Size.** M

### N3 — Co-op

**Gap.** Every player plays the whole chart. Nothing splits a chart between
players.

**Build.** Two players, one chart, split by lane (trivially derivable) or
alternating sections. One shared score and one shared gauge, so it is genuinely
cooperative.

**Sketch.**

```ts
/**
 * Lane split is the free version — it needs no new chart data, and a 2-lane
 * chart is already two independent streams. Section split needs C5 and is the
 * better mode; ship lane split first.
 */
export function coopFilter(
  slices: Slice[],
  seat: 0 | 1,
  mode: 'lane' | 'section',
  sections: Section[],
) {
  if (mode === 'lane') return slices.filter((s) => s.lane === seat);
  return slices.filter((s) => sectionIndexAt(sections, s.time) % 2 === seat);
}
```

**Prior art.** Rock Band, Taiko 2-player, DDR doubles/couples.
**Touches.** `chart.ts`, socket handler. **Size.** L

### N4 — Attack mode

**Gap.** Players in a lobby cannot affect each other at all. The only
interaction is watching a number.

**Build.** Earn charges on combo milestones, spend them to apply a short-lived
**visual** modifier to an opponent. Nothing that changes their chart — their
score must stay comparable. Its own mode, never mixed with ranked.

**Sketch.**

```ts
// lib/slice-it/net/events.ts
export const ATTACKS = {
  /** All strictly cosmetic and all time-boxed. A chart-altering attack would
   *  make the resulting score incomparable, which defeats the leaderboard the
   *  match writes to. */
  laneCover: { durationMs: 4000, cost: 1 },
  blackout:  { durationMs: 2000, cost: 2 },  // judgement popups hidden
  shake:     { durationMs: 3000, cost: 1 },
} as const;

'slice:attack': {
  c2s: z.object({ target: z.string().max(64), kind: z.enum(['laneCover', 'blackout', 'shake']) }),
  s2c: z.object({ kind: z.string(), from: z.string(), untilMs: z.number() }),
},
```

Server validates charges — a client that says it has five is not asked.

```ts
// Attacks respect the target's accessibility settings. A photosensitive player
// (A2) receives the charge cost but not the flash: an attack that overrides an
// accessibility setting is a hazard, not a mechanic.
if (target.reducedFlash && kind === 'blackout') kind = 'laneCover';
```

**Prior art.** DDR Battle mode, Taiko versus, Tetris garbage, Mario Kart items.
**Touches.** `net/events.ts`, socket handler, `engine.ts`. **Size.** L

### N5 — Elimination

**Gap.** Every player plays to the end regardless of standing. `MatchResults`
publishes final standings and that is the entire competitive structure.

**Build.** Last-place elimination at fixed chart checkpoints, eliminated players
dropping to spectator (`N1`). Reuses the pause/resume state machine unchanged.

**Sketch.**

```ts
// server/socket-server/handlers/slice-it.ts
const CHECKPOINTS = [0.25, 0.5, 0.75];

/**
 * Checkpoints are fractions of the SONG, evaluated on the server's own clock —
 * not on client-reported progress, which would let a client claim to be at 74%
 * forever.
 */
function checkElimination(lobby: Lobby, elapsedFraction: number): void {
  const next = CHECKPOINTS[lobby.checkpointsPassed];
  if (next === undefined || elapsedFraction < next) return;
  lobby.checkpointsPassed++;

  const alive = lobby.seats.filter((s) => !s.eliminated);
  if (alive.length <= 2) return; // never eliminate to fewer than 2
  const last = alive.sort((a, b) => a.score - b.score)[0];
  last.eliminated = true;
  io.to(last.socketId).emit(S2C.ELIMINATED, { rank: alive.length });
  void io.sockets.sockets.get(last.socketId)?.join(specRoom(lobby.code));
}
```

**Prior art.** Tetris 99, Fall Guys rounds, osu! knockout tournaments.
**Touches.** socket handler, `net/events.ts`. **Size.** M

### N6 — Skill-based matchmaking

**Gap.** `slice:quickplay` joins any lobby with room. `lib/ranked/elo.ts` and
`lib/ranked/engine.server.ts` exist on the platform and Slice It! does not use
them.

**Build.** An Elo rating per player from head-to-head results, with quickplay
matching in a band that widens over time. The rating system is already written;
this is wiring plus a band policy.

**Sketch.**

```ts
/**
 * Widen with wait time. A fixed band means a strong or weak player waits
 * forever; an unbounded one means quickplay is random. Doubling every 10s
 * reaches "anyone" in about a minute, which is the right ceiling for an
 * 8-player game.
 */
function ratingBand(waitedMs: number): number {
  return 100 * Math.pow(2, waitedMs / 10_000);
}

// An 8-player match is not 1v1: apply Elo pairwise across the final standings,
// scaled by 1/(n-1) so one match is worth one match regardless of lobby size.
for (const [a, b] of pairs(standings)) {
  const delta = eloDelta(rating[a.userId], rating[b.userId], a.score > b.score ? 1 : 0);
  rating[a.userId] += delta / (standings.length - 1);
  rating[b.userId] -= delta / (standings.length - 1);
}
```

**Prior art.** osu! multiplayer ranked; competitive matchmaking generally.
**Touches.** `lib/ranked/`, socket handler, `MatchResults.tsx`. **Size.** M

### N7 — Song voting

**Gap.** `slice:song` is host-only. On rematch the host picks again.

**Build.** A host-enabled vote mode: each player nominates, the lobby votes,
ties break randomly.

**Sketch.**

```ts
'slice:nominate': { c2s: z.object({ chartId: z.string().max(64) }) },
'slice:vote':     { c2s: z.object({ chartId: z.string().max(64) }) },

/**
 * Ties break with the lobby's own seeded RNG, not Math.random(), so the server
 * can explain the outcome if asked and two servers would agree.
 */
function resolveVote(votes: Map<string, number>, rng: () => number): string {
  const max = Math.max(...votes.values());
  const winners = [...votes].filter(([, n]) => n === max).map(([id]) => id);
  return winners[Math.floor(rng() * winners.length)];
}
```

**Prior art.** osu! multiplayer playlists, Jackbox-style lobby voting.
**Touches.** socket handler, `net/events.ts`, `MultiplayerLobby.tsx`. **Size.** M

### N8 — Lobby queues and host rotation

**Gap.** One song at a time, chosen by one host. The queue concept does not
exist.

**Build.** A persistent lobby queue surviving matches, plus a rotating picker
role. Turns a lobby from a single match into a session.

**Sketch.**

```ts
interface Lobby {
  /** Charts queued for this session. Survives `results → waiting`. */
  queue: string[];
  /** Index into the seat list of whoever picks next. Rotation is by SEAT, not
   *  by socket: a reconnect mints a new socket id, and rotating on that would
   *  hand the pick to whoever last had a wifi blip. */
  pickerSeat: number;
}
```

**Prior art.** osu! multiplayer playlist mode; Rocket League-style rotation.
**Touches.** socket handler, `MultiplayerLobby.tsx`. **Size.** M

### N9 — Invite links and friend lobbies

**Gap.** Joining requires typing a 6-character code or browsing public lobbies.
No link, no invite, no friends integration despite the platform having a friends
system.

**Build.** Deep links that join on load, an invite button that copies the link
or DMs it, and a "friends are playing" row in the menu.

**Sketch.**

```tsx
// app/routes/slice-it/index.tsx
/**
 * Validate before joining. A malformed or expired code arriving from a stale
 * link must land the player in the menu with a message, not in a socket error
 * loop.
 */
const search = Route.useSearch();
useEffect(() => {
  if (!search.lobby || !/^[A-Z0-9]{6}$/.test(search.lobby)) return;
  joinLobby(search.lobby);
}, [search.lobby]);
```

```ts
// Presence: reuse the platform's friend graph rather than a Slice It one.
export async function friendsInLobbies(userId: string) {
  const friends = await friendIds(userId);
  return [...lobbies.values()]
    .filter((l) => l.seats.some((s) => friends.includes(s.userId)))
    .map(publicInfo);
}
```

**Prior art.** Universal — Steam invites, Discord invites.
**Touches.** `app/routes/slice-it/index.tsx`, `net/client.ts`,
`lib/messages.server.ts`. **Size.** S

### N10 — Async ghost races

**Gap.** Multiplayer requires everyone present at once, and it is the only
competitive mode.

**Build.** Race a stored score curve (`P9`'s data) from a friend or a
leaderboard entry, in the same sidebar as a live opponent. The rendering exists;
what is missing is a source of curves and a menu entry.

**Sketch.**

```ts
/**
 * A ghost is a LiveScore the sidebar cannot distinguish from a real one — which
 * is the point: no second renderer, no second code path, no drift between how a
 * ghost and an opponent are drawn.
 */
export function ghostAsLiveScore(curve: number[], t: number, name: string): LiveScore {
  const i = Math.min(curve.length - 1, Math.floor(t));
  return {
    socketId: `ghost:${name}`,
    name,
    score: curve[i],
    combo: 0,
    maxCombo: 0,
    accuracy: 0,
    health: 100,
    finished: i >= curve.length - 1,
  };
}
```

**Prior art.** Trackmania ghosts, Beat Saber ScoreSaber comparisons.
**Touches.** `P9`'s models, `MultiplayerSidebar.tsx`. **Size.** M

### N11 — Tournaments

**Gap.** `docs/plans/2026-07-15-cross-system-feature-ideas.md` proposes a
platform-wide Tournaments Hub; Slice It! has no bracket, no scheduling and no
qualifier concept.

**Build.** Slice It! as the hub's first client: async qualifiers over a fixed
chart pool, then seeded brackets played in lobbies the tournament creates. The
lobby server already handles everything a match needs.

**Sketch.**

```ts
/**
 * The tournament creates lobbies rather than players joining them — otherwise a
 * bracket match depends on two people typing the same code at the same time.
 */
export async function startBracketMatch(match: BracketMatch) {
  const code = createLobby({ hostUserId: null, private: true, chartId: match.chartId });
  await Promise.all(
    match.playerIds.map((id) => notify(id, { kind: 'tournament-match-ready', lobbyCode: code })),
  );
}
```

**Prior art.** osu! World Cup, Beat Saber tournaments, the FGC bracket model.
**Touches.** platform tournament models, socket handler. **Size.** L

### N12 — Rejoin a match in progress

**Gap.** `MATCH_DISCONNECT_GRACE_MS` (30 s) pauses the room; on expiry the seat
drops, the player is recorded `finished: false`, and there is no way back in.
A player past `LOAD_TIMEOUT_MS` (90 s) is left out entirely.

**Build.** Let a returning player rejoin mid-song as a spectator (`N1`) with
their partial score preserved, and — inside the first ~20% — offer a
partial-credit seat scoring only the remainder, clearly marked.

**Sketch.**

```ts
/**
 * Nothing about the other seats changes, which is what keeps the room's timing
 * guarantees intact: the returning player is a new participant in an existing
 * match, not a rewind of it.
 */
socket.on(C2S.REJOIN, ({ code }) => {
  const lobby = lobbies.get(code);
  const seat = lobby?.dropped.get(userId);
  if (!lobby || !seat) return error(socket, 'not-found');

  const elapsed = (Date.now() - lobby.startedAt) / 1000;
  if (elapsed / lobby.songDuration <= 0.2) {
    seat.partial = { fromSeconds: elapsed }; // standings mark it as partial
    lobby.seats.push({ ...seat, socketId: socket.id });
    socket.emit(S2C.START, { ...startPayload(lobby), seekTo: elapsed });
  } else {
    void socket.join(specRoom(code)); // too late to compete; watch
  }
});
```

**Prior art.** Reconnect-to-match in competitive shooters; osu! rejoin.
**Touches.** socket handler, `net/events.ts`. **Size.** M

---

## §9 — Ranking, integrity and replays (`R1–R10`)

### R1 — Split the leaderboard by chart and mod pool

**Gap.** The most significant correctness gap in the document, and untouched by
the 08-06 commits. `SongLeaderboard` is unique on `(songId, userId)` ordered by
`score desc` — **one row per player per song, across all four difficulties and
all modifier combinations.** `calculateScoreMultiplier` partly compensates, but
the board mixes an `easy` run with six modifiers against an `expert` full combo,
and setting a high score on `normal` overwrites your `expert` record.

**Build.** Key on `(chartId, difficulty, modPool, userId)` with `modPool` a
small canonical enum rather than the full modifier cross-product, and default
the UI to one difficulty with a picker.

**Sketch.**

```ts
// lib/slice-it/pools.ts
/**
 * Three pools, not 2^8 boards.
 *
 * A board per modifier combination is technically the most correct and
 * practically empty — 256 boards with one entry each is not a leaderboard. The
 * pools are chosen so that within one, runs are genuinely comparable.
 */
export type ModPool = 'none' | 'standard' | 'challenge';

export function poolOf(modifiers: Modifiers): ModPool {
  if (ASSIST_MODIFIERS.some((k) => modifiers[k])) return 'none'; // unranked anyway
  const active = activeModifierKeys(modifiers).filter((k) => k !== 'difficulty');
  if (active.length === 0 && modifiers.speed === 1) return 'none';
  // "Challenge" is anything that changes what you SEE or how tight the windows
  // are; "standard" is speed and difficulty only.
  const visual = ['invisible', 'spin', 'strictTiming', 'oneTrack', 'switching', 'bombs'] as const;
  return visual.some((k) => modifiers[k]) ? 'challenge' : 'standard';
}
```

```sql
-- Migration. Backfill derives the pool from the stored `modifiers` JSON, which
-- is why that column was worth keeping.
ALTER TABLE "song_leaderboard" ADD COLUMN "difficulty" VARCHAR(16) NOT NULL DEFAULT 'normal';
ALTER TABLE "song_leaderboard" ADD COLUMN "modPool"    VARCHAR(16) NOT NULL DEFAULT 'standard';
ALTER TABLE "song_leaderboard" ADD COLUMN "chartId"    UUID;

UPDATE "song_leaderboard"
SET "difficulty" = COALESCE("modifiers"->>'difficulty', 'normal'),
    "modPool"    = CASE
      WHEN "modifiers" IS NULL THEN 'none'
      WHEN ("modifiers"->>'invisible')::bool OR ("modifiers"->>'spin')::bool
        OR ("modifiers"->>'strictTiming')::bool OR ("modifiers"->>'oneTrack')::bool
        OR ("modifiers"->>'bombs')::bool OR ("modifiers"->>'switching')::bool THEN 'challenge'
      WHEN "speedMod" <> 1.0 THEN 'standard'
      ELSE 'none' END;

DROP INDEX IF EXISTS "song_leaderboard_songId_userId_key";
CREATE UNIQUE INDEX ON "song_leaderboard" ("songId", "difficulty", "modPool", "userId");
CREATE INDEX ON "song_leaderboard" ("songId", "difficulty", "modPool", "score" DESC);
```

**Prior art.** osu! per-difficulty per-mod boards, IIDX per-chart boards,
GrooveStats.
**Touches.** `prisma/schema.prisma`, `score.ts`, `leaderboard.ts`,
`Leaderboard.tsx`. **Size.** M

### R2 — A global skill rating

**Gap.** The global board sums `Player.totalScore` across every run. It ranks
**volume played**, not skill — a player who grinds easy charts outranks a better
player who does not.

**Build.** Each player's best performance per chart, weighted by chart rating
(`C3`) and accuracy, summed with geometric decay so the top ~50 dominate. Keep
`totalScore` as a separate lifetime stat.

**Sketch.**

```ts
// lib/slice-it/rating.server.ts
/**
 * Decay is what makes the number a skill measure rather than a play counter:
 * a player's 200th-best score contributes 0.95^199 ≈ 0.004 of its value, so
 * grinding cannot substitute for playing well.
 *
 * Accuracy is raised to a power because the top of the range is where the
 * difficulty is: 99% is not 1.03× as good as 96%.
 */
const DECAY = 0.95;

export function skillRating(best: { chartRating: number; accuracy: number }[]): number {
  return best
    .map((b) => b.chartRating * Math.pow(b.accuracy, 12) * 100)
    .sort((a, b) => b - a)
    .reduce((sum, value, i) => sum + value * Math.pow(DECAY, i), 0);
}
```

Recomputed in a job on submission of a new best, not on read — a leaderboard
page must not recompute every player's rating.

**Prior art.** osu! performance points (decay included), Etterna player rating,
ScoreSaber PP.
**Touches.** new `lib/slice-it/rating.server.ts`, `prisma/schema.prisma`,
`leaderboard.ts`. **Size.** L

### R3 — Actually record replays

**Gap.** `lib/game/replay.ts` defines a complete Slice It! replay schema
(`SLICE_IT_VERSION = 'si-1'`, an input log, a `verifySliceIt` re-simulation, a
registry entry) and **nothing in `lib/slice-it/` or `components/slice-it/`
references it.** `fb34b5f0` added integrity checks that deliberately send a
_summary_ rather than samples — that is the right call for every submission, and
it is not a replay.

**Build.** Append `{t, lane, judgment}` per resolution and submit the log for
top scores. `integrity.ts` documents its own hold-term ceiling as loose; a
replay is what closes that specific hole (`R8`).

**Sketch.**

```ts
// lib/slice-it/engine.ts
/**
 * Bounded at the schema's own limit (20 000 inputs). A chart that would exceed
 * it is beyond MAX_NOTES_PER_SECOND anyway, and truncating is better than
 * sending a payload that will be rejected whole.
 */
private replayLog: { t: number; lane: number; judgment: string }[] = [];

private resolve(slice: Slice, result: HitResult, lane: number): void {
  // … existing
  if (this.replayLog.length < 20_000 && result !== 'NONE') {
    this.replayLog.push({
      t: Math.round(this.audioTime() * 1000),
      lane,
      // The shared schema's vocabulary is 4 values, not our 6. Map, don't widen:
      // `lib/game/replay.ts` is cross-game and its enum is a contract.
      judgment: ({ MARVELOUS: 'perfect', PERFECT: 'perfect', GREAT: 'great',
                   GOOD: 'good', BAD: 'good', MISS: 'miss' } as const)[result],
    });
  }
}
```

```ts
// lib/slice-it/useSubmitScore.ts — only for scores worth verifying
const shouldAttach = isNewBest && stats.score > 0;
body.replay = shouldAttach
  ? { track: songId, seed: runSeed, inputs: engine.getReplayLog() }
  : undefined;
```

**Prior art.** Universal — osu! `.osr`, StepMania replays, Beat Saber.
**Touches.** `engine.ts`, `useSubmitScore.ts`, `score.ts`. **Size.** M

### R4 — Watch replays

**Gap.** Follows from `R3`: with nothing recorded there is nothing to watch, and
the OG replay card route renders for a record gameplay never creates.

**Build.** Playback through the existing engine driven by the input log instead
of the chart, with scrubbing, linked from every leaderboard row.

**Sketch.**

```ts
// lib/slice-it/engine.ts
/**
 * Replay is autoplay (P3) with a different oracle: instead of resolving at the
 * note's exact time, resolve at the logged time with the logged judgement. Same
 * code path, so a replay renders identically to the run that produced it.
 */
private replayCursor = 0;

private stepReplay(now: number): void {
  while (this.replayCursor < this.replayInput.length) {
    const input = this.replayInput[this.replayCursor];
    if (input.t / 1000 > now) break;
    this.replayCursor++;
    const slice = this.getTargetedSlice(input.lane);
    if (slice) this.resolve(slice, REPLAY_JUDGEMENT[input.judgment], input.lane);
  }
}
```

**Prior art.** osu! replay viewing from every score, Beat Saber replays.
**Touches.** `engine.ts`, new `components/slice-it/ReplayViewer.tsx`. **Size.** M

### R5 — Leaderboard scopes

**Gap.** `/api/slice-it/leaderboard` filters on `songId` or returns the global
career board. No friends filter, no country filter, no time window — so on a
popular chart everyone outside the top page sees a list of strangers.

**Build.** `scope` and `window` query params on the existing route, reusing the
platform follow graph. The cursor paging and self-row logic already handle the
rest.

**Sketch.**

```ts
// lib/slice-it/api-schemas.ts
export const LeaderboardQueryZ = z.object({
  // … existing
  scope: z.enum(['global', 'friends', 'country']).catch('global'),
  window: z.enum(['all', 'month', 'week']).catch('all'),
});

// app/routes/api/slice-it/leaderboard.ts
const where: Prisma.SongLeaderboardWhereInput = {
  songId,
  difficulty,
  modPool,
  ...(query.window !== 'all' && {
    createdAt: { gte: new Date(Date.now() - (query.window === 'week' ? 7 : 30) * 86_400_000) },
  }),
  ...(query.scope === 'friends' && userId && { userId: { in: await friendIds(userId) } }),
  ...(query.scope === 'country' && userId && { user: { country: await countryOf(userId) } }),
};
```

**Prior art.** osu! country/friend rankings, ScoreSaber, GrooveStats.
**Touches.** `leaderboard.ts`, `api-schemas.ts`, `Leaderboard.tsx`. **Size.** S

### R6 — Score history

**Gap.** `SongLeaderboard` keeps only your best — the upsert overwrites `score`,
`maxCombo`, `accuracy` and `createdAt` when `isNewBest`. Every previous attempt
is destroyed, so no progress over time is visible anywhere. `fb34b5f0` added
timing statistics per run and they are discarded with everything else.

**Build.** An append-only `SliceRun` table with `SongLeaderboard` becoming a
materialised "best" pointer into it. Enables progress graphs, `P9`'s curves,
`P2`'s drilling, `R7`'s review queue and `O1`'s telemetry — all currently
impossible because the data is deleted.

**Sketch.**

```prisma
/// Every submitted run. Append-only, high volume — hence the time-sortable PK
/// the repo's new-table policy asks for (lib/CLAUDE.md §Database).
model SliceRun {
  id        BigInt   @id @default(autoincrement())
  userId    String
  chartId   String?  @db.Uuid
  songId    String
  chartHash String?  @db.Char(64)

  score      Int
  accuracy   Float
  maxCombo   Int
  difficulty String  @db.VarChar(16)
  modPool    String  @db.VarChar(16)
  modifiers  Json
  cleared    Boolean @default(true)
  isFullCombo Boolean @default(false)

  /// From getTimingSummary() — already computed and already submitted.
  timingCount  Int?
  timingMeanMs Float?
  timingSdMs   Float?

  /// R7's statistical flag. Null = not evaluated, 0 = clean.
  suspicion Float?

  createdAt DateTime @default(now())

  /// The two reads: "my history on this chart" and "this chart's telemetry".
  @@index([userId, chartId, createdAt(sort: Desc)])
  @@index([chartId, createdAt(sort: Desc)])
}
```

**Prior art.** osu! score history, Etterna's per-chart history graph.
**Touches.** `prisma/schema.prisma`, `score.ts`. **Size.** M

### R7 — A review surface for what integrity already flags

**Gap.** **The detection shipped.** `lib/slice-it/integrity.ts` (`fb34b5f0`) is
the statistical anti-cheat this entry originally proposed: bounds, internal
consistency, an HMAC wall-clock receipt, and a timing-distribution check that
compares the run's Welford standard deviation against what a human hand
produces. Its design note is explicit that the statistical layer **flags, never
rejects** — "a false positive on a legitimate record run is worse than a false
negative on one cheated score".

So the gap is no longer detection. It is that **a flag has nowhere to go**:
nothing persists `suspicion`, nothing surfaces it to a moderator, and nothing
acts on a pattern of them.

**Build.** Persist the suspicion score on the run (`R6`), a moderator queue in
the admin surface ordered by it, and an escalation rule — a _pattern_ of flagged
runs, not one run, is what justifies action.

**Sketch.**

```ts
// app/routes/api/slice-it/score.ts — after the existing integrity checks
const verdict = checkAll({ score, accuracy, maxCombo, notes, timing, token });
if (verdict.reject) return Response.json({ error: verdict.reason }, { status: 422 });

// The statistical layer never blocks the submission; it annotates it.
await prisma.sliceRun.create({
  data: { /* … */ suspicion: verdict.suspicion },
  select: { id: true },
});

/**
 * Escalate on a pattern, never on one run. A single tight-timing run is a
 * player having a very good night; six in a row is a program. This threshold is
 * the whole difference between a review queue and an accusation machine.
 */
if (verdict.suspicion > 0.8) {
  const recent = await prisma.sliceRun.count({
    where: { userId, suspicion: { gt: 0.8 }, createdAt: { gte: daysAgo(7) } },
  });
  if (recent >= 5) await flagForReview(userId, 'slice-it', { recent, latest: verdict });
}
```

```tsx
// app/routes/_site/admin/slice-it-review.tsx
/**
 * The queue shows the EVIDENCE, not a verdict: stdDev against the population
 * distribution for that chart, the run's history, and the replay (R4) if there
 * is one. A moderator who cannot see why something is flagged cannot judge it.
 */
```

**Prior art.** osu!'s statistical detection plus its human review pipeline;
ScoreSaber's replay analysis.
**Touches.** `score.ts`, `prisma/schema.prisma`, `lib/admin-review.server.ts`,
new admin route. **Size.** M

### R8 — Server-side replay verification

**Gap.** `verifySliceIt` in `lib/game/replay.ts` re-simulates the score from the
input log but has no access to the chart, so it cannot check that the claimed
judgements match the notes — its own comment says so. And `integrity.ts`
documents the specific hole this closes: _"The hold term assumes the entire song
could have been one held note at the highest combo reached... a cheat that stays
under a duration-scaled hold budget gets past this check."_

**Build.** With the chart server-side and `chartHash` from `C12`, re-judge each
input against the real note times using the shared `judge()` and confirm the
score exactly. Run it asynchronously in the Go supervisor for top-N scores, so
submission latency is unaffected.

**Sketch.**

```ts
// lib/slice-it/verify.server.ts
/**
 * The exact check the loose bound cannot make: replay the inputs against the
 * actual notes. Every constant comes from `scoring.ts`, so a scoring change can
 * never leave the verifier judging by different rules than the game.
 */
export function verifyAgainstChart(replay: SliceItReplay, chart: Slice[], mods: Modifiers) {
  const scale = timingScale(mods);
  const multiplier = calculateScoreMultiplier(mods);
  let score = 0,
    combo = 0,
    resolved = 0,
    hitPoints = 0;

  for (const input of replay.inputs) {
    const note = nearestUnresolved(chart, input.lane, input.t / 1000, HIT_WINDOWS.BAD * scale);
    if (!note) return { ok: false, reason: 'input-matches-no-note' };
    const result = judge(input.t / 1000 - note.time, scale);
    if (result === 'MISS') {
      combo = 0;
    } else {
      combo++;
      score += pointsFor(result, combo, multiplier);
    }
    hitPoints += accuracyWeight(result);
    resolved++;
    note.hit = true;
  }
  return { ok: true, score, accuracy: accuracyOf(hitPoints, resolved) };
}
```

**Prior art.** GrooveStats verification, ScoreSaber replay checks.
**Touches.** `lib/game/replay.ts`, new `lib/slice-it/verify.server.ts`,
`go-services/supervisor/`. **Size.** L

### R9 — First clear and clear rate

**Gap.** `Song.plays` counts starts. Nothing records whether a run was
_completed_, so a chart nobody can finish looks identical to an easy one.

**Build.** Record clear/fail per run (needs `G1`'s gauge to make "fail"
meaningful), show clear rate on the card, and credit the first clear of a new
chart with a permanent badge.

**Sketch.**

```ts
/**
 * Clear rate over the last 500 runs, not all time: a chart's difficulty is
 * fixed but its audience is not, and an all-time rate is dominated by the week
 * it was featured.
 */
export async function clearRate(chartId: string): Promise<number | null> {
  const rows = await prisma.sliceRun.findMany({
    where: { chartId },
    select: { cleared: true },
    orderBy: { id: 'desc' },
    take: 500,
  });
  if (rows.length < 20) return null; // too few to mean anything; show nothing
  return rows.filter((r) => r.cleared).length / rows.length;
}
```

**Prior art.** IIDX clear rates, osu! first places, speedrun first-clear culture.
**Touches.** `score.ts`, `songs.server.ts`, `SongLibrary.tsx`. **Size.** S

### R10 — A ranked chart pool

**Gap.** Every uploaded chart feeds the same global career total. A player can
upload a 15-minute track that charts into a huge note count and farm
`Player.totalScore` from it — the plausibility bound scales _with duration_, so
it does not stop this.

**Build.** A `status` on charts (`unranked` → `qualified` → `ranked`) gated on
`C11`'s lint, a minimum play count and review. Only `ranked` charts contribute
to `R2`. The structural fix for the farming problem, and why every mature rhythm
game has a ranking process.

**Sketch.**

```ts
// lib/slice-it/ranking.server.ts
/**
 * Qualification is automatic and reversible; ranking is a human decision.
 * Automating the second step means the first bad chart to hit 50 plays enters
 * the pool permanently.
 */
export async function evaluateQualification(chartId: string) {
  const [chart, plays, rate] = await Promise.all([
    prisma.chart.findUnique({ where: { id: chartId }, select: { notes: true, status: true } }),
    prisma.sliceRun.count({ where: { chartId } }),
    clearRate(chartId),
  ]);
  if (!chart || chart.status !== 'unranked') return;

  const errors = lintChart(chart.notes as Slice[]).errors;
  if (errors.length > 0 || plays < 50 || rate === null || rate < 0.05) return;

  await prisma.chart.update({
    where: { id: chartId },
    data: { status: 'qualified' },
    select: { id: true },
  });
}

// R2 reads only ranked charts:
where: {
  chart: {
    status: 'ranked';
  }
}
```

**Prior art.** osu!'s ranked/loved/graveyard tiers, Quaver's ranked queue,
ScoreSaber's ranked maps.
**Touches.** `prisma/schema.prisma`, `score.ts`, admin surfaces. **Size.** L

---

## §10 — The library, lookup and creator tools (`L1–L18`)

The library is a grid with a search box, five sorts and cursor paging. That was
correct at 50 songs. At a few thousand — which uploads reach quickly — search,
browse and organisation each need to be real systems. `L13`–`L18` are the
lookup and organisation layer specifically.

### L1 — Genres and tags

**Gap.** A song has title, artist, album, description and cover. Browse is
search plus `SONG_SORTS`. No genre, no tag, no BPM filter, no difficulty filter
— so a library of a thousand charts is navigable only by remembering a name.

**Build.** A curated genre enum plus free-form tags, with faceted browse.

**Sketch.**

```prisma
model Song {
  /// Curated list, not free text — a genre facet with 400 spellings of
  /// "drum and bass" is not a facet.
  genre String? @db.VarChar(32)
  /// Free-form, normalised lowercase, capped in the API at 8 per song.
  tags  String[]

  /// Faceted browse filters on these together; without the composite the
  /// planner falls back to a scan once two facets are active.
  @@index([isPublic, genre, createdAt(sort: Desc)])
  @@index([tags], type: Gin)
}
```

```ts
// app/routes/api/slice-it/songs.ts
const where: Prisma.SongWhereInput = {
  isPublic: true,
  ...(query.genre && { genre: query.genre }),
  ...(query.tags?.length && { tags: { hasEvery: query.tags } }),
  ...(query.bpmMin && { bpm: { gte: query.bpmMin, lte: query.bpmMax } }),
  ...(query.ratingMin && {
    charts: { some: { rating: { gte: query.ratingMin, lte: query.ratingMax } } },
  }),
};
```

**Prior art.** osu! genre/language/tag search, BeatSaver filters.
**Touches.** `prisma/schema.prisma`, `songs.ts`, `SongLibrary.tsx`. **Size.** M

### L2 — Curated shelves

**Gap.** The default sort is `recent`. New uploads dominate page one
permanently and good older charts are unreachable without search.

**Build.** Editorial rows — staff picks, this week's featured, hidden gems
(high accuracy-per-play, low play count), recently ranked (`R10`).

**Sketch.**

```ts
/**
 * "Hidden gems": charts people who played them liked, that few played. The
 * play-count ceiling is the whole point — without it this is just "popular".
 */
export function hiddenGems() {
  return prisma.song.findMany({
    where: { isPublic: true, plays: { gte: 10, lte: 300 } },
    orderBy: { likes: { _count: 'desc' } },
    take: 12,
    select: songSelect,
  });
}
```

**Prior art.** osu! spotlights, Beat Saber curator picks.
**Touches.** `songs.server.ts`, `SongLibrary.tsx`. **Size.** M

### L3 — Chart reviews

**Gap.** `SongRating` exists in the schema and is explicitly marked **dead**:
"DEAD (rewrite R0-T7): zero code references. Drop scheduled R1-T3; do not add
writers." Comments exist and are untimestamped prose.

**Build.** Do not revive `SongRating` — the schema comment is a standing
instruction. Design around what a rhythm game needs: rate the **chart** (does it
fit the song?) separately from the song, on charts you have cleared, feeding
`L2`'s shelves and `R10`'s queue.

**Sketch.**

```prisma
/// Replaces the dead SongRating. Two axes, because "this chart is bad" and
/// "this song is bad" are different complaints with different remedies.
model ChartReview {
  chartId  String @db.Uuid
  userId   String
  /// 1–5: does the chart represent the music?
  fit      Int
  /// 1–5: is it fun to play?
  fun      Int
  body     String? @db.VarChar(2000)
  createdAt DateTime @default(now())
  @@id([chartId, userId])
  @@index([chartId, createdAt(sort: Desc)])
}
```

```ts
/** Only from players who cleared it. A review from someone who failed at 0:20
 *  is a review of the first twenty seconds. */
const cleared = await prisma.sliceRun.findFirst({
  where: { chartId, userId, cleared: true },
  select: { id: true },
});
if (!cleared) return Response.json({ error: 'Clear it first' }, { status: 403 });
```

**Prior art.** BeatSaver ratings, osu! modding.
**Touches.** `prisma/schema.prisma`, `SongDetailsPanel.tsx`. **Size.** M

### L4 — Follow uploaders and charters

**Gap.** `SliceSong.uploader` carries id, name and image and the UI shows them.
No way to follow, and no notification when someone whose charts you like uploads
another.

**Build.** Reuse the platform follow graph, add an "uploads" notification type
through `lib/notifications.server.ts`, and an uploader page listing their charts
with aggregate stats.

**Sketch.**

```ts
// app/routes/api/slice-it/songs/upload.ts — after the song row is written
/**
 * Fan-out on write, capped. A charter with 40 000 followers must not turn one
 * upload into 40 000 synchronous inserts on the request path — batch it, and
 * push the tail to the jobs worker.
 */
const followers = await followerIds(userId, { limit: 500 });
await createNotifications(
  followers.map((id) => ({
    userId: id,
    kind: 'slice-upload',
    actorId: userId,
    data: { songId: song.id, title: song.title },
  })),
);
```

**Prior art.** BeatSaver mapper follows, osu! mapper subscriptions.
**Touches.** `lib/notifications.server.ts`, new uploader route. **Size.** S

### L5 — Timestamped comments

**Gap.** `SongComment` is `{songId, userId, content}` — prose attached to a song
with no position in it.

**Build.** An optional `atSeconds` rendering as a marker on the chart preview
and jumping playback there.

**Sketch.**

```ts
/**
 * Parse `01:42` out of the body rather than adding a separate field to the
 * compose UI — osu! modding taught a generation of players to type timestamps,
 * and a field nobody fills is worse than a convention they already have.
 */
const TIMESTAMP = /(?:^|\s)(\d{1,2}):([0-5]\d)(?:\.(\d{1,3}))?/;

export function extractTimestamp(body: string, duration: number): number | null {
  const m = TIMESTAMP.exec(body);
  if (!m) return null;
  const seconds = Number(m[1]) * 60 + Number(m[2]) + Number(m[3] ?? 0) / 1000;
  return seconds <= duration ? seconds : null;
}
```

**Prior art.** SoundCloud timed comments, osu! modding timestamps.
**Touches.** `prisma/schema.prisma`, `SongComments.tsx`. **Size.** S

### L6 — An uploader dashboard

**Gap.** `SliceSong` exposes `plays`, `likeCount`, `scoreCount` and
`commentCount` per song. No aggregate view, no trend, no sense of how a chart
actually plays.

**Build.** Plays over time, clear rate (`R9`), accuracy distribution, `O1`'s
miss heatmap, and which difficulty people pick. The heatmap in particular tells
an uploader their chart has a bad bar in it, which nothing currently can.

**Sketch.**

```sql
-- One query per panel, all off SliceRun's (chartId, createdAt) index.
SELECT date_trunc('day', "createdAt") AS day,
       count(*) AS plays,
       avg("accuracy") AS avg_accuracy,
       count(*) FILTER (WHERE "cleared")::float / count(*) AS clear_rate
FROM "slice_run"
WHERE "chartId" = ANY($1) AND "createdAt" > now() - interval '90 days'
GROUP BY 1 ORDER BY 1;
```

**Prior art.** BeatSaver mapper stats, YouTube Studio-style analytics.
**Touches.** new route, `songs.server.ts`. **Size.** M

### L7 — Waveform scrubbing in the details panel

**Gap.** `SongDetailsPanel.tsx` shows metadata, tempo, duration, difficulty,
plays and likes as numbers. You cannot hear or see the track before committing
to a run.

**Build.** A waveform from the analysis pass (the spectrogram is computed and
discarded), section colouring from `C5`, note density overlaid per difficulty,
click-to-preview. Density-over-time is the most useful pre-play signal in the
genre.

**Sketch.**

```ts
// lib/slice-it/beatmap/index.ts
/**
 * ~200 samples/second of peak envelope. A 4-minute track is 48 000 floats
 * (~48 KB as Float32, ~12 KB gzipped) — small enough to ship with the chart,
 * which is what makes the panel render instantly instead of decoding audio.
 */
export function peakEnvelope(pcm: Float32Array, sampleRate: number, hz = 200): Float32Array {
  const step = Math.floor(sampleRate / hz);
  const out = new Float32Array(Math.ceil(pcm.length / step));
  for (let i = 0, o = 0; i < pcm.length; i += step, o++) {
    let peak = 0;
    for (let j = i; j < Math.min(i + step, pcm.length); j++)
      peak = Math.max(peak, Math.abs(pcm[j]));
    out[o] = peak;
  }
  return out;
}
```

**Prior art.** Audiosurf track preview, osu! song select density graph.
**Touches.** `beatmap/`, `SongDetailsPanel.tsx`. **Size.** M

### L8 — Metadata autofill

**Gap.** Title and artist are typed by the uploader; the analyser reads the
audio, not the tags. Duplicate uploads under three spellings are three unrelated
entries.

**Build.** Parse ID3/Vorbis tags from the uploaded file first, then optionally
match an external service through `lib/ssrf-guard.server#safeFetch` — mandatory
for user-influenced fetches. Normalise artist names so search works.

**Sketch.**

```ts
/**
 * `lib/audio/probe.ts` (d4185549) already reads container headers to get
 * duration without decoding. Tag parsing is the same read extended — the bytes
 * are already in hand and the file is already known well-formed.
 */
export function readTags(head: Uint8Array): { title?: string; artist?: string; album?: string } {
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) return readId3v2(head);
  if (startsWith(head, 'fLaC')) return readVorbisComment(head);
  return {};
}

/** Normalised for search and for the artist facet (L15). */
export const normaliseArtist = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s*(feat\.?|ft\.?|featuring)\s.*$/i, '')
    .trim();
```

**Prior art.** MusicBrainz/AcoustID; every music app.
**Touches.** upload route, `lib/audio/probe.ts`, `lib/ssrf-guard.server.ts`.
**Size.** M

### L9 — Reporting and takedowns

**Gap.** Uploads are user-supplied audio (`descriptors: ['user-content']`) and
there is no report path in `components/slice-it/`. Moderation exists
platform-wide (`lib/moderation.server.ts`) and the game does not reach it.

**Build.** A report action on every chart routed to the existing queue, an
uploader-visible strike state, and a takedown that preserves leaderboard
integrity by tombstoning rather than deleting.

**Sketch.**

```ts
/**
 * Tombstone, never delete. `onDelete: Cascade` on SongLeaderboard means a
 * DMCA takedown would silently erase every score anyone ever set on that
 * track — a punishment aimed at the uploader that lands on hundreds of
 * players.
 */
await prisma.song.update({
  where: { id: songId },
  data: { isPublic: false, takenDownAt: new Date(), takedownReason: reason },
  select: { id: true },
});
// Audio object is deleted from storage; the row, the charts and every score stay.
await deleteObject(song.audioUrl);
```

**Prior art.** BeatSaver DMCA handling, osu! takedowns.
**Touches.** `lib/moderation.server.ts`, `SongDetailsPanel.tsx`. **Size.** M

### L10 — Chart packs

**Gap.** Charts are individual rows. There is no bundle, which is how the genre
has distributed content for twenty years.

**Build.** A pack model grouping charts with a title, art and a curator, as the
unit of discovery in `L2` and the unit of play in `S2`. Uploading a pack is one
flow rather than N. See `L16` for the album/pack authoring surface specifically.

**Prior art.** StepMania packs (the canonical format), osu! beatmap packs.
**Touches.** `prisma/schema.prisma`, `SongLibrary.tsx`. **Size.** M

### L11 — An RMHMusic bridge

**Gap.** The platform has RMHMusic — a whole music app with its own library —
and Slice It! maintains a separate `Song` table with its own storage prefixes
(`slice-it/audio/`). A track in one is invisible to the other.

**Build.** "Play this in Slice It!" from RMHMusic, analysing on demand and
caching the chart. One upload, two apps, one storage bill — and it doubles the
library on day one.

**Sketch.**

```ts
/**
 * Reference, do not copy. A second object in storage for a file already stored
 * is the whole reason the 10 GB quota is tight — and it would double every
 * future upload's cost for the sake of a foreign key.
 */
model Song {
  /// Set when this row is a Slice It view of an RMHMusic track. The audio lives
  /// under the music app's prefix and is streamed from there.
  rmhMusicTrackId String? @unique
}
```

**Prior art.** Audiosurf/Beat Hazard reading your local library.
**Touches.** `lib/rmhmusic/`, `songs.server.ts`. **Size.** L

### L12 — Storage lifecycle

**Gap.** Quotas are hard ceilings — 10 GB global, 1 GB per account. When the
global cap is hit, uploads stop for everyone; there is no eviction, no tiering
and no audit of what is being played. (`d4185549` made range reads cheap, which
helps serving cost, not storage.)

**Build.** Transcode at ingest (`O4`), move charts with no plays in N months to
cold storage while keeping the row and the chart hot, and surface a dashboard
before the cap is reached.

**Sketch.**

```ts
/**
 * The chart is what makes a song a game; the audio is what makes it expensive.
 * Archiving audio while keeping the chart means the library entry stays
 * browsable, its leaderboard stays intact, and playing it costs one restore.
 */
const cold = await prisma.song.findMany({
  where: { songPlays: { none: { lastPlayedAt: { gte: monthsAgo(6) } } }, archivedAt: null },
  select: { id: true, audioUrl: true },
  take: 100,
});
```

**Prior art.** Standard media lifecycle policy; BeatSaver archival tiers.
**Touches.** `lib/storage/s3.server.ts`, `go-services/supervisor/`. **Size.** M

### L13 — A song table view

**Gap.** `SongLibrary.tsx` renders a card grid with `SONGS_PAGE_SIZE` of 30 and
cursor paging. Cards are the right density for browsing 50 songs and the wrong
one for scanning a thousand: they show cover art and four counts, and you cannot
compare two rows without scrolling.

**Build.** A table view toggle beside the grid — sortable columns for title,
artist, BPM, duration, difficulty rating (`C3`), your lamp (`H8`), your best
score, clear rate (`R9`) and play count. Virtualised, so page size stops
mattering. The grid stays the default for discovery; the table is for finding.

**Sketch.**

```tsx
// components/slice-it/SongTable.tsx
/**
 * Virtualised rows, not paged ones. A table exists to be scanned, and a
 * "load more" button every 30 rows defeats that — the feed already uses window
 * virtualization (components/feed/FeedList.tsx) and this is the same problem.
 */
const rows = useVirtualizer({
  count: songs.length,
  estimateSize: () => 44,
  getScrollElement: () => ref.current,
});

<table className="w-full text-sm">
  <thead className="neumorphic-inset sticky top-0">
    {COLUMNS.map((col) => (
      <th
        key={col.key}
        aria-sort={sort === col.key ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button onClick={() => toggleSort(col.key)}>
          {t(col.labelKey, { defaultValue: col.label })}
        </button>
      </th>
    ))}
  </thead>
  <tbody>
    {rows.getVirtualItems().map((v) => (
      <SongRow key={songs[v.index].id} song={songs[v.index]} style={offsetOf(v)} />
    ))}
  </tbody>
</table>;
```

Sorting is server-side — the same mistake the library already fixed once is
available here:

```ts
/**
 * `SongLibrary.tsx` documents the original bug: "the old version fetched fifty
 * songs once and .filter()ed them in the browser, so search only ever searched
 * the page you already had". Client-side column sorting on a virtualised table
 * would reintroduce exactly that, one page at a time.
 */
export const SONG_SORTS = [
  'recent',
  'popular',
  'liked',
  'title',
  'duration',
  'artist',
  'bpm',
  'rating',
  'clearRate',
  'plays',
  'yourScore',
] as const;
```

**Prior art.** osu! song select's list mode, Etterna's chart table, Quaver.
**Touches.** new `components/slice-it/SongTable.tsx`, `songs.ts`,
`constants.ts`. **Size.** M

### L14 — A real search ranking

**Gap.** Search is server-side (correctly — that was fixed) but it is a
substring match: `songs.server.ts` builds a `contains` filter over title and
artist. Typing "eufori" finds nothing for "Euphoria", ranking is by whatever
`SONG_SORTS` is set to rather than by relevance, and a match in the title ranks
below a match in a description.

**Build.** Postgres full-text search with a weighted `tsvector`, trigram
similarity for typos, and a ranking that combines text relevance with
popularity — so the obvious result is first.

**Sketch.**

```prisma
model Song {
  /// Generated column, so it can never drift from the source fields — a
  /// trigger-maintained one would need a backfill on every schema change.
  searchVector Unsupported("tsvector")? @default(dbgenerated())

  @@index([searchVector], type: Gin)
}
```

```sql
ALTER TABLE "song" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    -- Weights are the ranking: a title match must beat a description match, and
    -- today they are indistinguishable.
    setweight(to_tsvector('simple', coalesce(title,  '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(artist, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(album,  '')), 'C') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'D')
  ) STORED;

CREATE INDEX ON "song" USING gin ("searchVector");
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON "song" USING gin (title gin_trgm_ops, artist gin_trgm_ops);
```

```sql
-- Relevance × popularity. log1p, not raw plays: without it the most-played
-- track wins every query it appears in at all.
SELECT s.*,
       ts_rank("searchVector", websearch_to_tsquery('simple', $1)) AS text_rank,
       similarity(s.title || ' ' || s.artist, $1)                  AS fuzzy
FROM "song" s
WHERE s."isPublic"
  AND ("searchVector" @@ websearch_to_tsquery('simple', $1)
       OR similarity(s.title || ' ' || s.artist, $1) > 0.25)   -- typo path
ORDER BY (ts_rank("searchVector", websearch_to_tsquery('simple', $1)) * 3
          + similarity(s.title || ' ' || s.artist, $1)
          + ln(1 + s.plays) * 0.15) DESC
LIMIT $2;
```

**Prior art.** osu!'s search (which is the feature people cite when explaining
why its library is usable at scale); `docs/search.md` for the platform's own
two-stage recall/precision design.
**Touches.** `prisma/schema.prisma`, `songs.server.ts`, a migration. **Size.** M

### L15 — Artist pages and per-artist filtering

**Gap.** `Song.artist` is a free-text string with a plain `@@index([artist])`.
There is no artist entity, so "everything by this artist" is a substring search
that misses "Artist feat. Someone" and matches "Artist Two". The uploader typed
it, so the same artist exists under several spellings.

**Build.** A normalised artist key (from `L8`), an artist facet in browse, and
an artist page listing every chart with aggregate stats. Cheap and it is the
first thing anyone tries after playing a track they liked.

**Sketch.**

```prisma
model Song {
  /// Normalised for grouping; `artist` stays as the display string the
  /// uploader typed. Two columns because "MOTHER3" and "Mother 3" are the same
  /// artist and only one of them is what should be shown.
  artistKey String? @db.VarChar(200)
  @@index([artistKey, createdAt(sort: Desc)])
}
```

```ts
// lib/slice-it/songs.server.ts
/**
 * Aggregates come from one grouped query, not one query per artist — the
 * library page shows a dozen artist chips and N+1 there is a dozen round trips.
 */
export async function artistSummary(artistKey: string) {
  const [songs, agg] = await Promise.all([
    prisma.song.findMany({
      where: { artistKey, isPublic: true },
      select: songSelect,
      orderBy: { plays: 'desc' },
    }),
    prisma.song.aggregate({
      where: { artistKey, isPublic: true },
      _sum: { plays: true },
      _count: true,
      _avg: { bpm: true },
    }),
  ]);
  return { display: songs[0]?.artist ?? artistKey, songs, ...agg };
}
```

```
app/routes/slice-it/artist.$key.tsx   — in-game, .slice-theme
app/routes/_site/games/slice-it/artist.$key.tsx — public/SEO, --site-* glass
```

**Prior art.** osu! artist/featured-artist pages, Spotify artist pages,
BeatSaver's per-mapper listing.
**Touches.** `prisma/schema.prisma`, `songs.server.ts`, new routes. **Size.** M

### L16 — Album and map-pack authoring

**Gap.** `Song.album` is a free-text field displayed and nothing else. There is
no way to upload an album as a unit, no way to group charts you did not upload,
and `L10`'s pack model has no authoring surface.

**Build.** A pack builder: create a pack, add any public charts (yours or not),
order them, give it art and a description, publish. Albums are the special case
where every chart shares an `album` value and the pack is created automatically
at upload. Packs are then the unit `S2` courses, `L2` shelves and `S8` setlists
all consume.

**Sketch.**

```prisma
model ChartPack {
  id          String  @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  curatorId   String
  title       String  @db.VarChar(120)
  description String? @db.VarChar(2000)
  coverUrl    String?
  /// 'album'  — auto-created from a multi-track upload, curator = uploader
  /// 'pack'   — hand-curated, may contain other people's charts
  /// 'course' — ordered and gated; S2 reads these
  kind        String  @db.VarChar(16) @default("pack")
  isPublic    Boolean @default(false)
  createdAt   DateTime @default(now())
  items       ChartPackItem[]
  @@index([isPublic, createdAt(sort: Desc)])
  @@index([curatorId])
}

model ChartPackItem {
  packId   String @db.Uuid
  chartId  String @db.Uuid
  /// Explicit, sparse (10, 20, 30…) so inserting between two items is one
  /// UPDATE rather than renumbering the pack.
  position Int
  @@id([packId, chartId])
  @@index([packId, position])
}
```

```ts
/**
 * Multi-file upload with a shared album creates the pack in the same
 * transaction as the songs — a pack created afterwards by a follow-up call is a
 * pack that does not exist when the first upload fails halfway.
 */
export async function uploadAlbum(files: UploadedTrack[], meta: AlbumMeta, userId: string) {
  return prisma.$transaction(async (tx) => {
    const pack = await tx.chartPack.create({
      data: { curatorId: userId, title: meta.album, kind: 'album', coverUrl: meta.coverUrl },
      select: { id: true },
    });
    for (const [i, file] of files.entries()) {
      const song = await createSong(tx, file, userId);
      await tx.chartPackItem.create({
        data: { packId: pack.id, chartId: song.chartId, position: i * 10 },
      });
    }
    return pack;
  });
}
```

**Prior art.** StepMania packs, osu! beatmap sets and packs, Beat Saber
playlists (the `.bplist` format is exactly this and is the community's most-used
artefact).
**Touches.** `prisma/schema.prisma`, upload route, new pack routes,
`SongLibrary.tsx`. **Size.** L

### L17 — Recently played, resume and history

**Gap.** `SongPlay` records `{songId, userId, count, lastPlayedAt}` — enough to
show "your plays" on a card, and it is never used as a _list_. There is no
recently-played row, no "continue where you left off", no history.

**Build.** A recently-played shelf on the menu, a resume affordance for a run
you abandoned, and a history view. The data is already written on every play;
only the read is missing.

**Sketch.**

```ts
/**
 * The row already exists and is already indexed on (songId, userId) unique.
 * Add the ordering index and the entire feature is a query.
 */
// @@index([userId, lastPlayedAt(sort: Desc)]) on SongPlay

export function recentlyPlayed(userId: string, take = 12) {
  return prisma.songPlay.findMany({
    where: { userId },
    orderBy: { lastPlayedAt: 'desc' },
    take,
    select: { lastPlayedAt: true, count: true, song: { select: songSelect } },
  });
}
```

**Prior art.** osu! recently played, Steam's "recent games", every music app.
**Touches.** `prisma/schema.prisma` (one index), `songs.server.ts`,
`MainMenu.tsx`. **Size.** S

### L18 — Saved searches and smart lists

**Gap.** Once `L1` and `L14` exist there are a dozen facets, and every session
starts by setting them again. `SongLibrary.tsx` holds `search` and `sort` in
component state — they do not even survive a navigation.

**Build.** Filters in the URL (shareable, back-button correct), plus saved named
filter sets that behave as dynamic lists: "unplayed expert charts rated 8–11",
"drum and bass I have not FC'd".

**Sketch.**

```ts
// app/routes/slice-it/index.tsx — filters as validated search params
export const Route = createFileRoute('/slice-it/')({
  validateSearch: z.object({
    q: z.string().max(100).optional(),
    genre: z.string().max(32).optional(),
    ratingMin: z.number().min(1).max(20).optional(),
    ratingMax: z.number().min(1).max(20).optional(),
    lamp: z.enum(['none', 'failed', 'cleared', 'fc', 'perfect']).optional(),
    sort: z.enum(SONG_SORTS).catch('recent'),
  }),
});
```

```prisma
/// A saved list is the filter, not its results — so it stays current as charts
/// are uploaded. Materialising the results would make it a stale setlist (S8),
/// which is a different feature that already exists.
model SliceSavedFilter {
  id      String @id @default(cuid())
  userId  String
  name    String @db.VarChar(60)
  /// Validated against the same zod schema the route uses, so a saved filter
  /// can never express a query the UI cannot.
  filter  Json
  @@index([userId])
}
```

**Prior art.** osu! search syntax (`stars>5 ar>9`), Beat Saber playlist filters,
Steam's dynamic collections.
**Touches.** `app/routes/slice-it/index.tsx`, `SongLibrary.tsx`,
`prisma/schema.prisma`. **Size.** M

---

## §11 — Platform integration, social and Discord (`X1–X14`)

Slice It! is the platform's most feature-complete game and one of its least
integrated. Three achievements, one quest, no economy participation, and a
leaderboard whose rows are dead text.

### X1 — More than three achievements

**Gap.** `lib/achievements/catalog.ts` has exactly three Slice It! entries:
`first_play`, `upload` and `full_combo`. Nothing for grades, accuracy,
modifiers, multiplayer, streaks or the library.

**Build.** A proper ladder. The catalog is a flat array with `group` already set
to `'Slice It!'`, so this is data.

**Sketch.**

```ts
// lib/achievements/catalog.ts
{ id: 'game.slice_it.s_rank',      name: 'Sharp',        description: 'Finish a song with an S rank.',            icon: '🔪', category: 'games', tier: 'silver', coinReward: 25, target: 1,   group: 'Slice It!' },
{ id: 'game.slice_it.ss_rank',     name: 'Flawless',     description: 'Finish a song with 100% accuracy.',        icon: '💎', category: 'games', tier: 'gold',   coinReward: 100, target: 1,  group: 'Slice It!' },
{ id: 'game.slice_it.expert_fc',   name: 'No Mercy',     description: 'Full combo an Expert chart.',              icon: '⚔️', category: 'games', tier: 'gold',   coinReward: 100, target: 1,  group: 'Slice It!' },
{ id: 'game.slice_it.stacked',     name: 'Stacked',      description: 'Clear a song with four modifiers active.', icon: '🎛️', category: 'games', tier: 'silver', coinReward: 30, target: 1,   group: 'Slice It!' },
{ id: 'game.slice_it.centurion',   name: 'Centurion',    description: 'Play 100 different songs.',                icon: '💯', category: 'games', tier: 'gold',   coinReward: 75, target: 100, group: 'Slice It!' },
{ id: 'game.slice_it.mp_streak',   name: 'Undefeated',   description: 'Win five multiplayer matches in a row.',   icon: '🏆', category: 'games', tier: 'gold',   coinReward: 75, target: 5,   group: 'Slice It!' },
{ id: 'game.slice_it.charted',     name: 'Charter',      description: 'Publish a hand-edited chart.',             icon: '✏️', category: 'games', tier: 'silver', coinReward: 40, target: 1,   group: 'Slice It!' },
```

**Prior art.** Steam achievement ladders; osu! medals.
**Touches.** `lib/achievements/catalog.ts`, `score.ts`. **Size.** S

### X2 — More arcade challenges

**Gap.** `lib/quests/arcade.ts:123` has one: "Score 5,000 in Slice It!" —
satisfied by any chart at any difficulty.

**Build.** A rotation using metrics the game already computes. `reportGameResult`
carries `score`, `won` and `cleared`; extend it with `accuracy` and
`isFullCombo` so challenges can address them.

**Sketch.**

```ts
// lib/game/results.server.ts
export interface GameResultPayload {
  game: string;
  score?: number;
  won?: boolean;
  cleared?: number;
  /** Added: 0–1. Rhythm and typing games are accuracy games, and neither can
   *  express its central metric through `score` alone. */
  accuracy?: number;
  isFullCombo?: boolean;
}

// lib/quests/arcade.ts
{ id: 'slice-accuracy', game: 'slice-it', title: 'Finish a song above 95%',
  metric: 'accuracy', target: 0.95 },
{ id: 'slice-fc',       game: 'slice-it', title: 'Full combo any song',
  metric: 'fullCombo', target: 1 },
```

**Prior art.** Daily/weekly challenge rotations across the genre.
**Touches.** `lib/quests/arcade.ts`, `lib/game/results.server.ts`. **Size.** S

### X3 — Economy participation

**Gap.** `/api/slice-it/score` calls `recordGamePlay` and `reportGameResult` and
never calls `awardCoins`. The platform's deepest game mints nothing.

**Build.** Coins on first clear, on a new personal best, and on multiplayer
wins — through `awardCoins()` (the only correct path) with per-day caps so
grinding a short chart is not a faucet.

**Sketch.**

```ts
// app/routes/api/slice-it/score.ts
/**
 * Capped per day and scaled by difficulty, so the optimal strategy is not
 * "replay the shortest easy chart". Best-effort like the rest of the
 * progression block — a coin ledger hiccup must not 500 a successful run.
 */
const COIN_DAILY_CAP = 150;
const COINS = { firstClear: 10, newBest: 5, mpWin: 15 } as const;

try {
  const earnedToday = await coinsEarnedToday(userId, 'slice-it');
  const award = Math.min(
    COIN_DAILY_CAP - earnedToday,
    (isFirstClear ? COINS.firstClear : 0) + (isNewBest ? COINS.newBest : 0),
  );
  if (award > 0) {
    await awardCoins(
      userId,
      Math.round(award * DIFFICULTY_MULTIPLIERS[modifiers.difficulty]),
      'slice-it:run',
      { songId: song.id },
    );
  }
} catch (error) {
  console.warn('[slice-it] coin award failed', error);
}
```

**Prior art.** Arcade credit loops; osu!'s cosmetic-free model as the
counterexample worth considering.
**Touches.** `score.ts`, `lib/coins.server.ts`. **Size.** S

### X4 — Battle pass integration

**Gap.** `lib/battlepass/` exists and Slice It! contributes nothing.

**Build.** Chart-play XP weighted by difficulty and accuracy, plus Slice
It!-specific pass rewards (note skins, lane palettes, hit sounds from
`V1`/`V2`).

**Sketch.**

```ts
/**
 * Weighted by accuracy so playing well is worth more than playing long, and
 * floored so a bad run on a hard chart still pays something — an XP formula
 * that can return zero teaches players to quit runs early.
 */
const xp = Math.round(
  BASE_XP * DIFFICULTY_MULTIPLIERS[modifiers.difficulty] * Math.max(0.3, accuracy),
);
await awardXp(userId, xp, 'slice-it:run');
```

**Prior art.** Season passes generally; Beat Saber music packs as seasonal
content.
**Touches.** `lib/battlepass/`, `lib/xp/engine.server.ts`. **Size.** M

### X5 — Post runs to the feed

**Gap.** A remarkable run — a first SS, a chart nobody had cleared — is visible
to nobody. The platform is built around a social feed and Slice It! never posts.

**Build.** An opt-in "share run" producing a feed post with `H10`'s card, plus
automatic posts for genuinely rare events with a per-user frequency cap.
Default off, because automatic bragging is how a feed gets muted.

**Sketch.**

```ts
/**
 * Rare means rare. Three conditions, all of which are true a handful of times
 * per player per year — not "a new personal best", which happens every session.
 */
function isNoteworthy(run: RunContext): boolean {
  return (
    run.isFirstClearOfChart ||
    (run.isPerfect && run.difficulty === 'expert') ||
    (run.globalRank !== null && run.globalRank <= 10)
  );
}

if (autoShareEnabled && isNoteworthy(run) && (await postsToday(userId, 'slice-it')) < 2) {
  await createFeedPost({ userId, kind: 'game-result', gameResultId });
}
```

**Prior art.** Strava activity posts; osu! score feeds.
**Touches.** `lib/feed/`, `GameOver.tsx`, `score.ts`. **Size.** M

### X6 — A profile showcase module

**Gap.** `components/profile/ProfileShowcase.tsx` is a modular showcase system
and Slice It! has no module in it, despite having the richest per-player stats
of any game on the platform.

**Build.** A card showing skill rating (`R2`), clear lamps by difficulty,
favourite chart, best accuracy, charts cleared, and the Dan badge from `S3`.

**Sketch.**

```tsx
// components/profile/modules/SliceItModule.tsx
/**
 * One aggregate query, cached — a showcase module runs on every profile view
 * and cannot afford six.
 */
export const sliceItShowcase: ShowcaseModule = {
  id: 'slice-it',
  title: 'Slice It!',
  load: (userId) => cached(`slice:showcase:${userId}`, 300, () => sliceItProfileStats(userId)),
  render: (stats) => (
    <div className="glass-fill space-y-2 p-4">
      {' '}
      {/* site tokens: this is a _site surface */}
      <StatRow label="Skill rating" value={stats.rating.toFixed(0)} />
      <StatRow label="Charts cleared" value={stats.cleared} />
      <StatRow label="Best accuracy" value={`${(stats.bestAccuracy * 100).toFixed(2)}%`} />
      <LampBar lamps={stats.lampsByDifficulty} />
    </div>
  ),
};
```

**Prior art.** osu! profile pages, IIDX player cards.
**Touches.** `ProfileShowcase.tsx`, `lib/slice-it/`. **Size.** S

### X7 — Wrapped and recap

**Gap.** `lib/wrapped/` and `lib/ai/recap.server.ts` exist; Slice It! feeds
neither, despite having per-play data going back to the first upload.

**Build.** Slice It! sections in Wrapped — minutes played, top charts, accuracy
curve over the year, hardest clear, the chart you retried most (needs `R6`).

**Sketch.**

```ts
export async function sliceItWrapped(userId: string, year: number) {
  const runs = await prisma.sliceRun.findMany({
    where: { userId, createdAt: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } },
    select: { chartId: true, accuracy: true, createdAt: true, cleared: true, songId: true },
  });
  return {
    minutes: Math.round((runs.length * AVERAGE_SONG_SEC) / 60),
    topCharts: topN(
      countBy(runs, (r) => r.songId),
      5,
    ),
    /** The most human number in the set: what you would not give up on. */
    mostRetried: topN(
      countBy(
        runs.filter((r) => !r.cleared),
        (r) => r.chartId,
      ),
      1,
    )[0],
    accuracyByMonth: groupMean(
      runs,
      (r) => r.createdAt.getMonth(),
      (r) => r.accuracy,
    ),
  };
}
```

**Prior art.** Spotify Wrapped; osu!'s year-in-review.
**Touches.** `lib/wrapped/`, `lib/ai/recap.server.ts`. **Size.** S

### X8 — A Discord Activity gateway

**Gap.** There are two Discord Activity routes — `app/routes/discord/rmhbox.tsx`
and `app/routes/discord/lights-out.tsx` — and **no `app/routes/discord/index.tsx`**.
The Discord application's URL mapping resolves to one of them, so in practice
the Activity is always RMHBox: launching it gives no way to reach anything else,
and Slice It! (the game whose multiplayer lobby is the exact shape an Activity is
for — a small group, a shared session, voice already running) is unreachable.

**Build.** A gateway at `/discord` — the Activity's root — that picks a game.
One SDK handshake, then a chooser; each game mounts lazily so the bundle cost is
paid per game rather than up front. Adding a third game becomes a registry entry.

**Sketch.**

```tsx
// app/routes/discord/index.tsx
/**
 * The SDK handshake happens ONCE, here, and the chosen game receives the
 * resolved context. Doing it per game route (as rmhbox.tsx and lights-out.tsx
 * do today) means re-authorising on every switch, and the OAuth round trip is
 * the slowest thing in an Activity's startup.
 */
const ACTIVITY_GAMES = [
  {
    id: 'rmhbox',
    title: 'RMHBox',
    players: '2–8',
    icon: '📦',
    load: () => import('@/components/rmhbox/RMHboxDiscordActivity'),
  },
  {
    id: 'slice-it',
    title: 'Slice It!',
    players: '1–8',
    icon: '🎵',
    load: () => import('@/components/slice-it/SliceItDiscordActivity'),
  },
  {
    id: 'lights-out',
    title: 'Lights Out',
    players: '1',
    icon: '💡',
    load: () => import('@/components/lights-out/LightsOutDiscordActivity'),
  },
] as const;

function DiscordGateway() {
  const discord = useDiscordSdk();
  const [game, setGame] = useState<ActivityGame | null>(null);

  if (discord.status !== 'ready') return <DiscordConnecting state={discord} />;
  if (game)
    return (
      <Suspense fallback={<Loading />}>
        <game.Component discord={discord.context} />
      </Suspense>
    );

  return (
    <ActivityPicker
      games={ACTIVITY_GAMES}
      onPick={setGame}
      // Whoever launched the Activity picks; everyone else follows. Two people
      // choosing different games in the same voice channel is the failure mode
      // a picker introduces, and the fix is that only one person has one.
      canPick={discord.context.user.id === discord.context.participants[0]?.id}
    />
  );
}
```

Discord's URL mapping then points `/` at this route, and the existing per-game
routes stay as direct deep links.

**Prior art.** Discord's own Activity shelf; the existing Lights Out
implementation is the template for the per-game half.
**Touches.** new `app/routes/discord/index.tsx`, new
`components/slice-it/SliceItDiscordActivity.tsx`, `lib/discord-sdk.ts`.
**Size.** M

### X9 — Slice It! as a Discord Activity

**Gap.** Following from `X8`: even with a gateway there is no Slice It! Activity
component. The lobby server is ready — codes, quickplay, 8 seats, chat, a pause
protocol — and Discord already supplies the group.

**Build.** A component that maps the Discord channel to a lobby, so everyone in
the voice channel lands in the same room with no code typed. Audio latency in
the Activity iframe is the real risk and needs measuring before committing —
`A6`'s `outputLatencyMs()` is the instrument.

**Sketch.**

```tsx
// components/slice-it/SliceItDiscordActivity.tsx
/**
 * The channel IS the lobby. Deriving the code from `channelId` means no code
 * exchange, no invite step, and everyone in the call is already in the room —
 * which is the entire reason to be an Activity rather than a link.
 */
const code = lobbyCodeFromChannel(discord.channelId); // stable 6-char hash

useEffect(() => {
  joinOrCreateLobby(code, { displayName: discord.user.global_name ?? discord.user.username });
}, [code]);

/**
 * Warn before it costs someone a run. The iframe adds latency on top of the
 * output device, and a rhythm game at +150 ms feels broken rather than late.
 */
const latency = outputLatencyMs();
if (latency !== null && latency > 120) showCalibrationHint(latency);
```

Rich presence tells the channel what is happening, using the existing helper:

```ts
setActivityStatus(discord.sdk, {
  state: t('playing-song', { defaultValue: 'Playing {{title}}', title: song.title }),
  imageUrl: absoluteUrl(song.coverUrl), // toDiscordImageProxy handles the rest
});
```

**Prior art.** Discord Activities generally; osu!'s Discord rich presence.
**Touches.** new `components/slice-it/SliceItDiscordActivity.tsx`,
`server/socket-server/handlers/slice-it.ts`. **Size.** L

### X10 — Discord identity, and a guest mode that saves nothing

**Gap.** `DiscordContext` already carries `linkedUserId` — "the rmhstudios.com
user ID if this Discord account is linked" — so the join between a Discord user
and a site account exists. Nothing in Slice It! reads it, and there is no path
at all for a Discord user _without_ a linked account: `lib/catalog/games/slice-it.ts`
sets `authGate: true`, so they get a login wall inside a Discord call.

**Build.** Two identities, explicitly different:

- **Linked.** `linkedUserId` is present → this is a real session. Scores submit,
  the leaderboard shows their site profile, `X11`'s profile links work.
- **Guest.** No linked account → they play immediately, using their Discord
  display name and avatar **for the duration of the session only**. Nothing is
  persisted: no `User` row, no `SongLeaderboard` row, no `SliceRun`. Their score
  appears in the live sidebar and in the match results, and then it is gone. The
  end-of-match screen offers to link an account and keep it.

**Sketch.**

```ts
// lib/slice-it/net/events.ts
export interface LobbyPlayer {
  // …
  /** Guests have no userId. The seat is keyed by socket for them, which is the
   *  one case where the userId-keying rule cannot apply — and it is why a guest
   *  loses their seat on disconnect rather than getting the 30s grace. */
  userId: string | null;
  guest?: {
    /** Discord display name, shown as-is. Never written to any table. */
    name: string;
    /** Discord CDN avatar URL. Referenced, never copied into our storage. */
    avatarUrl: string | null;
  };
}
```

```ts
// app/routes/api/slice-it/score.ts
/**
 * A guest run is computed, shown, and discarded.
 *
 * The alternative — a shadow User row per Discord guest — creates accounts
 * nobody asked for, holds a third party's display name and avatar URL
 * indefinitely, and turns "I tried a game in a voice call" into a data
 * retention question. Not storing it is both the simpler code and the correct
 * privacy answer.
 */
if (!userId) {
  return Response.json({ ok: true, ranked: false, stored: false, score, accuracy, grade });
}
```

```tsx
// components/slice-it/MatchResults.tsx
{
  isGuest && (
    <div className="neumorphic p-4">
      <p>
        {t('guest-score-not-saved', {
          defaultValue: 'Playing as a guest — this score was not saved.',
        })}
      </p>
      <a className="neumorphic-sm px-3 py-2" href="/login?link=discord&return=/discord">
        {t('link-discord', { defaultValue: 'Link your Discord account to keep scores' })}
      </a>
    </div>
  );
}
```

The socket handler must be explicit that guests are second-class in exactly one
way — seat persistence:

```ts
/**
 * Seats are keyed by `userId`, because "a reconnect mints a new socket id" and
 * keying on it removed players mid-song. A guest has no userId, so their seat
 * is keyed by socket and does NOT survive a reconnect. That is a real downgrade
 * and it is the honest one: holding a seat for an identity we refuse to store
 * would mean storing it.
 */
const seatKey = (player: LobbyPlayer) => player.userId ?? `guest:${player.socketId}`;
```

**Prior art.** Discord Activities' guest handling generally; osu!'s
guest-to-account conversion prompt.
**Touches.** `net/events.ts`, socket handler, `score.ts`, `MatchResults.tsx`,
`lib/discord-sdk.ts`. **Size.** M

### X11 — Profiles reachable from the leaderboard

**Gap.** `LeaderboardEntry` carries `userId`, `username` and `image` and
`Leaderboard.tsx` renders them as **plain text and an avatar with no link**. The
single most natural social action in the whole game — "who is this person who
beat me, and what else do they play?" — is a dead end.

**Build.** Every leaderboard row, match result and comment author links to a
player profile. Two tiers: the platform profile (`/u/$userid`) for the whole
account, and a Slice It! player page for the game-specific view (`X12`). Guests
(`X10`) render with their Discord avatar and no link, which is also how a viewer
can tell a guest from a member.

**Sketch.**

```tsx
// components/slice-it/Leaderboard.tsx
/**
 * `resolveUserDisplay` is already called server-side to build the row — the
 * handle it returns is what makes the link possible without a second query.
 */
{
  entry.handle ? (
    <Link
      to="/slice-it/player/$handle"
      params={{ handle: entry.handle }}
      className="flex items-center gap-2 hover:text-slice-primary"
    >
      <Avatar src={entry.image} name={entry.username} size={20} />
      <span className={entry.isSelf ? 'font-bold text-slice-primary' : ''}>{entry.username}</span>
    </Link>
  ) : (
    // Guest: shown, not linkable, and visibly marked.
    <span className="flex items-center gap-2 opacity-70">
      <Avatar src={entry.image} name={entry.username} size={20} />
      {entry.username}
      <span className="text-[10px] uppercase">{t('guest', { defaultValue: 'guest' })}</span>
    </span>
  );
}
```

```ts
// lib/slice-it/types.ts
export interface LeaderboardEntry {
  // …
  /** Null for guests and for accounts without a handle. The presence of this
   *  field is what the UI branches on — never construct a URL from `username`,
   *  which is display text and not unique. */
  handle: string | null;
}
```

**Prior art.** Universal — osu!, ScoreSaber, GrooveStats all make every score
row a link to the player. It is the primary discovery mechanism in all three.
**Touches.** `leaderboard.ts`, `types.ts`, `Leaderboard.tsx`,
`MatchResults.tsx`, `MultiplayerSidebar.tsx`. **Size.** S

### X12 — A Slice It! player page

**Gap.** Follows from `X11`: there is nowhere for those links to go. The
platform profile shows posts and site activity; nothing shows what a player is
like _at this game_. `Player` holds `totalScore` and `gamesPlayed` and is
rendered nowhere.

**Build.** `/slice-it/player/$handle` — skill rating (`R2`), lamp counts by
difficulty (`H8`), recent scores, best scores, pattern radar (`P8`), Dan badge
(`S3`), charts uploaded and charts authored, and a "compare with me" view that
diffs two players' best scores per chart.

**Sketch.**

```ts
// lib/slice-it/player.server.ts
/**
 * One round trip. A profile page that issues eight queries is a profile page
 * nobody links to twice — and this one is linked from every leaderboard row.
 */
export async function playerProfile(handle: string, viewerId: string | null) {
  const user = await prisma.user.findUnique({ where: { handle }, select: userDisplaySelect });
  if (!user) return null;

  const [best, lamps, recent, uploads, patterns] = await prisma.$transaction([
    prisma.songLeaderboard.findMany({
      where: { userId: user.id },
      orderBy: { score: 'desc' },
      take: 20,
      select: {
        score: true,
        accuracy: true,
        difficulty: true,
        modPool: true,
        isFullCombo: true,
        song: { select: { id: true, title: true, artist: true } },
      },
    }),
    prisma.songLeaderboard.groupBy({
      by: ['difficulty'],
      where: { userId: user.id },
      _count: true,
      _sum: {}, // plus counts of isFullCombo / isPerfect
    }),
    prisma.sliceRun.findMany({
      where: { userId: user.id },
      orderBy: { id: 'desc' },
      take: 10,
      select: { score: true, accuracy: true, createdAt: true, songId: true },
    }),
    prisma.song.count({ where: { uploadedBy: user.id, isPublic: true } }),
    prisma.slicePatternStat.findMany({ where: { userId: user.id } }),
  ]);

  return { user, best, lamps, recent, uploads, patterns, isSelf: viewerId === user.id };
}
```

The comparison view is the socially useful part:

```ts
/**
 * Only charts BOTH have played. A comparison padded with "they have no score"
 * rows is a list of what the other person has not done, which is neither
 * interesting nor kind.
 */
export function compare(mine: Best[], theirs: Best[]) {
  const byChart = new Map(theirs.map((b) => [b.chartId, b]));
  return mine
    .filter((b) => byChart.has(b.chartId))
    .map((b) => ({ chart: b.chart, mine: b.score, theirs: byChart.get(b.chartId)!.score }))
    .sort((a, b) => b.theirs - b.mine - (a.theirs - a.mine));
}
```

**Prior art.** osu! user pages (the reference — top plays, rank graph, per-mode
tabs), ScoreSaber profiles, IIDX player cards.
**Touches.** new `app/routes/slice-it/player.$handle.tsx`, new
`lib/slice-it/player.server.ts`, `prisma/schema.prisma`. **Size.** M

### X13 — Developer API endpoints

**Gap.** The platform has a scoped developer API (`/api/v1/**` with
`withDeveloperApi`). Slice It! exposes nothing through it.

**Build.** Read endpoints for chart metadata, leaderboards and a player's own
scores, scoped to a `slice-it:read` permission. Community stat sites are a
load-bearing part of every rhythm game's ecosystem.

**Sketch.**

```ts
// app/routes/api/v1/slice-it/leaderboard.ts
/**
 * The developer API keeps its own wrapper — it speaks a different error
 * envelope from `defineHandler`, which is why /api/v1 is the one place that
 * rule does not apply.
 */
export const Route = createFileRoute('/api/v1/slice-it/leaderboard')({
  server: {
    handlers: {
      GET: withDeveloperApi({ scope: 'slice-it:read', rateLimit: 'read' }, async ({ query }) => {
        const rows = await leaderboardPage(query);
        // Never leak internal ids or the chart blob through a public API.
        return { data: rows.map(publicLeaderboardShape), meta: { total: rows.total } };
      }),
    },
  },
});
```

**Prior art.** osu! API v2 (the entire community tooling ecosystem is built on
it), ScoreSaber's API.
**Touches.** `app/routes/api/v1/`, `lib/webhooks/`. **Size.** M

### X14 — Practice streaks

**Gap.** `lib/streak.server.ts` exists and `reportGameResult` bumps an arcade
streak, but there is no Slice It!-specific practice streak — the metric that
actually correlates with improvement in a skill game.

**Build.** A daily practice streak (any ranked run counts), with the existing
`streak-saver` Go worker handling grace logic, and a counter on the main menu.

**Sketch.**

```ts
/**
 * Any ranked run counts, with no score threshold. A streak with a performance
 * bar punishes the bad days, which are exactly the days the streak is supposed
 * to get you through.
 */
await bumpStreak(userId, 'slice-it', { onNewDay: () => awardCoins(userId, 5, 'slice-it:streak') });
```

**Prior art.** Duolingo-style streaks; Rocksmith practice tracking.
**Touches.** `lib/streak.server.ts`, `MainMenu.tsx`. **Size.** S

---

## §12 — Presentation, cosmetics and identity (`V1–V12`)

The game has a strong, deliberate look — a neumorphic `--slice-*` palette with
light and dark variants, `.neumorphic` and `.neumorphic-inset` carrying the
material. It has no customisation whatsoever, which in this genre is unusual:
skinning is a defining feature of the category.

### V1 — Note and playfield skins

**Gap.** Colours are hard-coded in `GameCanvas.tsx:26` (`COLORS`) and read from
CSS variables for the theme. There is no skin concept.

**Build.** A skin as a JSON descriptor resolved at run start into the same
structure `readTheme()` already produces. Ship four or five; sell more (`X3`).

**Sketch.**

```ts
// lib/slice-it/skins.ts
export interface Skin {
  id: string;
  noteShape: 'pill' | 'arrow' | 'circle' | 'bar';
  /** Per lane, then per quantisation (G8) as an optional override. */
  laneColors: string[];
  quantColors?: Record<number, string>;
  judgementLine: 'solid' | 'glow' | 'inset';
  hitBurst: 'particles' | 'ring' | 'none';
  /** Whether the skin keeps the neumorphic double-shadow. A skin that drops it
   *  is a deliberate flat look, not a broken one — but it must say so, because
   *  the renderer decides shadow work from this. */
  neumorphic: boolean;
}

/**
 * Resolved once per run, not per frame — same discipline as `readTheme()`,
 * which was hoisted out of the draw loop by the 07-30 audit precisely because
 * per-frame style resolution costs a forced recalc.
 */
export function resolveSkin(skin: Skin, canvas: HTMLCanvasElement): ResolvedSkin {
  /* … */
}
```

**Prior art.** osu! skinning is the deepest example in gaming; StepMania
noteskins; Clone Hero highways.
**Touches.** `GameCanvas.tsx`, `slice-it.css`, new `lib/slice-it/skins.ts`.
**Size.** M

### V2 — Custom hit sounds

**Gap.** `hitSound` is a string naming a file under `/music/slice-it/sounds/` —
a fixed list.

**Build.** More stock sounds, per-judgement variants (a distinct `MARVELOUS`
tick is a real feedback channel), and uploaded samples for members through the
existing upload validation path with a tight cap.

**Sketch.**

```ts
/**
 * 256 KB and 2 seconds. A hit sound is played hundreds of times per run and
 * must be decoded into memory up front; anything longer is a music file, and
 * the validation ceiling is what stops it being used as free audio hosting.
 */
export const HIT_SOUND_MAX_BYTES = 256 * 1024;
export const HIT_SOUND_MAX_SECONDS = 2;

// Reuse lib/audio/probe.ts (d4185549) to check duration from headers before
// decode — the same allocation-bomb reasoning applies at a smaller scale.
```

**Prior art.** osu! hitsound sets, StepMania, IIDX key sounds.
**Touches.** `store.ts`, `engine.ts`, upload route. **Size.** S

### V3 — A reactive background

**Gap.** The playfield sits on a flat `--slice-bg`. The analyser computes a full
STFT and log-frequency filterbank per song and discards the spectrogram after
charting.

**Build.** Persist a downsampled spectrum envelope with the chart (a few
kilobytes) and drive a visualiser from it — no runtime FFT, no audio-thread
cost, perfectly synced because it comes from the same analysis the notes did.

**Sketch.**

```ts
/**
 * 8 bands at 30 Hz. A 4-minute track is 57 600 bytes as Uint8 — smaller than
 * the cover image, and it removes any need for an AnalyserNode on the audio
 * path, which is the thing that would actually cost frames.
 */
export function spectrumEnvelope(bands: Float32Array[], hz = 30): Uint8Array {
  /* … */
}

// components/slice-it/GameCanvas.tsx — must obey both degradation tiers
if (theme.glow && !reducedFlash) drawSpectrum(ctx, envelope, audioTime);
```

**Prior art.** Audiosurf, Beat Hazard, Cytus backgrounds, Muse Dash.
**Touches.** `beatmap/spectrum.ts`, `GameCanvas.tsx`. **Size.** M

### V4 — Cover-derived palettes

**Gap.** `coverUrl` is decorative. Every chart looks identical in play
regardless of the music.

**Build.** Extract dominant colours from the cover at upload (already processed
to a 1024px square WebP) and offer a "match the cover" palette — clamped to a
safe hue separation so it still passes `A3`.

**Sketch.**

```ts
/**
 * Extracted colours are a suggestion, not a palette. Two lanes 20° apart in hue
 * are indistinguishable mid-run for anyone, and unusable for a dichromat — so
 * force them apart and keep the luminance gap that makes them readable at all.
 */
export function safeLanePair(dominant: Hsl[]): [string, string] {
  const [a] = dominant;
  const b = {
    ...a,
    h: (a.h + 150) % 360,
    l: clamp(a.l > 0.5 ? a.l - 0.25 : a.l + 0.25, 0.25, 0.75),
  };
  return [hslToHex(a), hslToHex(b)];
}
```

**Prior art.** Spotify's dynamic colour; Muse Dash per-song theming.
**Touches.** upload route, `GameCanvas.tsx`. **Size.** S

### V5 — Combo milestones

**Gap.** Combo is a number that increments. Nothing marks 100, 250 or 500.

**Build.** Escalating visual and audio treatment at milestones, respecting `A2`.
The genre's oldest retention mechanic, and it costs one counter comparison.

**Sketch.**

```ts
const COMBO_MILESTONES = [50, 100, 250, 500, 1000];

/** Fires once per crossing — comparing `combo` to the list every frame would
 *  re-fire for as long as the combo sits on the number. */
if (COMBO_MILESTONES.includes(this.combo) && this.combo !== this.lastMilestone) {
  this.lastMilestone = this.combo;
  this.effects.push({ kind: 'milestone', value: this.combo, at: this.now() });
}
```

**Prior art.** DDR/IIDX combo effects, Guitar Hero star power.
**Touches.** `GameCanvas.tsx`, `engine.ts`. **Size.** S

### V6 — Cosmetic unlocks

**Gap.** Nothing in the game is unlockable. There is no reward for playing
beyond the number.

**Build.** Skins (`V1`), hit sounds (`V2`), palettes (`A3`) and card frames
(`H10`) as unlocks from achievements (`X1`), the pass (`X4`) and coins (`X3`).
**Cosmetics only, never readability** — a purchasable advantage in a skill game
is the end of its leaderboard.

**Sketch.**

```ts
/**
 * The invariant, enforced rather than documented: nothing sold or unlocked may
 * change what the player can SEE about incoming notes. Scroll speed, lane
 * cover, note size and visibility mods stay free for everyone, always.
 */
export function assertCosmeticOnly(item: ShopItem): void {
  const gameplay = ['scrollSpeed', 'laneCover', 'noteSize', 'visibility', 'timingWindow'];
  if (gameplay.some((k) => k in item.effects)) {
    throw new Error(`Shop item ${item.id} affects gameplay; cosmetics only.`);
  }
}
```

**Prior art.** Battle-pass cosmetics generally; Beat Saber sabers.
**Touches.** `lib/shop/`, `lib/slice-it/skins.ts`. **Size.** M

### V7 — Stage backdrops

**Gap.** One background per theme, site-wide.

**Build.** Selectable backdrops reacting to the gauge (`G1`) and combo —
dimming as failure approaches, intensifying at high combo. Feedback disguised as
decoration.

**Sketch.**

```ts
/** Backdrop intensity is a pure function of run state, so it never needs its
 *  own timeline and can never desync from the gauge it is describing. */
const intensity = (health / HEALTH_MAX) * 0.6 + Math.min(1, combo / 200) * 0.4;
```

**Prior art.** IIDX/SDVX backgrounds, FNF stages, Taiko dancers.
**Touches.** `GameCanvas.tsx`. **Size.** M

### V8 — Chart preview animation on cards

**Gap.** Library cards are static — cover, title, artist, counts.

**Build.** A tiny animated note-density strip on hover, generated from a
precomputed 64-value density array (not the chart — the list response
deliberately excludes it for payload reasons).

**Sketch.**

```ts
/**
 * 64 bytes per difficulty. Small enough to include in the LIST response, which
 * is the whole point: sending the chart to animate a card would undo the exact
 * optimisation `songs.server.ts` documents making.
 */
export function densityStrip(notes: Slice[], duration: number, buckets = 64): Uint8Array {
  const out = new Uint8Array(buckets);
  for (const note of notes)
    out[Math.min(buckets - 1, Math.floor((note.time / duration) * buckets))]++;
  const peak = Math.max(1, ...out);
  return out.map((v) => Math.round((v / peak) * 255));
}
```

**Prior art.** osu! song select preview, Steam video previews.
**Touches.** `songs.server.ts`, `SongLibrary.tsx`. **Size.** S

### V9 — Results replays as clips

**Gap.** `H10` produces a static card. Nothing captures the run itself.

**Build.** With `R3`'s replays, render the best 10 seconds (highest combo
density) as an animated share asset.

**Sketch.**

```ts
/** The interesting window is where the most notes were hit consecutively, not
 *  where the score rose fastest — score rises fastest at the END of any run,
 *  because combo multiplies. */
export function highlightWindow(log: ReplayInput[], seconds = 10): [number, number] {
  return maxSumWindow(
    log.map((i) => i.t / 1000),
    seconds,
  );
}
```

**Prior art.** Beat Saber clip sharing, osu! replay clips.
**Touches.** `lib/og/`, `R3`/`R4`'s infrastructure. **Size.** L

### V10 — Lane cover customisation

**Gap.** Nothing occludes the playfield, so a player who reads better with a
shorter approach distance has no way to get one. (`M3` introduces the mechanic;
this is its tuning surface.)

**Build.** A draggable lane cover with a persisted height and **a numeric
readout of the resulting reaction window in milliseconds** — the readout is what
makes it a tool rather than a curtain.

**Sketch.**

```ts
/**
 * The "green number": how long a note is visible before it must be hit. This is
 * the quantity players actually tune, and expressing the cover as a percentage
 * without it is asking them to tune something they cannot perceive.
 */
export function reactionWindowMs(approachSec: number, coverFraction: number): number {
  return Math.round(approachSec * (1 - coverFraction) * 1000);
}
```

**Prior art.** IIDX green number / lane cover — one of the most-used features in
the genre.
**Touches.** `GameCanvas.tsx`, `store.ts`. **Size.** S

### V11 — Seasonal presentation

**Gap.** The game looks the same every day of the year.

**Build.** Light seasonal skinning tied to the platform's live-ops calendar —
menu treatment, a seasonal shelf (`L2`), a seasonal skin in the pass (`X4`).
Cosmetic only, always disableable.

**Sketch.**

```css
/* Seasons override the palette, never the shadow geometry — a season that
   changes the neumorphic depth stops looking like Slice It!. */
.slice-theme[data-season='winter'] {
  --slice-primary: #7dd3fc;
  --slice-accent: #e0f2fe;
}
```

**Prior art.** Seasonal events across every live game.
**Touches.** `slice-it.css`, `MainMenu.tsx`. **Size.** S

### V12 — A dedicated game hub page

**Gap.** `/slice-it` goes straight into the full-screen game and
`lib/catalog/games/slice-it.ts` is the only public-facing description. There is
no page to link to, no SEO surface, and `authGate: true` means an anonymous
visitor gets a gate rather than a pitch.

**Build.** A `_site/` hub at `/games/slice-it` with the radial shell: what the
game is, top charts, recent records, featured charters, and the link into play.

**Sketch.**

```tsx
// app/routes/_site/games/slice-it.tsx
/**
 * A _site route, so this one follows the SITE tokens and glass elevation —
 * `--slice-*` and `.neumorphic` stay inside the game. `buildMeta` owns the
 * whole Open Graph block; do not hand-roll og:* tags here.
 */
export const Route = createFileRoute('/_site/games/slice-it')({
  head: () => ({
    ...buildMeta({
      title: 'Slice It! — rhythm game',
      description: 'Upload any track, get a chart, race up to eight players.',
      canonical: buildCanonical('/games/slice-it'),
      image: ogCardPath('game', 'slice-it'),
    }),
    scripts: [jsonLdScript(videoGameSchema({ name: 'Slice It!', url: '/slice-it' }))],
  }),
  loader: () => ({ topCharts: topCharts(12), recentRecords: recentRecords(10) }),
});
```

**Prior art.** Steam store pages; osu!'s beatmap listing pages as its SEO
surface.
**Touches.** new `app/routes/_site/games/slice-it.tsx`, `lib/seo.ts`.
**Size.** M

---

## §13 — Input, hardware and devices (`I1–I10`)

`lib/game-capabilities.ts:173` records keyboard, touch and gamepad support, with
a comment noting Slice It! is "the only game wired to a gamepad today". That is
a real strength; it is also the whole of it. `fb34b5f0` improved the _timing_ of
input (event `timeStamp` reconstruction) without widening what counts as input.

### I1 — A full remapping surface

**Gap.** `Keybinds` is `{lane1, lane2}` — two keys, one binding each. Gamepad
mapping is a hard-coded array (`GAMEPAD_LANE0_BUTTONS`, `GAMEPAD_LANE1_BUTTONS`).

**Build.** Multiple bindings per lane (players routinely alternate two keys on
one lane for fast jacks — currently impossible), gamepad remapping in the UI,
separate bindings for pause/restart/skip, named profiles.

**Sketch.**

```ts
// lib/slice-it/store.ts — v3 migration, following the existing v1→v2 pattern
export interface Keybinds {
  /** Per lane, multiple keys. Alternating two keys on one lane is how a fast
   *  jack is played, and one-binding-per-lane makes it physically impossible. */
  lanes: string[][];
  pause: string[];
  restart: string[];
  skip: string[];
}

migrate: (persisted, version) => {
  const state = (persisted ?? {}) as Record<string, any>;
  if (version < 3) {
    const old = state.keybinds ?? {};
    state.keybinds = {
      lanes: [[old.lane1 ?? 'ArrowLeft'], [old.lane2 ?? 'ArrowRight']],
      pause: ['Escape'], restart: ['`'], skip: ['Space'],
    };
  }
  return state;
},
```

```ts
/**
 * The debounce is PER LANE, not per key — INPUT_COOLDOWN_MS exists so one press
 * cannot resolve two notes, and two keys bound to the same lane are still one
 * lane. Keying the cooldown by key would let alternating keys double-hit.
 */
const lastInputByLane = new Map<number, number>();
```

**Prior art.** Universal. StepMania input mapping, osu! per-mode keys.
**Touches.** `store.ts`, `MainMenu.tsx`, `GameCanvas.tsx`. **Size.** M

### I2 — Gamepad haptics

**Gap.** The gamepad is polled for buttons only. No rumble on hit, no feedback
on miss.

**Build.** Judgement-scaled rumble through the Gamepad haptics API, sharing
`A8`'s signal path and intensity setting.

**Sketch.**

```ts
/**
 * `playEffect` is fire-and-forget and returns a promise that must NOT be
 * awaited on the input path — a rejected promise on a pad without haptics would
 * otherwise surface as an unhandled rejection every note.
 */
function rumble(pad: Gamepad, result: HitResult, intensity: number): void {
  const actuator = (pad as any).vibrationActuator;
  if (!actuator?.playEffect) return;
  void actuator
    .playEffect('dual-rumble', {
      duration: HAPTIC_MS[result],
      weakMagnitude: 0.4 * intensity,
      strongMagnitude: (result === 'MISS' ? 0.8 : 0.2) * intensity,
    })
    .catch(() => {});
}
```

**Prior art.** Console rhythm games; Rock Band peripherals.
**Touches.** `GameCanvas.tsx`, `lib/shared/platform.ts`. **Size.** S

### I3 — MIDI controllers

**Gap.** Input is keyboard, touch and gamepad. There is no Web MIDI path, so
electronic drum kits, launchpads and MIDI keyboards — devices whose owners are
exactly this game's audience — cannot play it.

**Build.** Web MIDI as a fourth source with a learn-mode binding UI. Small
implementation, distinctive result, and it makes the game genuinely playable on
an e-drum kit.

**Sketch.**

```ts
// lib/slice-it/input/midi.ts
/**
 * MIDI events carry their own `timeStamp` in the same `performance.now()`
 * domain the engine reconstructs audio position from (fb34b5f0) — so MIDI gets
 * the low-latency path for free, unlike gamepad, which has no event timestamp.
 */
export async function connectMidi(onNote: (note: number, timeStamp: number) => void) {
  const access = await navigator.requestMIDIAccess({ sysex: false });
  for (const input of access.inputs.values()) {
    input.onmidimessage = (event) => {
      const [status, note, velocity] = event.data;
      // 0x90 with velocity 0 is a note-off in disguise; a huge share of devices
      // send it that way and treating it as a hit double-fires every note.
      if ((status & 0xf0) === 0x90 && velocity > 0) onNote(note, event.timeStamp);
    };
  }
}
```

**Prior art.** Clone Hero MIDI drums, Rocksmith real-instrument input, Taiko
drum controllers.
**Touches.** new `lib/slice-it/input/midi.ts`, `GameCanvas.tsx`. **Size.** M

### I4 — Touch layout customisation

**Gap.** Touch is declared supported and the playfield geometry is fixed, so
touch targets are wherever the two lanes render — which on a landscape phone is
not where thumbs are.

**Build.** Configurable touch zones (size, position, opacity), a split landscape
layout, and a visible-on-touch overlay.

**Sketch.**

```tsx
/**
 * Zones are independent of where notes are DRAWN. Coupling them means a player
 * who wants big thumb targets also gets a distorted playfield, which is two
 * settings pretending to be one.
 */
<div
  className="absolute touch-none select-none"
  style={{ left: `${zone.x}%`, bottom: `${zone.y}%`, width: `${zone.w}%`, height: `${zone.h}%` }}
  onPointerDown={(e) => {
    e.preventDefault();
    engine.submitInput(lane, undefined, e.timeStamp);
  }}
/>
```

```css
/* `touch-action: none` is load-bearing: without it the browser waits ~300ms to
   decide whether a tap is a scroll, which is 15 hit windows. */
```

**Prior art.** Every mobile rhythm game — Cytus, Arcaea, Phigros, Muse Dash.
**Touches.** `GameCanvas.tsx`, `store.ts`. **Size.** M

### I5 — An input latency test

**Gap.** `CalibrationScreen.tsx` calibrates **audio** offset. Input latency —
polling rate, event lag, display latency — is a separate quantity and nothing
measures it.

**Build.** A visual-only calibration pass yielding a separate `inputOffset`.
Audio and visual offsets being one number is a known source of "the game feels
wrong and calibrating does not help".

**Sketch.**

```ts
/**
 * Visual-only: a marker crosses a line, the player taps, and the error is
 * display+input latency with no audio in the loop. Subtracting the audio-based
 * offset (P5) from this isolates the two, which is what makes both fixable.
 */
audioOffset: number; // audio ahead of visuals, ms
inputOffset: number; // input pipeline delay, ms — applied to press timestamps

// engine: they compose, they do not substitute
const pressAudioTime = reconstruct(event.timeStamp) - this.inputOffset / 1000;
const noteTime = slice.time + this.audioOffset / 1000;
```

**Prior art.** osu! separate offsets, StepMania global offset vs visual delay,
Rock Band's two-stage calibration.
**Touches.** `CalibrationScreen.tsx`, `store.ts`, `engine.ts`. **Size.** S

### I6 — Low-latency audio and pitch preservation

**Gap.** Speed changes are playback-rate changes, which shift pitch — a 1.5× run
is audibly wrong. Audio goes through `lib/audio/AudioManager` with no device
selection and no explicit latency hint.

**Build.** Pitch-preserving time-stretch for rate mods (or an explicit
"nightcore" toggle for players who want the shift), an output device picker, and
`latencyHint: 'interactive'`.

**Sketch.**

```ts
/**
 * ALWAYS through getAudioContext() — `lib/CLAUDE.md` is explicit: never
 * `new AudioContext()`. A second context is a second clock, and a second clock
 * in a rhythm game is a desync nobody can reproduce.
 */
const ctx = getAudioContext({ latencyHint: 'interactive' });

/**
 * `preservesPitch` is the one-line version and is enough for ±25%. Beyond that
 * browsers' stretchers artefact badly and a proper phase-vocoder in an
 * AudioWorklet is the real answer — worth measuring before building.
 */
element.preservesPitch = !nightcore;
element.playbackRate = modifiers.speed;

// Device picking, where supported.
if ('setSinkId' in element) await (element as any).setSinkId(deviceId);
```

**Prior art.** osu! DT vs NC (pitch-shifted vs not), Etterna rates with pitch
preservation.
**Touches.** `lib/audio/AudioManager`, `lib/shared/platform.ts`. **Size.** M

### I7 — Dance pad and arcade controller mapping

**Gap.** Gamepad buttons map to two lanes via hard-coded arrays. Arcade
controllers and dance pads enumerate as gamepads with unusual layouts and get
whatever those arrays give them.

**Build.** Device profiles keyed by gamepad ID, community-contributable, plus a
"hold to bind" flow for unknown devices. Depends on `I1`.

**Sketch.**

```ts
/**
 * `Gamepad.id` is a free-text vendor string, so match loosely and fall back —
 * a profile system that silently applies the wrong mapping is worse than none.
 */
const PROFILES: { match: RegExp; lanes: number[][] }[] = [
  {
    match: /dance ?pad|ddr|stepmania/i,
    lanes: [
      [14, 12],
      [15, 13],
    ],
  },
  {
    match: /iidx|beatmania/i,
    lanes: [
      [0, 2, 4],
      [1, 3, 5],
    ],
  },
];

export function profileFor(pad: Gamepad) {
  return PROFILES.find((p) => p.match.test(pad.id)) ?? null; // null → defaults
}
```

**Prior art.** StepMania pad support, IIDX controller profiles.
**Touches.** `GameCanvas.tsx`, `store.ts`. **Size.** M

### I8 — Local two-player

**Gap.** Multiplayer is networked only — `MIN_VERSUS_PLAYERS` is 2 and every
seat is a socket.

**Build.** Split-keyboard local versus on one machine and one screen: two
keybind sets, two score displays, one chart. No server involvement, and it is
the mode that gets people into a rhythm game in the first place.

**Sketch.**

```ts
/**
 * Two engines, ONE audio source. Two AudioManagers would drift within a minute
 * — and the whole premise of local versus is that both players hear the same
 * note at the same instant.
 */
const engines = [new GameEngine({ audio: shared }), new GameEngine({ audio: shared })];
const routeKey = (key: string) => bindings.findIndex((b) => b.lanes.flat().includes(key));
```

**Prior art.** Arcade cabinets are two-player by default; DDR doubles, Taiko 2P.
**Touches.** `engine.ts`, `GameCanvas.tsx`. **Size.** M

### I9 — Keyboard ghosting guidance

**Gap.** Nothing warns a player that their keyboard cannot register their chosen
key combination — a real hardware limit on membrane keyboards that manifests as
"the game dropped my input" and reads as a bug.

**Build.** A detection pass in the keybind UI: ask for simultaneous presses,
report whether all registered, suggest alternates.

**Sketch.**

```ts
/**
 * Ghosting is a matrix property, so it can only be detected empirically — there
 * is no API for it. Ask the player to press the bound keys together and count
 * what arrives.
 */
export function testGhosting(keys: string[], onResult: (missing: string[]) => void) {
  const seen = new Set<string>();
  const down = (e: KeyboardEvent) => {
    seen.add(e.code);
    if (seen.size === keys.length) finish();
  };
  const finish = () => onResult(keys.filter((k) => !seen.has(k)));
  window.addEventListener('keydown', down);
  setTimeout(finish, 1500);
}
```

**Prior art.** StepMania key test; fighting-game input displays.
**Touches.** `MainMenu.tsx`. **Size.** S

### I10 — Session guards

**Gap.** A run is a canvas in a browser tab. Nothing holds the wake lock,
nothing prevents accidental back-navigation mid-chart, and nothing enters
fullscreen — despite `lib/shared/platform.ts` wrapping wake lock and fullscreen
already.

**Build.** Acquire the wake lock (and optionally fullscreen) at run start,
release on finish, and guard navigation during a run — matching the care the
multiplayer handler already takes about not losing someone's run.

**Sketch.**

```ts
/**
 * The wake lock is dropped by the browser on visibility change and is NOT
 * restored automatically — re-acquiring on `visibilitychange` is the difference
 * between "the screen stayed on" and "the screen stayed on until you got a
 * notification".
 */
useEffect(() => {
  if (!playing) return;
  let lock: WakeLockSentinel | null = null;
  const acquire = async () => {
    lock = await requestWakeLock();
  };
  void acquire();
  document.addEventListener('visibilitychange', acquire);
  return () => {
    document.removeEventListener('visibilitychange', acquire);
    void lock?.release();
  };
}, [playing]);
```

**Prior art.** Standard practice in browser games.
**Touches.** `GameCanvas.tsx`, `lib/shared/platform.ts`. **Size.** S

---

## §14 — Telemetry, content operations and infrastructure (`O1–O8`)

### O1 — Per-chart miss heatmaps

**Gap.** Nothing records where in a chart players fail. `SongLeaderboard` keeps
a final score; `RunStats` keeps totals. A chart with one unplayable bar is
indistinguishable from a hard chart.

**Build.** Aggregate per-note miss rates across runs (needs `R6`) into a heatmap
over the chart timeline — surfaced to the uploader (`L6`), to the player as a
warning, and to whoever tunes the charter as the ground truth for whether it
places notes people can hit, which is currently unknown.

**Sketch.**

```prisma
/// Per-note aggregate, not per-run rows — a run's worth of note results is
/// 1200 rows and this table would be the largest in the database within a
/// month. Counters, updated in batch.
model SliceNoteStat {
  chartId  String @db.Uuid
  /// Note time in milliseconds — stable across regeneration only within a
  /// chartHash, which is why that column exists (C12).
  noteMs   Int
  attempts Int    @default(0)
  misses   Int    @default(0)
  @@id([chartId, noteMs])
}
```

```ts
/**
 * Batched per run, sampled at high volume. A popular chart does not need every
 * run counted to know which bar people fail — 1-in-10 converges within a day
 * and costs a tenth of the writes.
 */
if (hash(runId) % 10 === 0) await queueNoteStats(chartId, noteResults);
```

**Prior art.** osu! map fail-point graphs (shown on the beatmap page), Guitar
Hero difficulty telemetry.
**Touches.** `prisma/schema.prisma`, `server/jobs/`. **Size.** M

### O2 — Automatic bad-chart detection

**Gap.** A chart that generates badly — the tempo tracker locking onto half
time, the 55 ms filter dropping most of the song — ships silently. There is no
signal that anything is wrong except players not playing it.

**Build.** Flag charts whose clear rate (`R9`) is near zero, whose miss heatmap
(`O1`) spikes unexplained by density, or whose accuracy distribution is bimodal,
and queue them for regeneration (`C8`) or review.

**Sketch.**

```ts
/**
 * Bimodality is the tell for a mis-tracked tempo: players who happen to lock
 * onto the wrong grid score well and the rest score terribly, so the
 * distribution has two humps where a merely-hard chart has one long tail.
 */
export function looksBroken(accuracies: number[], clearRate: number): boolean {
  if (accuracies.length < 30) return false;
  if (clearRate < 0.02) return true;
  return dipStatistic(accuracies) > DIP_THRESHOLD;
}
```

**Prior art.** Content moderation heuristics; osu!'s QA team as the manual
version.
**Touches.** `go-services/supervisor/`, admin surfaces. **Size.** M

### O3 — Analysis in the worker fleet

**Gap.** Beatmap generation still runs **inline in the upload route**.
`d4185549` made it 31–37% faster (900 s of audio: 3027 ms → 1895 ms) and added
`lib/audio/probe.ts` so a decode bomb cannot allocate 530 MB from a 4 MB upload
— both large improvements, and neither moves the work off the web tier. Two
seconds of CPU-bound work still blocks an SSR worker on the container that also
serves every page.

**Build.** Move analysis to a queued job (pg-boss is the platform's job system;
`go-services/supervisor` runs the background fleet), returning the upload
immediately with a "charting…" state.

**Sketch.**

```ts
// app/routes/api/slice-it/songs/upload.ts
/**
 * The probe stays inline — it is header reads, it is microseconds, and it is
 * what makes accepting the file safe. Only the analysis moves.
 */
const probe = await probeAudio(bytes);
if (!probe.ok) return Response.json({ error: probe.reason }, { status: 400 });

const song = await createSong({ ...meta, duration: probe.duration, analysisState: 'pending' });
await jobs.send('slice-it:analyse', { songId: song.id }, { retryLimit: 3, expireInHours: 2 });
return Response.json({ song, charting: true });
```

```tsx
/** The library shows the pending state rather than hiding the row — a song that
 *  vanishes for two minutes after upload reads as a failed upload. */
{
  song.analysisState === 'pending' && <Badge>{t('charting', { defaultValue: 'Charting…' })}</Badge>;
}
```

**Prior art.** Standard media-processing architecture.
**Touches.** `upload.ts`, `server/jobs/`, `SongLibrary.tsx`. **Size.** M

### O4 — Transcode on ingest

**Gap.** Uploaded audio is stored as supplied, up to `AUDIO_MAX_BYTES` (50 MB).
A player on a phone downloads a 40 MB WAV to play a 3-minute chart, and the
10 GB global quota fills with unoptimised files. (`d4185549` made _serving_ a
range cheap; the bytes are still the bytes.)

**Build.** Transcode to Opus (plus a compatibility AAC) at ingest, keep the
original only if storage allows, serve by client capability. Typically 5–10×
smaller — which is a 5–10× effective increase in the global quota.

**Sketch.**

```ts
/**
 * In the analysis worker (O3), not the request: transcoding is the same class
 * of CPU cost as analysis and belongs behind the same queue.
 *
 * 96 kbps Opus is transparent for gameplay — the player is listening for onsets
 * they can already see, and the chart was generated from the original anyway.
 */
const opus = await transcode(original, { codec: 'libopus', bitrate: '96k' });
await putObject(`${SONG_AUDIO_PREFIX}${id}.opus`, opus);
if (totalStorage() < TOTAL_STORAGE_LIMIT_BYTES * 0.7) await putObject(originalKey, original);
```

**Prior art.** Every streaming service; BeatSaver's ogg standard.
**Touches.** upload route, `lib/storage/s3.server.ts`, `O3`'s worker. **Size.** M

### O5 — Preload before the countdown

**Gap.** `LOAD_TIMEOUT_MS` is 90 seconds because "a cold cache on a weak phone
genuinely takes tens of seconds" — the constant is a workaround for nothing
starting to fetch until the match does.

**Build.** Prefetch audio and chart when a player selects a song in the lobby
(before ready-up), report real progress through the existing `slice:loading`
event, and shrink the timeout once the data says it can shrink.

**Sketch.**

```ts
// components/slice-it/MultiplayerLobby.tsx
/**
 * The lobby knows the song well before the match starts — `slice:song` fires on
 * host selection. Starting the fetch there converts most of the 90-second
 * window into time the player was reading the song list anyway.
 */
useEffect(() => {
  if (!lobby?.song) return;
  const controller = new AbortController();
  void prefetchRun(lobby.song.id, { signal: controller.signal });
  return () => controller.abort(); // host changed the song: stop the old fetch
}, [lobby?.song?.id]);
```

**Prior art.** Standard preloading; osu!'s background beatmap downloads.
**Touches.** `MultiplayerLobby.tsx`, `net/client.ts`, `constants.ts`. **Size.** S

### O6 — Frame-timing telemetry

**Gap.** The 07-30 audit measured this game's canvas cost with an external probe
(`scripts/perf/canvas2d-probe.mjs`) and shipped `canvasGlowEnabled()` as the
mitigation. The game reports no frame timing from real players, so the tier's
field effectiveness is unknown — and `fb34b5f0` just changed the frame loop
substantially (update ran twice per frame; render ran before update).

**Build.** Sample frame times during runs and beacon percentiles with device
class and glow tier through `lib/rum.ts`. In a rhythm game a frame-time spike is
a missed note, so this is a correctness metric.

**Sketch.**

```ts
/**
 * Percentiles, not a mean — a run at a perfect 60 fps with four 200 ms stalls
 * has an excellent mean and four missed notes. p99 is the number that
 * corresponds to what the player felt.
 */
const frames = new Float32Array(4096);
// on finish:
beacon('slice-it:frames', {
  p50: percentile(frames, 0.5),
  p95: percentile(frames, 0.95),
  p99: percentile(frames, 0.99),
  glow: canvasGlowEnabled(),
  dpr: devicePixelRatio,
  notes: stats.notesResolved,
});
```

**Prior art.** Standard game telemetry.
**Touches.** `GameCanvas.tsx`, `lib/rum.ts`. **Size.** S

### O7 — Ship one difficulty, not four

**Gap.** Still true after both 08-06 commits.
`app/routes/api/slice-it/songs/$id.ts:31` selects the whole `analysisData` blob,
and `BeatMap.slices` is `Record<Difficulty, Slice[]>` — so the single-song read
delivers **all four difficulty charts** and the client discards three in
`resolveSlices()`. The list response already excludes the chart for exactly this
reason ("hundreds of kilobytes"), and the difficulties are _nested_
(Easy ⊆ Normal ⊆ Hard ⊆ Expert), so most of what ships is the same notes four
times.

**Build.** Take the difficulty as a query parameter and return only that
variant; or store Expert plus three index sets naming which notes survive into
each tier — which is how the nesting is generated in the first place. Either
cuts the pre-match download on the exact path `LOAD_TIMEOUT_MS` exists to
accommodate.

**Sketch.**

```ts
// app/routes/api/slice-it/songs/$id.ts
/**
 * The `select` cannot narrow inside a Json column, so the trim happens after
 * the read — the win is on the wire, not in the query. Trimming in the DB would
 * need the nested-index representation below.
 */
const song = await prisma.song.findUnique({ where: { id }, select: songDetailSelect });
const chart = song.analysisData as BeatMap | null;
if (chart && query.difficulty && !Array.isArray(chart.slices)) {
  chart.slices = { [query.difficulty]: chart.slices[query.difficulty] } as any;
}
```

The representation that makes it free, for new charts:

```ts
/**
 * Expert once, plus three bitsets. Easy ⊆ Normal ⊆ Hard ⊆ Expert means every
 * lower tier is a SUBSET — storing it as a list repeats notes that are already
 * present. A 1200-note Expert plus three 1200-bit masks is ~450 bytes of masks
 * against ~200 KB of repeated note objects.
 */
interface NestedChart {
  expert: Slice[];
  /** Base64 bitsets over `expert`, one per lower tier. */
  masks: Record<'easy' | 'normal' | 'hard', string>;
}
```

**Prior art.** Per-difficulty chart files are the norm — `.osu` files are one
difficulty each; StepMania's single-file `.sm` is the exception people complain
about.
**Touches.** `songs/$id.ts`, `songs.server.ts`, `chart.ts`, `useStartRun.ts`.
**Size.** M

### O8 — An admin content dashboard

**Gap.** Storage totals, quota headroom, upload rates, chart-version
distribution and analysis failures are computable and surfaced nowhere. The
first signal that the 10 GB cap is close is uploads failing.

**Build.** An admin panel: storage by uploader, songs below the current
`BEATMAP_VERSION`, the analysis failure log (which `O3`'s queue makes a real
thing rather than a 500), upload rate over time, orphaned storage objects.
Pairs with `L12` — you cannot run a lifecycle policy without a view.

**Sketch.**

```ts
/**
 * `getObjectSize` (d4185549) makes the orphan scan cheap: compare storage keys
 * against Song rows without fetching a single object body.
 */
export async function orphanedObjects(): Promise<string[]> {
  const [keys, rows] = await Promise.all([
    listObjects(SONG_AUDIO_PREFIX),
    prisma.song.findMany({ select: { audioUrl: true } }),
  ]);
  const known = new Set(rows.map((r) => storageKeyOf(r.audioUrl)));
  return keys.filter((k) => !known.has(k));
}
```

**Prior art.** Standard operations dashboards.
**Touches.** admin routes, `songs.server.ts`, `lib/storage/s3.server.ts`.
**Size.** M

---

## §15 — If you only do fifteen

Ordered by value per unit of work, given the code as it stands after the 08-06
commits. Most are small because the data already exists and is being discarded.

| #   | ID    | Why it is first                                                                                          |
| --- | ----- | -------------------------------------------------------------------------------------------------------- |
| 1   | `R1`  | The leaderboard mixes difficulties and modifiers into one row per player. It is wrong now.               |
| 2   | `P6`  | The engine already computes and submits the timing distribution. The player is never shown any of it.    |
| 3   | `H1`  | `recordOffset()` already retains the signed offset. The error bar is a renderer, nothing more.           |
| 4   | `P5`  | A mis-set offset silently ruins the game and players never diagnose it — and the measurement now exists. |
| 5   | `G8`  | The charter computes each note's subdivision and throws it away. Colouring it makes charts readable.     |
| 6   | `X11` | Every leaderboard row is dead text. Linking it is the whole social layer's front door.                   |
| 7   | `H4`  | The HUD shows no accuracy at all, on a game whose grade is defined purely by accuracy.                   |
| 8   | `G9`  | No scroll-speed setting exists, so readability is hostage to the song's BPM.                             |
| 9   | `H3`  | `RunStats.judgements` is documented as being "for the results screen" and is not shown there.            |
| 10  | `H8`  | Clear lamps are one join away and are the genre's strongest retention mechanic.                          |
| 11  | `R6`  | Every run except your best is deleted on submission. Ten other ideas need that history.                  |
| 12  | `L14` | Search is a substring match. At a few thousand songs that stops being a search box.                      |
| 13  | `X8`  | The Discord Activity is permanently RMHBox because there is no `discord/index.tsx` to choose from.       |
| 14  | `O7`  | Every pre-match download ships four difficulty charts so the client can discard three.                   |
| 15  | `G1`  | `health: 100` is still a literal — and as an opt-in multiplier mod it sidesteps the multiplayer problem. |

---

## §16 — Prior art index

Which game to study when designing each idea. Useful when the question is
"which variant of this feature", which is almost always the real question.

| Reference                     | What is worth copying                                                                     | Ideas                                                |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **osu! / osu!mania**          | Error bar, unstable rate, offset wizard, pp, replays, ranked queue, skinning, API, search | `H1` `P5` `P6` `R2` `R3` `R4` `R10` `V1` `X13` `L14` |
| **StepMania / DDR**           | Quantisation colours, packs, mines, courses, noteskins, pad input, timing windows         | `G8` `G7` `L10` `L16` `S2` `V1` `I7` `A9`            |
| **Beatmania IIDX**            | Groove gauge, clear lamps, RANDOM family, lane cover / green number, Dan certification    | `G1` `H8` `M2` `M3` `V10` `S3`                       |
| **Etterna / Quaver**          | Skillset decomposition, chart keys, rates with pitch preservation, HUD editing            | `P8` `C12` `I6` `H9` `L13`                           |
| **Beat Saber / ScoreSaber**   | Directional cuts, playlists, score ghosts, modifier economy, ranked pools, clips          | `G4` `S8` `P9` `M9` `R10` `V9`                       |
| **Clone Hero / GH**           | Chart imports, practice mode, MIDI drums, star-power phrasing, highway speed              | `C9` `P1` `I3` `C5` `G9`                             |
| **Rocksmith**                 | Riff Repeater, adaptive difficulty, real-instrument input                                 | `P2` `P7` `I3`                                       |
| **Taiko no Tatsujin**         | Drumrolls, don/ka pitch, two-player local, boss songs                                     | `G6` `G12` `I8` `S7`                                 |
| **Muse Dash / Arcaea**        | Endless mode, per-chart goals, mobile touch layout, per-song theming                      | `S4` `S10` `I4` `V4`                                 |
| **Friday Night Funkin'**      | Week campaign structure, opponent-as-chart, upscroll convention                           | `S5` `S7` `G11`                                      |
| **Audiosurf**                 | Track preview, density visualisation, reactive backgrounds                                | `L7` `V3`                                            |
| **Tetris 99 / battle royale** | Checkpoint elimination in a many-player race                                              | `N5`                                                 |
| **BeatSaver**                 | Mapper follows, ratings, archival tiers, the `.bplist` playlist format                    | `L4` `L3` `L12` `L16`                                |
| **Discord Activities**        | One entry point, several games; guest participation without an account                    | `X8` `X9` `X10`                                      |

---

## §17 — Deliberately not proposed

Checked and excluded, so nobody re-derives them:

- **A charting rewrite.** The analyser is the best-engineered part of this game,
  `docs/slice-it.md` documents why each choice was made, and `d4185549` just
  made it 31–37% faster with a verified-equivalent FFT. Everything in §2 builds
  on it; nothing replaces it.
- **Anything that re-proposes score integrity.** `lib/slice-it/integrity.ts`
  shipped with `fb34b5f0` — bounds, internal consistency, an HMAC wall-clock
  receipt, and a timing-distribution check. `R7` is now only the review surface;
  `R8` is only the one hole `integrity.ts` documents about its own hold term.
- **Changes to the multiplayer state machine's timing model.** Server-owned
  absolute deadlines, seats keyed by `userId`, the two grace windows and the
  pause cap are deliberate and documented. New modes ride on it as-is. `X10`
  touches the seat key **only** for guests, and only because a guest has no
  `userId` to key on.
- **Loosening `maxPlausibleScore`.** It is loose by design and `fb34b5f0`
  tightened it ~120× by fixing hold accrual. `R8` is the way to tighten further.
- **Reviving `SongRating`.** The schema marks it dead with a drop scheduled and
  "do not add writers". `L3` proposes a new model, deliberately.
- **Per-frame writes to `<html>` custom properties, or anything cursor-tracked.**
  Retired platform-wide on 2026-08-01.
- **Lowering `RANKED_MIN_SPEED`.** Slow runs should exist (`P1`) and should not
  be ranked. Those are the same decision, not a conflict.
- **Storing anything about a Discord guest.** `X10` is explicit: a guest session
  writes no `User`, no leaderboard row and no run. A shadow account per guest
  would be easier code and a worse answer.
- **Rate rules for `slice:*` socket events.** The 07-17 audit finding is
  **fixed** — `server/socket-server/config.ts` now carries a rule for every
  `slice:*` event, with `slice:score` at 240/min against its ~200 ms cadence.
- **Cross-game features already specced elsewhere** — tournaments hub,
  spectating as a platform primitive, wagers, prediction markets, user-content
  classification. `N11` and `N1` reference the platform work rather than
  re-specifying it; see `docs/plans/2026-07-15`, `2026-07-19` and `2026-08-04`.

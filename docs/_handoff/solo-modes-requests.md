# Solo modes — cross-boundary requests

From the S1 (daily challenge) / S8 (setlists) / S2 (courses) change. Each item
below needs a file that change did not own. Nothing here is a blocker for what
shipped; each is a place where a mode is currently _less_ than its design
because the seam it needs does not exist yet.

---

## 1. `engine.ts` — a course cannot actually start a song below full gauge

**Owner:** whoever owns `lib/slice-it/engine.ts`.

**What is true today.** `GameEngine.reset()` (around line 366) does
`this.health = HEALTH_MAX;` unconditionally, and there is no setter and no
`loadMap` option for a starting value. So a course:

- tracks the carried gauge correctly (`lib/slice-it/course.ts` → `advance()`),
- decides continue / complete / fail from it,
- displays it in the progress banner,
- and then starts the next song at 100 anyway.

That makes the shared gauge a **score-keeping device rather than a mechanic**,
which is exactly the thing S2 says separates a course from a playlist. It is the
one part of the mode that is not real.

**What is needed.** Any one of:

```ts
// Smallest version — a field the next reset honours once.
engine.setStartingHealth(health: number): void;
// or
engine.loadMap(map, buffer, { startingHealth?: number });
```

The reducer already produces the number (`CourseState.health` after `advance()`)
and `components/slice-it/modes/SetlistPanel.tsx` already has it in hand at the
call site. Wiring is one argument at the `onPlay` call; **no change to
`course.ts` is required**, which is why the reducer was written for the finished
behaviour rather than the current one.

Worth knowing: `HEALTH_MAX` and the drain table are already imported by
`course.ts` from `constants.ts`, so the recovery number (`COURSE_RECOVERY = 25`)
is expressed in the same units the engine uses. No conversion is needed.

---

## 2. `SongLibrary.tsx` / `SongDetailsPanel.tsx` — no "add to setlist" affordance

**Owner:** whoever owns the library components.

Setlists are built today from a **search box inside the setlist editor**
(`SetlistPanel.tsx`), which works but is the wrong place to be standing when you
find a track you like. The natural gesture is "I am looking at this song, put it
in a list", and that lives in the library row's overflow menu or in the details
panel, neither of which this change owned.

**What is needed.** A menu item that calls:

```
PATCH /api/slice-it/setlists/:id   { songIds: [...existing, newSongId] }
```

The whole array is sent because `songIds` is an array column whose order is the
data — there is no append endpoint and there should not be one; see the header
of `app/routes/api/slice-it/setlists/$id.ts`. `GET /api/slice-it/setlists`
returns the viewer's lists (`mine[]`) with `id` and `name`, which is everything
a submenu needs.

---

## 3. `/api/slice-it/score` — a daily attempt is not marked as one

**Owner:** whoever owns `app/routes/api/slice-it/score.ts`.

A daily attempt goes through the normal run path, so it lands on the song's
normal leaderboard through `/api/slice-it/score` **and** on the daily board
through `/api/slice-it/daily/submit`. Two writes, deliberately: folding the
daily into the score route would mean editing the most correctness-sensitive
endpoint in the game to teach it about a mode it does not need to know about.

The cost is that `SliceRun` cannot distinguish a daily attempt from a free play.
Nothing needs that today. It would matter if the daily ever wanted its own
integrity treatment, or if a future "your daily history" view wanted to be built
from `SliceRun` rather than `SliceDailyEntry`.

**If it becomes worth doing**, the cheap version is an optional `daily: boolean`
on the score submission that sets a column on `SliceRun` — not a second code
path.

---

## 4. `store.ts` — modes borrow the modifier set and put it back by hand

**Owner:** whoever owns `lib/slice-it/store.ts`.

Both the daily (fixed modifier set) and courses (gauge forced on) need to run one
or more songs under modifiers that are **not** the player's. The store's
`modifiers` is persisted, so the panels snapshot the player's set, overwrite it,
and restore it in the run-finish handler
(`components/slice-it/modes/{DailyPanel,SetlistPanel}.tsx`).

That is correct as written and it is also fragile: a crash between the overwrite
and the restore leaves the daily's modifiers as the player's saved settings. A
store-level `withModifiers(temporary)` / `overrideModifiers` concept — a
non-persisted overlay that the engine reads in preference to the saved set —
would remove the whole class of problem and would serve any future mode that
dictates its own rules.

---

## 5. Note on migration timestamps

`prisma/migrations/20260806181000_slice_it_solo_modes` was originally created as
`20260806180000_…` and renamed after another change in the same wave landed
`20260806180000_slice_it_pool_flags_backfill`. Two migration directories sharing
a timestamp resolve by full-name sort, which works but is not something to rely
on. Worth a glance if more migrations land the same day.

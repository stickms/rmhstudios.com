# Temple of Joy — game design

> Rewritten 2026-07-30. This document describes the game that is in the repo.
> The previous design (Happiness, buildings, Karma/relics, the Wheel of
> Samsara, Radiance/Ascension, philosophical events) was replaced wholesale;
> its `patch-1.md`, `patch-2.md`, `content-expansion.md` and
> `implementation-plan.md` were deleted rather than left to mislead.

## What it is

An idle clicker about building an unreasonable amount of gladness. Alabaster
and gold leaf, minimal chrome, and an economy borrowed — deliberately and
almost verbatim — from Cookie Clicker, because that curve is the most
play-tested one in the genre.

The design goal is **250+ hours that stay interesting, including the hours the
tab is closed.**

## Where the code is

| Path                            | What                                                             |
| ------------------------------- | ---------------------------------------------------------------- |
| `lib/temple-of-joy/types.ts`    | The whole state, as plain data. Everything serialises.           |
| `lib/temple-of-joy/engine.ts`   | Every derived number. Pure, uncached, one place per multiplier.  |
| `lib/temple-of-joy/tick.ts`     | `applyTick` (per frame) and `applyVigil` (the offline catch-up). |
| `lib/temple-of-joy/actions.ts`  | Every player move, as `state -> state`.                          |
| `lib/temple-of-joy/trophies.ts` | The once-a-second trophy audit.                                  |
| `lib/temple-of-joy/data/`       | Sources, blessings, trophies, the Ladder, halo outcomes.         |
| `lib/temple-of-joy/minigames/`  | Garden, choir, exchange, hours, sinners, manna.                  |
| `components/temple-of-joy/`     | The interface. `panels/` is one file per tab.                    |
| `lib/temple-of-joy/__tests__/`  | Economy invariants + an SSR render smoke test. Both run in CI.   |

## The currencies

| Name         | Earned by                                   | Spent on                       | Reset by  |
| ------------ | ------------------------------------------- | ------------------------------ | --------- |
| **Joy**      | Sources, offerings, halos, harvests, trades | Sources, blessings, seeds      | Ascension |
| **Grace**    | `floor(cbrt(lifetimeJoy / 1e12))`           | The Ladder                     | Never     |
| **Manna**    | One ripens roughly every 20 h, on its own   | Source levels (+1% each)       | Never     |
| **Devotion** | 4% per non-shadow trophy                    | Nothing — the Cherubim read it | Never     |

Lifetime joy is never reset; the prestige formula depends on it.

## The economy

**24 sources**, `baseCost × 1.15^owned`. The first twenty are Cookie Clicker's
building table verbatim (Acolyte 15/0.1 → The Beloved 540e24/510e12); the last
four continue the same ratios. `lib/temple-of-joy/__tests__/economy.test.ts`
asserts every one of those twenty pairs, so a well-meaning tweak fails CI.

**~360 blessings**, in six shapes:

- **Tiers** — ten per source, each ×2, unlocking at
  1/5/25/50/100/150/200/250/300/350 copies for 10× … 5e20× the base price. Ten
  doublings is ×1024, which is why a source you stopped buying an hour ago is
  still worth topping up.
- **The Touch** — doublings of the offering, the "each source lends every
  Acolyte a hand" line (Cookie Clicker's Thousand Fingers), and censers that add
  a share of joy-per-second to every tap. The last is what keeps clicking
  meaningful at 10^40.
- **Cherubim** — ×`(1 + Devotion × factor)`, stacking multiplicatively. Fourteen
  of them. This is the engine of the late game: it turns the trophy list from a
  checklist into the main progression.
- **Relics** — a long drip of small flat global multipliers.
- **Synergies** — one source boosted per copy of another, thematically paired.
- **Rites** — the vigil, manna speed, and the Steward.

**~430 trophies**, mostly generated (12 count tiers × 24 sources, 34 joy tiers),
plus ~90 hand-written ones for the minigames, halos, Sinners, time, and six
secrets. Three _shadow_ trophies mark showing off and are excluded from Devotion.

## Prestige

Ascending gives the whole run back — sources, blessings, joy — for Grace. Grace
does nothing until a **Communion** rung unlocks it; all five together make every
point of Grace +1% to everything, permanently. That is Cookie Clicker's
heavenly-chip tier structure and it is the single most important thing on the
Ladder.

The **Ladder** (30 rungs, 7 tiers) also buys: keepsake blessings carried through
an ascension, a starting gift, the vigil window, manna speed, halo frequency and
potency, flat multipliers, and a rung that carries the minigames through a reset.

**Manna levels are never reset.** They are the one thing an ascension cannot
take, which is what makes the twenty-hour resource feel like the real
progression rather than a side dish.

## Halos

Golden cookies, renamed. They appear every 5–15 minutes (before frequency
blessings), wait 13 seconds, and pay Cookie Clicker's numbers: ×7 for 77 s, a
×777 click frenzy for 13 s, and a lucky payout of
`min(15% of joy held, 15 min of rate) + 13`. That last formula is why banking joy
before catching one is a real strategy, and it is left exactly as it is.

Three kinds: **gilded** (ordinary), **sable** (only during the Rapture — pays far
better, and two of the five outcomes hurt), and **seraphic** (rare, huge).

## The Rapture, and Sinners

Buying into the Rapture is a real decision. Sinners latch onto the temple and
drink 5% of your rate each — twelve of them take more than half your income —
but everything they drink is held, and striking one hands it all back ×1.1
(×3 for a penitent), before blessings that multiply it further.

**They keep drinking while the tab is shut.** A full house feeding overnight is
worth far more than the same night spent producing normally. This is the best
offline mechanic in the genre and it is supposed to look like a mistake at first.

The Rapture can be closed again; the guests already inside stay.

## The four minigames

Each is opened by spending Manna to raise a specific source to level 1 — the
only way in, and the reason the twenty-hour resource matters from the very first
one.

| Minigame                | Source      | What it is                                                                                                         |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| **Garden of Eden**      | Olive Grove | 6×6 bed, 16 seeds, adjacency crossbreeding, six soils. Standing plants change the temple. Grows while closed.      |
| **Indulgence Exchange** | Almshouse   | Ten goods on a bounded random walk with a mean-reverting drift. Moves once a minute, awake or not.                 |
| **Choir of Saints**     | Sanctuary   | Twelve saints, three stalls at 100/50/25% strength. Most cost you something. Re-seating has an escalating silence. |
| **Book of Hours**       | Scriptorium | Mana refills on its own; seven prayers spend it; every one can backfire. The only place you can lose something.    |

The garden bed opens outward from the middle as the Grove is raised (2×2 at
level 1, the full 6×6 at level 5).

## What happens while you are away

`applyVigil` runs once on load. The asymmetry in it is the whole answer to "is
this fun when it is closed":

- **Income is capped** — a share of rate (20% base, up to 100%) for a limited
  window (2 h base, up to ~5 days with the Ladder).
- **Everything else is not.** The garden, the market, the manna and the Sinners
  run for the _full_ elapsed time.

So your rate is throttled, but your garden matured, your market moved, three
manna ripened, and twelve Sinners spent nine hours getting fat on your behalf.
The vigil report itemises all of it rather than showing one number.

Plants never disappear on their own — a mature plant left standing loses value
down to a 50% floor over 24 h past a 6 h grace, and keeps providing its standing
effect the whole time. Cookie Clicker kills crops that are left, which is a fine
rule for a game you sit in front of and a bad one for a garden whose selling
point is that it grows overnight.

## The look

Alabaster and gold leaf, minimal, in
`components/temple-of-joy/temple-of-joy.css`. Hairline rules instead of boxes,
one serif (Cormorant Garamond) for anything that is a number or a name, and gold
used only where the game wants your eye: the counter, the affordable row, the
halo, the button that matters. A page that is 95% paper makes the 5% that is gold
read as light.

**Dawn** is the default. **Vespers** is the same building after sunset; every
token flips.

Motion is transform and opacity only. It collapses under
`prefers-reduced-motion` and again under the in-game _reduced flourish_ switch
(`data-flourish="off"`), both of which remove ambient and looping motion while
leaving every state change visible.

## Sound

`lib/temple-of-joy/audio.ts`, two layers:

- The existing **mp3 soundtrack** and the two signature stings (offering,
  trophy), pooled across five voices so a fast hand never truncates itself.
- **Twenty synthesised cues** — short sine and triangle tones through the shared
  `AudioContext`, all pitched inside one pentatonic scale so a halo storm layers
  into something intentional rather than a slot machine. Capped at four voices
  per 100 ms.

Settings expose a mute plus separate music and effects sliders; dragging music to
zero pauses the track rather than leaving a silent decoder running.

## Performance

The game ticks every animation frame, and the blessing list is 360 rows, so reads
are stratified:

- `<LiveValue>` writes `textContent` directly each frame — no React render.
- `useTempleSnapshot` samples derived state on a shared interval and re-renders
  only on a shallow change.
- `useTempleValue` is a plain subscription for discrete state. It is written
  against `useSyncExternalStore` rather than zustand's hook because zustand v5
  serves `getInitialState()` as the _server_ snapshot.

Inside the tick, only income and buffs run per frame; the garden, market, mana,
manna and trophy audit each carry an accumulator and fire on a coarse beat. That
is also what lets the same code run the offline simulation.

## Saves

`SaveData` v2, plain JSON, stored per user in `TempleOfJoySave` and mirrored to
`localStorage`; on load the newer of the two wins. A v1 save is detected by its
`lifetimeHappiness` field and migrated to Grace on the new curve plus its
playtime and settings — the old structure has no equivalent, but the time
someone put in does.

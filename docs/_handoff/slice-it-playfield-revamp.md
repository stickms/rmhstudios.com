# Slice It — playfield visual revamp (handoff)

**Status:** not started. This document is the brief.

**Scope:** the *game* — notes, hit feedback, animations, and how the
playfield's energy escalates with combo. **Not** the surrounding UI (menus,
library, lobby); that had its own pass and is done.

---

## 1. The ask, in the owner's words

> "let's revamp the design for the actual game itself (not the UI) but things
> like notes and animations and such, as they haven't been changed since the
> start" … "and the style or the 'energy' as the game/combo goes up and notes
> are played"

Two halves. The first is a restyle of what a note looks like and how a hit
reads. The second is the harder and more interesting one: **the playfield
should feel like it is building as a streak grows.**

## 2. The one design constraint that is already decided

The previous combo feedback was a **full-screen colour wash** — the entire
canvas filled with the tier colour at 10–26% alpha every time combo crossed
50/100/250/500/1000, plus a 0.16–0.24s tone at full SFX volume. The owner's
words were "really annoying". It was removed in `f35a003f`.

**Do not reintroduce a punctuated full-screen effect, smaller or otherwise.**
The replacement should be **continuous, not thresholded**: something that
tracks the combo curve smoothly so it rewards the streak you are *in* rather
than interrupting you five times per song. Directions worth exploring —

- lane/judgement-line glow that saturates with combo
- note trails that lengthen or brighten
- background contrast or vignette that tightens
- playfield edges that warm up
- particle density/lifetime scaling

The `{{n}} COMBO` label at a milestone is fine and stayed; it is the *wash*
that was the problem.

## 3. Where the code is

| File | What |
| --- | --- |
| `components/slice-it/GameCanvas.tsx` (~2.5k lines) | **The renderer.** One `render()` with numbered sections: `1.` background, `2.` judgement feedback + particles, `3.` slices (the note draw loop), `3c.` combo milestone label, `4.` particles. This is where almost all of this work lands. |
| `lib/slice-it/engine.ts` | Judgement, scoring, combo. `COMBO_MILESTONES = [50, 100, 250, 500, 1000]`; the milestone SFX is in `resolve()`. |
| `components/slice-it/slice-it.css` | The `--slice-*` token sets (light + `.dark`). Note art colours belong here or in `lib/slice-it/palettes.ts`, not inline. |
| `lib/slice-it/palettes.ts` | Colour-blind-safe note palettes (A-tier accessibility feature). Any new note colour must go through this. |
| `lib/slice-it/skins.ts` | Cosmetic skins. `assertCosmeticOnly` **throws** if a skin key could affect gameplay — respect it. |
| `lib/slice-it/presentation.ts` | Spectrum envelope + `backdropState` — the existing hook for audio-reactive background. Probably the natural seam for "energy". |
| `lib/slice-it/visible-window.ts` | Note culling. Contract is one-directional: the range may be too wide, never too narrow. |

### Two things in the renderer you must not undo

1. **`const slices = engine.getSlices();`** — the draw source. It used to be
   `map.slices as Slice[]`, which was a cast, not a conversion: on a
   per-difficulty chart that handed an object to a binary search and the loop
   drew *nothing*. `lib/slice-it/__tests__/visible-window.test.ts` has a source
   guard that fails if `map.slices` reappears. Draw what the engine judges.
2. **`glow` / `flashOff` / `fx` gating.** Every visual intensity already reads
   these. They fold together photosensitivity mode (A2), reduced motion and
   `perf-lite`. A revamp that adds energy is exactly the change that tends to
   trample them — every new effect must be gated the same way, and must
   degrade to *calm*, not to *broken*.

## 4. Non-negotiables

- **Accessibility.** `useReducedMotion`, the photosensitivity flag, and the
  colour-blind palettes are shipped features. "More energy" must be opt-out-able
  and must never become a strobe. If an effect flashes faster than ~3 Hz at any
  combo, it is wrong.
- **Performance.** The canvas clamps DPR (`gameSurfaceDpr()`), must not
  reallocate itself per frame, and must not add a second rAF loop —
  `lib/__tests__/raf-loop-allowlist.test.ts` gates that. Per-frame allocation in
  the draw loop is the thing to watch; it runs on the weakest device that opens
  the game.
- **Tokens, not literals.** Colours through `--slice-*` / `palettes.ts`.
- **The commit gate.** `pnpm check:consistency` before every commit. Never
  `--no-verify`.
- Repo conventions: `/CLAUDE.md`, `components/CLAUDE.md`,
  `docs/design-language.md` §12.1 (game viewport contract).

## 5. You can run and see the game — do that

This is the important part, and it is not obvious: **this container has
Chromium and Playwright, and Postgres 16.** The previous session audited the UI
by actually rendering it and measuring the DOM, which found four bugs that no
amount of code reading had. Do the same here — screenshot the playfield at
combo 0 / 50 / 200 / 600 and compare.

Recipe that works:

```bash
# 1. Postgres (must live somewhere the postgres user can traverse)
export PGDATA=/var/lib/postgresql/rmhdata
mkdir -p "$PGDATA" && chown -R postgres:postgres /var/lib/postgresql && chmod 700 "$PGDATA"
su postgres -c "/usr/lib/postgresql/16/bin/initdb -D $PGDATA -A trust -U postgres"
su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PGDATA -l /var/lib/postgresql/pg.log -o '-p 5432 -k /tmp' start"
su postgres -c "/usr/lib/postgresql/16/bin/psql -h /tmp -U postgres -c 'CREATE DATABASE rmh;'"
su postgres -c "/usr/lib/postgresql/16/bin/psql -h /tmp -U postgres -d rmh -c 'CREATE EXTENSION IF NOT EXISTS pg_trgm;'"

# 2. .env — the AI/Stripe keys are NOT optional for boot. Several modules build
#    their client at module scope and routeTree.gen.ts imports every route
#    eagerly, so ONE missing key 500s the whole SSR tier with a useless message.
cat > .env <<'EOF'
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/rmh
BETTER_AUTH_SECRET=local-dev-secret
BETTER_AUTH_URL=http://localhost:7005
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
XAI_API_KEY=xai-placeholder
OPENAI_API_KEY=sk-placeholder
DEEPSEEK_API_KEY=sk-placeholder
EOF

set -a; . ./.env; set +a
pnpm exec prisma migrate deploy
pnpm exec vite dev --port 7005 --host 127.0.0.1   # run in background

# 3. A real session cookie (Better Auth signs its cookies — a hand-inserted
#    session row does NOT work).
curl -s -X POST http://127.0.0.1:7005/api/auth/sign-up/email \
  -H 'Content-Type: application/json' \
  -d '{"email":"dev@example.com","password":"DevPassword123!","name":"Dev"}' -D -
# take better-auth.session_token from the Set-Cookie header
```

Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; pass it as
`executablePath` and do **not** run `playwright install`. Seed songs by writing
a throwaway `tsx` script at the **repo root** (module resolution fails outside
it) using `new PrismaClient({ adapter: new PrismaPg({ connectionString: ... }) })`
— Prisma 7 requires the adapter.

Getting into an actual run needs a playable audio file; the previous session
only seeded metadata. Expect to spend a little time there, or drive the engine
directly in a test and render to a canvas.

## 6. Branch and state

- Branch `claude/slice-it-feature-ideas-8ng340`, open PR **#794**.
- Recent commits worth reading before starting: `f35a003f` (removed the combo
  strobe — the thing you are replacing), `16493484` (the UI pass), `63949333`
  (removed the twelve AI features; do not reintroduce an AI dependency here).
- Everything is green: tsc clean, 8885 tests, gate passing.

## 7. Known-open, not yours unless you want them

- The `audit` CI job is red on `main` — two dependency advisories, unrelated to
  this branch (details in #792's body).
- The UI audit covered `/slice-it` and `/games/slice-it` only. The lobby, chart
  editor, song details, leaderboard, results screens, calibration, replay
  viewer and spectator view have **not** been looked at in a browser.

# Alex — the Discord Tamagotchi

Alex is a communal virtual pet that lives in the Discord bot. Every server (guild)
raises **one shared Alex** together: feeding him, playing with him, keeping him
clean and rested, and talking to him. Alex is born an infant and grows up to an
adult over real time — and if the server neglects him, he gets sick and can pass
out (recoverable with `/revive`).

He uses the existing **DeepSeek** persona for conversation and **xAI (Grok)** image
generation to show what he looks like right now.

> Implementation: `go-services/internal/discordbot/pet*.go` (the production Go
> bot, run by the supervisor). The old `/rmhbot` website-editor commands have been
> removed.

## Commands

| Command | What it does |
| --- | --- |
| `/alex` | Show Alex's status card — stats, age, life stage, mood (+ a cached selfie if one exists) |
| `/feed [food]` | Feed Alex. `food` = 🧋 boba (his favourite), 🍜 meal, or 🍪 snack. Restores hunger |
| `/play` | Play with Alex. Boosts happiness, costs energy (refused if he's too tired) |
| `/clean` | Clean Alex up. Restores hygiene |
| `/rest` | Put Alex down for a nap. Restores energy |
| `/show` | Generate an xAI picture of Alex in his current life stage + mood |
| `/chat <message>` | Talk to Alex (DeepSeek persona, flavoured by his live state) |
| `/revive` | Bring Alex back as a newborn if he's passed out (bumps his "generation") |
| `/rename <name>` | Give Alex a new name |
| `/caretakers` | Leaderboard of who's taken the best care of Alex |

Alex is a **server pet** — the commands don't work in DMs.

## Mechanics

- **Stats** (0–100): hunger, happiness, energy, hygiene, health. They decay over
  real time. Decay is computed lazily from `statsUpdatedAt` on every read, so the
  state is always correct-as-of-now without a fixed DB tick.
- **Health** drains while any stat is critically low (< 15) and slowly regenerates
  while Alex is thriving. If health hits 0, Alex passes out (`alive = false`).
- **Life stages** by age: infant → toddler → kid → teen → adult (defaults: 12h /
  2d / 5d / 10d). Only a living Alex grows.
- **Caretaker leaderboard**: each care action credits the user who did it
  (feed 10 / play 8 / clean 6 / nap 5 / chat 3 points).

## Proactive messages

A background loop (`pet_care.go`) checks on every pet on a ticker and posts **into
the last channel a command was used in**, at most one message per pet per tick,
by priority:

1. **Life events** — "Alex grew into a Teen!" (with a fresh selfie), or "Alex
   passed out from neglect… `/revive` him".
2. **Care alerts** — "yo I'm STARVING, `/feed` me a boba" (throttled).
3. **Ambient life** — "Alex: currently out getting boba 🧋", "in a Wells Fargo
   standup pretending I understand the sprint board" — stage-appropriate
   slice-of-life flavour.

If a saved channel becomes unreachable (deleted / bot lost access), it's cleared
so the bot stops posting there.

## Cost & safety

- **xAI images** are gated by the shared global `image_gen_budget` daily cap
  (`XAI_IMAGE_DAILY_CAP`, default 50), an in-memory per-guild cache keyed by
  stage+mood, and a per-guild `/show` cooldown. Any failure degrades to a
  stats-only response — a picture can never break a command.
- **Concurrency**: per-guild mutex serialises the load→decay→mutate→save cycle;
  the paid image call runs outside the lock on a snapshot.
- **Input**: `/rename` is sanitised (printable, 1–32 chars, no mention/backtick
  injection); leaderboard counter columns come from a fixed whitelist; all SQL is
  parameterised.

## Configuration

Requires `DISCORD_BOT_TOKEN` (or `DISCORD_ACTIVITY_BOT_TOKEN`). Uses
`DEEPSEEK_API_KEY` for chat and `XAI_API_KEY` (+ `XAI_IMAGE_*`) for `/show`. Alex
degrades gracefully if either AI key is missing (chat/images just become
unavailable; the care game still works).

Optional pacing overrides (see `.env.example`): `ALEX_GROWTH_SCALE`,
`ALEX_HUNGER_DECAY`, `ALEX_HAPPY_DECAY`, `ALEX_ENERGY_DECAY`,
`ALEX_HYGIENE_DECAY`, `ALEX_TICK_INTERVAL`, `ALEX_CARE_ALERT_INTERVAL`,
`ALEX_AMBIENT_INTERVAL`.

## Data model

- `discord_alex_pet` — one row per guild (stats, age, stage, last channel, throttle
  timestamps).
- `discord_alex_caretaker` — one row per (guild, user) for the leaderboard.

Migration: `prisma/migrations/20260706000000_add_discord_alex_tamagotchi/`.

# Alex — the Discord Tamagotchi

Alex is a communal virtual pet that lives in the Discord bot. There is **one
single global Alex** shared across every server the bot is in — everyone,
everywhere, raises the same pet together: feeding him, playing with him, keeping
him clean and rested, studying, and talking to him. Alex is born an infant and
grows up to an adult over real time — and if he's collectively neglected, he gets
sick and can pass out (recoverable with `/revive`). His care and ambient messages
**broadcast to every server's last-used channel**, so wherever you are you'll see
when Alex is hungry or out getting boba.

He uses the existing **DeepSeek** persona for conversation and **xAI (Grok)** image
generation to show what he looks like right now.

> Implementation: `go-services/internal/discordbot/pet*.go` (the production Go
> bot, run by the supervisor). The old `/rmhbot` website-editor commands have been
> removed.

## Commands

| Command | What it does |
| --- | --- |
| `/alex` | Show Alex's status card — stats, age, life stage, mood, career, intelligence (+ a cached selfie if one exists) |
| `/feed [food]` | Feed Alex. `food` = 🧋 boba (his favourite), 🍜 meal, or 🍪 snack. Restores hunger |
| `/play` | Play with Alex. Boosts happiness, costs energy (refused if he's too tired) |
| `/clean` | Clean Alex up. Restores hygiene |
| `/rest` | Put Alex down for a nap. Restores energy |
| `/study` | Alex studies — builds his (non-decaying) intelligence, costs energy |
| `/career [path]` | Pick Alex's dream career (SWE / data / founder / quant / PM / design), or view the current one |
| `/show` | Generate an xAI picture of Alex in his current life stage + mood (career-styled once grown) |
| `/chat <message>` | Talk to Alex (DeepSeek persona, flavoured by his live state + career) |
| `/revive` | Bring Alex back as a newborn if he's passed out (New Game+) |
| `/newlife` | Voluntary New Game+ once Alex is a grown adult — he "graduates" and a new generation begins |
| `/rename <name>` | Give Alex a new name |
| `/caretakers` | Leaderboard of who's taken the best care of Alex |
| `/alexmessages [all\|care\|off]` | **(Manage Messages / bot owner only)** Set how much Alex talks in this server: `all` (everything), `care` (only care alerts + life events), `off` (completely silent). Blank shows the current setting. |

Alex is a **global pet** — commands work in any server (but not DMs, so the bot
knows which channel to talk back in).

## Mechanics

- **Stats** (0–100): hunger, happiness, energy, hygiene, health, intelligence.
  The first five decay over real time (lazily recomputed from `statsUpdatedAt` on
  every read, so state is always correct-as-of-now). **Intelligence does not
  decay** — it's cumulative knowledge built by `/study`.
- **Health** drains while any stat is critically low (< 15) and slowly regenerates
  while Alex is thriving. If health hits 0, Alex passes out (`alive = false`).
- **Life stages** by age: infant → toddler (12h) → kid (2d) → teen (5d) →
  adult (10d), all at the default `ALEX_GROWTH_SCALE=1.0`. Set the scale higher to
  speed it up (e.g. `2.0` reaches adult in ~5 days). Only a living Alex grows.
- **Career**: an aspiration set via `/career`. It flavours his chat replies,
  ambient posts, and — once he's a teen/adult — his `/show` picture. `/study`
  builds the intelligence that makes the dream believable.
- **New Game+**: `/revive` (on death) and `/newlife` (voluntary, once adult) both
  reincarnate Alex as a fresh gen-N+1 infant, carrying over his name, the (global)
  caretaker leaderboard, and a **legacy intelligence head-start** (up to 30,
  scaled from the previous life's intelligence). Career resets so each life can
  choose a new path.
- **Global caretaker leaderboard**: each care action credits the user who did it,
  counted once across all servers (feed 10 / study 9 / play 8 / clean 6 / nap 5 /
  chat 3 points).

## First-hello announcement

When the bot joins a server (and on startup for servers it's already in), Alex
posts a **one-time** intro explaining the system into the first channel he can
talk in. It fires exactly once per server (tracked in `discord_alex_guild`, so
restarts and redeploys never repeat it), and servers where he can't send anywhere
are skipped — if he's granted access later, he'll introduce himself then.

## Proactive messages

A background loop (`pet_care.go`) advances the single global Alex on a ticker and,
when something's worth saying, **broadcasts one message to every server's
last-used channel** (at most one per tick), by priority:

1. **Life events** — "Alex grew into a Teen!" (with a fresh selfie, generated once
   and reused across all servers), or "Alex passed out from neglect… `/revive` him".
2. **Care alerts** — "yo I'm STARVING, `/feed` me a boba" (globally throttled).
3. **Ambient life** — "Alex: currently out getting boba 🧋", "in a Wells Fargo
   standup pretending I understand the sprint board" — stage-appropriate
   slice-of-life flavour.

If a server's channel becomes unreachable (deleted / bot lost access), it's
cleared so the bot stops broadcasting there.

Each server picks how much Alex talks with `/alexmessages` (bot owner or a member
with **Manage Messages**; stored per server in `discord_alex_guild.messageLevel`):

- `all` (default) — random ambient posts + care alerts + life events.
- `care` — care alerts + life events only (no random chatter).
- `off` — completely silent; no proactive messages at all.

## Discord presence

The bot's own Discord status reflects the global Alex's current state — a custom
status like `🧋 Adult Alex · just vibin`, `🍽️ Kid Alex · starving no cap`, or
`💀 passed out — someone /revive me`, with the online dot turning **idle** when
he's sleepy and **do-not-disturb** when he's sick or gone. It's refreshed on
every care-loop tick and (throttled) right after care commands, so anyone can
glance at the bot in the member list and see how Alex is doing.

## Visibility & persistence

- **Public & attributed**: every command posts publicly in-channel (never
  ephemeral, except the "this belongs to another user" nudge on someone else's
  `/chat` button), and each response embed footers who ran it — so the whole
  server sees who's raising Alex. `/chat` shows the speaker in its footer.
- **Survives restarts**: all state lives in Postgres and is reloaded on every
  interaction (there's no in-memory pet cache) — stats, age, stage, career,
  intelligence, the care-loop throttle timestamps, the caretaker leaderboard, the
  one-time intro flag, and `/chat` history. A redeploy loses nothing. The only
  in-memory data is the image cache and per-guild cooldowns, which are
  intentionally ephemeral (a restart just means at most one image regeneration).

## Cost & safety

- **xAI images** are gated by the shared global `image_gen_budget` daily cap
  (`XAI_IMAGE_DAILY_CAP`, default 50), an in-memory cache keyed by stage+mood, and
  a global `/show` cooldown. Any failure degrades to a stats-only response — a
  picture can never break a command.
- **Concurrency**: a single global mutex serialises the load→decay→mutate→save
  cycle; the paid image call runs outside the lock on a snapshot.
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

- `discord_alex_pet` — a **single global row** (keyed by the sentinel `"global"`)
  holding the shared Alex: stats, age, stage, career, intelligence, and the global
  care-loop throttle timestamps.
- `discord_alex_guild` — one row per server: which channel Alex last spoke / was
  used in, whether he's introduced himself there, and the server's `messageLevel`
  (all / care / off). Drives the broadcast, the one-time intro, and `/alexmessages`.
- `discord_alex_caretaker` — one row per user (keyed by the `"global"` sentinel) —
  the global leaderboard.

Migrations: `20260706000000_add_discord_alex_tamagotchi/` (initial),
`20260707000000_add_discord_alex_global_guild/` (global refactor),
`20260707120000_add_alex_ambient_toggle/` (initial per-server ambient boolean),
and `20260707140000_add_alex_message_level/` (replaces it with the three-way
`messageLevel`, backfilling existing rows).

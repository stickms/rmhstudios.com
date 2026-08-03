# The Liquid Globe bot

The Discord bot has one job: make things look like the site. Upload a picture,
and it hands you back that picture re-made in **Radial Avant-Garde Glass** — the
site's design language — plus the note explaining how the new object obeys it.

There is exactly **one command**, no personality, no chatter, no background
loops. The bot speaks when it is asked to and is otherwise silent.

> Implementation: `go-services/internal/discordbot/`. It runs as the
> `discord-bot` worker inside the Go `supervisor` process (see
> [`go-services/CLAUDE.md`](../../go-services/CLAUDE.md)).
>
> **This replaced the Alex tamagotchi** (`/chat`, `/feed`, `/play`, `/alex` and
> the rest), which is gone along with its five `discord_alex_*` /
> `discord_chat_session` tables — dropped by migration
> `20260803120000_retire_alex_bot`. Recover it from git history if it is ever
> wanted back.

## The command

| Command                               | What it does                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/liquid image:<file> [notes:<text>]` | Re-makes the uploaded image as a liquid-globe object and explains how it adheres to the design language |

- **`image`** (required) — a PNG, JPEG, GIF or WebP, up to 8 MB. Validated
  twice: once against the content type Discord reports (before anything is
  downloaded) and again against the file's own magic bytes (before anything is
  sent to a model), so a `.png` that is really an HTML error page is caught.
- **`notes`** (optional, ≤300 chars) — what the treatment should pay attention
  to. Steering, not override: it reaches the renderer explicitly subordinated to
  every rule of the design language, so "make it red and put my name on it"
  cannot produce a red object with text on it.

The reply is one embed: the generated object as the image, the original as the
thumbnail (straight off Discord's CDN — the source is never re-uploaded), and
the adherence note as the description.

## The pipeline

```
/liquid  →  validate       attachment type + size, then the real magic bytes
         →  download       from Discord's CDN, capped at 8 MB
         →  xAI  READ      vision chat completion: what IS this a picture of?
         →  xAI  RENDER    that subject, as a liquid globe (images/generations)
         →  DeepSeek       how does the result obey the design language?
         →  reply          one embed: the object, the note, the source
```

**Why two xAI calls.** `images/generations` is text-to-image, so the subject has
to reach the renderer as words. The READ stage is what makes `/liquid` a
treatment _of your image_ rather than an unrelated sphere; it is also the only
stage with no fallback, because without a subject the two stages after it would
be describing an image nobody looked at.

**Both models are briefed from one file.** `canon.go` holds the design canon in
two forms — `liquidGlobeVisual` (how the object must look, written for an image
model) and `liquidGlobeLaws` (the rules it must be shown to obey, written for a
reviewer). A render brief and a rationale that had drifted apart would have the
bot arguing with its own picture. When the design language moves, move that file
with it.

**The reviewer is given the laws verbatim** and told never to invent a token
name, a class name or a measurement. The failure mode that prompt exists to
prevent is a confident paragraph about `--site-*` tokens that do not exist.

## Degradation

Each stage fails into the most useful thing left, rather than into an error:

| Stage fails             | What you get                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| READ (vision)           | Nothing. The command aborts and says why — there is no subject to work from.                                                         |
| RENDER (image)          | The design note, with a field naming the reason (over budget, no accounting, API failure). The design argument is most of the value. |
| EXPLAIN (DeepSeek)      | The picture, with a short static caption.                                                                                            |
| Both RENDER and EXPLAIN | An error embed. Nothing is dressed up as a result.                                                                                   |

## Cost control

Three ceilings, all shared with the rest of the fleet:

1. **The daily image budget.** `XAI_IMAGE_DAILY_CAP` (default 50) against the
   `image_gen_budget` table — the same row the bot-worker reserves from, so one
   ceiling covers both processes. The reservation is a single atomic upsert
   whose `DO UPDATE` is guarded on the count, so two concurrent callers cannot
   both squeeze past the cap. It **fails closed**: no database means no
   accounting, and unaccounted image spend is exactly what it exists to prevent.
2. **A per-user cooldown.** `LIQUID_COOLDOWN` (default 45s), claimed on _accept_
   rather than on completion, so nobody can start a second render while their
   first is in flight. A run that fails pre-flight (wrong file type, bad upload)
   releases the slot immediately.
3. **The cheap model by default.** `grok-imagine-image` at $0.02/image;
   `grok-imagine-image-quality` is $0.07.

`XAI_IMAGE_ENABLED=false` hard-disables generation across the whole fleet.

## Configuration

Everything is optional except the token. The bot boots and registers `/liquid`
with either API key missing, and the command reports which half is unavailable
rather than failing silently.

| Env                    | Default                                    | What                                                                                                                                                     |
| ---------------------- | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_BOT_TOKEN`    | falls back to `DISCORD_ACTIVITY_BOT_TOKEN` | Without it the worker idles — a missing secret never takes down the supervisor                                                                           |
| `DISCORD_DEV_GUILD_ID` | —                                          | Set to a guild id for instant command registration in dev; unset registers globally                                                                      |
| `XAI_API_KEY`          | —                                          | Both xAI stages                                                                                                                                          |
| `XAI_IMAGE_MODEL`      | `grok-imagine-image`                       | The renderer                                                                                                                                             |
| `XAI_VISION_MODEL`     | `grok-4-fast-non-reasoning`                | The reader. Must be multimodal — **pin this if xAI retires the default**; it is env-overridable precisely so an operator can repoint it without a deploy |
| `XAI_IMAGE_DAILY_CAP`  | `50`                                       | Shared daily cap                                                                                                                                         |
| `XAI_IMAGE_ENABLED`    | `true`                                     | Fleet-wide kill switch                                                                                                                                   |
| `DEEPSEEK_API_KEY`     | —                                          | The design note                                                                                                                                          |
| `DEEPSEEK_MODEL`       | `deepseek-chat`                            | —                                                                                                                                                        |
| `LIQUID_COOLDOWN`      | `45s`                                      | Per-user throttle                                                                                                                                        |

## Notes for whoever touches this next

- **The command surface is the product.** `slashCommands()` returns one command,
  and a test asserts both that it is `/liquid` and that none of the retired Alex
  commands have crept back. Adding chatter back would be a change of what this
  bot is, not a feature.
- **The bulk overwrite on ready is what retires old commands.** Any command not
  in `desired` is removed by that call, so the first boot after a change clears
  stale registrations without a manual purge. Entry Point commands (type 4) are
  preserved explicitly — a bulk overwrite cannot remove them, and trying returns
  Discord error 50240.
- **The pipeline runs off the gateway goroutine.** It takes tens of seconds;
  blocking the handler would stall every other event on the connection. Each run
  gets a context derived from the worker's lifecycle context with a 3-minute
  timeout, so in-flight model calls are cancelled on shutdown rather than
  detached.
- **Every text cut is rune-safe.** Discord counts embed limits in characters and
  this copy is emoji-heavy; a byte cut splits a glyph and Discord rejects the
  embed.
- **Only `image_gen_budget` is touched.** The bot keeps no other state — no
  sessions, no per-guild config, no memory. Adding a table is a decision, not a
  detail.

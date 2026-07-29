# Cast — names and titles across the platform

> Audience: humans **and** coding agents. This is the canon roster: every named
> character on rmhstudios.com, the title they hold, and the file that defines
> them. Read it before writing new in-world copy, inventing a character, or
> renaming an existing one.

**Why this exists.** Names leak. A character written in a dialogue file shows up
later in a quest string, a locale JSON, an achievement, an OG card and a wiki
page, and by then a second author has quietly given them a different job. This
file is the single place to check who already exists and what they are called.

**Three rules:**

1. **Check here before naming anything.** If a name is taken in another game,
   pick a different one — the platform is one universe to a reader even when the
   games are unrelated. `Vesper` is the counter-example that already got through
   (see §1).
2. **The code is authority, this file is index.** Where they disagree, the
   `Where defined` column wins and this file is wrong — fix it in the same
   commit.
3. **A new named character means a new row here.** Same commit, not later.

---

## 1. Named characters

### Versecraft — the Ivory Quill Society

A poetry visual novel. The six members are the fullest characters on the
platform: each carries a role in the society, a poetic school, an archetype, a
background, a secret, a fear, a dream and a signature poem. All six are
**gender-variable** — the player picks a presentation and the character's first
name and pronouns change with it, which is why the name column has three
entries. `surname`, `nickname`, role and personality do **not** vary.

Defined in [`lib/versecraft/characters.ts`](../lib/versecraft/characters.ts);
chapter/ending titles in [`lib/versecraft/progress.ts`](../lib/versecraft/progress.ts).

| id      | Name (fem / masc / nb)       | Nickname      | Title in the society                              | Archetype                      | Poetic school                     | Age | Available |
| ------- | ---------------------------- | ------------- | ------------------------------------------------- | ------------------------------ | --------------------------------- | --- | --------- |
| `luna`  | Luna / Lucius / Luna Voss    | "Lune"        | **Vice President**                                | The Wounded Healer             | Romanticism / Gothic              | 19  | Act 1     |
| `kai`   | Kai Nakamura (all three)     | "K"           | **Resident Contrarian / Unofficial Critic**       | The Trickster                  | Dadaism / L=A=N=G=U=A=G=E         | 20  | Act 1     |
| `rowan` | Rowan Hart (all three)       | "Row"         | **Secretary / Garden Keeper**                     | The Innocent / The Sage        | Haiku / Imagism / Pastoral        | 18  | Act 1     |
| `sable` | Sable / Sabel / Sable Okafor | "Sab"         | **Performance Director / Events Coordinator**     | The Warrior / The Leader       | Spoken Word / Slam / Protest      | 20  | Act 2     |
| `milo`  | Mila / Milo / Milo Vance     | "Mi"          | **Treasurer / Archivist**                         | The Mentor / The Perfectionist | Formalism / Sonnets / Villanelles | 19  | Act 1     |
| `wren`  | Wren Delacroix (all three)   | "Little Bird" | **Illustrator** (newest member before the player) | The Mystic / The Child         | Surrealism / Magical Realism      | 18  | Act 2     |

Default presentations: Luna feminine, Sable feminine, Rowan masculine, Milo
masculine, Kai nonbinary, Wren nonbinary. The **player** is the newest member
and holds no office; **the Society's President is deliberately never named or
shown** — don't fill that gap without a design decision.

### House Always Wins — the Mirage Royale

A platformer set in a casino that owns your debt. Speakers are defined in
[`lib/house-always-wins/dialogues.ts`](../lib/house-always-wins/dialogues.ts).

| Name           | Title                                                  | Role in the game                                                                             |
| -------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **The Dealer** | House representative / narrator                        | Opens the game, explains the three Vault Keys, runs the shop, settles the tab.               |
| **Marlow**     | **the Janitor** (always written "Marlow, the Janitor") | Forty-year veteran of the floor; hints the old dealing pattern; runs a five-card draw table. |
| **Vesper**     | Floor hostess of the reels                             | Grants the All-In Dash (Ace); gates a key behind three bells.                                |
| **Chief Doss** | **Chief** of vault security                            | Grants the Grip; gates the vault corridor behind lasers and a camera.                        |
| **THE HOUSE**  | The casino itself                                      | Final antagonist; always set in caps. Not a person and shouldn't be written as one.          |

⚠️ **`Vesper` is a collision** — the name is also a Breakpoint agent (below).
They are unrelated characters in unrelated games. Don't "reconcile" them, and
don't add a third.

### Breakpoint — agents

A tactical shooter. Agents are defined in
[`lib/breakpoint/agents.ts`](../lib/breakpoint/agents.ts); the title is the
class role, and each has four named abilities.

| Agent      | Role           | Signature kit (Q / C / E / X)                   |
| ---------- | -------------- | ----------------------------------------------- |
| **Blaze**  | **Duelist**    | Afterburn · Firewall · Flashpoint · **Inferno** |
| **Warden** | **Sentinel**   | Mend · Barricade · Watchtower · **Lockdown**    |
| **Cipher** | **Controller** | Quicksand · Veil · Paradise · **Blackout**      |
| **Echo**   | **Initiator**  | Strobe · Pulse · Blink · **Overdrive**          |
| **Vesper** | **Sentinel**   | Bulwark · Haze · Stronghold · **Last Stand**    |
| **Razor**  | **Duelist**    | Dazzle · Shrapnel · Slipstream · **Bloodrush**  |

Ability names are canon too: renaming "Firewall" breaks the locale catalogs.

### Void Breaker — pilots

Four playable characters, each with a two-character Chinese **title** rendered
alongside the name. Defined in
[`lib/void-breaker/characters.ts`](../lib/void-breaker/characters.ts).

| Pilot          | Title | Reads as     | Character                                              |
| -------------- | ----- | ------------ | ------------------------------------------------------ |
| **Striker**    | 均衡  | "balance"    | The all-rounder. No weaknesses, no crutches. (starter) |
| **Juggernaut** | 铁壁  | "iron wall"  | Tanky bruiser: +2 HP, harder hits, slow and heavy.     |
| **Phantom**    | 幽影  | "shadow"     | Glass dodger: fast, lightning dash, fragile (−1 HP).   |
| **Gunner**     | 连射  | "rapid fire" | Bullet hose: very high fire rate, lighter shots.       |

### Altair — bosses

Named antagonists, one per act, in
[`lib/altair/data/bosses.ts`](../lib/altair/data/bosses.ts). Regular enemies
(Shambler, Skeleton Warrior, Witch, Bone Golem, …) are types, not characters.

| Boss                      | Title / framing             |
| ------------------------- | --------------------------- |
| **The Hollow King**       | Act 1 boss, multi-phase     |
| **The Crimson Countess**  | Act 2 boss                  |
| **Elder Lich Malachar**   | **Elder Lich** — Act 3 boss |
| **Terminus, The Undying** | Final boss                  |

Player classes in the same game are **Knight**, **Arcanist**, **Ranger** and
**Plague Doctor** ([`lib/altair/data/classes.ts`](../lib/altair/data/classes.ts)).

### Kowloon Knockout — fighting styles

The nine fighters are **styles, not individuals** — a match names the style, and
the human behind it is the player. Defined in
[`lib/kowloon-knockout/game/fighters/stats.ts`](../lib/kowloon-knockout/game/fighters/stats.ts).
Always set in caps.

| Style              | Character                                                        |
| ------------------ | ---------------------------------------------------------------- |
| **STONE TIGER**    | Immovable bruiser. Absorbs punishment, crushes with heavy blows. |
| **RED PHOENIX**    | Explosive glass cannon. Highest power, shatters on impact.       |
| **JADE DRAGON**    | Balanced warrior. Master of adaptability.                        |
| **SILVER VIPER**   | Blinding speed and evasion. Strikes before you see it move.      |
| **NIGHT CRANE**    | Patient counter-puncher. Waits, reads, then devastates.          |
| **GHOST MONKEY**   | Unpredictable wildcard. Erratic movement, impossible to read.    |
| **BLACK TORTOISE** | Endless stamina and iron defense. Outlasts everything.           |
| **IRON BULL**      | Close-range devastator. Ends the fight in your face.             |
| **SMOKE LEOPARD**  | Ranged poker. Controls space, never lets you close in.           |

### Alex — the Discord tamagotchi

The one character who exists **outside** a game and is genuinely singular.

| Name     | Title                                | Pronouns                     | Where                                                                                                                                   |
| -------- | ------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Alex** | The communal virtual pet / RMH's pet | he/him (established in copy) | [`go-services/internal/discordbot/pet*.go`](../go-services/internal/discordbot/), docs in [`docs/alex-tamagotchi/`](./alex-tamagotchi/) |

There is **one single global Alex** shared by every server the bot is in —
everyone raises the same pet. He is born an infant, ages to adult in real time,
gets sick if collectively neglected, and can pass out (recoverable via
`/revive`). He has a **dream career** the community sets (`/career`), an
intelligence stat, and a favourite food (🧋 boba). His care events broadcast to
every server's last-used channel.

Writing for Alex: he is a pet, not an assistant. Keep him warm, small and a
little needy — never a helpdesk. He speaks through the DeepSeek persona and
shows himself through generated images; both read from the same stat block, so
copy that contradicts his stats (calling him energetic while energy is at 4) is
a bug, not flavour.

---

## 2. Titles the platform confers on real users

These are titles too — they attach to actual accounts, they show up in UI next
to a username, and they must be spelled exactly as defined.

**Doctrine — access tiers** ([`lib/doctrine/constants.ts`](../lib/doctrine/constants.ts)):
**Civilian** (free) → **Asset** (500) → **Operator** (1500).

**Doctrine — ranks by XP** (same file):

| Rank              | XP     | Badge |
| ----------------- | ------ | ----- |
| **Recruit**       | 0      | 🔘    |
| **Analyst**       | 100    | 📊    |
| **Field Agent**   | 500    | 🕵️    |
| **Case Officer**  | 1,500  | 📁    |
| **Station Chief** | 5,000  | 🏛️    |
| **Director**      | 15,000 | ⭐    |
| **Shadow Ops**    | 50,000 | 🌑    |

**Ranked ladder tiers** ([`lib/ranked/tiers.ts`](../lib/ranked/tiers.ts)):
**Master** (1500+) · **Diamond** (1350) · **Platinum** (1200) · **Gold** (1050)
· **Silver** (900) · **Bronze** (floor).

**Membership tiers** ([`lib/entitlements.ts`](../lib/entitlements.ts)): `free`,
`starter`, `pro`, `enterprise` — lowercase identifiers, not display titles.
Capitalise them in UI copy through `t()`, never by string-munging the id.

---

## 3. Named organisations with no named people

Two fictional companies have full multi-page sites and **deliberately no named
staff** — every page describes a role, never a person:

- **RMH Capital** ([`components/rmh-capital/`](../components/rmh-capital/)) —
  the firm, its businesses, insights and careers. Copy refers to the firm, to
  "founders", to functions.
- **RMH PMC** ([`components/rmh-pmc/`](../components/rmh-pmc/)) — capabilities,
  intelligence, command, operators. The Operators page lists **role
  archetypes** — Assaulters & Protective Specialists, Intelligence Analysts,
  Logisticians, Combat Medics, Communications & Signals — and a four-phase
  intake (Application & Records → Vetting & Clearance → Assessment & Selection
  → Badging & Deployment).

That absence is a choice, and a load-bearing one: an unnamed firm reads as a
firm, while a named CEO reads as a claim about a real person. **Do not invent
an executive, a founder or a commander for either.** If a page needs a human
voice, use a role ("the desk", "your account team").

Also named but not people: **the Mirage Royale** (House Always Wins),
**the Ivory Quill Society** (Versecraft), **the Whispering Woods** and its acts
(Forest Explorer).

---

## 4. Names that are generated, not canon

Do not add these to the roster, and don't treat a name you see in the running
app as established:

| Source                                                              | What it is                                                                                                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`lib/rmhark-ai/`](../lib/rmhark-ai/)                               | AI feed bots. Display name, handle and bio are **invented at runtime** by the model, per bot, and stored on the account.                                                                                      |
| `AiPersona` (Prisma) + [`lib/personas/`](../lib/personas/)          | AI personas are **user-authored**. Names come from members; there is no seeded cast and no house persona.                                                                                                     |
| [`lib/breakpoint/store.ts`](../lib/breakpoint/store.ts) `BOT_NAMES` | A 20-entry filler pool for shooter bots (`gracepenguinator`, `Mahmoud`, `Kimmy`, …). Nicknames and in-jokes, not characters.                                                                                  |
| [`lib/daily-puzzles/alibi.ts`](../lib/daily-puzzles/alibi.ts)       | ~124 one-off suspects across the case pool (Marcus Cole, Elena Voss, Conductor Elias Brandt, …). Each belongs to a single case; they are **puzzle content**, and reusing one elsewhere would leak the answer. |
| `data/rmhbox/**`                                                    | Party-game content packs (wiki-race targets, prompts). Real-world names in them are trivia subjects, not cast.                                                                                                |

---

## 5. Adding a character

1. Search this file and `lib/**` for the name first — including across games.
2. Define them in the game's own data module (`characters.ts`, `agents.ts`,
   `dialogues.ts`), not inline in a component, so the name has one home.
3. Give them a **title**, not just a name. Every character above holds one; it
   is what lets UI, dialogue and achievements refer to them consistently.
4. Put every user-facing string through `t()` with a `defaultValue` — including
   the name, if the game localises it (Void Breaker's titles and Kowloon's
   style names are deliberately not translated).
5. Add the row here in the same commit.

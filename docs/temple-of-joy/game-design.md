# Temple of Joy — Game Design Document

> *"The highest good is pleasure. The greatest pleasure is more pleasure."*
> — Misquoted Epicurus, Temple of Joy Loading Screen

---

## 1. Overview

**Title:** Temple of Joy  
**Genre:** Idle / Incremental Clicker  
**Platform:** Web (Next.js, browser-first)  
**Estimated Base Content:** 200+ hours  
**Aesthetic:** Minimalist religious — tan parchment / dark walnut, serif typography, ceremonial iconography. Full dark/light mode.  
**Tagline:** *Happiness is a practice. This is the temple.*

Temple of Joy is an idle clicker game centered on the philosophical doctrine of Hedonism — the maximization of pleasure and happiness as the highest good. Players click to generate **Happiness**, construct buildings that generate Happiness passively, purchase upgrades to multiply output, and eventually "Transcend" (prestige) to restart with permanent enhancements. The game rewards both active engagement and patient idling, with over 200 hours of incremental content before the soft endgame.

---

## 2. Visual Design

### Color Palette

**Light Mode:**
- Background: `#f5efe0` (warm parchment)
- Surface: `#ede0c4` (aged vellum)
- Border / Divider: `#c9b89a` (worn tan)
- Primary Text: `#2e1f0e` (dark walnut)
- Secondary Text: `#5c4428` (medium brown)
- Accent: `#7a5c3a` (earthy gold-brown)
- Highlight: `#b08040` (muted gold)
- Success: `#4a7a4a` (temple sage green)
- Danger: `#8b3a3a` (deep temple crimson)

**Dark Mode:**
- Background: `#1a1410` (dark walnut)
- Surface: `#221c16` (deep brown)
- Border / Divider: `#3d3028` (medium dark brown)
- Primary Text: `#e8d9c0` (warm parchment)
- Secondary Text: `#a08060` (muted tan)
- Accent: `#c09858` (candlelight gold)
- Highlight: `#d4a855` (warm gold)
- Success: `#5a8a5a` (temple green)
- Danger: `#c05050` (temple red)

### Typography
- **Headings:** Serif (e.g., `Cormorant Garamond` or `Playfair Display`)
- **Body / Numbers:** Clean sans-serif (e.g., `Inter`) for readability of large numbers
- **Flavor Text / Quotes:** Italic serif

### UI Motifs
- Thin hairline borders (no thick drop shadows)
- Subtle parchment texture in backgrounds (CSS gradient, not a bitmap)
- Sparse iconography — candles, temple pillars, lotus, incense smoke, laurel wreaths
- Numbers formatted as abbreviated (K, M, B, T, Qa, Qi, Sx, Sp, Oc, No, Dc...)
- Progress bars styled as "offering bars" — fill from left to right with a candle flame at the end

---

## 3. Core Loop

```
Click / Idle
    ↓
Generate Happiness (HP)
    ↓
Spend HP on Buildings (passive HPS)
Spend HP on Upgrades (multipliers)
    ↓
Happiness scales → unlocks new content tiers
    ↓
Reach Transcendence threshold → Prestige
    ↓
Earn Bliss Shards → buy from Wheel of Samsara
    ↓
Rebirth with permanent bonuses → faster next run
```

### Primary Currency: **Happiness (HP)**
- Earned by clicking ("Smile") and from passive Buildings
- Spent on Buildings and Upgrades
- Has no cap — accumulates indefinitely

### Secondary Currency: **Karma**
- Earned slowly via Spiritual Path upgrades and certain events
- Spent on the Spiritual upgrade tree and special Relics
- Carries over across prestige resets *after* specific Wheel of Samsara unlocks

### Prestige Currency: **Bliss Shards**
- Earned upon Transcendence (prestige)
- Amount based on total Happiness earned during the run (not current)
- Spent at the **Wheel of Samsara** (prestige shop)
- Never spent on anything that resets

---

## 4. Clicking

### The Smile Button
- Center of screen — large, circular, glows gently on hover
- Each click produces **Happiness per Click (HPC)**
- Base HPC: 1
- HPC scales with upgrades, buildings (some buildings boost HPC), prestige bonuses, and Ritual state

### Ritual Clicks
Clicking 7 times within 3 seconds triggers a **Ritual**:
- A short golden pulse animation radiates from the Smile button
- Produces 7× the normal click value as a burst
- 30-second cooldown visualized as an incense stick burning down
- Can be shortened by upgrades

### Auto-Clicker Buildings
Certain buildings produce "automatic clicks" rather than raw HPS — these benefit from click multipliers separately from the main HPS track, enabling hybrid "clicker" builds vs. "idle" builds.

---

## 5. Buildings

Buildings are the primary HPS engine. Each has:
- A base cost (scales ×1.15 per purchased copy)
- A base HPS contribution
- A flavor name, tagline, and icon
- Upgrade slots (3 upgrades each, plus global synergy upgrades)

### Building Tiers

| # | Building | Base Cost | Base HPS | Tagline |
|---|----------|-----------|----------|---------|
| 1 | **Mood Candle** | 15 HP | 0.1 | *Smells like "clean linen." Definitely vanilla.* |
| 2 | **Nap Pod** | 100 HP | 0.5 | *The pillow accepts you. You accept the pillow.* |
| 3 | **Snack Bar** | 500 HP | 3 | *Crunchy. Warm. Theologically sound.* |
| 4 | **Hot Tub** | 2,000 HP | 10 | *Buoyancy is a gift you did not earn.* |
| 5 | **Massage Studio** | 8,000 HP | 40 | *Strangers touch your back professionally.* |
| 6 | **Gratitude Journal** | 25,000 HP | 150 | *You wrote three things. Karma increased.* |
| 7 | **Goon Cave** | 75,000 HP | 500 | *A sacred chamber. Minimally furnished. Profoundly... focused.* |
| 8 | **Joy Cult** | 200,000 HP | 1,500 | *"Cult" is a strong word. We prefer "voluntary bliss congregation."* |
| 9 | **Spa Sanctum** | 600K HP | 5,000 | *Your pores are open. So is your mind.* |
| 10 | **Therapy** | 2M HP | 15,000 | *$250/hr. Worth every penny. Should have started sooner.* |
| 11 | **Pleasure Palace** | 6M HP | 50,000 | *Architecture designed entirely around feeling great.* |
| 12 | **Dopamine Lab** | 20M HP | 150,000 | *Scientists. All smiling. Suspiciously.* |
| 13 | **Hedonist Monastery** | 75M HP | 500,000 | *Monks devoted entirely to enjoying themselves.* |
| 14 | **Feast Hall** | 250M HP | 1.5M | *Unlimited breadsticks. This was the promise.* |
| 15 | **Nirvana Resort** | 900M HP | 5M | *Checkout is not available.* |
| 16 | **Eternal Party** | 3.5B HP | 15M | *Nobody knows when it started. Nobody is leaving.* |
| 17 | **Heaven on Earth Ltd.** | 15B HP | 50M | *Publicly traded. Shares: priceless.* |
| 18 | **Bliss Singularity** | 75B HP | 200M | *Happiness so concentrated it folds space-time.* |

### Building Unlock Thresholds
Buildings unlock sequentially as the player can afford them OR reaches total happiness milestones, whichever comes first. Later buildings (14+) have dual requirements: cost AND total happiness earned.

### Per-Building Upgrades
Each building has 3 tiers of dedicated upgrades ("Offerings"):
- **Tier 1** (×2 boost): Unlocked at 10 copies purchased
- **Tier 2** (×3 boost): Unlocked at 25 copies
- **Tier 3** (×5 boost): Unlocked at 50 copies

Each building also participates in **Synergy Upgrades** — cross-building multipliers that unlock when you own certain quantities of multiple buildings at once (see Section 8).

---

## 6. Upgrade Trees

Upgrades are purchased with Happiness. They appear in a scrollable panel and are grouped into thematic paths. Each path has ~30–40 upgrades for 150–180 total upgrades per run.

---

### 🍖 Path of the Flesh (Carnal)
*Physical pleasures — food, warmth, sleep, sensation.*

| Name | Cost | Effect | Flavor |
|------|------|--------|--------|
| Artisanal Cheese Acquisition | 100 HP | ×2 Snack Bar HPS | *Aged 18 months. You can taste the philosophy.* |
| The Perfect Temperature | 500 HP | +5 HPC | *68°F. Science agrees.* |
| Cashmere Everything | 2K HP | ×1.5 all HPS | *You touched it in the store. You bought it immediately.* |
| Nap Mastery Vol. I | 5K HP | ×3 Nap Pod HPS | *The nap knows when to end.* |
| Nap Mastery Vol. II | 50K HP | ×3 Nap Pod HPS | *You nap before the nap.* |
| Nap Mastery Vol. III | 500K HP | ×3 Nap Pod HPS | *Napping is not laziness. It is theology.* |
| Weighted Blanket Theology | 15K HP | ×2 HPS while idle | *8.5 lbs of grace.* |
| The Feast Protocol | 100K HP | ×5 Feast Hall HPS | *Courses: twelve. Regrets: none.* |
| Warm Bread (At Last) | 1M HP | ×2 click HPS buildings | *The bread. You waited. It was worth it.* |
| Hot Spring Revelation | 10M HP | ×3 Hot Tub HPS + ×2 Spa HPS | *You went in skeptical. You emerged transformed.* |
| Everything in Moderation (Discarded) | 50M HP | ×1.5 all HPS | *You considered moderation. You did not choose it.* |
| The Michelin Experience | 500M HP | ×10 Feast Hall HPS | *Three stars. You deserved four.* |

---

### 🥂 Path of the Crowd (Social)
*Validation, belonging, attention, schadenfreude.*

| Name | Cost | Effect | Flavor |
|------|------|--------|--------|
| 37 Notifications (All Positive) | 200 HP | ×2 HPC | *Every single one good. A holy day.* |
| Remembered Your Birthday | 1K HP | +10 HPS | *And not just because of the app.* |
| The Group Chat That Responds | 3K HP | ×2 Gratitude Journal HPS | *You sent a message. They replied within minutes.* |
| Winning an Argument Online | 10K HP | ×3 HPC | *You were right. They admitted it. Screenshot saved.* |
| Crowd Goes Wild (Specifically For You) | 40K HP | ×2 Joy Cult HPS | *They chanted your name. Or a name. Close enough.* |
| The Life of the Party | 150K HP | ×4 Joy Cult HPS | *People stayed because of you. Documented.* |
| Validation (Professional Grade) | 600K HP | ×3 Therapy HPS | *Your therapist: "That's completely valid." You: saved.* |
| Compliment That Landed | 2M HP | ×5 HPC | *They meant it. You could tell.* |
| Fan Base (Modest) | 10M HP | ×3 Joy Cult + ×2 Eternal Party HPS | *Modest. Growing. Devoted.* |
| The Viral Moment | 75M HP | ×10 HPC burst (permanent) | *You were there. The internet was there. Magic.* |
| Unconditional Acceptance | 500M HP | ×3 all Social buildings | *Finally. Just as you are.* |
| The Adoring Crowd (Eternal) | 5B HP | ×5 Eternal Party HPS | *They are still clapping. They will always be clapping.* |

---

### 📚 Path of the Mind (Intellectual)
*Focus, curiosity, creative flow, discovery.*

| Name | Cost | Effect | Flavor |
|------|------|--------|--------|
| The Hyperfocus Trance | 500 HP | ×1.3 HPC when clicking rapidly | *You entered the state. Twelve hours passed.* |
| 3AM Wikipedia Spiral | 2K HP | ×2 HPS, flavor: you knew it was a mistake | *You clicked one link. Then another. Then— it's 4AM.* |
| Reading A Book That Gets You | 8K HP | ×3 Gratitude Journal HPS | *You underlined every third sentence.* |
| The Perfect Playlist | 20K HP | ×1.5 all HPS | *Every song was exactly right. You saved it.* |
| The Sudden Understanding | 100K HP | ×5 Dopamine Lab HPS | *The concept resolved. You said "oh!" aloud.* |
| Finishing A Creative Project | 400K HP | ×10 Dopamine Lab HPS | *You made a thing. It exists. You are at peace.* |
| Deep Work (Actually) | 2M HP | ×3 HPC + ×2 Dopamine Lab | *Cal Newport was right. Annoyingly.* |
| The Rabbit Hole (Academic) | 8M HP | ×4 all Mind-path buildings | *Fourteen papers. One conclusion. Unputdownable.* |
| Flow State (Sustained) | 50M HP | ×2 all HPS for 5 min after clicking 100x | *Time dissolved. The work remained. Beautiful.* |
| Mastery (Recognized) | 300M HP | ×5 Dopamine Lab HPS | *You are good at the thing. People notice.* |
| The Grand Unified Theory of Fun | 3B HP | ×2 all HPS | *You worked it out. Happiness: understood. Applied.* |

---

### 🌿 Path of the Spirit (Transcendence)
*Nature, quiet, cosmic perspective, earned peace.*

Upgrades on this path primarily multiply Karma generation and yield passive Karma income, which then drives the Spiritual building tier and special Relics.

| Name | Cost | Effect | Flavor |
|------|------|--------|--------|
| Touch Grass | 300 HP | +2 Karma; ×1.5 HPS | *Ancient practice. Somehow still effective.* |
| Sunset Witnessed (Unfiltered) | 1.5K HP | ×2 Karma/sec | *You watched the whole thing. Phone in pocket. Remarkable.* |
| Ocean Sounds (Not The App) | 6K HP | ×2 HPS while idle | *The real ocean. You went there. Long drive. Worth it.* |
| Manifesting (But It Worked) | 30K HP | ×2 HPC; flavor: you're a little spooked | *You wrote it down. Then it happened. File under: unknown.* |
| The Forest Walk | 100K HP | ×3 Karma; ×1.5 HPS | *No destination. Just trees. Profound.* |
| Cosmic Insignificance (Comforting) | 400K HP | ×2 all HPS | *You are nothing in the universe. This is relaxing.* |
| The Stars (Seen Clearly) | 2M HP | ×5 Karma/sec | *No light pollution. You lay on the hood of the car. You understood.* |
| Meditation (Real Kind) | 10M HP | ×3 HPS while idle + ×3 Karma | *You sat. You didn't think about email. For 20 minutes. Extraordinary.* |
| Pilgrim's Rest | 50M HP | ×4 Hedonist Monastery HPS | *You arrived somewhere holy. Sat. Left better.* |
| The Void (Comfortable) | 250M HP | ×3 all HPS; +10 Karma/sec | *You found the silence. You liked it.* |
| Nirvana (Adjacent) | 2B HP | ×5 all Spirit-path buildings + Karma ×10 | *Not quite there. Incredibly close. Still pleasant.* |
| Enlightenment (Partial) | 20B HP | ×2 all HPS and HPC | *A sliver. Enough.* |

---

### 💰 Path of Indulgence (Hedonist)
*Luxury, excess, unapologetic pleasure maximization.*

| Name | Cost | Effect | Flavor |
|------|------|--------|--------|
| Business Class (No Reason) | 800 HP | ×2 HPS | *The seat reclined. All the way. You deserved this.* |
| Dessert for Breakfast | 3K HP | ×3 Snack Bar HPS | *You looked at the rules. You set them aside.* |
| Unnecessary Purchase (10/10) | 12K HP | ×5 HPC | *You didn't need it. You have it. Correct decision.* |
| The Vacation That Fixed Everything | 50K HP | ×5 Nirvana Resort HPS | *You came back different. Better. Yes, it worked.* |
| Not Checking Email (Two Weeks) | 200K HP | ×3 HPS while idle | *Someone handled it. Or they didn't. Either way: you were in the sea.* |
| Custom Everything | 800K HP | ×3 Pleasure Palace HPS | *Bespoke. Tailored. Exactly right. For you specifically.* |
| The Penthouse | 3M HP | ×5 Pleasure Palace HPS | *Floor-to-ceiling views. Bathrobe on. Permanent.* |
| Chef's Table (Reserved Permanently) | 15M HP | ×4 Feast Hall + ×3 Snack Bar HPS | *They know your name. They saved you the corner table.* |
| Personal Masseuse (On Staff) | 80M HP | ×6 Massage Studio HPS | *You gesture. They appear. Knots: addressed.* |
| First Class Existence | 500M HP | ×3 all Indulgence buildings | *Every moment: premium. No turbulence. No lines.* |
| Hedonist of the Year Award | 3B HP | ×5 all HPS | *Awarded at the ceremony. Standing ovation. You accepted graciously.* |
| The Perfect Life (Drafted) | 25B HP | ×10 all HPS | *You designed it. They built it. You're in it. This is it.* |

---

### 🔬 Path of Philosophy (Late Game)
*Unlocks after Prestige 1. Abstract, conceptual happiness sources.*

| Name | Cost | Effect | Flavor |
|------|------|--------|--------|
| Epicurus Was Right | 1B HP | ×2 all HPS | *Simple pleasures. Absence of pain. He figured it out 300 BCE. We forgot.* |
| The Utilitarian Calculus | 5B HP | ×3 Dopamine Lab HPS | *Greatest happiness, greatest number. Starting with you.* |
| Hedonistic Imperative (Applied) | 25B HP | ×2 HPC + ×2 HPS | *David Pearce proposed it. You implemented it.* |
| Post-Ironic Contentment | 100B HP | ×5 all HPS | *You stopped performing happiness. You found it.* |
| The Paradox Resolved | 500B HP | ×3 all multipliers | *Wanting less, having more. More of what matters. Solved.* |
| Just Vibes (Theoretical Framework) | 2T HP | ×10 all HPS | *You published the paper: "Vibes: A Grand Unified Theory." Peer-reviewed. Accepted.* |
| The Meaning of Life (Found) | 20T HP | ×5 all HPS + ×5 HPC | *42? No. But close. Warmer. Much warmer.* |

---

## 7. Prestige System: Enlightenment

### Triggering Transcendence
The **Transcend** button appears on a dedicated panel once the player has earned a cumulative **1 Trillion Happiness** lifetime in a single run (adjusted for subsequent runs — scales by 0.85× per prestige, so each run reaches the threshold faster).

Upon pressing:
- A ceremonial animation plays: the temple "dissolves," candles blow out, screen fades to white/dark
- All buildings, upgrades, and current Happiness reset to zero
- Karma balance resets (unless `Karmic Vessel` upgrade purchased)
- **Bliss Shards** are awarded based on `floor(sqrt(peakHappiness / 1e10))` — a formula that rewards scale but diminishes returns, encouraging many prestige runs

### Bliss Shard Formula
```
shardsEarned = floor(sqrt(lifetimeHappiness / 1e10))
```
Example: 1T lifetime HP → 10 shards. 100T → 100 shards. 10Q → 1,000 shards.

### Wheel of Samsara (Prestige Shop)

The Wheel of Samsara is a circular upgrade interface using the religious temple aesthetic. Upgrades radiate outward from the center in tiers.

**Tier 1 (1–3 Shards each):**
| Upgrade | Cost | Effect |
|---------|------|--------|
| Beginner's Bliss | 1 | Start each run with +50 HPS |
| The Second Smile | 1 | ×2 base HPC |
| Ember of Memory | 2 | Keep 5 upgrades of your choice on prestige |
| Karmic Vessel | 2 | Karma balance persists through prestige |
| Early Warmth | 3 | Building costs reduced by 5% |
| Remembered Joy | 1 | Start with 60 seconds of ×5 HPS |

**Tier 2 (5–15 Shards each, requires 1 Tier 1):**
| Upgrade | Cost | Effect |
|---------|------|--------|
| Reincarnated Wealthier | 5 | Start each run with 1% of peak HP from last run |
| The Deep Roots | 5 | Buildings 1–5 start at 5 owned copies |
| The Eternal Return | 8 | Prestige shard formula improved by ×1.25 |
| The Saint's Patience | 10 | Offline income cap raised to 16 hours |
| Samsara's Gift | 10 | +5% HPS per prestige completed (stacks, max 20×) |
| Ritual Mastery | 7 | Ritual cooldown reduced 50%; trigger requires 5 clicks |

**Tier 3 (20–50 Shards each, requires 3 Tier 2):**
| Upgrade | Cost | Effect |
|---------|------|--------|
| The Long View | 20 | Offline income formula uses square root (not linear cap) |
| Enlightened Clicker | 25 | HPC ×(1 + 0.1× prestige count) |
| The Second Coming | 30 | First 10 minutes of each run yields ×10 HPS |
| The Prophet's Memory | 35 | Keep 20 upgrades on prestige |
| Heaven's Infrastructure | 40 | All buildings cost 10% less (stacks with other reductions) |
| Karmic Dividend | 50 | Karma generates ×5 per second after prestige 3 |

**Tier 4 (100–200 Shards, requires 3 Tier 3 — post-run 5+):**
| Upgrade | Cost | Effect |
|---------|------|--------|
| The Infinite Wheel | 100 | Shards earned formula uses 1.1× exponent instead of 0.5 |
| Nirvana's Blueprint | 120 | All new runs start at 50% of previous run's peak HPS |
| The Divine Memory | 150 | All upgrades retained on prestige |
| Temple Eternal | 200 | ×10 all HPS — permanent, stacks multiplicatively across prestige |

**Total Wheel of Samsara upgrades:** ~30+ across 4 tiers, requiring many prestige runs to fully complete.

---

## 8. Synergy Upgrades

Synergy Upgrades appear when the player meets cross-building quantity milestones. They provide multiplicative boosts to groups of buildings.

| Name | Requirement | Effect | Flavor |
|------|-------------|--------|--------|
| The Drowsy Economy | 10 Nap Pods + 10 Snack Bars | ×4 both | *Rest and snacks. The foundation of civilization.* |
| Hedonist's Routine | 25 Mood Candles + 25 Massage Studios | ×6 both | *Morning candle. Evening massage. Perfect day.* |
| Cult Cuisine | 50 Joy Cults + 30 Feast Halls | ×5 both | *The congregation eats together. Transcendence is served warm.* |
| The Bliss Pipeline | 100 Dopamine Labs + 50 Spa Sanctums | ×8 both | *Chemical and architectural happiness, unified.* |
| The Philosopher's Spa | 75 Therapy + 75 Hedonist Monasteries | ×10 both | *Inner peace, outer peace. You've both.* |
| Eden's Architecture | 100 Pleasure Palaces + 50 Heaven on Earth | ×12 both | *Two interpretations of paradise. Merged.* |
| The Eternal Feast | 150 Feast Halls + 100 Eternal Parties | ×15 both | *The table is infinite. The music never stops.* |

---

## 9. The Hedonic Treadmill (Meta Mechanic)

### What It Is
As your Happiness grows, so does your **Baseline Happiness** — representing how much you take for granted. The gap between **Current Happiness** and **Baseline** is your **Effective Satisfaction**, which determines the Karma yield and certain late-game multipliers.

```
Effective Satisfaction = Current HP - Baseline HP
Baseline HP = slow-moving average of recent HP peak
```

### Why It Matters
- This creates a cycle: earn HP → baseline rises → you must push harder for the same satisfaction → upgrades help you stay ahead
- It's a soft difficulty curve — not punishing, but philosophically on-theme
- Certain upgrades (philosophical path) specifically address the Hedonic Treadmill: *"Wanting Less, Having More"* — freeze baseline growth temporarily

### UI
The Treadmill is shown as a two-line graph on the stats panel: Current HP (blue/gold) and Baseline HP (gray). The gap between them glows.

---

## 10. Special Mechanics

### 🎰 The Vibe Check
Every 3–7 minutes (random), a **Vibe Check** prompt appears:
- A small card slides in from the side: *"Vibe Check."*
- Player can click **"Pass"** or ignore
- **Pass** (within 10 seconds): +15% HPS burst for 60 seconds
- **Ignore / Fail** (you waited): +5% HPS burst for 30 seconds — *"You cannot truly fail a vibe check. You can only have a different vibe."*
- No punishment path — pure upside

### ⛪ Pilgrimage Mode
A button available from the start, labeled **"Make Pilgrimage."** On click:
- Game enters Pilgrimage mode: no clicking allowed for 2 minutes
- After 2 minutes: large Happiness burst (equivalent to 5 minutes of HPS)
- Visual: single candle flame animation, ambient incense background
- *"You did nothing. That was the point."*
- Cooldown: 15 minutes (reducible by upgrades)

### 📿 Karma System
- Karma is a secondary currency that accumulates slowly
- Certain actions generate Karma: Pilgrimage, Spirit Path upgrades, certain events
- Karma is spent on:
  - Spiritual Path upgrade unlocks (some locked behind Karma thresholds)
  - Special Relics (see Section 11)
  - The "Offering" system (small HPS boosts that regenerate daily)

### 🕯️ Daily Offerings
Each day (real-time 24 hours), the player can make up to 3 **Offerings**:
- Spend small Karma amounts for temporary HPS bonuses that stack
- *"First offering: incense (+2% HPS, 24h). Second: bread (+5% HPS, 12h). Third: gold (+15% HPS, 6h)."*
- Encourages daily engagement

### 🌀 Prestige Challenges (Ascetic Runs)
After Prestige 3, **Ascetic Runs** unlock — optional prestige variants with a modifier:
- *"Vow of Silence"*: No buildings above Tier 8
- *"Fasting Protocol"*: No Food-related upgrades
- *"The Hermit's Way"*: No Social-path upgrades
- Completing an Ascetic Run with a higher Bliss Shard yield (×1.5–2.5×) rewards special cosmetic badges and unique Wheel of Samsara entries

---

## 11. Relics

Relics are unique passive items purchased with Karma or found via special events. Only 5 can be active at once (expandable to 8 via prestige).

| Relic | Karma Cost | Effect |
|-------|-----------|--------|
| **Epicurus's Ring** | 50 | All Philosophical upgrades cost 50% less |
| **The Laurel Crown** | 40 | ×2 HPS while idle |
| **Incense of the Ancients** | 60 | Doubles Ritual burst; halves cooldown |
| **The Stuffed Pillow** | 30 | ×3 Nap Pod HPS + Pilgrimage burst ×1.5 |
| **Golden Fork** | 45 | ×4 Feast Hall + ×2 Snack Bar HPS |
| **The Confession Booth** | 80 | +5% HPS per Bliss Shard owned |
| **Vibe Crystal** | 35 | Vibe Check rewards doubled |
| **The Philosopher's Stone (Joy)** | 150 | ×2 all multipliers — costs everything adjacent |
| **The Warm Blanket (Eternal)** | 55 | Idle HPS = active HPS always |
| **The Sacred Ledger** | 70 | HPS increases the longer you stay on the page (caps at ×5, resets on close) |
| **The Hymnal of Excess** | 100 | Each building type has a ×1.01 compound bonus per copy owned (applied separately per building type) |
| **The Eternal Nap** | 90 | Offline progress calculated as if you were actively clicking |

Relic inventory is shown in a dedicated panel with slot artwork. Hovering shows full effect description in sermon-style prose.

---

## 12. Events

Random events occur approximately every 10–20 minutes of active play or every hour of idle accumulation.

### Event Types

**Blessing Events** (always positive):
- *"A stranger paid for your coffee."* → +5 min HPS
- *"Perfect weather today."* → ×2 HPS for 10 mins
- *"You found $20 in an old jacket."* → +flat HP bonus
- *"The nap was perfect."* → ×3 Nap Pod HPS for 5 mins

**Choice Events** (two options, both positive but different):
- *"You have a free Sunday. [Stay in (×2 idle HPS 4hr)] or [Go out (×5 HPC 1hr)]"*
- *"The waiter offers dessert. [Yes (×2 Feast Hall 2hr)] or [No, I'm satisfied (+10% permanent HPS)]"*
- *"An old friend calls. [Long call (+15% Social buildings 3hr)] or [Catch up later (+5% permanent HPC)]"*

**Philosophical Events** (late game, text-heavy):
- Present a short philosophical vignette (2-3 sentences) and ask the player to choose a response
- No wrong answer — each grants different currency (HP vs Karma vs Bliss-Shard preview)
- Example: *Epicurus walks in. He orders the small plate. "Excess diminishes the feast," he says. [Agree (+karma)] [Order the large plate anyway (+HP)]"*

---

## 13. Milestones & Achievements

**Milestones** are one-time thresholds that grant permanent HPS bonuses (per run):
- *1K HP earned* → +0.5 HPS permanently  
- *100K HP* → +5 HPS
- *1M HP* → ×1.05 all HPS
- *1B HP* → ×1.1 all HPS
- *1T HP* → First Transcendence unlocked
- ... continued every order of magnitude through 1 Novemtrigintillion HP (the soft endgame)

**Achievements** are cosmetic +flavor records. ~150 total:
- *"Cozy Operator"* — 1000 Mood Candles purchased
- *"The Cave Dweller"* — Own a Goon Cave. Just own one.
- *"Are You Okay?"* — Click 10,000 times in one session
- *"The Stoic (Failed)"* — Reach high happiness without the Spirit path
- *"Against the Treadmill"* — Maintain Effective Satisfaction > 50% for 1 hour
- *"Enlightenment (Partial)"* — First prestige
- *"Enlightenment (Complete)"* — 10th prestige
- *"The Long Game"* — 200 hours total playtime

---

## 14. UI / UX Layout

### Main Layout (Desktop)
```
┌──────────────────────────────────────────────────────────┐
│  TEMPLE OF JOY                              [☀/🌙 mode]  │
├────────────┬────────────────────┬───────────────────────┤
│            │                    │                       │
│  BUILDINGS │    SMILE BUTTON    │   UPGRADES PANEL      │
│  PANEL     │    (center, big)   │   (scrollable list)   │
│            │                    │                       │
│  [name]    │  ✦ HPS: 1.2M/s ✦  │  [Path filters]       │
│  [count]   │  ☼ HP: 847.3M     │  [Upgrade cards]      │
│  [HPS]     │                    │                       │
│  [buy btn] │  [Stats panel]     │                       │
│  ...       │  [Karma / Shards]  │                       │
│            │                    │                       │
├────────────┴────────────────────┴───────────────────────┤
│  [Milestones] [Relics] [Wheel of Samsara] [Achievements]│
└──────────────────────────────────────────────────────────┘
```

### Mobile Layout
- Single column, tabbed navigation at bottom
- Tabs: Temple (click), Buildings, Upgrades, Collection (relics/achievements)
- Smile button always accessible via floating action button

### The Smile Button
- Position: center of main panel
- Size: 120px diameter (desktop), 100px (mobile)
- Design: circular, tan/parchment with a worn-gold border
- Hover: subtle golden glow
- Click: small burst of dots/particles outward, brief scale-up animation
- Ritual triggered: golden shockwave animation, screen tint for 1s

### Number Display
All numbers use a compact display with religious-flavored tier names:
```
< 1,000       → digits
1K–999K       → K (Humble)
1M–999M       → M (Devout)
1B–999B       → B (Exalted)
1T–999T       → T (Transcendent)
1Qa–999Qa     → Qa (Blessed)
1Qi–999Qi     → Qi (Holy)
1Sx–...       → Sx (Sacred)
...
```
Optional toggle to display full scientific notation.

---

## 15. Save System

### Auto-Save
- Save to `localStorage` every 30 seconds
- On page visibility change (tab switch, minimize)
- On major event (prestige, milestone)
- Serialized as JSON: all building counts, upgrade state, currencies, timestamp

### Offline Progress
- On load: calculate time delta since last save
- Offline income = `HPS × timeAwaySeconds × offlineEfficiency`
- Default offline efficiency: 50% (earn half idle rate while away)
- Cap: 8 hours base (extendable to 24h via Wheel of Samsara)
- Display modal on return: *"You were away for X hours. The temple kept going. +Y Happiness."*

### Server Backup (Optional)
- If user is logged in (Better Auth), save a server snapshot every 5 minutes
- Used for cross-device continuity
- Endpoint: `POST /api/temple-of-joy/save`

### Import / Export
- JSON export/import for manual backups
- Accessible via settings panel

---

## 16. Settings Panel

- **Dark / Light mode toggle** (persisted in localStorage + body class)
- **Number format** (abbreviated / scientific notation)
- **Sound effects** (on/off, volume slider) — soft chime on click, ambient incense/candle crackling
- **Notifications** (browser notifications for Vibe Check, Pilgrimage ready)
- **Save / Export / Import**
- **Reset run** (with confirmation — does NOT give Bliss Shards, full wipe)
- **Credits** ("Built with love and hubris at RMH Studios")

---

## 17. Content Volume Estimate

The 200+ hour target is achieved through:

| Source | Hours |
|--------|-------|
| 18 building tiers × natural progression curve | ~60h |
| 5 upgrade paths × 30–40 upgrades each | ~40h |
| Per-building upgrade tiers (1–50 copies) | ~20h |
| Synergy unlock progression | ~10h |
| Event + achievement collection | ~15h |
| Prestige runs 1–5 | ~25h |
| Prestige runs 6–20 (deeper Wheel of Samsara) | ~40h |
| Ascetic challenge runs | ~15h |
| Late-game philosophy path | ~20h |
| Full achievement completion | ~15h |
| **Total** | **~260h** |

The prestige system resets most progress, meaning the 200+ hours does not require a single "playthrough" — it accumulates across multiple prestige cycles that each become progressively faster but push into new content.

---

## 18. Tech Stack & Implementation

### Frontend
- **Framework**: Next.js (App Router) — page at `/temple-of-joy`
- **State**: Zustand store for all game state
- **Styling**: Tailwind CSS with CSS variables for light/dark mode tokens
- **Animations**: Framer Motion for building/upgrade unlock animations; CSS keyframes for click burst

### Game State Shape (TypeScript)
```ts
interface TempleOfJoyState {
  // Currencies
  happiness: number;          // current HP
  lifetimeHappiness: number;  // total earned this run
  karma: number;
  blissShards: number;

  // Buildings
  buildings: Record<BuildingId, number>;  // count owned

  // Upgrades
  upgrades: Record<UpgradeId, boolean>;   // purchased

  // Relics
  relics: RelicId[];           // active relics (max 5 base)

  // Prestige
  prestigeCount: number;
  wheelOfSamsara: Record<WheelUpgradeId, boolean>;

  // Meta
  lastSaved: number;           // Unix timestamp
  totalPlaytime: number;       // seconds
  achievements: Record<AchievementId, boolean>;
  milestones: Record<string, boolean>;

  // Hedonic Treadmill
  baselineHappiness: number;

  // Session
  offlineHappinessOnLoad: number;  // shown in modal on boot
}
```

### Store Actions
```ts
interface TempleOfJoyActions {
  tick: (deltaMs: number) => void;        // called via requestAnimationFrame
  click: () => void;                       // smile button
  buyBuilding: (id: BuildingId) => void;
  purchaseUpgrade: (id: UpgradeId) => void;
  equipRelic: (id: RelicId) => void;
  triggerPilgrimage: () => void;
  triggerTranscendence: () => void;
  purchaseWheelUpgrade: (id: WheelUpgradeId) => void;
  resolveEvent: (eventId: string, choice: number) => void;
  loadSave: (save: SaveData) => void;
  computeOfflineProgress: (awayMs: number) => number;
}
```

### Computed Selectors
```ts
const useHPS = () => // sum of all building HPS × all multipliers
const useHPC = () => // base × click multipliers
const useEffectiveSatisfaction = () => // current - baseline
const useCanTranscend = () => // lifetimeHappiness >= threshold
```

### Tick Loop
```ts
useEffect(() => {
  let lastTime = performance.now();
  let rafId: number;
  const loop = () => {
    const now = performance.now();
    const delta = Math.min(now - lastTime, 1000); // cap at 1s
    lastTime = now;
    tick(delta);
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(rafId);
}, []);
```

### File Structure
```
app/
  temple-of-joy/
    page.tsx                   ← main game page
    layout.tsx                 ← applies theme tokens

components/
  temple-of-joy/
    TempleOfJoyGame.tsx        ← top-level orchestrator
    ui/
      LandingScreen.tsx
      SmileButton.tsx
      BuildingsPanel.tsx
      UpgradesPanel.tsx
      RelicsPanel.tsx
      WheelOfSamsara.tsx
      StatsPanel.tsx
      EventModal.tsx
      VibeCheck.tsx
      PilgrimageOverlay.tsx
      TranscendenceModal.tsx
      OfflineModal.tsx
      SettingsPanel.tsx
      AchievementsPanel.tsx
    data/
      buildings.ts             ← all building definitions
      upgrades.ts              ← all upgrade definitions
      relics.ts
      events.ts
      achievements.ts
      milestones.ts
      wheel.ts                 ← Wheel of Samsara entries

lib/
  temple-of-joy/
    store.ts                   ← Zustand store
    selectors.ts               ← computed values
    persistence.ts             ← save/load/offline
    engine.ts                  ← tick, HPS calc, multiplier
    numbers.ts                 ← abbreviation formatting

app/api/
  temple-of-joy/
    save/route.ts              ← server-side save endpoint

prisma/
  schema.prisma                ← TempleOfJoySave model
```

---

## 19. Prisma Schema Addition

```prisma
model TempleOfJoySave {
  id        String   @id @default(cuid())
  userId    String   @unique
  saveData  Json
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## 20. Content Roadmap

### v1.0 — Core Loop
- Buildings 1–10
- Carnal, Social, Mind paths (partial)
- Basic prestige (Tiers 1–2 Wheel)
- Save / load
- Light + dark mode

### v1.1 — Spiritual & Indulgence
- Buildings 11–15
- Spirit and Indulgence paths complete
- Relics (first 6)
- Events system
- Vibe Check
- Pilgrimage Mode

### v1.2 — Deep Endgame
- Buildings 16–18
- Philosophical path (post-prestige 1)
- Full Wheel of Samsara
- Ascetic Runs
- Achievements (complete)
- Hedonic Treadmill mechanic

### v1.3 — Polish
- Sound design (click chimes, ambient candle/incense audio)
- Mobile optimization pass
- Cross-device sync via server save
- Daily Offerings
- Notification system

---

*Document version: 1.0 — Initial design. Subject to revision based on playtesting.*

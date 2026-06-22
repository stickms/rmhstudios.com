# RMH Coding Simulator — Design

A two-layer-prestige incremental ("clicker") game where you play an RMH Studios
developer: write Lines of Code (LoC), hire automated developers, ship products
for Reputation, and eventually IPO your studio for Equity. Lives at
`/rmh-coding-simulator` and is listed on the curated **Builds** page.

## Why it's a 200h+ game (and the stats behind it)

The economy is modelled directly on the proven curves of the genre's
longest-played titles:

- **Cookie Clicker** — 14 generators ("auto-coders") whose **base prices climb
  ~14× per tier** and whose per-unit cost grows **×1.15 per purchase**. This is
  the single most important longevity lever: each generator line takes
  exponentially longer to max, and there are 14 of them. Per-generator output is
  seeded from Cookie Clicker's building CpS table (Intern 0.1/s → The Codeverse
  2.9B/s). 156 upgrades (10 doubling tiers per generator + 16 hand-authored
  global/click/golden upgrades) keep every tier relevant.
- **AdVenture Capitalist** — bulk-buy (×1, ×10, ×100, MAX) and the
  "buy the next unaffordable tier" reveal pacing.
- **Cookie Clicker golden cookies** → **Golden Commits**: random floating
  pickups granting Lucky lump sums, Code Frenzy (×7), Click Frenzy (×777), a
  rare Code Storm (×15), and a rare Build Failed (×0.5) "wrath" outcome.
- **Realm Grinder / NGU Idle** — a **second prestige layer**. "Ship It" resets
  for Reputation (cube-root of lifetime LoC, +2%/star, spent on a 14-node skill
  tree); the deep "IPO" reset trades all Reputation for Equity (sqrt-scaled,
  +50% each, permanent Founder Perks). Cube-root → sqrt stacking means a 10×
  longer grind yields ~2× the prestige currency, so the long tail stretches into
  the hundreds of hours.

## Systems

| System | Currency | Reset by | Persists |
|---|---|---|---|
| Generators + upgrades | Lines of Code | Ship It, IPO | — |
| Skill tree | Reputation ⭐ | IPO | Ship It |
| Founder Perks | Equity 📈 | never | Ship It + IPO |
| Achievements (32) | — | never | everything (+1% each) |

- **Offline progress**: 3h cap (extendable via skills/perks) at 50% efficiency
  (improvable to 100%), shown in a "welcome back" modal.
- **Persistence**: local-only (`localStorage`) plus a copy-paste export/import
  string. No server schema — the game is fully client-side.

## The AI Architect (DeepSeek)

The **AI Architect** tab is "ARCH-1", an in-character RMH principal architect
powered by **DeepSeek**. It reuses the existing same-site proxy at
`/api/vibe/ai` (`lib/rmhvibe/vibe-ai.server.ts`), so the `DEEPSEEK_API_KEY`
never reaches the client and calls are rate-limited server-side.

- **Chat** — ask ARCH-1 anything; replies are short, dev-culture-flavored.
- **Generate Sprint** — DeepSeek writes a one-line sprint goal that comes with a
  temporary **×3 production & click** buff.
- **Graceful fallback** — if the key is unset or the model errors, the feature
  returns on-theme canned lines, so it never blocks gameplay.

## Code map

```
lib/rmh-coding-simulator/
  numbers.ts       number + duration formatting
  types.ts         GameState, definitions, save shape
  data.ts          generators, upgrades, skills, perks, achievements, scaling
  engine.ts        pure economy math (costs, CpS, click, multipliers, prestige)
  tick.ts          per-frame simulation step (production, buffs, golden clock)
  ai.ts            DeepSeek "ARCH-1" client (via /api/vibe/ai) + fallbacks
  persistence.ts   localStorage save/load, offline catch-up, import/export
  store.ts         zustand store + all actions
components/rmh-coding-simulator/
  RMHCodingSimulator.tsx   full UI (clicker, tabs, AI terminal, modals)
  rmh-coding-simulator.css IDE/terminal theme
app/routes/rmh-coding-simulator.tsx   the route (lazy + error boundary)
```

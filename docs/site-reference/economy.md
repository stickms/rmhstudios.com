# Economy & progression

Two systems that look similar but are not: **coins** are a spendable currency, **XP/levels** are a permanent record of activity. Coins can go down; XP does not.

The design rationale for the coin economy is in [`coins.md`](../coins.md); this page is the map of where it surfaces and what implements it.

## Coins

```{warning}
`awardCoins()` in `lib/coins.server.ts` is the **only** correct way to grant
coins. It writes the ledger entry and updates the profile in one place. Writing
a balance directly leaves the ledger and the balance disagreeing, and the ledger
is what reconciliation trusts.
```

`CoinTransaction` is the ledger model. `lib/coins-schema.ts` holds the zod schemas (the standard `.server.ts` mutations + plain-file schema split described in [`lib/CLAUDE.md`](https://github.com/stickms/rmhstudios.com/blob/main/lib/CLAUDE.md)).

| Route | What it is |
| ----- | ---------- |
| `/shop` | Spend coins on cosmetics and items. |
| `/store`, `/store/:userid` | Creator storefronts. `/market` redirects here. |
| `/predictions` | Prediction markets. `/wallet` redirects here. |
| `/wishlist` | Wishlists. |

Implementations: `lib/shop/`, `lib/store/`, `lib/storefront/`, `lib/market/`, `lib/staking/`, `lib/gifting/`, `lib/wheel/`, `lib/predictions/`, `lib/wishlist/`.

## Progression

| Route | What it is |
| ----- | ---------- |
| `/progress` | The progression dashboard. |
| `/achievements` | Achievement gallery. |
| `/arcade` | Arcade Pass — per-game daily challenges. `/leaderboard` redirects here. |
| `/history` | Activity history. |
| `/wrapped`, `/recap` | Periodic summaries. |

`lib/xp/`, `lib/quests/`, `lib/achievements/`, `lib/battlepass/`, `lib/streak.server.ts` and `lib/ranked/` (elo) implement these. Progression is a *consequence* of activity rather than something a page triggers directly: the engagement layer awards it (see [Social](./social.md)), which is why posting via the public API progresses quests identically to posting in-app.

## Competitive play

| Route | What it is |
| ----- | ---------- |
| `/ranked` | Ranked ladder. |
| `/tournaments`, `/tournaments/:id` | Tournaments. |
| `/wager`, `/wager/:id` | Wager matches. |
| `/replays/:id` | A saved replay (full-screen). |

Backed by `lib/ranked/`, `lib/tournaments/`, `lib/wager/` and `lib/replays.server.ts`.

## Memberships

`/pricing` sells Stripe-backed memberships. Tiers resolve through `lib/entitlements.ts` — `getUserTier(userId)` accounts for both a Stripe subscription and a gifted membership, and the tier is injected into the session by the `customSession` plugin in `lib/auth.ts`.

Entitlement is re-checked on **every** developer API request rather than cached into the key, so access tracks the subscription in real time; a lapsed subscription stops working immediately rather than at the next key rotation. See [Authentication](../developer-api/authentication.md).

## Redirects worth knowing

Several economy URLs are permanent redirects kept alive after a rename — `/wallet` → `/predictions`, `/market` → `/store`, `/leaderboard` → `/arcade`, `/events` → `/communities`. They are listed as redirects in the [page inventory](./pages.md). Don't "clean them up": they're load-bearing for existing links.

# Trading cards, badges and inventory — design (Phase B of the Steam library)

Status: approved scope (owner asked for "community market with RMH coins and trading cards").
This phase adds cards, badges and the inventory. It moves **no coins**: the market and
trade offers are Phase C and will list cards that exist from this phase.

## Model (Steam's, trimmed)

- Every title that tracks playtime (`isTrackableTitle`) has a **set of 6 cards**. A card is
  `(gameId, cardIndex 0..5)`; names come from a fixed pool, chosen per title by a hash, so
  there is nothing to author and nothing to keep in sync with the catalog.
- **Drops come from playtime**, like Steam: a title drops one card per 30 minutes of
  credited play, at most 3 per account per title. Which card is deterministic per
  `(userId, gameId, dropIndex)` through a per-user permutation of the set, so the three drops
  are distinct and a user cannot reroll by replaying. One drop in 20 is **foil**
  (also deterministic).
- **Badges**: holding all 6 cards (same finish) lets you craft the title's badge, consuming
  one of each. Normal badges level 1 to 5; a foil badge is one level. Crafting awards XP
  (100 per normal level, 400 for foil) through `awardXp`, which is what moves the account
  level shown on profiles.
- **Inventory** is the stack of cards you own, plus your badges.

## Data (new tables, composite keys, no surrogate ids)

- `UserCard (userId, gameId, cardIndex, foil) → count` — stackable, `CHECK (count > 0)`.
  The existing `UserInventory` is unique per item and cannot stack.
- `CardDrop (userId, gameId, dropIndex) → cardIndex, foil, createdAt` — the idempotency key:
  a drop is granted exactly once however many heartbeats race.
- `GameBadge (userId, gameId, foil) → level, craftedAt`.
- All cascade on user delete, and account deletion erases them explicitly (it anonymises the
  user row, so cascades never fire). Included in the data export.

## Rules that must hold

1. A drop is granted at most once per `(user, title, dropIndex)` (primary key) and never more
   than 3 per title, whatever the playtime.
2. Drops need real playtime: they are computed from `GamePlaytime.totalSeconds`, which the
   heartbeat already limits to one real-time clock per user.
3. Crafting is one transaction under the user's advisory lock: it re-reads counts, refuses if
   any card is missing or the badge is maxed, decrements, and levels the badge. Two concurrent
   crafts cannot spend the same cards.
4. Pure logic (`lib/cards/`) has no I/O and is unit-tested; the server module is thin.
5. Cards are visible to others only through the profile's badge list; the card stack is private
   until Phase C lists items on the market.

## Surfaces

- Game page: **Trading cards** card (set progress, silhouettes for missing cards, drops left,
  Craft badge).
- `/games/inventory`: the user's cards grouped by title, and badges.
- Profile: **Badges** card.
- A card drop toasts from the playtime tracker.
- Card art is a deterministic SVG from the title's hue; foil carries a static rainbow edge.
  No animation (the Steam skin is flat).

## Not in this phase

Booster packs, gems, selling or trading (Phase C), badge showcase editing.

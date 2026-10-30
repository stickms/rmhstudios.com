# Community Market for trading cards — design (Phase C of the Steam library)

Status: approved scope (owner: "community market with RMH coins and trading cards").
This phase moves **coins**, so every movement goes through the ledger
(`transferCoins`, with `tx` and a burned fee), and every state change is one transaction.
It reuses the shop marketplace's proven shape (`lib/market/market.server.ts`) for cards.
Trade offers (card-for-card) are a follow-up phase.

## Model

Fixed-price **sell listings** of single cards, Steam-style: you list one card at an asking
price, buyers see the lowest price per card and buy it. A listing holds the card in
**escrow**: listing removes one card from the seller's stack in the same transaction that
creates the listing; cancelling returns it; a sale hands it to the buyer.

- `CardListing (id, sellerId, gameId, cardIndex, foil, priceCoins, status, buyerId?, createdAt, closedAt?)`.
  Status reuses `ListingStatus` (`ACTIVE`, `SOLD`, `CANCELED`; `HELD` is unused here).
  The price is immutable: to change it, cancel and relist.
- Price bounds 10 to 5,000 coins (10 keeps the burned fee at 1 or more). Ten percent fee, burned (`marketFee`), as the shop market.

## Invariants (each has a test)

1. **A card is in exactly one place.** Stack, or one ACTIVE listing, or (after a sale) the
   buyer's stack. Listing = decrement stack + create listing, one transaction; a stack that
   reaches zero is deleted, never negative (`CHECK count > 0`).
2. **A listing sells at most once.** The claim is `updateMany where status = ACTIVE`; the loser
   of a race sees count 0 and the whole transaction rolls back (no coins, no card).
3. **Coins are conserved with a burn.** Buyer pays `price`; the seller receives `price - fee`;
   `fee` is a recorded SINK row. One `transferCoins({ tx, fee, type: 'MARKET' })`, so summing the
   ledger reproduces every balance (`reconcileUser`), and the seller's proceeds are typed
   `MARKET`, which creator earnings exclude (no coins-to-cash laundering path).
4. **Insufficient coins rolls everything back**: the card stays in escrow, the listing stays
   ACTIVE.
5. **Nobody buys their own listing**, and only the seller can cancel, and only while ACTIVE.
6. **Seller gates**: level 3+ and an account 7+ days old (the shop market's gates), and at most
   25 active card listings, so a fresh bot account cannot farm drops straight into coins.
7. **Fat-finger guard**: a price at or above ten times the 30-day median of recent sales of
   that exact card (once there are three sales) is refused at listing time.

## Surfaces

- `/games/market`: every card on sale, grouped per card with the lowest price and the count;
  Buy lowest; your own listings with Cancel; filter by title. Reads are public, writes need
  sign-in.
- Inventory: a **Sell** control on each card stack (price, then confirm).
- APIs: `POST /api/games/market/{list,buy,cancel}` under `defineHandler`, `rateLimit: 'write'`.

## Data lifecycle

- Account deletion removes the account's ACTIVE listings (their escrowed cards are erased with
  the rest of the inventory); finished sales stay as anonymous price history.
- The data export includes the account's listings as seller or buyer.
- `card_listing` indexes serve browse (`status, gameId, cardIndex, foil, priceCoins`) and "my
  listings" (`sellerId, status`).

## Not in this phase

Buy orders, price-history charts, trade offers, partial quantities per listing.

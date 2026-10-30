# Market depth — design (E2)

Adds to the card market (see 2026-10-30-card-market-design.md): a page per card, a price
history, and **buy orders**.

## Buy orders are custody-free

A buy order is a standing instruction: "buy this card for up to N coins". **No coins are held
for it.** The buyer's balance is checked only when the order fills, and a fill is the same
sale transaction as a normal purchase (`settleSale`): claim the listing, one
`transferCoins({ tx, fee, type: 'MARKET' })`, hand over the card. That means no new coin
custody path, no escrow to leak or refund, and the ledger identity is untouched.

- An order fills at the **listing's price** (so a bid of 200 against a listing of 120 pays 120).
- It fills when it is placed (against the cheapest listing at or below the bid, not the buyer's
  own) and when a listing is created (bids are tried highest price first, then oldest).
- A bidder who cannot afford the fill is skipped and the order stays open.
- One open order per member per card and 20 open orders per member. Prices are 10 to 5000, and
  the buyer must hold the price when placing it (it stops junk, it is not a hold).
- Cancelling an open order is free. Filled orders point at the listing that filled them.

## Invariants (each has a test)

1. An order fills at most once and a listing sells at most once: both claims are conditional
   `updateMany`; a lost claim rolls the whole fill back.
2. A fill moves coins and the card exactly as a purchase does (conservation with the burn).
3. An order never fills against its own buyer's listing.
4. An unaffordable bidder neither blocks the others nor loses their order.
5. Only the buyer cancels, and only while OPEN.

## Price history

Derived from SOLD listings (no new table): per day, the average, low, high and volume over
the last 30 days, and the median. Pure and tested; drawn as a small SVG chart.

## Surfaces

`/games/market/$gameId/$cardIndex?foil=1` (card page: listings with Buy, history, buy orders,
place an order), links from the market list; `POST /api/games/market/{order,order-cancel}`.
The buyer is notified when an order fills.

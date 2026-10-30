# Card trade offers — design (Phase C2 of the Steam library)

Card-for-card (or gift) offers between two members. **No coins move**, so nothing here
touches the ledger; the risk is cards: duplication, loss, or a card promised twice.

## Model

A proposer offers some of their cards (`give`) for some of the recipient's (`ask`). Steam does
not escrow a pending offer, and neither do we: both sides are re-checked at the moment of
acceptance, which is the only time cards move. An offer lives 14 days.

- `CardTrade (id, fromId, toId, status PENDING|ACCEPTED|DECLINED|CANCELED, createdAt, closedAt?, expiresAt)`.
- `CardTradeItem (tradeId, fromGives, gameId, cardIndex, foil, qty)`; `fromGives` is true when
  the proposer gives that card, false when they ask for it.

## Invariants (each has a test)

1. **Accepting is one transaction under both users' card locks**, taken in sorted id order so two
   trades between the same pair cannot deadlock. It re-reads every stack, refuses if either side
   no longer holds what was offered, then moves every card. Cards are conserved: what leaves a
   stack arrives in the other.
2. **An offer resolves once**: the claim is `updateMany where status = PENDING`; a second accept,
   or an accept racing a cancel, loses and rolls back.
3. **Only the recipient accepts or declines; only the proposer cancels**, only while PENDING.
4. **An expired offer cannot be accepted.**
5. **Offers are bounded**: no empty offer, at most 6 distinct cards and 10 of each per side, at
   most 20 pending offers per proposer, no offer to yourself.
6. **Spam control**: you can only send an offer to someone you follow or who follows you
   (this model's "friends"). The partner's tradable stacks are shown to the proposer while
   composing, and only then.
7. A trade that would hand over a card the giver does not hold fails whole: nothing moves.

## Surfaces

- `/games/trades`: incoming (Accept, Decline), outgoing (Cancel), recent history.
- `/games/trades/new/$id`: pick cards from both inventories and send.
- A Trade button on a profile you may trade with.
- `POST /api/games/trades/{propose,accept,decline,cancel}` under `defineHandler`, rate limited.

## Data lifecycle

Account deletion removes the account's PENDING offers (both directions); finished trades stay
as anonymous history. Included in the data export.

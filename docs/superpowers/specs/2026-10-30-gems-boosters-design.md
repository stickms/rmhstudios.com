# Gems and booster packs — design (E7)

Steam's other half of the card economy: turn cards you do not need into **gems**, spend gems
on a **booster pack** of a title's cards. This changes card supply, so the rules are stated
and tested.

## Rules

- **Unpack**: destroy cards for gems: 10 gems per normal card, 40 per foil.
- **Booster pack**: costs 100 gems, gives 3 cards of the title you pick, each drawn at random
  from the title's six, one in twenty foil (the drop rate). Duplicates are possible.
- **Buy gems with coins**: 100 gems for 100 coins, in units of 100. The coins are a **sink**
  (`debitCoins`, type PURCHASE, in the same transaction that credits the gems), so this adds a
  coin sink and mints no coins.
- Gems cannot be traded or sold. They only move between a member and the system, so there is no
  new member-to-member transfer to launder through.

## Why this cannot inflate coins

Coins only leave the economy here (the gem purchase). Cards entering via packs are paid for in
gems, which come from destroyed cards or burned coins. One pack (100 gems) is worth ten destroyed
cards and yields three, so converting cards is deflationary for cards; buying with coins turns
a sink into a card faucet, and selling those cards on the market pays the seller 90% of the price
paid by another member, so no coins are created. Gem value (1 coin) against the market's minimum
price (10 coins per card) keeps packs from undercutting the market below its floor.

## Invariants (each has a test)

1. **A card is destroyed once**: unpacking decrements the stack and credits gems in one
   transaction under the card lock; you cannot unpack more than you hold; a stack at zero is deleted.
2. **Gems never go negative**: the pack and the unpack-free paths debit with a conditional update
   (`gems >= cost`); two packs racing for one pack's worth of gems, only one succeeds.
3. **The coin debit and the gem credit commit together**: an insufficient balance rolls back both.
4. **Every gem movement has a ledger row** (`gem_entry`), so the balance is explainable by summing.
5. **Packs are fair and injectable**: the draw takes a random source (tests use a fixed one);
   production uses the crypto RNG. Cards drawn are always from the chosen title's set.

## Surfaces

`/games/inventory`: a Gems panel (balance, buy, open a pack for a title you choose) and a
Turn into gems control on each card. `POST /api/games/gems/{unpack,pack,buy}`.
Registered in the coin-flow inventory as a coin sink; erased on deletion; in the export.

# 01 — Roll for the table

Surface: RMHCharacters party view (`#p=<id>`), the sheets' roll buttons while a party is open, a "Table rolls" log.
Wave 1. Namespace `party-rolls`. App tier (L8).

## User story

As a player in an RMHCharacters party, I want to make a roll the whole table sees, rolled by the site from my real
sheet, so that the game master can trust the number without asking me to read my dice aloud; and as the game master, I
want to roll in secret and to see a player's secret roll, so that hidden checks stay hidden.

## Requirements elicitation

- **What exists (verified):**
  - Sprint 11 02 put rolls on both sheets (`features/rmhcharacters/engine/rolls.ts`: `rollD20`, `rollDamage`,
    `rollFree`, `degreeOfSuccess`, `withinSheetLimits`, `SHEET_MAX_DICE = 50`, `SHEET_MAX_SIDES = 100`;
    `ui/RollButton.tsx`, `ui/RollBar.tsx`, `ui/RollLog.tsx`, `ui/useRolls.tsx`). They run in the browser on
    `crypto.getRandomValues` and are kept in a 50-roll log on the device (`engine/roll-log.ts`); nothing reaches the
    server. Sprint 11's design pass left "shared rolls" for later because it needs a decision about who sees which roll
    (sprint 11 README, "Rejected ideas": "Shared roll log in a party").
  - Sprint 11 03 added parties (`RmhCharacterParty`, `RmhCharacterPartyMember` in `prisma/schema/rmhcharacters.prisma`;
    `engine/party.server.ts`: `getParty`, `listParties`, `joinParty`, `readPartySheet`, `characterPartyErasureOps`,
    `exportCharacterParties`; `ui/PartyView.tsx`, `ui/useParty.ts` polling every `PARTY_REFETCH_MS = 20_000` while the
    page is visible). A party member row points at the player's own `RmhCharacter`; every read re-checks membership.
  - The rules engines are pure and run anywhere (`engine/dnd5e/rules.ts`: `skillLines`, `attacks`, `initiative`;
    `engine/pf2e/rules.ts`: `skillLines`, `strikes`, `perception`, `save`), so the server can compute a modifier from
    the stored sheet instead of trusting one sent by the client.
  - The Toolbox dice parser (`lib/toolbox/dice.ts`) parses free notation; `rolls.ts` already reuses it.
- **Decisions (taken by default, recorded in the README):**
  - **The server rolls.** A table roll is a request naming what to roll (`{ kind: 'skill', key: 'stealth' }`,
    `{ kind: 'save', ability: 'dex' }`, `{ kind: 'attack', index: 0 }`, `{ kind: 'damage', index: 0, critical }`,
    `{ kind: 'initiative' }`, `{ kind: 'perception' }`, `{ kind: 'strike', index, map: 0 | 1 | 2 }`,
    `{ kind: 'free', notation }`), plus `mode` (normal, advantage, disadvantage). The server reads the member's own
    character in that party, computes the modifier with the same engine functions the sheet uses, rolls with
    `node:crypto`, and stores the dice, the modifier and the total. A client never sends a modifier or a result.
  - **Who sees a roll:** `table` (every current member, the default), `gm` (a player's roll only the roller and the game
    master see), `secret` (the game master's own roll that only the game master sees). PF2e degrees of success appear
    only when the game master sets a DC on a `gm` or `secret` roll; a player never sets one.
  - **The log:** the newest 200 rolls per party are kept (older ones are trimmed in the same transaction as the
    insert); the view shows the newest 50 the viewer may see, and asks for new ones every 5 seconds while the party view
    is visible (`refetchIntervalInBackground: false`), with "Show earlier".
  - **Names:** a roll stores `characterId` and `userId`, never a copied name; the view joins the character's current
    name, so a renamed or deleted character never leaves an old name behind. A roll whose character has left the party
    shows "A character who left".
  - **Local rolls stay:** the device-only log from sprint 11 02 is unchanged. "Roll for the table" is a switch on the
    sheet's roll bar that appears only while the sheet is opened from a party; off by default each time.
  - **Limits:** 30 table rolls a minute per member (`rateLimit`); free notation within `SHEET_MAX_DICE` and
    `SHEET_MAX_SIDES`.
  - **Erasure:** the member's rolls in any party are erased; rolls in a party the member runs go with the party (sprint
    11 03 deletes it). **Export:** the member's own rolls (party name, what was rolled, dice, total, time).

## Functional requirements

1. FR-1 Model `RmhCharacterPartyRoll` (migration `20261202010100_s12_party_rolls`), back-relation on `User` under the
   Wave 0 anchor.
2. FR-2 `features/rmhcharacters/engine/party-rolls.ts` (pure): the request schema's shape check,
   `modifierFor(character, request, data)` over both engines, `visibleTo(roll, viewer)`; `party-rolls-schema.ts` (zod);
   `party-rolls.contract.ts`.
3. FR-3 `features/rmhcharacters/engine/party-rolls.server.ts`: `rollForParty` (membership, character in that party,
   modifier from the stored sheet, `node:crypto` dice, insert and trim under `lockKey(tx, 'party-rolls:<partyId>')`),
   `listPartyRolls` (visibility filtered in the query), `partyRollErasureOps`, `exportPartyRolls`.
4. FR-4 Registered endpoints `features/rmhcharacters/api/rmhcharacters.parties.$id.rolls.server.ts` (GET with
   `after` keyset, POST `rateLimit: { limit: 30, windowMs: 60_000, prefix: 'party-rolls' }`).
5. FR-5 UI: `ui/TableRolls.tsx` (the log, on `PartyView.tsx`), the "Roll for the table" switch and visibility choice in
   `RollBar.tsx`, the game master's DC field; each new row arrives through `components/ui/arrive.tsx`.
6. FR-6 Refusals: `PARTY_ROLL_NOT_MEMBER` is not needed (`NOT_FOUND` for a party the caller is not in);
   `PARTY_ROLL_NO_CHARACTER` ("Bring a character to this party to roll") under the Wave 0 refusal anchor.
7. FR-7 Erasure, registry (`RmhCharacterPartyRoll`: `erase`), export (`partyRolls` under the sprint 12 export anchor).

## Non-functional requirements

- **Integrity:** the total is the server's; a test sends a forged `modifier` field and sees it ignored.
- **Privacy:** a `gm` roll is never in another player's response; a `secret` roll never in any player's response. A
  removed member's next read is 404.
- **Accessibility:** each new roll is read by a polite live region once ("Ada rolled Stealth: 17"); names in `<bdi>`.
- **Performance:** one indexed query per poll (`@@index([partyId, createdAt])`); no poll while hidden.

## Data model and API

- `RmhCharacterPartyRoll` (`@@map("rmh_character_party_roll")`): `id`, `partyId` → `RmhCharacterParty`
  (`onDelete: Cascade`), `userId` → `User` (relation `RmhCharacterPartyRolls`), `characterId String?` (no relation: a
  character that leaves keeps no tie), `kind` `@db.VarChar(12)`, `label` `@db.VarChar(40)` (a rules key such as
  `stealth`, never free text), `notation` `@db.VarChar(64)`, `dice Int[]`, `modifier Int`, `total Int`, `mode`
  `@db.VarChar(12)`, `visibility` `@db.VarChar(6)`, `dc Int?`, `degree` `@db.VarChar(16)?`, `createdAt`;
  `@@index([partyId, createdAt])`, `@@index([userId])`.
- `GET /api/rmhcharacters/parties/$id/rolls?after=<cursor>` → `{ rolls: PartyRoll[], next }`;
  `POST /api/rmhcharacters/parties/$id/rolls` → the stored roll.

## Testing requirements

- Main suite `features/rmhcharacters/api/__tests__/party-rolls.server.test.ts`: a non-member gets 404; a member without
  a character is refused with the code; the modifier comes from the stored sheet (a forged one is ignored); `gm` and
  `secret` visibility per viewer; only the game master may set a DC; the trim keeps 200; the rate limit.
- Product suite `features/rmhcharacters/engine/__tests__/party-rolls.product.test.ts`: `modifierFor` for 5e skills,
  saves, attacks, initiative and PF2e Perception and strikes with the multiple attack penalty, against the sheet's own
  numbers (`skillLines`, `strikes`).
- Main suite `lib/account/__tests__/party-rolls-erasure.test.ts` (copy `study-erasure.test.ts`).
- `features/rmhcharacters/ui/__tests__/table-rolls.test.tsx` (`renderToStaticMarkup`): a roll of a character who left;
  names in `<bdi>`.
- Gates: route table, user-text direction, error-code catalogue, export test, erasure coverage, feature manifests.

## Acceptance criteria

- [ ] A player rolls Stealth "for the table" from the sheet opened in a party; every member sees the same total within
      5 seconds, and it matches the sheet's modifier.
- [ ] The game master's secret roll is in no player's response.
- [ ] A forged modifier in the request changes nothing.
- [ ] A removed player can no longer read the log.

## Out of scope

Dice animation, rolls in a chat, rolls through the developer API (13 reads characters and parties only), rolls
outside a party (sprint 11 02's device log covers them).

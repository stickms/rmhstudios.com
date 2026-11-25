# 03 — A party for your table

Surface: RMHCharacters (`/rmhcharacters`): a Parties view beside the roster, the party page in the app (`#p=<id>`), the
join link `/rmhcharacters?party=<code>`. Wave 4. Namespace `character-party`. App tier (L8).

## User story

As the person running a game, I want my players to bring their RMHCharacters sheets into one party, so that I can see
everyone's armour class, hit points, conditions and passive Perception at a glance and keep the turn order, without
asking each player to read their sheet out loud.

## Requirements elicitation

- **What exists (verified):**
  - A character is one `RmhCharacter` row (`prisma/schema/rmhcharacters.prisma`): `id` (client-made), `userId`,
    `system`, `name`, `data` (the normalised sheet), written only through the owner-scoped endpoints
    (`features/rmhcharacters/api/rmhcharacters.characters*.server.ts`, which check ownership on every write). The
    erasure registry says "private (only the owner-scoped character API reads them)".
  - The rules engines compute armour class, maximum HP, passive values, speed, initiative and spell slots from a sheet
    (`engine/dnd5e/rules.ts`: `armorClass`, `maxHp`, `initiative`, `speed`, `spellSlots`, `skillLines`;
    `engine/pf2e/rules.ts`: `armorClass`, `maxHp`, `perception`, `speed`, `save`, `classDc`). Current HP, temporary HP
    and conditions live on the sheet (`CharacterBase.hp`, `conditions`).
  - There is no way for anyone but the owner to see a character, and nothing groups characters.
- **Decisions:**
  - **A party** has a game master (its creator), a name (up to 60 characters), a system (`dnd5e` or `pf2e`) and an
    invite code. Up to 8 players; a member runs at most 10 parties and plays in at most 20.
  - **Joining:** the invite link opens RMHCharacters with a join line ("Join Tuesday Night as …") and the member picks
    one of their characters of the party's system. Refused: a member blocked by the game master or blocking them
    (`UserBlock`, either direction), an account under a ban (`bannedUntil` in the future), a full party, the wrong
    system. The game master can change the code (old links stop working) and remove a player; a player can swap their
    character or leave.
  - **What is shared, and the player chooses:** only the character a player brought, only with that party, only while
    they are in it. The join screen says exactly what the party will see before the player confirms. Every party member
    sees the **party summary** of each character: name, class and level (or ancestry, class and level), AC, current,
    maximum and temporary HP, conditions, passive Perception (5e) or Perception (PF2e), speed and initiative bonus;
    never the portrait, `playerName`, appearance, personality, backstory, notes, inventory or currency. A player may
    also choose **"Let the game master open my full sheet"** (a switch on the join screen and on the party page, **off
    by default**, stored on the membership as `sheetShared`); only then does the game master open that sheet read-only
    (the existing sheet components in a read-only mode: no edit control, no roll log write), and even then the server
    removes `notes` (the player's private notes) and `portrait` before returning it. Turning the switch off, leaving,
    being removed or swapping removes access at once, because every read is checked against the membership row. The game
    master's own character, if they bring one, follows the same rule.
  - **The summary is computed on the server** from `RmhCharacter.data` with the same rules engines (the data sets load
    through `engine/data.ts`'s dynamic imports, which run on the server as the advisor's do), so a player never receives
    another player's raw sheet JSON; only the game master's read-only view returns one sheet, of a current member who
    shared it, with `notes` and `portrait` removed. Reads of the character go through one function (`readPartySheet`) so
    no second path returns `data`.
  - **Turn order:** the game master keeps an initiative list (the party's characters plus up to 20 named extras such as
    "Goblin 1", each with a number), sorts it, marks whose turn it is and advances; players read it. It is stored on the
    party (`initiative` JSON, at most 28 entries), written only by the game master.
  - **Freshness:** the party page refetches every 20 seconds while it is visible (React Query `refetchInterval`, paused
    when the document is hidden) and on focus; no socket.
  - **No notices:** a join appears on the party page; nothing is sent to the inbox (a join is not urgent and the game
    master is usually in the room).
  - **No report path:** a party's name and extras are seen only by its members, who can leave or block; recorded.
  - **Erasure:** parties the member runs are deleted (their players' characters are untouched); the member's memberships
    are deleted. **Export:** parties run (name, system, created, the extras' names) and memberships (party name,
    character id, joined).

## Functional requirements

1. FR-1 Models `RmhCharacterParty` and `RmhCharacterPartyMember`; caps under `lockKey(tx, 'character-party:<id>')` and
   `lockKey(tx, 'character-party-owner:<userId>')`.
2. FR-2 `features/rmhcharacters/engine/party-summary.ts` (pure): `partySummary(character, data)` for both systems.
3. FR-3 `features/rmhcharacters/api/party*.server.ts` registered endpoints with contracts in `engine/party.contract.ts`:
   create, list mine, get one (members only), join by code, leave, swap character, remove player, rotate code, rename,
   delete, read a player's sheet (game master only, and only a member with `sheetShared`), set my sharing (the member
   only), write the turn order (game master only). Writes `rateLimit: 'write'`; a refused read is 404 whatever the
   reason.
4. FR-4 UI: `ui/Parties.tsx` (list and create), `ui/PartyView.tsx` (summary rows, turn order), `ui/JoinParty.tsx`,
   read-only mode on `Sheet5e` / `SheetPf2e` (a `readOnly` prop that hides every control that writes).
5. FR-5 The roster gains a "Parties" entry; the app reads `#p=<id>` beside today's `#c=<id>`.
6. FR-6 Erasure operations, registry entries and the export section under the anchors.

## Non-functional requirements

- **Privacy:** a non-member gets 404 for every party read; the summary endpoint never returns `data`; a removed player's
  sheet is unreadable on the next request (no cache: `Cache-Control: private, no-store`).
- **Performance:** one party read loads at most 8 characters and computes summaries in memory.
- **Accessibility:** the summary is a table with header cells; the current turn is marked with text, not only colour.

## Data model and API

- `RmhCharacterParty` (`@@map("rmh_character_party")`: `id`, `ownerId` → `User` (relation `RmhCharacterPartiesRun`),
  `name` `@db.VarChar(60)`, `system` `@db.VarChar(8)`, `inviteCode` `@unique @db.VarChar(16)`,
  `initiative Json @default("[]")`, `turnIndex Int @default(0)`, `createdAt`, `updatedAt`, `@@index([ownerId])`) and
  `RmhCharacterPartyMember` (`@@map("rmh_character_party_member")`: `partyId` → party (cascade), `userId` → `User`
  (relation `RmhCharacterPartyMemberships`), `characterId` → `RmhCharacter` (`onDelete: Cascade`: deleting the character
  leaves the party), `sheetShared Boolean @default(false)`, `joinedAt`, `@@id([partyId, userId])`, `@@index([userId])`,
  `@@index([characterId])`) in `prisma/schema/rmhcharacters.prisma`. Migration `20261201040100_s11_character_party`.
- Erasure registry: both `erase`.

## Testing requirements

- Main suite `features/rmhcharacters/api/__tests__/party.server.test.ts`: non-member 404 on every read; the summary
  carries no `data`, portrait, notes or `playerName`; only the game master reads a sheet, only of a member with
  `sheetShared` on, and the sheet comes back without `notes` or `portrait`; turning sharing off refuses the next read;
  only the game master writes the order; blocks either way and bans refuse a join; caps under the lock; leaving revokes
  the sheet read; wrong system refused; a rotated code refuses the old one.
- Product suite `features/rmhcharacters/engine/__tests__/party-summary.product.test.ts`: summary values equal the rules
  engines' for a fixture of each system.
- Main suite `lib/account/__tests__/character-party-erasure.test.ts`: parties run and memberships erased, other members'
  characters untouched.
- Component (`renderToStaticMarkup`) `features/rmhcharacters/ui/__tests__/party-view.test.tsx`: the table headers, the
  current-turn text, the read-only sheet has no input.
- Route table, erasure coverage, export test, escape-hatch and `useEffect` ratchets.

## Acceptance criteria

- [ ] A game master creates a party, two players join with their 5e characters, and the game master sees both ACs, HPs
      and passive Perceptions.
- [ ] A player who leaves disappears from the summary and their sheet can no longer be opened by the game master.
- [ ] A player who has not turned on "Let the game master open my full sheet" appears in the summary only; the game
      master's request for their sheet answers 404.
- [ ] A member the game master has blocked cannot join with the link.
- [ ] The turn order the game master sets is what the players see after the next refetch.

## Out of scope

Shared dice rolls, chat, maps or tokens, an encounter builder with monster statistics, players editing each other's
sheets, cross-system parties.

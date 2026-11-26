# 11 — Track class resources, and take a short rest that spends Hit Dice, in RMHCharacters

Surface: the D&D 5e character sheet in RMHCharacters (`/rmhcharacters`, "Class resources" and the rest buttons), the
party view's shared sheet. Wave 3. Namespace `character-resources`. App tier (L8; RMHCharacters' own look).

## User story

As a player running a barbarian or a cleric at the table, I want to tick off a Rage or a Channel Divinity when I use
it and have a rest give back exactly what that rest restores, and I want a short rest to let me spend Hit Dice and
roll the healing, so that the sheet keeps track of my uses instead of my scrap paper.

## Requirements elicitation

- **What exists (verified):**
  - Class resources are data: each class in `features/rmhcharacters/engine/dnd5e/data/classes.ts` lists `resources`
    (`name`, `values` by level, `recharge` text such as `'Long Rest'`, `'Short Rest'`,
    `'Long Rest (one use back on a Short Rest)'`, `'Long Rest (Short Rest from level 5)'`). `resources(c, data)`
    (`features/rmhcharacters/engine/dnd5e/rules.ts`) turns them into `{ name, value, recharge }` strings, and
    `features/rmhcharacters/ui/dnd5e/Sheet5e.tsx` shows each as a read-only `StatRow` ("Class resources"): the maximum,
    never how many are left.
  - The character (`Dnd5eCharacter`, `features/rmhcharacters/engine/types.ts`) tracks `spells.slotsUsed`,
    `pactSlotsUsed`, `hitDiceUsed`, death saves and exhaustion, but no resource uses. Old saves are normalised on load
    (`features/rmhcharacters/engine/factory.ts`, which clamps every number it restores).
  - **Long Rest** (in `Sheet5e.tsx`) restores HP, half the Hit Dice, all slots, one exhaustion and the death saves.
    **Short Rest** only clears `pactSlotsUsed`: it spends no Hit Dice and restores no short-rest resource.
  - Hit Dice and dice rolls already exist: `R.hitDice(c, d)` and the roll engine
    (`features/rmhcharacters/engine/rolls.ts`, `RollButton.tsx`, `RollLog.tsx`; party rolls are shared through
    `party-rolls.server.ts`).
  - Characters are stored as JSON on `RmhCharacter` (`prisma/schema/rmhcharacters.prisma`) through
    `features/rmhcharacters/api/rmhcharacters.characters.$id.server.ts`, and are already exported and erased.
- **Decisions:**
  - **Uses are stored by resource name**, `resourcesUsed: Record<string, number>` on `Dnd5eCharacter` (names are stable
    data keys), normalised by `factory.ts` (unknown names dropped on load, each clamped to 0..its maximum).
  - **Only counted resources are tracked:** a resource whose value is a number gets a stepper ("2 of 3 left"); a die
    value ("d8") stays a read-only row.
  - **Recharge is parsed once**, by a pure `rechargeRule(recharge, classLevel)` returning what a short and a long rest
    give back (`all`, `one`, `none`); unknown text is treated as long-rest-all and listed in a test so new data is
    noticed.
  - **Long Rest** also resets every resource.
  - **Short Rest** opens a small dialog (`components/ui/dialog.tsx`): how many Hit Dice to spend (0 to available, per
    die size for a multiclass character), "Roll" rolls each through the existing roll engine (adding the Constitution
    modifier, at least 1 per die as the 2024 rules allow), shows the total and adds it to current HP up to the maximum;
    then short-rest resources and pact slots recover. The rolls appear in the roll log and, in a party, in the shared
    table rolls like any other roll.
  - **The GM's view:** a sheet shared with the party shows resources left, read-only, as the rest of the sheet is.
  - **PF2e** is unchanged (its focus points are a different rule; out of scope).

## Functional requirements

1. FR-1 `features/rmhcharacters/engine/types.ts`: `resourcesUsed`; `factory.ts` creates `{}` and normalises it.
2. FR-2 `features/rmhcharacters/engine/dnd5e/rest.ts` (new, pure): `rechargeRule`, `applyLongRest`, `applyShortRest`
   (given the rolled healing), `trackableResources(c, data)`.
3. FR-3 `features/rmhcharacters/ui/dnd5e/Sheet5e.tsx`: steppers on counted resources; Long Rest through
   `applyLongRest`; Short Rest opens `ShortRestDialog.tsx` (new, `features/rmhcharacters/ui/dnd5e/`).
4. FR-4 The roll engine records each Hit Die roll with the label "Hit Die" (key in the namespace).
5. FR-5 The party sheet view shows resources left for shared sheets.

## Non-functional requirements

- **Pure rules, tested:** the rest functions take a character and return a new one; the sheet only calls them.
- **Saved as today:** no new endpoint; the character `PUT` carries the new field (check its zod schema in
  `features/rmhcharacters/engine/characters-schema.ts` accepts it; extend it if it is strict).
- **No schema change** (JSON column).
- **Accessibility:** each stepper is labelled with the resource name and announces "2 of 3 left"; the dialog's
  roll result is announced politely.
- **Phones at 390 px:** a resource row's stepper must not cover the resource's name; check it.

## Testing requirements

- Product suite `features/rmhcharacters/engine/__tests__/rest.product.test.ts`: every distinct `recharge` text in the
  class data maps to a known rule (the test fails on new text); short and long rest outcomes on worked examples
  (a level 6 barbarian, a level 5 bard, a multiclass fighter/warlock); Hit Dice never below zero, HP never over max.
- Main suite `features/rmhcharacters/engine/__tests__/resources-normalise.test.ts`: old saves load with `{}`, unknown
  names drop, values clamp.
- The existing RMHCharacters suites (`features/rmhcharacters/engine/__tests__/`, `features/rmhcharacters/ui/__tests__/`).

## Acceptance criteria

- [ ] A barbarian's sheet shows "Rages 3 of 3 left"; using two leaves 1, and a long rest restores 3.
- [ ] A short rest restores one Channel Divinity use for a cleric and all Warlock pact slots.
- [ ] A short rest can spend two Hit Dice, rolls them with the Constitution modifier, and heals up to the maximum.
- [ ] A character saved before this feature opens with every resource full.

## Out of scope

PF2e focus points and refocus, automatic resting for a whole party, per-feature uses not in the class resource data.

# 02 — Roll from the character sheet

Surface: the RMHCharacters sheet (`/rmhcharacters#c=<id>`), D&D 5e and Pathfinder 2e. Wave 2. Namespace
`character-rolls`. App tier (L8): RMHCharacters keeps its own look.

## User story

As a player at a table, I want to tap a skill, a save or an attack on my sheet and get the roll with my modifiers
already added, with advantage when I have it, so that I can play from the sheet without a separate dice app or doing the
arithmetic in my head.

## Requirements elicitation

- **What exists (verified):**
  - The rules engines compute every number a roll needs: 5e `skillLines`, `saveProficiencies`, `abilityScores` and
    `abilityMod`, `initiative`, `attacks` (`AttackLine` with `damage` such as `1d8` and `damageType`)
    (`features/rmhcharacters/engine/dnd5e/rules.ts`); PF2e `skillLines`, `save`, `perception`, `strikes` (`StrikeLine`)
    and `classDc` (`engine/pf2e/rules.ts`).
  - The sheets (`ui/dnd5e/Sheet5e.tsx`, `ui/pf2e/SheetPf2e.tsx`) show those modifiers as text. Nothing rolls: the only
    "roll" in the app is a typed HP roll at level-up (`LevelUp5e.tsx`), and exhaustion's note says "−n to every d20
    test" without applying it to anything.
  - Characters are saved to the account (`RmhCharacter.data`); the app has no device storage of its own for rolls.
  - **A dice engine already exists:** the Toolbox's dice roller (sprint 01 19, `/tools/dice`) is `lib/toolbox/dice.ts`
    (`parseDice`, `roll`, `formatDice`, `range`: `NdM`, `kh`/`kl`/`dh`/`dl`, exploding `!`, `d%`, constants, with
    limits) over `lib/toolbox/random.ts` (`randomInt`: `crypto.getRandomValues` with rejection sampling, an injectable
    `WordSource`), tested in `lib/toolbox/__tests__/dice.test.ts` (the Toolbox suite). Group chats roll with `/roll`
    (`lib/chat-plus/commands.ts`). The sheets reuse that engine; they do not get a second parser.
- **Decisions:**
  - **Rollable lines:** every ability check, saving throw, skill, initiative and attack (to hit, then its damage) on
    both sheets, and PF2e's Perception and strikes (the multiple attack penalty as a choice: first, second, third
    attack). A roll button sits on the line's value; the line itself is unchanged.
  - **Modes (5e):** Normal, Advantage, Disadvantage as a three-way control above the sheet, reset to Normal after each
    roll unless pinned. Exhaustion's −2 per level (2024 rules, as the sheet's note says) is applied to every d20 test
    and shown in the breakdown.
  - **Criticals:** 5e: a natural 20 on an attack is a critical hit and its damage roll doubles the dice; a natural 1
    misses. PF2e: when the member enters a DC, the result says the degree of success (±10 and the natural 20 / natural 1
    step), otherwise the total only.
  - **The result line** shows the dice faces, the modifier breakdown and the total ("d20 (14) + 5 = 19"), is announced
    in a polite live region, and can be copied as text.
  - **A free roll box** takes the Toolbox's notation through `parseDice`, with a tighter sheet limit checked after the
    parse: at most 50 dice in all and faces up to 100 (the Toolbox allows 1,000 and 10,000). A refusal names what is
    wrong from `parseDice`'s own error (`syntax`, `too-many-dice`, …) or the sheet limit, translated in this namespace.
  - **Randomness:** `roll()` and `randomInt` from the Toolbox (`crypto.getRandomValues` with rejection sampling); a
    seeded `WordSource` only in tests. A d20 test is `roll(parseDice('1d20'))` (or `2d20kh1` / `2d20kl1`).
  - **The roll log** keeps the last 50 rolls per character on this device only (never sent to the server, never on the
    account), with "Clear log". The key is listed in the device-data registry as personal.
  - **Nothing is shared:** rolls are private to the device. Sharing a roll with a party is out of scope (03 builds the
    party; a shared roll log would need its own privacy decision).

## Functional requirements

1. FR-1 No new parser: `lib/toolbox/dice.ts` is imported as it is (not edited); `engine/rolls.ts` adds only the sheet
   limit (`withinSheetLimits(terms)`).
2. FR-2 `features/rmhcharacters/engine/rolls.ts` (pure): build a roll from a sheet line for each system (d20 tests,
   attacks with the critical rule, damage, PF2e degrees of success against a DC) as Toolbox terms, roll them with an
   injected `WordSource`, and return the faces, kept dice, modifier breakdown and total.
3. FR-3 `ui/RollButton.tsx`, `ui/RollBar.tsx` (mode control and free roll box) and `ui/RollLog.tsx` (the log, copy and
   clear), wired into both sheets.
4. FR-4 The log store `engine/roll-log.ts` through `lib/core/persist` (`persisted`), keyed per character id, capped at
   50 entries, every read and write wrapped so a blocked store reads empty.

## Non-functional requirements

- **Accessibility:** each roll button's name says what it rolls ("Roll Stealth"); results are announced; the mode
  control is a labelled radio group; every control works from the keyboard.
- **Design:** app tier; no dice animation, no sound; the result appears at once.
- **Privacy:** no network request is made by a roll.

## Data model and API

- No schema change, no endpoint.
- New `engine/rolls.ts`, `engine/roll-log.ts`, `ui/RollButton.tsx`, `ui/RollBar.tsx`, `ui/RollLog.tsx`. Edits
  `ui/dnd5e/Sheet5e.tsx`, `ui/pf2e/SheetPf2e.tsx`, `lib/device-data/registry.ts` and
  `components/settings/device-data-labels.ts` (anchors).

## Testing requirements

- The Toolbox's own `lib/toolbox/__tests__/dice.test.ts` covers the grammar and the sampler; it stays green untouched.
- Product suite `features/rmhcharacters/engine/__tests__/rolls.product.test.ts`: the sheet limit (51 dice and a d101
  refused, `3d6+2` accepted, `3d6*2` refused as `syntax`); a skill roll's modifier equals the sheet's; advantage keeps
  the higher; exhaustion applies; a natural 20 attack doubles the damage dice; PF2e degrees of success across the four
  bands and the natural 20 / natural 1 step.
- Main suite `features/rmhcharacters/engine/__tests__/roll-log.test.ts`: cap at 50, per-character keys, a throwing store
  reads empty, nothing calls `fetch`.
- Device registry test, design and escape-hatch gates.

## Acceptance criteria

- [ ] On a 5e sheet with +5 Stealth, rolling Stealth with advantage shows two d20 faces, keeps the higher and adds 5.
- [ ] An attack that rolls a natural 20 offers "Roll critical damage" with doubled dice.
- [ ] `3d6+2` in the free box rolls; `3d6*2` is refused with a reason.
- [ ] The log survives a reload on the same device and is gone after "Clear log".

## Out of scope

Shared or party rolls, 3D dice, rolling from spells' damage text, custom dice macros.

# 11 — Keyboard shortcut settings

Surface: `/settings/keyboard`. Wave 5. Namespace `keyboard`. Accessibility (WCAG
2.2 success criterion 2.1.4, Character Key Shortcuts).

## User story

As a member who uses speech input, a switch device or a screen reader, I want to
turn off the site's single-letter shortcuts or move them behind a modifier, and
to remap any shortcut that clashes with my tools, so that stray keystrokes stop
navigating me away from what I am doing.

## Requirements elicitation

- **What exists (verified):** `components/site/KeyboardShortcuts.tsx` binds the
  site set (single keys like `n`, `?`, `/` and sequences like `g h`) with its
  own handler; `lib/shortcuts/registry.ts` mirrors them as `SITE_SHORTCUTS` with
  conflict checks (`lib/__tests__/shortcut-registry.test.ts`) and documents that
  the component should eventually dispatch from the registry. **There is no way
  to turn shortcuts off or change them**, which WCAG 2.1.4 requires for
  single-character shortcuts (turn off, remap to include a modifier, or active
  only on focus).
- **Decisions:** three modes for character-key shortcuts (any binding with no
  modifier: single keys and plain sequences like `g h`) — On (today's
  behaviour), Off, and "With Alt" (Alt on the first key; Option on macOS).
  Bindings that already use Ctrl/⌘ are unaffected by the mode. Any site shortcut
  can be remapped to another key or sequence; a remap that collides with another
  shortcut or a browser-reserved combination is refused with the name of the
  clash. Game shortcuts (`scope: 'game:*'`) are listed read-only: each
  full-screen game owns its controls (L8). Signed-out visitors keep their choice
  in `localStorage` (through `lib/core/persist.ts`); members have it stored
  server-side and applied on every device. The component is moved onto registry
  dispatch, finishing plan B4, so overrides apply in one place.

## Functional requirements

1. FR-1 `/settings/keyboard`: the mode for single-key shortcuts (radio group)
   and a table of every site shortcut — action, current keys, default keys,
   Change, Reset.
2. FR-2 Change opens a capture field that records the next key or two-key
   sequence (Escape cancels), shows conflicts before saving, and refuses
   `mod+w`, `mod+t`, `mod+n`, `mod+l`, `mod+r`, `mod+q`, Tab and Escape.
3. FR-3 Reset all.
4. FR-4 `KeyboardShortcuts.tsx` dispatches from the registry with the effective
   bindings (defaults → overrides → mode), and the help sheet (`?`, or its
   remapped key) lists the effective bindings.
5. FR-5 The settings hub (`lib/settings-nav.ts`) gains a Keyboard destination in
   the personalization group.
6. FR-6 Shortcuts never fire while focus is in an editable field (unchanged
   behaviour, now covered by a test).

## Non-functional requirements

- **Accessibility:** the page itself is fully operable without shortcuts; the
  capture field announces what it recorded; mode changes apply immediately
  without reload.
- **Performance:** the effective-bindings map is computed once per change, not
  per keystroke; no listener is added when everything is off.
- **Security:** overrides are validated server-side against the registry ids and
  a key grammar; at most 64 overrides; `rateLimit: 'write'`.
- **i18n:** strings in `keyboard`; key names rendered through a small key-label
  helper (⌘ on macOS, Ctrl elsewhere; Alt / Option).
- **Steel:** `PageLayout` + `SettingsPageBody`; the table is rows on rules; keys
  shown as `t-meta` mono in a 1px-bordered control-radius box (a key cap is a
  picture of a control, R3).

## Data model and API

- New model `KeyboardPreference` in `prisma/schema/profile.prisma`:
  `userId String @id`, `singleKeys String @default("on") @db.VarChar(8)`,
  `overrides Json @default("{}")`, `updatedAt DateTime @updatedAt`; cascades on
  user; `@@map("keyboard_preference")`.
- Migration `20261122050200_s02_keyboard_preferences`.
- Pure `lib/shortcuts/bindings.ts` (`effectiveBindings(defaults, prefs)`,
  `validateOverride`, `RESERVED`), plus a tiny client store
  `stores/keyboardPrefsStore.ts`.
- Contract `lib/preferences/keyboard.contract.ts` (its own file — do not edit
  `preferences.contract.ts`); endpoints `GET/PUT /api/preferences/keyboard`.
- Route `app/routes/_site/settings/keyboard.tsx`, `EXCLUDED_ROUTES`
  `'personal'`.

## Testing requirements

- Product suite `lib/shortcuts/__tests__/bindings.product.test.ts`: Off removes
  every single-key binding and keeps modifier ones; With Alt rewrites single
  keys only; an override that collides is refused; reserved combinations are
  refused; reset restores defaults.
- Main suite: `lib/__tests__/shortcut-registry.test.ts` still passes;
  `lib/preferences/__tests__/keyboard.test.ts` rejects unknown ids and bad key
  strings.

## Acceptance criteria

- [ ] With Off, pressing `n` on the feed does nothing; Ctrl/⌘+K still opens the
      palette.
- [ ] With "With Alt", Alt+N opens the composer and `n` alone does not.
- [ ] Remapping compose to `c` works immediately and survives reload and a
      second device when signed in.
- [ ] The help sheet shows the remapped key.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Remapping inside games, per-page shortcut sets, importing keymaps.

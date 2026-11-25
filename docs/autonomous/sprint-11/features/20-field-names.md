# 20 — Every form field has a name

Surface: every text field, select, textarea, checkbox, radio and switch on the site and in the apps that a screen reader
would announce with no name, and a gate that keeps it so. Wave 7 (sweeping, last). No namespace of its own: each fix's
string goes into the namespace the file already uses. Accessibility.

## User story

As someone who uses a screen reader or voice control, I want every field I land on to say what it is for, so that I can
fill in a form without guessing from a placeholder that my reader may not announce, and so that "click Search" finds the
search box.

## Requirements elicitation

- **What exists (verified):**
  - eslint runs `jsx-a11y` at warn (`eslint.config.*`), including `label-has-associated-control`, which checks that a
    `<label>` has a control, not that a control has a label; it also cannot see through the site's primitives
    (`components/ui/input.tsx`, `textarea.tsx`, `select.tsx`, `switch.tsx`, `slider.tsx`, `search-field.tsx`).
  - A rough scan of `app/`, `components/` and `features/` (fields with no `aria-label`, `aria-labelledby`, `id` or
    `title`, ignoring hidden, file and submit inputs) finds about 270 candidates in about 130 files, many of them
    labelled by a wrapping `<label>` the scan cannot see; the true number is lower and is measured at wave start by the
    gate below. The most are in `components/feed`, `components/rmhbox`, `components/steam`, `app/routes`,
    `components/dunesday`, `components/calendar`, `components/admin` and `components/studio`.
  - A placeholder is not an accessible name in every reader (WCAG 2.2 SC 4.1.2, 1.3.1; the HTML-AAM name computation
    uses `placeholder` only as a last resort and not consistently).
- **Decisions:**
  - **What counts as named** (the gate's rule, by syntax tree, never by text search): the element has a non-empty
    `aria-label` or `aria-labelledby`; or it has an `id` that a `<label htmlFor>` / `Label htmlFor` in the same file
    names (the same literal, or the same expression text); or it sits inside a `<label>` or `Label` element in the same
    JSX tree; or it is a primitive given a `label` prop the primitive renders as its name (each such primitive listed in
    the gate with the line that renders it); or it is `type="hidden"`, `submit`, `button` or `reset`.
  - **What a fix looks like:** a visible label where the design has room (the Steel label is `t-label`), else an
    `aria-label` through `t()` with a literal key in the file's namespace, saying what the field is ("Search messages",
    "Minutes", "Your answer"), never "input" or "field". A visible label that already exists beside the field is
    connected with `htmlFor` and `id` (`useId`), not duplicated.
  - **Scope:** site tier and app tier alike (the games and apps keep their look; a name is not a look). Primitives in
    `components/ui/` are exempt as definitions (they pass props through); their call sites are checked.
  - **The gate:** `lib/__tests__/field-names.test.ts` (TypeScript compiler API, the way the `serverError` ratchet reads
    syntax trees) with a `BASELINE` that starts at the measured count, must reach **0** for files under
    `app/routes/_site` and `components/` outside the exact-path list below, and may only fall. Any file left over is
    listed by exact path with a reason a reviewer can check (for example, a canvas game whose input is drawn, with its
    keyboard alternative named). No folder-wide exemptions.
  - **No visual change** beyond the labels added; no field changes behaviour.

## Functional requirements

1. FR-1 The gate, its rule, its tests of the rule (fixtures for each named and unnamed form).
2. FR-2 Fix every unnamed field the gate finds at wave start, file by file, with strings in the file's namespace
   (literal keys, `pnpm i18n:extract` or keys added by hand when the extractor churns other catalogues).
3. FR-3 The remaining list (expected empty for the site tier), each entry with its reason.

## Non-functional requirements

- **Merge safety:** this feature edits many component files and nothing under `lib/` except its gate; it must not edit
  files 18 edits in the same wave (`lib/media/**`, `lib/homes/**`, `app/routes/api/homes/**`, `lib/errors/**`,
  `components/errors/useRefusalText.ts`, `components/homes/ListingForm.tsx`, `lib/account/erasure-follows.server.ts`,
  `locales/en/errors.json`); if a field in `ListingForm.tsx` is unnamed, it is fixed after 18 merges (integration) or
  listed.
- **i18n:** every new string through `t()` with a literal key and default, in the file's existing namespace; no new
  namespace; app-tier files keep their own namespaces.

## Data model and API

- No schema change, no endpoint.

## Testing requirements

- Main suite `lib/__tests__/field-names.test.ts`: the count at or under `BASELINE`, zero for the site tier outside the
  exact list; fixtures: `aria-label`, `aria-labelledby`, `htmlFor`/`id` (literal and expression), a wrapping label, a
  primitive's `label` prop count as named; a placeholder alone, an empty `aria-label`, a comment and a label in another
  file do not.
- i18n catalogue and drift tests for every namespace touched; the computed-key ratchet.

## Acceptance criteria

- [ ] `field-names.test.ts` passes with the site tier at zero.
- [ ] With a screen reader, the message search box, the calendar's time fields and the RMHBox join code field announce
      their names.
- [ ] No field moved or changed size except where a visible label was added.

## Out of scope

Icon-only buttons (a scan found about twenty without a name; small enough to fold into this sweep if they are in files
it already edits, otherwise a follow-up), colour contrast, focus order.

<!--
Thanks for contributing to rmhstudios.com! Fill in the sections below and tick
the checklist. Delete any section that doesn't apply.
-->

## What & why

<!-- What does this change do, and why? Link any related issue. -->

## How it was verified

<!-- How did you confirm it works? Local run, screenshots, manual steps, etc.
     (We don't require automated tests for every change, but say what you did.) -->

## Screenshots / recordings

<!-- For UI changes. Before/after helps. Delete if not applicable. -->

## Checklist

- [ ] `pnpm check:consistency --base main` passes (the commit gate, over the whole branch).
- [ ] `pnpm exec tsc --noEmit` passes (no *new* type errors vs. the base branch).
- [ ] `pnpm lint` passes (no new errors; a11y/`any` warnings noted if added).
- [ ] UI uses `--site-*`/`--app-*` tokens, a glass elevation class by role, and `components/ui/` primitives — no hardcoded colours/radii, no second copy of a shared component.
- [ ] UI was looked at in Daylight, `.style-graphite` and `.style-high-contrast`, at a phone and a desktop width.
- [ ] New interactive UI is keyboard-operable, labeled, and respects `prefers-reduced-motion`.
- [ ] New public route sets a unique title/description, a canonical, and (if content) JSON-LD.
- [ ] User-facing errors are handled (route `errorComponent`/boundary) and reported.
- [ ] New server/API input is validated (zod) and rate-limited where it writes or costs money.
- [ ] User-facing strings go through i18n (`t(...)`), not hardcoded English.
- [ ] Data-heavy views have a layout-matched skeleton/empty state.
- [ ] Security headers / CSP unaffected, or intentionally updated in the Apache vhost (`deploy/apache/rmhstudios.conf`) and the Nitro `security-headers` plugin.

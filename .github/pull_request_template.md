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

- [ ] `pnpm exec tsc --noEmit` passes (no *new* type errors vs. the base branch).
- [ ] `pnpm lint` passes (no new errors; a11y/`any` warnings noted if added).
- [ ] New interactive UI is keyboard-operable, labeled, and respects `prefers-reduced-motion`.
- [ ] New public route sets a unique title/description, a canonical, and (if content) JSON-LD.
- [ ] User-facing errors are handled (route `errorComponent`/boundary) and reported.
- [ ] New server/API input is validated (zod) and rate-limited where it writes or costs money.
- [ ] User-facing strings go through i18n (`t(...)`), not hardcoded English.
- [ ] Data-heavy views have a layout-matched skeleton/empty state.
- [ ] Security headers / CSP unaffected, or intentionally updated in **both** serving paths (Apache + Helm/Traefik).

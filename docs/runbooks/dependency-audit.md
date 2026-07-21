# Runbook — unblocking the `audit` CI gate

The `audit` job in `web-ci.yml` runs `pnpm audit --prod --audit-level=high`
and fails the PR when any **high/critical** advisory matches a production
dependency — including transitive ones pinned by `pnpm-lock.yaml`. New
advisories publish daily, so this gate can go red on a PR that changed
nothing dependency-related (it happened twice on 2026-07-21: js-yaml
GHSA-52cp-r559-cp3m and fast-uri GHSA-4c8g-83qw-93j6).

## Fix recipe (scoped override)

1. Read the failing job log: it names the package, the vulnerable range, the
   patched version, and the dependency path.
2. Add a **range-scoped** override in `package.json` → `pnpm.overrides`:

   ```json
   "fast-uri@>=3.0.0 <3.1.3": ">=3.1.3"
   ```

   Scope the key to the vulnerable range so consumers of other majors are
   untouched. **Stay within the same major** in the target when the package
   is imported at runtime — forcing a new major can break consumers (js-yaml
   v5 dropped its default export and broke `i18next-parser`; the fix was
   `>=4.3.0 <5`).
3. `pnpm install` → `pnpm audit --prod --audit-level=high` locally until only
   sub-high findings remain.
4. Run the full suite (`pnpm exec tsc --noEmit && pnpm exec vitest run`) —
   an override changes resolved versions at runtime; treat it like a dep
   upgrade, not a config tweak.
5. Commit `package.json` + `pnpm-lock.yaml` together.

## Prevention

`.github/dependabot.yml` opens security-update PRs automatically and a
weekly grouped minor/patch update; merging those promptly keeps the lockfile
ahead of the advisory feed. Overrides added by this recipe should be
re-checked when the direct dependency chain updates (they become dead weight
once the chain resolves a patched version on its own).

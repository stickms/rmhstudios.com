# Epic build pipeline

Generates the bilingual Chinese epic PDF for the Library.

- `manuscript/` — generated content (story bible + per-chapter passage JSON)
- `ornaments/` — pure SVG-string generators (woodblock 版式 elements)
- `render/` — manuscript + ornaments → styled HTML
- `paginate.ts` — Chromium-measured synchronized facing leaf-pairs
- `build-epic.ts` — orchestrator → public/library/<slug>.pdf + cover

Run the binaries directly (NOT via `pnpm run`/`pnpm exec`, which trigger
pnpm v11's pre-run deps check and rewrite the repo lockfile):

- Tests: `node_modules/.bin/vitest run --config vitest.epic.config.ts`
- Build: `node_modules/.bin/tsx scripts/epic/build-epic.ts`

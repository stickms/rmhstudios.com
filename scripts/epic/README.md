# Epic build pipeline

Generates the bilingual Chinese epic PDF for the Library.

- `manuscript/` — generated content (story bible + per-chapter passage JSON)
- `ornaments/` — pure SVG-string generators (woodblock 版式 elements)
- `render/` — manuscript + ornaments → styled HTML
- `paginate.ts` — Chromium-measured synchronized facing leaf-pairs
- `build-epic.ts` — orchestrator → public/library/<slug>.pdf + cover

Run: `pnpm run epic:test` and `pnpm run epic:build`.

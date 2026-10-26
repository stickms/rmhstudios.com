# RMH TF2 HUD Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a browser-based TF2 custom-HUD editor with live canvas preview, TF2-structured files, zip import/export, diff-vs-base, and account saving/sharing.

**Architecture:** Pure-TS core under `lib/tf2-hud/` (lossless KeyValues parser, VGUI layout engine, project model, diff, zip) with no DOM so it is unit-testable; React UI under `components/tf2-hud/` renders the preview with Konva; persistence is Prisma manifests plus content-addressed blobs in object storage. The base ("TF2 Default") is served as static files with a hash manifest and fetched lazily per file.

**Tech Stack:** TanStack Start, React 19, Zustand, Konva, CodeMirror 6, jszip, Prisma 7, zod, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-25-rmh-tf2-hud-editor-design.md`

## Global Constraints

- Base = `stickms/stickshud@b0635b402419f602c72dfaa9835b3a0795622623`, GPL-3.0; LICENSE ships in every export.
- No Valve fonts/sounds/textures/layouts bundled; fonts are placeholders behind a swappable registry.
- Route prefix `/tf2-hud`; app id `rmh-tf2-hud`; API under `/api/tf2-hud/*` via `defineHandler`.
- A no-op parse→serialize is byte-identical (CRLF preserved) for all 734 base `.res` files.
- Exports contain TF2 layout (`resource/`, `scripts/`, `materials/vgui/`, `sound/`, `info.vdf`).
- Repo rules: `--app-*` tokens (no raw palette colours, hardcoded radii, `transition-all`), all strings via `t()`, zod-validated + rate-limited writes, `.server.ts` never imported by client, no new lint/type warnings.

## Review Focus

- Hostile zips (path traversal, absolute paths, zip bombs, thousands of entries) must be rejected, not extracted.
- Malformed `.res` (unbalanced braces, unterminated strings) must produce diagnostics, never throw into the UI.
- Files with BOM, CRLF, duplicate keys, `#base`/`#include`, and `[$X360]` conditionals must round-trip.
- Signed-out users must keep their work (local draft) and lose nothing on sign-in.
- A missing asset (image/font) must render a visible placeholder, not crash the scene.

---

### Task 1: Catalog, routes, theme

**Files:** `lib/catalog/apps/rmh-tf2-hud.ts`, `lib/catalog/index.ts`, `app/routes/tf2-hud.tsx`, `app/routes/tf2-hud/index.tsx`, `components/tf2-hud/Tf2HudShell.tsx`, `components/tf2-hud/tf2-hud.css`

- [ ] Register the app in the barrel; `pnpm test lib/__tests__/catalog.test.ts` passes.
- [ ] Route layout mounts `AppShell appClassName="tf2hud-theme"`.

### Task 2: KeyValues parser

**Files:** `lib/tf2-hud/kv/{parse,serialize,types}.ts`, `lib/tf2-hud/__tests__/kv.test.ts`
**Produces:** `parseKv(text): KvDoc` (never throws; `doc.diagnostics`), `serializeKv(doc): string`, `kvGet/kvSet/kvPaths` helpers.

- [ ] Tests: round-trip every base file; BOM/CRLF; comments; conditionals; unterminated string → diagnostic.

### Task 3: Base pack

**Files:** `public/tf2-hud/base/**`, `scripts/tf2-hud/build-manifest.mjs`, test for manifest freshness

- [ ] Vendor base + LICENSE; manifest lists path, size, sha1.

### Task 4: Scheme + layout engine

**Files:** `lib/tf2-hud/layout/*`, `lib/tf2-hud/scheme/*`
**Produces:** `resolveScheme(clientscheme)`, `layoutPanel(node, parentRect, screen): Rect`.

- [ ] Tests for `xpos`/`ypos` with `c`/`r` modifiers, `wide`/`tall` with `f`, proportional scaling, aspect ratios.

### Task 5: Scene renderer + pages + fixtures

**Files:** `lib/tf2-hud/scene/*`, `lib/tf2-hud/pages.ts`, `lib/tf2-hud/fixtures.ts`, `components/tf2-hud/Preview.tsx`

- [ ] Panel tree → Konva nodes (Label, ImagePanel, Button, ProgressBar, EditablePanel); click-to-select; missing assets use placeholders.

### Task 6: Project model, diff, zip

**Files:** `lib/tf2-hud/project/*`, `lib/tf2-hud/zip/*`

- [ ] Undo/redo store; `diffAgainstBase`; `importZip` with limits; `exportZip` with LICENSE and `info.vdf`.

### Task 7: Editor UI

**Files:** `components/tf2-hud/*`

- [ ] File tree with filters, CodeMirror KV editor, inspector, diff view, asset dialogs, validation panel, command palette.

### Task 8: Persistence + sharing

**Files:** `prisma/schema.prisma`, migration, `lib/tf2-hud/*.server.ts`, `app/routes/api/tf2-hud/*`, workshop/share routes

- [ ] Models, blob store, versioning, publish/fork/like/share.

### Task 9: Fidelity + polish

- [ ] Placeholder `hudlayout.res`, BYO import, animations parse, i18n extraction, docs, `pnpm check:consistency`.

# Design Spec — The rmhstudios Textbook (PDF)

**Date:** 2026-06-21
**Status:** Approved (design); ready for implementation planning
**Deliverable:** A textbook-style PDF on the architecture and history of rmhstudios.com, with figures, per-chapter practice exercises, and practice exams (full worked solutions).

## 1. Goal & audience

Produce a comprehensive, university-textbook-style PDF that teaches the architecture and
history of rmhstudios.com using the real system as the running case study.

- **Audience:** CS-student textbook voice — formal learning objectives, definitions, theory
  framing (distributed systems, realtime, SSR, build systems) anchored to rmhstudios reality.
- **Depth:** Comprehensive — 13 chapters + front/back matter. Dense like the existing
  `docs/go-migration/` engineering report. Target ~80–150 pages.
- **History:** Factual backbone (git history, migration PRs #121 / #142, the `docs/` folder,
  the `Create Next App → Next.js → TanStack Start` and `Compose → k3s/Helm` evolution) with
  light textbook narrative framing (eras, design pressures). Grounded — do not invent.
- **Exercises/exams:** Every chapter has practice exercises; 3 practice exams in back matter;
  **full worked solutions** for all exercises and exams in appendices.

## 2. Build approach

**Reuse the `docs/go-migration/` PDF pipeline**, parallel-instantiated under `docs/textbook/`:

- Playwright/Chromium renderer (`build.mjs`), offline, with **inlined Mermaid** for figures.
- Section-fragment HTML files + a `sections.json` manifest + `assets/doc.css`.
- Extend `doc.css` with textbook elements: learning-objective lists, key-term callouts,
  boxed exercises, exam pages, and worked-solution blocks.
- Output: `docs/textbook/rmhstudios-architecture-and-history.(html|pdf)`.

Rationale: proven, visually consistent with existing rmh docs, fully offline, handles
figures (Mermaid) + PDF generation already. Alternatives (Pandoc/LaTeX, React-PDF) rejected
as higher-risk and stylistically inconsistent.

## 3. Accuracy contract

This documents REAL code. Authors must read the actual files for each chapter and quote real
identifiers, ports, event names, model names, schema, and scripts. Honest scope notes where
something is scaffolded vs. production (use a `scope` callout). No invented facts.

Ground-truth already established:
- TanStack Start + Vite + Nitro web tier (SSR), React 19, Tailwind v4, Framer Motion.
- 142 Prisma models / ~2,975-line schema; Postgres.
- Better Auth (Discord/GitHub/Google + email/password); catch-all auth route.
- 11 server processes under `server/`: socket-server, rmhbox, rmhtube, rmhmusic, status,
  recap, discord-bot, doctrine-worker, vibe-worker, bot-worker, shared.
- Go microservices tier under `go-services/` (pkg/internal/cmd/e2e) + Bazel (PR #142).
- `deploy/`: apache, docker, helm, k8s, terraform, hotswap scripts; PM2/Compose + k3s/Helm.
- ~1,473 commits; scaling roadmap (Redis backplane/CDN/PgBouncer → multi-node k3s/HPA →
  regional clusters/read replicas) per the infra-direction.

## 4. Chapter outline (13 chapters)

Front matter: Cover, Preface ("how to use this book"), Table of Contents (auto-generated).

1. The rmhstudios Platform at a Glance — what it is; bird's-eye architecture; process-split philosophy.
2. A Brief History — CNA → Next.js → TanStack Start; Compose → k3s/Helm; Bazel + Go tier; eras & pressures.
3. The Web Tier: SSR with TanStack Start + Nitro — routing, SSR, request lifecycle.
4. State, Data Fetching & the Client — Zustand, TanStack Query, hydration boundary.
5. The Data Layer: Postgres + Prisma at Scale — the 142-model schema, domains, indexing, migrations.
6. Authentication & Identity (RMH Auth) — Better Auth, sessions, OAuth, catch-all route.
7. Realtime Architecture: The Socket Server Fleet — the 11 processes, lobby/room model, event protocols, in-memory state.
8. The Games Platform — engine patterns, score/leaderboard pipeline, save systems, 2D/3D/multiplayer.
9. Apps & Content Systems — RMHTube, RMHMusic, the feed, blog/MDX.
10. The Go Microservices Tier — strangler-fig, shared foundation, ported vs scaffolded.
11. Build & Tooling: Bazel, Vite & the Monorepo — hermetic builds, the frontend leaf, esbuild bundling.
12. Deployment & Operations — PM2/Compose, hotswap, k3s/Helm/Terraform, the deploy script.
13. Scaling & the Road Ahead — three-stage roadmap; real constraints (single Postgres, non-CDN-able websockets).

Back matter:
- Practice Exams: Midterm (Ch.1–7), Final (Ch.8–13), Comprehensive.
- Appendix A: Solutions to all chapter exercises.
- Appendix B: Exam answer keys (worked).
- Appendix C: Glossary.
- Appendix D: Reference tables (events / ports / file inventory).

## 5. Per-chapter pedagogical structure

Each chapter fragment contains, in order:
- **Learning Objectives** (3–6 bullets).
- Lead paragraph (`<p class="lead">`) + narrative body.
- **2–4 Mermaid figures** (flowchart / sequence / ER / state), each with a `<figcaption>`.
- **Key Terms** callouts and boxed real-code excerpts (`<pre><code>`, escaped).
- **Chapter Summary**.
- **Practice Exercises** — 6–10 per chapter, tagged by difficulty (conceptual,
  diagram-reading, code-tracing, design), numbered `<chapter>.<n>` for solution cross-ref.

## 6. Exams

3 practice exams, mixed format (multiple-choice, short-answer, diagram/design), each with a
point budget and time suggestion. Every question worked in Appendix B.

## 7. Deliverables checklist

- `docs/textbook/build/{build.mjs,sections.json,package.json,STYLE_GUIDE.md}`
- `docs/textbook/assets/doc.css` (extended)
- `docs/textbook/sections/*.html` (cover, preface, 13 chapters, 3 exams, 4 appendices)
- Rendered `docs/textbook/rmhstudios-architecture-and-history.pdf`
- All content verified against real repo files (accuracy contract).

## 8. Non-goals

- No changes to application code.
- Not a deploy/runbook rewrite (the go-migration report already covers Go ops).
- No invented metrics or fictional history.

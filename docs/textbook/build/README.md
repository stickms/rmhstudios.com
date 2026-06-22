# Textbook build

Renders the textbook *rmhstudios.com — Architecture & History* from HTML section
fragments to a single PDF. Same toolchain as `docs/go-migration/build` (offline
Playwright/Chromium + inlined Mermaid).

## Layout

- `../sections/*.html` — section fragments (cover, preface, 13 chapters, 3 exams,
  4 appendices). Authored per `STYLE_GUIDE.md`.
- `../sections/_sol/*.html` — per-chapter (`chNN.html`) and per-exam (`examA/B/C.html`)
  worked-solution fragments. These are the source for Appendices A and B.
- `../assets/doc.css` — print stylesheet (house base + textbook elements).
- `sections.json` — manifest: order, labels, parts, titles.

## Build

```bash
npm install                  # mermaid + playwright (first time)
node assemble-appendices.mjs # regenerate Appendix A & B from sections/_sol/*
node build.mjs               # → ../rmhstudios-architecture-and-history.pdf
```

Run `assemble-appendices.mjs` whenever a chapter's exercises or an exam's questions
change, then `build.mjs`. Editing any `sections/*.html` only needs `build.mjs`.

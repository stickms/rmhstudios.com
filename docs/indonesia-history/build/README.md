# Build — *Indonesia: A Comprehensive History*

Renders the textbook from HTML section fragments to a single offline PDF using
Playwright/Chromium (Mermaid diagrams rendered in-page; real images inlined as base64
data-URIs). Forked from the `docs/textbook/` pipeline.

## Layout
- `../sections/*.html` — section fragments: cover, preface, introduction, 50 chapters
  (10 Parts), and 7 back-matter appendices (chronology, glossary, dynastic tables, maps,
  bibliography, image credits, index). Authored per `STYLE_GUIDE.md`.
- `../assets/img/` — downloaded Wikimedia Commons images (public-domain / CC0 / CC-BY /
  CC-BY-SA), inlined into the PDF at build time. Credited in the Image Credits appendix.
- `../assets/doc.css` — print stylesheet (base + textbook/figure/endnote/bibliography styles).
- `../harness/` — the cross-chapter coherence layer used while authoring: `conventions.md`,
  `master-timeline.md`, `glossary-ledger.md`, `bibliography.md`, `image-manifest.md`, and
  `_deltas/` (one delta file per chapter — the source from which the back matter was assembled).
- `sections.json` — manifest: order, labels, Parts, titles.

## Build
```bash
npm install          # mermaid + playwright (first time; also downloads Chromium)
node build.mjs       # → ../indonesia-a-comprehensive-history.(html|pdf)
```
Editing any `sections/*.html` only requires re-running `node build.mjs`.

## Notes
- The build inlines `<img src="img/NAME">` references as base64; it **throws** if a
  referenced image file is missing under `assets/img/` (fail-loud, so a broken figure can't
  ship silently).
- The output `.html`/`.pdf` are git-ignored (the PDF is large — images are embedded).
- Citations follow Chicago notes-bibliography; every chapter ends with numbered endnotes,
  consolidated into the back-matter bibliography.

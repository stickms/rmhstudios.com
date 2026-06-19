# Content generation

The manuscript (`../manuscript/bible.json` and `../manuscript/chNN.json`) is
produced by a multi-agent generation process driven by the controller. JSON
shapes are defined in `./schemas.ts` and mirror `../manuscript/types.ts`;
every generated chapter is validated with `validateChapter` before being
written and is re-checked by `./assemble.test.ts`.

## Phase 1 — Story bible (`bible.json`)

Three independent concept agents each designed the epic with a different
source as the lead (Gilgamesh / Three Kingdoms / Dream of the Red Chamber);
their concepts were synthesised into a single bible: 5 title options (one
chosen by the user → `chosenTitle`), a synopsis, 6 principal characters, and
a 10-chapter outline. The myth is original and braids all four sources:
the Iliad, Romance of the Three Kingdoms, Dream of the Red Chamber, Gilgamesh.

## Phase 2 — Per-chapter pipeline (`chNN.json`)

Each outline chapter is drafted as 章回体: a 回目 couplet plus alternating
prose and verse passages in classical Chinese, with a faithful literary
English translation for every passage (verse keeps equal line counts), a
continuity/style pass against the bible, and 1–3 脂批-style red `redComment`
notes. Output validates against `CHAPTER_SCHEMA` / `validateChapter`.

Length target: ~12–16 passages per chapter so the book reaches ~100 PDF
pages once paginated (~3 passages per facing leaf-pair → ~2 leaves ≈ 4 pages
per chapter of prose, plus plates and breathing room).

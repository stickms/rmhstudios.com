# Design: A Bilingual Chinese Epic for the RMH Library

**Date:** 2026-06-18
**Status:** Approved design → implementation planning
**Working title:** 《天命輓歌》 *Elegy of the Mandate* (final title chosen in Phase 1; 3–5 options generated)

## 1. Goal

Produce an **original, book-length Chinese epic** (~100 PDF pages) that braids the DNA of four
source works — the *Iliad*, *Romance of the Three Kingdoms*, *Dream of the Red Chamber*, and the
*Epic of Gilgamesh* — presented as a **bilingual** classical edition: vertical Chinese (竖排) on the
verso, English translation on the facing recto. The output is a **stylized PDF** in an authentic
古籍 woodblock aesthetic, added to the existing site Library so it appears on the shelf and in the
3D page-turning reader.

## 2. Decisions (locked)

| Decision | Choice |
| --- | --- |
| Story source | Invent an original myth braiding all four sources |
| Literary form | 章回体: prose chapters + verse interludes + per-回 couplets |
| Length | ~100 pages, rich layout (multi-agent generation workflow) |
| Aesthetic | Classical 古籍 woodblock |
| Bilingual layout | Facing pages — zh verso (竖排, right→left), en recto (horizontal), synced per passage |
| Ornaments | Procedural SVG/CSS ornaments **+ a few full-page vector plates** |
| Chinese setting | Vertical 竖排 with 界行 column rules and 版心/鱼尾 center strip |
| Commentary | 脂批-style red marginal commentary in 天头 + 圈点 emphasis marks, from an invented commentator |
| Title | Bible phase generates 3–5 options; user picks before drafting |
| Code location | `scripts/` (alongside `generate-library-metadata.ts`) |

## 3. The Story (premise)

A hero of a once-glorious noble house, in a mythic warring-states age:

- **Iliad** — a great war erupts over a stolen sacred omen (a heaven-sent relic); set-piece duels,
  a wrathful champion who withdraws, the death of a beloved companion as the turning point.
- **Three Kingdoms** — a lattice of warlords bound and broken by sworn-brotherhood oaths, shifting
  alliances, stratagems, and the contested **Mandate of Heaven (天命)**.
- **Dream of the Red Chamber** — the slow decline of the hero's ancestral house: a garden world of
  women, dreams, omens, and impermanence framing the martial action; the dream/illusion motif.
- **Gilgamesh** — after losing his sworn brother, the hero journeys to the edge of the world to
  wrest immortality from Heaven, and learns its price; returns changed.

Structure: **9–12 回 (chapters)**, each opening with a two-line couplet (回目) and mixing prose
narrative with verse interludes (poems, laments, songs).

## 4. Architecture

All build tooling lives under `scripts/epic/`; the only artifacts that touch the app are the
generated **PDF**, **cover image**, and a **metadata entry**.

```
scripts/epic/
  manuscript/            # generated content (source of truth for rendering)
    bible.json           #   story bible: title options, characters, outline, source-mapping
    ch01.json … chNN.json#   per-chapter passage arrays
  ornaments/             # pure SVG-string generators (no I/O)
    frame.ts             #   版框 (文武边栏 double rule), 界行 column rules
    centerStrip.ts       #   版心 + 黑鱼尾 + 象鼻 + page number cartouche
    seal.ts              #   朱文/白文 vermilion seals (seal-script glyphs, carved edge)
    borders.ts           #   回纹/雷纹 fret borders, 卷云纹 cloud motifs
    plates.ts            #   dragonPlate (frontispiece), xiuxiangPlate (绣像), colophon (牌记)
  render/
    typeset.ts           #   manuscript + ornaments → full HTML document
    epic.css             #   print CSS: 竖排 verso, horizontal recto, 天头 commentary, 圈点, fonts
  paginate.ts            # Playwright measuring → synchronized facing leaf-pairs
  build-epic.ts          # orchestrator: typeset → paginate → page.pdf() → cover via sharp
```

### 4.1 Manuscript data model

```ts
type Passage =
  | { type: 'heading';  zh: string; en: string }          // 回 title line
  | { type: 'couplet';  zh: [string, string]; en: [string, string] } // 回目 couplet
  | { type: 'prose';    zh: string; en: string; redComment?: RedNote[] }
  | { type: 'verse';    zh: string[]; en: string[]; redComment?: RedNote[] }; // line arrays

type RedNote = { anchor: string; zh: string; en: string }; // 脂批-style margin note
type Chapter  = { n: number; title: { zh: string; en: string }; couplet: Passage; passages: Passage[] };
```

`redComment` and `圈点` (emphasis) markers are sparse — a handful per chapter — to evoke the
commentary tradition without clutter.

### 4.2 Ornament library

Pure functions returning SVG strings, unit-testable in isolation. Each takes geometry/params and
returns valid SVG. Hand-cut feel: slightly irregular stroke weights, warm sumi ink (`#1a1410`),
cinnabar vermilion (`#b03a2e`) for seals/圈点/朱批.

- `blockFrame(w,h)` — 文武边栏 (thick outer + thin inner rule).
- `columnRules(cols)` — 界行 vertical separators for the verso.
- `centerStrip(title, juan, page)` — 版心 with 黑鱼尾 fishtail and page cartouche.
- `seal(text, style)` — vermilion seal, 朱文 (relief) or 白文 (intaglio), carved-edge texture.
- `fretBorder()`, `cloudMotif()` — 回纹 / 卷云纹 frames for plates.
- `dragonPlate(title)`, `xiuxiangPlate(figure)`, `colophon(info)` — full-page plates.

### 4.3 Typesetting

`typeset.ts` emits one HTML document; `epic.css` handles:

- **Verso (Chinese):** `writing-mode: vertical-rl`, 界行 rules, Songti body / Kaiti headings,
  red 天头 commentary positioned in the head margin, 圈点 dots beside anchored characters.
- **Recto (English):** horizontal, Baskerville serif, oldstyle figures, small-caps headers,
  matching 版框 and red marginal notes aligned to the same passage.
- **Fonts:** macOS system fonts referenced by family (Songti SC, Kaiti SC, Baskerville);
  Chromium embeds the used glyphs into the PDF.

### 4.4 Pagination (the hard part)

Facing-page sync with two different writing modes requires a measuring pass:

1. Render passages into the verso (zh) and recto (en) frames in headless Chromium.
2. Greedily pack passages into a **leaf-pair** until **either** the zh column-set **or** the en
   block would overflow its 版框; break at that passage boundary; carry the remainder.
3. Emit final page order **zh, en, zh, en …** so a two-up spread (and the site's `BookCanvas`
   reader) shows zh on the left leaf and its synced en on the right leaf. Front-matter plates are
   arranged to keep spread parity (zh = verso/left).

**Invariant:** every Chinese page faces its synchronized English page; no content overflows the
版框. Leftover whitespace on the shorter side is acceptable (classical breathing room).

### 4.5 Build & integration

- `build-epic.ts`: typeset → paginate → `page.pdf()` → `public/library/elegy-of-the-mandate.pdf`
  (final slug from chosen title). Then render the frontispiece plate and screenshot → `sharp` →
  `public/library/covers/<slug>.jpg`.
- Add one entry to `data/library-metadata.json`:
  `{ title, description, pages, cover }`. `lib/library/library.ts` consumes it; the book then
  appears on the shelf (`library.index.tsx`) and in the reader (`library.$slug.tsx`,
  `BookReader` + `BookCanvas`) with **no app code changes**.

## 5. Content generation pipeline (multi-agent workflow)

User explicitly opted into a multi-agent workflow for the writing (extra cost acknowledged).

- **Phase 1 — Story bible** (`bible.json`): establish the myth, 9–12 回 outline, characters with
  zh+en names, the four-source mapping, and **3–5 title options** for the user to pick.
- **Phase 2 — Per-chapter pipeline:** each 回 → draft (zh prose + verse + 回目 couplet) →
  English translation → continuity/style edit → 脂批 red-commentary pass → validated passage JSON.
- **Phase 3 — Assembly:** cross-chapter consistency/continuity check; then render + paginate + build.

Generation is gated on the user choosing the title from Phase 1 before Phase 2 drafting.

## 6. Testing

- **Ornaments:** each generator returns well-formed, parseable SVG (snapshot + XML-parse checks).
- **Pagination invariant:** assert every zh page is faced by its synced en page and nothing
  overflows the 版框 (programmatic check on the measured layout).
- **Build smoke test:** running `build-epic.ts` produces a valid multi-page PDF with embedded
  fonts and a generated cover; metadata entry resolves through `getLibraryBook`.
- **Visual spot-check:** open the produced PDF in the site's reader to confirm facing-page spreads
  render correctly on desktop (two-up) and mobile (single).

## 7. Out of scope

- AI-generated raster artwork (all imagery is procedural vector).
- Changes to the library reader/app UI (integration is data-only).
- Print/physical production concerns (bleed, CMYK) — screen/PDF only.

## 8. Open risks

- **Pagination complexity** with mixed writing modes — mitigated by passage-boundary breaks and a
  measuring pass; whitespace tolerance keeps it robust.
- **Font embedding/CJK** in Chromium PDF — verify glyphs embed; fall back to bundling a libre CJK
  serif (e.g. Noto Serif CJK) if system-font embedding is incomplete.
- **Content quality/consistency** across many chapters — mitigated by the Phase 3 continuity pass.
- **Reader spread parity** (zh always left) — controlled via front-matter plate count; verified in
  the visual spot-check.

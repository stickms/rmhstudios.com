# Indonesia History Textbook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a comprehensive, real-cited, image-rich ~1000-page Indonesian history textbook (prehistory → 2026) as an offline print-quality PDF, reusing and extending the repo's existing `docs/textbook/` Playwright pipeline.

**Architecture:** A new self-contained book project at `docs/indonesia-history/` forks the proven `docs/textbook/` pipeline (Playwright/Chromium HTML→PDF, `sections.json` manifest, shared `doc.css`, inlined Mermaid). Phase 0 builds the scaffolding + an **image-embedding extension** (local images → base64 data-URIs at build time) + a **cross-chapter coherence harness** (conventions / timeline / glossary / bibliography). Phases 1–5 then author ~50 chapter HTML fragments in waves of parallel research-and-write subagents, each following one fixed chapter-authoring template, with a build + adversarial citation-verification checkpoint closing every phase.

**Tech Stack:** Node.js (ESM), Playwright/Chromium, Mermaid, HTML/CSS fragments. Research via the `deep-research` skill + web search/fetch. Images from Wikimedia Commons (PD/CC only).

## Global Constraints

- **Citation style:** Chicago notes-bibliography. Inline superscript markers → per-chapter numbered endnotes → consolidated master bibliography in back matter.
- **No citation from memory:** every cited claim must trace to a source the subagent actually fetched during research; record the URL/DOI with each source. Fabricated/uncheckable citations are a task failure.
- **Images:** Wikimedia Commons only; license must be public-domain, CC0, CC-BY, or CC-BY-SA, verified per image. Record source URL + creator + license for every image; full attribution in each caption and in the Image Credits appendix.
- **Offline & self-contained:** the built PDF must require no network at view time (Mermaid inlined; images base64-embedded).
- **Accuracy & honesty:** present scholarly debates and attribute contested positions (Majapahit's extent, 1965, 1998, Papua); never assert contested narratives as settled fact. Flag any chapter with thin sourcing in its handback.
- **No fragment chrome:** section fragments contain body content only — no `<html>/<head>/<body>`, no `<h1 class="section">` (the build injects it), no `<script>`, no external CSS.
- **Spelling/transliteration:** every author follows `conventions.md` (e.g., Srivijaya, Majapahit, Sukarno, Suharto, Yogyakarta) and appends new terms there.
- **Output path:** `docs/indonesia-history/indonesia-a-comprehensive-history.(html|pdf)`.
- **Title:** *Indonesia: A Comprehensive History*.

---

## File Structure

New project root `docs/indonesia-history/`:

- `build/build.mjs` — assembler + renderer (forked from `docs/textbook/build/build.mjs`, **plus image-embedding**).
- `build/sections.json` — manifest: title/footer + ordered list of all front-matter, 50 chapters (with `part` dividers), and back-matter sections.
- `build/package.json` — `mermaid` + `playwright` deps (copied from existing).
- `build/STYLE_GUIDE.md` — authoring contract for chapter subagents (history + citations + images variant).
- `assets/doc.css` — print stylesheet (forked from existing + figure/photo/credit/endnote/bibliography styles).
- `assets/img/` — downloaded PD/CC images (filenames referenced as `img/<name>` in fragments).
- `sections/*.html` — section fragments (cover, preface, introduction, ch01..ch50, back matter).
- `harness/conventions.md` — spelling/transliteration/date/citation conventions (append-only).
- `harness/master-timeline.md` — canonical chronology (append-only).
- `harness/glossary-ledger.md` — running glossary/names ledger (append-only) → feeds back-matter glossary.
- `harness/bibliography.md` — seed + accumulating verified sources (append-only) → feeds master bibliography.
- `harness/image-manifest.md` — one row per downloaded image: filename, source URL, creator, license, caption (append-only) → feeds Image Credits appendix.
- `.gitignore` — ignore `build/node_modules/` and the generated `*.html`/`*.pdf` output (mirror existing).

---

## PHASE 0 — Scaffolding & Pipeline (done in this session, not via chapter subagents)

### Task 0.1: Fork the pipeline skeleton

**Files:**
- Create: `docs/indonesia-history/build/{build.mjs,package.json,STYLE_GUIDE.md,.gitignore}`
- Create: `docs/indonesia-history/assets/doc.css`, `docs/indonesia-history/.gitignore`
- Create: `docs/indonesia-history/{sections,assets/img,harness}/` (dirs)
- Reference: `docs/textbook/build/build.mjs`, `docs/textbook/assets/doc.css`, `docs/textbook/build/package.json`, `docs/textbook/.gitignore`

**Interfaces:**
- Produces: a working copy of the existing pipeline under the new root, building the same way (`node build.mjs`), before any history-specific change.

- [ ] **Step 1:** Copy `docs/textbook/build/build.mjs` → `docs/indonesia-history/build/build.mjs`, `docs/textbook/build/package.json` → `.../build/package.json`, `docs/textbook/.gitignore` → `docs/indonesia-history/.gitignore`, and `docs/textbook/assets/doc.css` → `docs/indonesia-history/assets/doc.css`.
- [ ] **Step 2:** In the copied `build.mjs`, change the output basename to `indonesia-a-comprehensive-history` and the page `<title>` source to the new manifest title (the file already reads title/footer from `sections.json`, so most of this is the output filename constant near the bottom).
- [ ] **Step 3:** Create `docs/indonesia-history/build/sections.json` minimal stub:

```json
{
  "title": "Indonesia: A Comprehensive History",
  "footer": "Indonesia: A Comprehensive History",
  "headerRight": "Indonesia — A Comprehensive History",
  "cover": "00-cover.html",
  "sections": [
    { "id": "preface", "label": "Front Matter", "part": "Front Matter", "title": "Preface: How to Use This Book", "file": "00-preface.html" }
  ]
}
```

- [ ] **Step 4:** Create placeholder `sections/00-cover.html` and `sections/00-preface.html` (a single `<p>placeholder</p>` each) so the first build has something to render.
- [ ] **Step 5: Install + build to verify the fork works.**

Run: `cd docs/indonesia-history/build && npm install && node build.mjs`
Expected: exits 0; `docs/indonesia-history/indonesia-a-comprehensive-history.pdf` is created. (Network note: `npm install` and Playwright's Chromium download need network the first time.)

- [ ] **Step 6: Commit.**

```bash
git add docs/indonesia-history
git commit -m "feat(id-textbook): fork docs/textbook pipeline to docs/indonesia-history"
```

### Task 0.2: Image-embedding extension (base64 data-URIs)

**Files:**
- Modify: `docs/indonesia-history/build/build.mjs`
- Test: `docs/indonesia-history/sections/00-cover.html` (temporarily add a test `<img>`), `docs/indonesia-history/assets/img/_test.png`

**Interfaces:**
- Produces: build-time inlining so any `<img src="img/<filename>">` in a fragment is replaced with a `data:<mime>;base64,<...>` URI read from `assets/img/<filename>`. Authors reference images as `src="img/<filename>"` only.

- [ ] **Step 1: Write the helper in `build.mjs`** (add near the top, after the `ASSETS` constant):

```javascript
import { readFileSync as _rf } from "node:fs";
const IMG_DIR = resolve(ROOT, "assets/img");
const MIME = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };
// Replace <img ... src="img/NAME" ...> with an inlined base64 data-URI so the
// PDF is fully self-contained/offline. Throws if a referenced image is missing.
function inlineImages(frag) {
  return frag.replace(/src="img\/([^"]+)"/g, (_m, name) => {
    const p = resolve(IMG_DIR, name);
    if (!existsSync(p)) throw new Error(`Missing image referenced in a fragment: assets/img/${name}`);
    const ext = name.split(".").pop().toLowerCase();
    const mime = MIME[ext] || "application/octet-stream";
    const b64 = _rf(p).toString("base64");
    return `src="data:${mime};base64,${b64}"`;
  });
}
```

- [ ] **Step 2: Apply it** in the fragment-assembly loop — wrap the `readFileSync(file, "utf8")` result: `const frag = inlineImages(readFileSync(file, "utf8"));`
- [ ] **Step 3: Create a tiny test image and reference it.** Save any small PNG to `assets/img/_test.png`, and add `<img src="img/_test.png" alt="test">` to `sections/00-cover.html`.
- [ ] **Step 4: Build and verify the image inlined.**

Run: `cd docs/indonesia-history/build && node build.mjs && grep -c "data:image/png;base64," ../indonesia-a-comprehensive-history.html`
Expected: build exits 0; grep prints `1` (or more) — confirming the `<img>` became a base64 data-URI in the assembled HTML.

- [ ] **Step 5: Remove the test artifacts** — delete `assets/img/_test.png` and the test `<img>` line from `00-cover.html`.
- [ ] **Step 6: Commit.**

```bash
git add docs/indonesia-history/build/build.mjs docs/indonesia-history/sections/00-cover.html
git commit -m "feat(id-textbook): inline local images as base64 data-URIs at build time"
```

### Task 0.3: Extend the stylesheet for photos, credits, endnotes, bibliography

**Files:**
- Modify: `docs/indonesia-history/assets/doc.css`

**Interfaces:**
- Produces CSS classes used by every chapter and the back matter: `figure.photo`/`figure.photo img`, `.credit` (small attribution line under a caption), superscript `sup.cite`, `ol.endnotes`/`.endnotes li`, `.bibliography`/`.bib-entry` (hanging indent), `.maps`, `.dynasty-table`.

- [ ] **Step 1:** Append a clearly-commented block to `doc.css` defining the classes above. Concrete starting rules:

```css
/* ── Indonesia textbook additions ─────────────────────────────── */
figure.photo { margin: 1.2rem 0; text-align: center; break-inside: avoid; }
figure.photo img { max-width: 100%; height: auto; border: 1px solid #ddd; }
figure.photo figcaption { font-size: .85rem; color: #333; margin-top: .4rem; }
.credit { display: block; font-size: .72rem; color: #777; margin-top: .2rem; }
sup.cite { font-size: .7em; line-height: 0; vertical-align: super; }
ol.endnotes { font-size: .82rem; color: #222; padding-left: 1.4rem; }
ol.endnotes li { margin: .25rem 0; }
.bibliography .bib-entry { padding-left: 1.6rem; text-indent: -1.6rem; margin: .35rem 0; font-size: .9rem; }
.dynasty-table { width: 100%; border-collapse: collapse; font-size: .85rem; }
.dynasty-table th, .dynasty-table td { border: 1px solid #ccc; padding: .3rem .5rem; text-align: left; }
```

- [ ] **Step 2: Build to verify CSS still parses and renders.**

Run: `cd docs/indonesia-history/build && node build.mjs`
Expected: exits 0; PDF regenerated with no errors.

- [ ] **Step 3: Commit.**

```bash
git add docs/indonesia-history/assets/doc.css
git commit -m "feat(id-textbook): add photo/credit/endnote/bibliography styles"
```

### Task 0.4: Author the chapter-authoring STYLE_GUIDE (the subagent contract)

**Files:**
- Create/replace: `docs/indonesia-history/build/STYLE_GUIDE.md`
- Reference: `docs/textbook/build/STYLE_GUIDE.md` (structure to adapt)

**Interfaces:**
- Produces the single document every chapter subagent reads. Must specify exactly the required fragment structure (below) and the citation/image/harness rules from Global Constraints.

- [ ] **Step 1:** Write `STYLE_GUIDE.md` documenting the **required chapter fragment structure, in order**:
  1. `<div class="objectives"><h4>Learning Objectives</h4><ul>…</ul></div>`
  2. `<p class="lead">…</p>`
  3. Narrative body: `<h2 id="kebab-id">` subsections (id REQUIRED — feeds TOC), `<h3>/<h4>` nesting.
  4. 2–5 figures: real images as `<figure class="photo"><img src="img/<name>" alt="…"><figcaption>Figure N.x: …<span class="credit">Source: <a href="URL">…</a>. Creator. License.</span></figcaption></figure>` and/or Mermaid `<figure class="mermaid-fig"><div class="mermaid">…</div><figcaption>Figure N.x: …</figcaption></figure>`.
  5. `<div class="keyterm"><span class="term">…</span> — definition</div>` callouts.
  6. Inline citations: `<sup class="cite">1</sup>` markers in prose.
  7. `<div class="summary"><h4>Summary</h4>…</div>`.
  8. `<div class="exercises"><h2 id="chN-questions">Review &amp; Discussion Questions</h2>…</div>` (6–10 questions; no answer keys).
  9. `<ol class="endnotes"><h2 id="chN-notes">Notes</h2>` … wait: endnotes render as `<h2 id="chN-notes">Notes</h2>` followed by `<ol class="endnotes"><li>Author, *Title* (Place: Publisher, Year), p. N.</li>…</ol>`.
- [ ] **Step 2:** Document the **citation contract**: numbered endnotes correspond 1:1 to `<sup class="cite">N</sup>` markers; every endnote must come from a fetched source; append each source to `harness/bibliography.md`.
- [ ] **Step 3:** Document the **image contract**: only Wikimedia Commons PD/CC0/CC-BY/CC-BY-SA; download into `assets/img/` with a descriptive kebab filename; add a row to `harness/image-manifest.md`; caption must carry source+creator+license.
- [ ] **Step 4:** Document the **harness contract**: read `conventions.md`, `master-timeline.md`, `glossary-ledger.md` before writing; append new dates to the timeline, new terms to the glossary, follow spellings in conventions.
- [ ] **Step 5:** Document **don'ts** (no fragment chrome, no external CSS/JS, no `<h1 class="section">`, no raw `<`/`>` in Mermaid labels, no citing from memory).
- [ ] **Step 6: Commit.**

```bash
git add docs/indonesia-history/build/STYLE_GUIDE.md
git commit -m "docs(id-textbook): chapter-authoring style guide (history/citations/images)"
```

### Task 0.5: Seed the coherence harness

**Files:**
- Create: `docs/indonesia-history/harness/{conventions.md,master-timeline.md,glossary-ledger.md,bibliography.md,image-manifest.md}`

**Interfaces:**
- Produces the append-only shared files referenced by Task 0.4 and every chapter task.

- [ ] **Step 1:** `conventions.md` — seed with: preferred spellings (Srivijaya, Sailendra, Majapahit, Singhasari, Sukarno, Suharto/Soeharto note, Yogyakarta, Borobudur, Nusantara), date style (CE/BCE, circa = "c."), era/period names matching the Parts, citation format examples, figure-numbering rule (`Figure <chapter>.<n>`), and "append new decisions here."
- [ ] **Step 2:** `master-timeline.md` — seed with ~15 anchor dates (e.g., c. 1.5 Mya *H. erectus*; 7th c. Srivijaya rises; c. 800 Borobudur; 1293–1527 Majapahit; 1511 Malacca falls to Portugal; 1602 VOC; 1799 VOC dissolved; 1830 Cultivation System; 1908 Budi Utomo; 1928 Sumpah Pemuda; 1942 Japanese occupation; 1945 Proclamation; 1949 sovereignty transfer; 1965–66; 1998 Reformasi; 2004 first direct presidential election; 2024 Prabowo elected). Note "append/reconcile dates here."
- [ ] **Step 3:** `glossary-ledger.md` — seed with a handful of core terms (Pancasila, Dwifungsi, Konfrontasi, kraton, wayang, adat, pribumi, Reformasi) + "append new terms here."
- [ ] **Step 4:** `bibliography.md` — seed the standard works from the spec (Ricklefs; Vickers; Reid; Taylor; Elson; Cribb) as *leads to verify*, with a clear note: entries become "verified" only once a subagent has actually fetched/consulted them; append verified sources here.
- [ ] **Step 5:** `image-manifest.md` — header row only: `| filename | source URL | creator | license | caption |`.
- [ ] **Step 6: Commit.**

```bash
git add docs/indonesia-history/harness
git commit -m "feat(id-textbook): seed coherence harness (conventions/timeline/glossary/bib/images)"
```

### Task 0.6: Author front matter (cover, preface, introduction)

**Files:**
- Replace: `docs/indonesia-history/sections/00-cover.html`, `sections/00-preface.html`
- Create: `docs/indonesia-history/sections/01-introduction.html`
- Modify: `docs/indonesia-history/build/sections.json`

**Interfaces:**
- Produces the book's front matter and the first real TOC entries. Introduction establishes "the idea of Indonesia," periodization, and how to read the book.

- [ ] **Step 1:** Write `00-cover.html` (title, subtitle, a one-line scope statement) following the existing cover fragment's structure (look at `docs/textbook/sections/00-cover.html`).
- [ ] **Step 2:** Write `00-preface.html` — how to use the book, the periodization scheme, transliteration note, a note on sources & historiography, and an honest note that this is a survey synthesizing cited scholarship.
- [ ] **Step 3:** Write `01-introduction.html` — *The Idea of "Indonesia"*: geography of unity-in-diversity, why "Indonesia" is a modern concept, the archipelago's place in world history. Apply the full chapter structure from the STYLE_GUIDE including at least 2 figures and real endnotes (this chapter doubles as the template exemplar — author it to the standard you want every chapter to meet).
- [ ] **Step 4:** Update `sections.json` to add the `intro` entry after `preface`: `{ "id": "intro", "label": "Introduction", "title": "The Idea of \"Indonesia\"", "file": "01-introduction.html" }`.
- [ ] **Step 5: Build and eyeball.**

Run: `cd docs/indonesia-history/build && node build.mjs`
Expected: exits 0; PDF shows cover, preface, introduction, and a TOC listing them with the introduction's `<h2>` subsections nested.

- [ ] **Step 6: Commit.**

```bash
git add docs/indonesia-history/sections docs/indonesia-history/build/sections.json
git commit -m "feat(id-textbook): front matter — cover, preface, introduction"
```

### Task 0.7: Populate the full manifest with all 50 chapters + back matter

**Files:**
- Modify: `docs/indonesia-history/build/sections.json`

**Interfaces:**
- Produces the complete ordered manifest (Parts I–X, ch01–ch50, back matter), with `part` dividers. Missing fragments only warn at build time (existing `build.mjs` behavior: `console.warn("!! missing section …")`), so the TOC + page numbering scaffold exists before chapters are written.

- [ ] **Step 1:** Add all 50 chapter entries with stable `id`s (`ch1`…`ch50`), `file`s (`02-archipelago.html` … numbered sequentially), `label`s (`Chapter 1`…), `title`s from the spec §7 outline, and `part` set on the first chapter of each Part (I–X). Use the exact part names from the spec.
- [ ] **Step 2:** Add back-matter entries: `chronology`, `glossary`, `dynastic-tables`, `maps`, `bibliography`, `image-credits`, `index` — each with `part: "Back Matter"` on the first.
- [ ] **Step 3: Build to verify the manifest parses and the TOC scaffolds.**

Run: `cd docs/indonesia-history/build && node build.mjs 2>&1 | grep -c "missing section"`
Expected: build exits 0 (warnings are non-fatal); the count equals the number of not-yet-written sections — confirming the manifest is wired and the pipeline degrades gracefully.

- [ ] **Step 4: Commit.**

```bash
git add docs/indonesia-history/build/sections.json
git commit -m "feat(id-textbook): full chapter + back-matter manifest scaffold"
```

---

## CHAPTER-AUTHORING TASK TEMPLATE (reused for every chapter in Phases 1–5)

Each chapter is one subagent task. The subagent is dispatched with: the chapter number/title, its `part`, its target file from `sections.json`, a ~18–25pp length target, and this template. **The subagent's deliverable is the chapter HTML fragment + harness appends; its "test" is the phase-level build + verification checkpoint.**

Per-chapter steps the subagent MUST follow:

- [ ] **Step 1 — Read the harness:** read `build/STYLE_GUIDE.md`, `harness/conventions.md`, `harness/master-timeline.md`, `harness/glossary-ledger.md`, and the neighbouring chapters' titles in `sections.json` (to avoid overlap).
- [ ] **Step 2 — Research (fetch-then-cite):** use the `deep-research` skill (or web search + fetch) to gather sourced material for the chapter's topics. For every claim that will carry a citation, record the source (title, author, publisher/site, year, URL/DOI, page if applicable). Aim for 15–35 distinct verified sources per chapter. Do NOT proceed to writing claims you could not source.
- [ ] **Step 3 — Source images:** find 2–5 Wikimedia Commons images (PD/CC0/CC-BY/CC-BY-SA only — verify the license on the file's Commons page). Download each into `assets/img/<descriptive-name.ext>`. Append a row to `harness/image-manifest.md` (filename, source URL, creator, license, caption). Where a real image isn't available/appropriate, use a Mermaid diagram (timeline, map sketch, dynasty tree) instead.
- [ ] **Step 4 — Write the fragment** to its `sections/<file>.html` per the STYLE_GUIDE structure: objectives → lead → narrative `<h2 id>` subsections → figures (with attribution captions) → key terms → `<sup class="cite">` markers → summary → Review & Discussion Questions → `Notes` `<ol class="endnotes">` (1:1 with the cite markers). Follow conventions.md spellings.
- [ ] **Step 5 — Update the harness:** append new dates to `master-timeline.md`, new terms to `glossary-ledger.md`, new verified sources to `bibliography.md`, and any new spelling/style decisions to `conventions.md`.
- [ ] **Step 6 — Self-check:** confirm every `<sup class="cite">N</sup>` has a matching endnote N; every `<img>` file exists in `assets/img/` and has a manifest row + caption attribution; all `<h2>` have `id`s.
- [ ] **Step 7 — Handback:** report the chapter id, file, the cite-count, the image filenames used, and **explicitly flag any subsection where sourcing was thin or a claim is contested/uncertain.**

---

## PHASE 1 — Parts I–II (Chapters 1–10)

**Wave:** dispatch chapters 1–10 in parallel (or in two sub-waves of 5), each as a chapter-authoring task. Chapters: 1 Archipelago/geography; 2 Human origins; 3 Austronesian expansion; 4 Indian influence; 5 First kingdoms; 6 Srivijaya; 7 Central Java golden age; 8 Kediri/Singhasari; 9 Majapahit; 10 Bali.

- [ ] **Step 1:** Dispatch the 10 chapter-authoring tasks (per template above).
- [ ] **Step 2 — Build checkpoint.**

Run: `cd docs/indonesia-history/build && node build.mjs`
Expected: exits 0; PDF now renders chapters 1–10 with figures and endnotes; TOC updated.

- [ ] **Step 3 — Citation-verification checkpoint (adversarial):** dispatch a verification subagent to sample 3–5 endnotes per chapter, confirm each source exists and supports its claim (fetch/search), and report any fabricated/mismatched citations. Fix flagged chapters (re-dispatch the chapter task with the specific findings).
- [ ] **Step 4 — Consistency checkpoint:** skim `master-timeline.md`/`conventions.md` for contradictions introduced this wave; reconcile.
- [ ] **Step 5 — Commit the phase.**

```bash
git add docs/indonesia-history
git commit -m "feat(id-textbook): Phase 1 — chapters 1-10 (prehistory → classical kingdoms)"
```

## PHASE 2 — Parts III–V (Chapters 11–23)

- [ ] **Step 1:** Dispatch chapters 11–23 in waves of ~5 (per template). Topics per spec §7: Islam's coming; Malacca; the sultanates; spice trade; Portuguese; VOC; VOC decline; East Indies state; Cultivation System; Java/Padri wars; Aceh War; Ethical Policy; colonial society.
- [ ] **Step 2 — Build checkpoint:** `node build.mjs` exits 0; chapters 11–23 render.
- [ ] **Step 3 — Citation-verification checkpoint** (as Phase 1 Step 3).
- [ ] **Step 4 — Consistency checkpoint** (timeline/conventions).
- [ ] **Step 5 — Commit:** `git commit -m "feat(id-textbook): Phase 2 — chapters 11-23 (Islam → colonial state)"`.

## PHASE 3 — Parts VI–VII (Chapters 24–30)

- [ ] **Step 1:** Dispatch chapters 24–30 (per template). Topics: nationalism origins; ideologies (Islam/PKI/secular); Sukarno-Hatta & Sumpah Pemuda; Japanese occupation; Revolution 1945–49; parliamentary democracy; Guided Democracy/Konfrontasi/rebellions.
- [ ] **Step 2 — Build checkpoint:** `node build.mjs` exits 0; chapters 24–30 render.
- [ ] **Step 3 — Citation-verification checkpoint.**
- [ ] **Step 4 — Consistency checkpoint.**
- [ ] **Step 5 — Commit:** `git commit -m "feat(id-textbook): Phase 3 — chapters 24-30 (nationalism → Sukarno)"`.

## PHASE 4 — Parts VIII–IX (Chapters 31–43)

- [ ] **Step 1:** Dispatch chapters 31–43 in waves of ~5 (per template). Topics: 1965 & Suharto's rise; New Order state; economic transformation; East Timor/Aceh/Papua; New Order society; 1997–98 crisis & fall; democratization/decentralization; reform-era presidents; Jokowi/Prabowo/2024; contemporary economy & Nusantara; religion & pluralism; separatism/human rights; Indonesia in the world. **Extra care on contested history (1965, 1998, Papua) — attribute positions.**
- [ ] **Step 2 — Build checkpoint:** `node build.mjs` exits 0; chapters 31–43 render.
- [ ] **Step 3 — Citation-verification checkpoint** (heightened: sample more endnotes on the contested chapters).
- [ ] **Step 4 — Consistency checkpoint.**
- [ ] **Step 5 — Commit:** `git commit -m "feat(id-textbook): Phase 4 — chapters 31-43 (New Order → contemporary)"`.

## PHASE 5 — Part X thematic + back matter (Chapters 44–50 + appendices)

- [ ] **Step 1:** Dispatch thematic chapters 44–50 (per template): cultural; religious; economic; Chinese-Indonesians/diasporas; women/gender/family; environmental; historiography.
- [ ] **Step 2 — Assemble back matter from the harness** (one task each):
  - `chronology` ← finalize/format `master-timeline.md`.
  - `glossary` ← finalize/format `glossary-ledger.md` + transliteration guide.
  - `dynastic-tables` ← compile rulers/dynasties/presidents (use `.dynasty-table`).
  - `maps` ← collect the key maps (PD/CC, attributed) into a maps appendix.
  - `bibliography` ← dedupe/sort `bibliography.md` into `.bibliography`/`.bib-entry` Chicago entries.
  - `image-credits` ← render `image-manifest.md` as the credits/licenses appendix.
  - `index` ← key-terms index from the glossary + chapter `<h2 id>`s.
- [ ] **Step 3 — Final build checkpoint:** `node build.mjs` exits 0; the complete PDF renders all ~50 chapters + full back matter; spot-check page count is in the ~1000pp range and the TOC is complete.
- [ ] **Step 4 — Final citation-verification + consistency sweep.**
- [ ] **Step 5 — Commit:** `git commit -m "feat(id-textbook): Phase 5 — thematic chapters + back matter; complete first edition"`.

---

## Self-Review

**Spec coverage:** scope (prehistory→2026) → front matter + Parts I–X ✓; reuse pipeline → Task 0.1 ✓; image support → Task 0.2 ✓; Chicago fetch-then-cite → STYLE_GUIDE 0.4 + template Steps 2/4 + verification checkpoints ✓; Wikimedia PD/CC images + credits → template Step 3 + Task 0.5 image-manifest + Phase 5 image-credits ✓; coherence harness → Task 0.5 + template Steps 1/5 ✓; chapter structure §6 → STYLE_GUIDE 0.4 ✓; ~50-chapter outline §7 → Task 0.7 + Phases 1–5 ✓; phasing §8 → Phases 0–5 ✓; risks §9 (cost→phasing; citation→verification; consistency→harness; licensing→manifest; contested→attribute) ✓; decisions §10 (no exams → template uses Review & Discussion Questions only, no answer keys) ✓.

**Placeholder scan:** Phase 1–5 chapter *content* is intentionally not pre-written (it is research output, not predeterminable code); every *mechanical* step (build commands, expected output, file paths, the image-inlining code, CSS, manifest entries) is concrete. No "TBD"/"handle errors"-style gaps in the pipeline tasks.

**Type/name consistency:** `inlineImages()` defined in 0.2 and used in 0.2; CSS classes defined in 0.3 (`figure.photo`, `.credit`, `sup.cite`, `ol.endnotes`, `.bibliography`/`.bib-entry`, `.dynasty-table`) are exactly the ones referenced in STYLE_GUIDE 0.4 and the template; harness filenames identical across 0.4/0.5/template; `sections.json` ids (`ch1..ch50` + back-matter ids) consistent between 0.7 and Phases 1–5.

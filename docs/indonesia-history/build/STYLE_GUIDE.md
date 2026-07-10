# Section fragment style guide — *Indonesia: A Comprehensive History* → PDF

Each chapter is an **HTML fragment** saved to `docs/indonesia-history/sections/<file>.html`.
The build injects the chapter title `<h1 class="section">` for you, so your fragment **starts
with the body content** (do NOT include the section `<h1>`).

This is a **university-grade history survey** for a serious general reader. Voice: clear,
narrative, scholarly but readable. Explain debates; define terms on first use; never assume
prior knowledge of Indonesian history.

## READ FIRST (the coherence harness)
Before writing, read and then (after writing) append to:
- `../harness/conventions.md` — preferred spellings, dates, periods, citation/figure rules. Follow exactly.
- `../harness/master-timeline.md` — reconcile every date you state; append/fix dates.
- `../harness/glossary-ledger.md` — reuse existing definitions; append new terms.
- `../harness/bibliography.md` — append every source you cite (Chicago).
- `../harness/image-manifest.md` — append a row for every image you download.
Also read the titles of the chapters adjacent to yours in `build/sections.json` to avoid overlap.

## Accuracy & citation contract (non-negotiable)
- **No citation from memory.** Every cited claim must come from a source you ACTUALLY fetched
  during research (web search + fetch, or the `deep-research` skill). Record title, author,
  publisher/site, year, URL/DOI, and page where applicable. Fabricated or uncheckable citations
  are a failure — if you cannot source a claim, soften it or cut it.
- Aim for **15–35 distinct verified sources** per chapter.
- **Chicago notes-bibliography.** In prose, mark a citation `<sup class="cite">N</sup>`. At the
  end of the chapter add the Notes block (below). The Nth `<li>` matches `<sup class="cite">N</sup>`.
- **Contested history** (e.g., extent of Majapahit, the 1965 killings, 1998, Papua): present the
  scholarly debate and attribute positions; do not assert one contested narrative as settled fact.

## Image contract
- **Wikimedia Commons only**, license = public-domain, CC0, CC-BY, or CC-BY-SA. Verify the license
  on the file's Commons page before using it.
- Download into `../assets/img/<descriptive-kebab-name>.<ext>` and reference as `src="img/<name>"`.
- Append a row to `../harness/image-manifest.md` (filename, source URL, creator, license, caption).
- Every photo caption ends with a `<span class="credit">` carrying source URL + creator + license.
- 2–5 figures per chapter. Where a suitable real image is unavailable, use a Mermaid diagram
  (timeline, route map sketch, dynasty tree, comparison) instead.

## Required chapter structure (in order)
1. **Learning objectives:**
   ```html
   <div class="objectives"><h4>Learning Objectives</h4><ul><li>…</li></ul></div>
   ```
2. **Lead paragraph:** `<p class="lead">…</p>`.
3. **Narrative body** with `<h2 id="kebab-id">…</h2>` subsections — the `id` is REQUIRED (feeds
   the table of contents). Use `<h3>`/`<h4>` for deeper nesting (no id needed). Weave
   `<sup class="cite">N</sup>` markers into the prose as you make sourced claims.
4. **Figures (2–5)**, each with a numbered `<figcaption>`:
   ```html
   <figure class="photo">
     <img src="img/borobudur-aerial.jpg" alt="Aerial view of Borobudur">
     <figcaption>Figure 7.1: Borobudur, Central Java.
       <span class="credit">Source: <a href="URL">Wikimedia Commons</a>. Creator. License (e.g., CC BY-SA 4.0).</span>
     </figcaption>
   </figure>
   ```
   or a diagram:
   ```html
   <figure class="mermaid-fig"><div class="mermaid">
   timeline
     title Majapahit rulers
     1293 : Raden Wijaya
     1350 : Hayam Wuruk
   </div><figcaption>Figure 9.2: Majapahit succession.</figcaption></figure>
   ```
   Number figures `Figure <chapter>.<n>`. Do NOT put raw `<`/`>` inside Mermaid labels.
5. **Key terms** where a concept is first introduced:
   `<div class="keyterm"><span class="term">Thalassocracy</span> — a maritime power based on sea trade…</div>`
6. **Chapter summary:** `<div class="summary"><h4>Summary</h4>…</div>`.
7. **Review & Discussion Questions (6–10)** — open-ended, no answer keys:
   ```html
   <div class="exercises"><h2 id="ch<N>-questions">Review &amp; Discussion Questions</h2>
     <div class="exercise"><span class="qid"><N>.1</span> Question text…</div>
   </div>
   ```
8. **Notes (endnotes):**
   ```html
   <h2 id="ch<N>-notes" class="notes-h">Notes</h2>
   <ol class="endnotes">
     <li>Author First Last, <i>Title</i> (Place: Publisher, Year), p. N.</li>
     <li>Org, "Page Title," Site, accessed Month Year, https://…</li>
   </ol>
   ```

## Callouts available
`<div class="note">`, `<div class="warn">`, `<div class="ok">`, `<div class="keyterm">`,
`<div class="summary">`, `<div class="objectives">`. Stat strip:
`<div class="stats"><div class="stat"><div class="v">1293</div><div class="l">Majapahit founded</div></div></div>`.
Tables of rulers/dynasties: `<table class="dynasty-table">…</table>`.

## Length
Dense narrative history + figures + tables. Target the page count in your task brief
(typically ~18–25 printed pages). Thoroughness is welcome; padding is not.

## Don't
- No `<html>/<head>/<body>`, no `<h1 class="section">` (the build injects it), no `<script>`,
  no external CSS, no remote `<img>` URLs (download to `assets/img/` instead).
- No citing from memory. No raw `<`/`>` inside Mermaid labels.
- No inventing dates, quotations, or statistics. When unsure, attribute or hedge honestly.

# Design Spec — *Indonesia: A Comprehensive History* (textbook PDF)

**Date:** 2026-06-26
**Status:** Approved (design); ready for implementation planning
**Deliverable:** A university-grade, expert-level history textbook (~1000 pp.) covering the
Indonesian archipelago from deep prehistory to 2026, with real cited sources, real
public-domain/CC images, original diagrams, and a print-quality PDF build.

## 1. Goal & audience

Produce a comprehensive survey that a motivated non-specialist can read cover-to-cover and
come away genuinely conversant — "expert" in the sense of a well-read generalist, not a
credentialed area specialist.

- **Audience:** serious general reader / undergraduate survey level. Voice: clear,
  pedagogical, scholarly but readable. Define terms; explain debates; avoid jargon without
  glossing it.
- **Scope (decided):** broad reading of "founding → today." Covers prehistory → classical
  Hindu-Buddhist kingdoms → Islamic sultanates → European encounter & VOC → colonial state →
  national awakening → Japanese occupation & revolution → Sukarno → New Order → Reformasi →
  contemporary Indonesia (through the 2024 election / 2026), plus thematic syntheses.
- **Length target:** ~1000 printed pages (~400,000–500,000 words) across ~50 chapters at
  ~18–25 pp. each. Built in phases; the project is stoppable at any phase milestone with a
  coherent partial book.

## 2. Build approach (reuse the existing pipeline)

Fork the proven `docs/textbook/` pipeline into a new **`docs/indonesia-history/`**:

- Playwright/Chromium offline HTML→PDF renderer (`build.mjs`), inlined Mermaid for diagrams.
- Section-fragment HTML files + a `sections.json` manifest + `assets/doc.css`.
- Auto-generated cover, table of contents (from manifest + `<h2 id>` subsections), and
  `part` dividers — already supported by the existing `build.mjs`.

**Required pipeline adaptation — image support.** The current style guide forbids external
images. This book needs real imagery, so the forked pipeline MUST support embedded images
while staying fully offline and self-contained. Approach:

- Store sourced images under `docs/indonesia-history/assets/img/`.
- Embed them in the PDF as **base64 data-URIs** (preferred — keeps the single output file
  self-contained and offline), or render Playwright from a `file://` base so relative
  `assets/img/...` references resolve. Implementer picks one in Phase 0; base64 is the
  default recommendation.
- Add CSS for figures-with-photos, captions, attribution lines, endnote/citation styling.

**Output:** `docs/indonesia-history/indonesia-a-comprehensive-history.(html|pdf)`.

Rationale: proven, visually consistent with existing rmh docs, fully offline, already handles
TOC/figures/PDF. Alternatives (Pandoc/LaTeX, React-PDF) rejected as higher-risk and
stylistically inconsistent with the repo.

## 3. Citation & accuracy contract (non-negotiable)

- **Citation style: Chicago notes-bibliography.** Inline superscript markers in the prose →
  a numbered **endnotes** list at the end of each chapter → a single consolidated **master
  bibliography** in back matter.
- **No citation from memory.** Every cited claim must trace to a source the writing subagent
  *actually fetched during its research pass* (record the URL/DOI). Subagents use the
  `deep-research` skill / web search + fetch to ground claims before writing.
- **Adversarial verification pass.** After a chapter is drafted, a separate verification
  step spot-checks a sample of citations for (a) the source existing and (b) actually
  supporting the claim. Any chapter with thin/unverifiable sourcing is flagged in its
  handback, not silently shipped.
- **Seed scholarship.** A starter bibliography of standard works seeds research and is
  extended per chapter, e.g.: Ricklefs, *A History of Modern Indonesia since c. 1200*;
  Vickers, *A History of Modern Indonesia*; Reid, *Southeast Asia in the Age of Commerce*;
  Taylor, *Indonesia: Peoples and Histories*; Elson, *The Idea of Indonesia*; Cribb,
  *Historical Atlas of Indonesia*. (Treated as leads to verify, not as quotable-from-memory.)
- **Honesty on contested history.** Where scholarship disagrees (e.g., extent of Majapahit,
  the 1965 killings, 1998, Papua), present the debate and attribute positions; do not assert
  one contested narrative as settled fact.

## 4. Image sourcing (legal + real)

- **Source: Wikimedia Commons only**, restricted to **public-domain, CC0, CC-BY, or
  CC-BY-SA** images; license verified per image before use.
- For each image record: source URL, creator/author, license, and a short caption.
- Every figure caption carries attribution; a **Image Credits & Licenses** appendix lists
  every image with full attribution and license.
- Content mix: real imagery (maps, manuscripts, inscriptions, temple/architecture photos,
  colonial-era photographs, portraits) **plus** original generated diagrams (Mermaid/SVG):
  timelines, dynastic trees, trade-route maps, comparative tables.

## 5. Coherence harness (cross-chapter consistency)

Because ~50 chapters are written by many subagents, a shared, append-only harness keeps the
book consistent. Every writing subagent reads these first and appends to them:

- `conventions.md` — transliteration/spelling rules (e.g., Srivijaya, Majapahit, Sukarno vs
  Soekarno, Yogyakarta), date/era conventions, periodization, naming of figures/places,
  citation formatting rules.
- `master-timeline.md` — growing canonical chronology; chapters reconcile their dates here.
- `glossary-ledger.md` — running glossary / names ledger feeding the back-matter glossary.
- `bibliography.md` — seed + accumulating verified sources feeding the master bibliography.

This mirrors the established VerseCraft cohesion-harness pattern in this repo.

## 6. Chapter structure (per chapter)

Following an adapted version of the existing `STYLE_GUIDE.md`:

1. Learning objectives box.
2. Lead paragraph (`<p class="lead">`).
3. Narrative body with `<h2 id="kebab-id">` subsections (ids feed the TOC), `<h3>/<h4>` nesting.
4. 2–5 figures (real images and/or Mermaid diagrams), each with a numbered `<figcaption>` +
   attribution where applicable.
5. Key-term callouts where concepts are first introduced.
6. Chapter summary box.
7. **Review & Discussion Questions** (6–10) — lightweight, NOT the full exam/worked-solution
   apparatus of the rmh codebase textbook (decided: history survey doesn't need exams; this
   keeps scope focused).
8. **Endnotes** — numbered citations for the chapter.

## 7. Chapter outline (~50 chapters)

**Front matter:** Cover · Preface (how to use, periodization, transliteration) · Introduction:
*The Idea of "Indonesia."*

**Part I — Land, Peoples, Deep Time**
1. The Archipelago: Geography, Geology, Volcanoes, Monsoons & the Sea (Wallace Line)
2. Human Origins: *Homo erectus* (Sangiran/Trinil), *Homo floresiensis* (Liang Bua)
3. The Austronesian Expansion: Language, Migration, Neolithic Societies, Megaliths, Dong Son
4. Early Trade & the Coming of Indian Influence (the "Indianization" debate)

**Part II — Classical Hindu-Buddhist Era (4th–15th c.)**
5. First Kingdoms: Kutai, Tarumanagara & the Earliest Inscriptions
6. Srivijaya: The Maritime Empire of Sumatra
7. Central Java's Golden Age: Sailendra, Mataram, Borobudur & Prambanan
8. Eastern Java: Kediri & Singhasari
9. Majapahit: The Great Archipelagic Empire (Gajah Mada, *Nagarakretagama*)
10. Bali & Cultural-Religious Continuity

**Part III — Islam & the Sultanates (13th–17th c.)**
11. The Coming of Islam (Sufism, trade, Pasai, the Wali Songo)
12. Malacca & the Maritime Muslim World
13. The Sultanates: Aceh, Banten, Demak, Islamic Mataram, Makassar, Ternate/Tidore
14. The Spice Trade & the Early Global Economy

**Part IV — Encounter & the VOC (16th–18th c.)**
15. The Portuguese & First European Intrusion
16. The Dutch VOC: A Company-State (Batavia, Coen, monopoly)
17. VOC Expansion, the Banda Massacre, Wars & Decline (bankruptcy 1799)

**Part V — The Colonial State (19th c.)**
18. From Company to Crown: The Netherlands East Indies
19. The Cultivation System (*Cultuurstelsel*) & Its Consequences
20. The Java War, Padri War & Regional Resistance
21. The Aceh War & the Completion of Conquest
22. Liberal Era, Plantation Economy & the Ethical Policy
23. Colonial Society: Race, Class & Daily Life

**Part VI — National Awakening (1900–1942)**
24. Origins of Nationalism (Budi Utomo, Sarekat Islam, education)
25. Ideologies in Contest: Islam, Communism (PKI), Secular Nationalism
26. Sukarno, Hatta & the Movement; *Sumpah Pemuda* 1928

**Part VII — Occupation, Revolution & Sukarno (1942–1965)**
27. The Japanese Occupation 1942–45
28. Proclamation & the National Revolution 1945–49
29. Parliamentary Democracy & Its Crises 1950–57
30. Guided Democracy, *Konfrontasi* & Regional Rebellions

**Part VIII — The New Order (1965–1998)**
31. 1965: The Coup, the Mass Killings & Suharto's Rise
32. The New Order State: Developmentalism, Pancasila, *Dwifungsi*
33. Economic Transformation & Its Discontents
34. East Timor, Aceh & Papua: Integration & Insurgency
35. Society, Religion & Culture under the New Order

**Part IX — Reformasi & Contemporary Indonesia (1998–2026)**
36. The 1997–98 Crisis & the Fall of Suharto
37. Democratization, Decentralization & Reformasi
38. Reform-Era Presidents: Habibie, Wahid, Megawati, SBY
39. Jokowi, Prabowo & the 2024 Election
40. Contemporary Economy, Infrastructure & the New Capital (Nusantara)
41. Religion, Islam & Pluralism Today
42. Separatism, Human Rights & Unresolved Pasts
43. Indonesia in the World: ASEAN, China & Geopolitics

**Part X — Thematic Syntheses (span all eras)**
44. Cultural History: Language, Literature, Wayang, Batik, Architecture
45. Religious History across the Archipelago
46. Economic History: From Spices to Palm Oil & Nickel
47. The Chinese Indonesians & Other Diasporas
48. Women, Gender & Family Through Indonesian History
49. Environmental History: Forests, Volcanoes & Climate
50. Historiography: *How We Know* — Sources, Debates & Contested Pasts

**Back matter:** Master Chronology · Glossary & Transliteration Guide · Dynastic/Presidential
Tables · Maps Appendix · **Consolidated Bibliography** · **Image Credits & Licenses** ·
Key-Terms Index.

## 8. Phasing (built in waves; stop at any milestone)

- **Phase 0 — Scaffolding** (done directly, not via subagents): fork pipeline to
  `docs/indonesia-history/`; implement image support; write `conventions.md`, seed
  `bibliography.md`, `master-timeline.md`, `glossary-ledger.md`; author cover + preface +
  introduction; extend `doc.css` (figures/photos/attribution/endnotes); set up `sections.json`.
- **Phase 1 — Parts I–II** (ch 1–10): prehistory → classical kingdoms.
- **Phase 2 — Parts III–V** (ch 11–23): Islam → colonialism.
- **Phase 3 — Parts VI–VII** (ch 24–30): nationalism → Sukarno.
- **Phase 4 — Parts VIII–IX** (ch 31–43): New Order → contemporary.
- **Phase 5 — Part X + back matter** (ch 44–50 + bibliography, glossary, maps, timeline,
  credits, index).

**Per-chapter subagent loop (every chapter):** deep web research + source-fetch → record
verified citations → source PD/CC images (license-checked) → write the HTML fragment per §6 →
append to the shared ledger/timeline/bibliography → adversarial citation-verification
spot-check → handback noting any thin sourcing.

Each phase is a wave of parallel chapter-writing subagents, reviewed before moving to the
next phase.

## 9. Risks & mitigations

- **Scale/cost:** ~50 research-heavy chapters = many large subagent runs over multiple
  sessions and significant token spend. *Mitigation:* phasing; each phase delivers a coherent
  partial book; stoppable at any milestone.
- **Citation integrity (top risk):** subagents can fabricate plausible-but-fake citations.
  *Mitigation:* fetch-then-cite contract (record URLs/DOIs), adversarial verification pass,
  explicit flagging of thin sourcing. Spot-checks won't catch everything — residual risk
  acknowledged.
- **Cross-chapter inconsistency** (spellings, dates, overlapping coverage): *Mitigation:* the
  coherence harness (§5) read/appended by every subagent.
- **Image licensing:** *Mitigation:* Commons-only, license-verified, full credits appendix.
- **Contested history framed as fact:** *Mitigation:* attribute positions, present debates
  (§3).

## 10. Decisions captured

- Scope: prehistory → 2026 (broad reading). ✓
- Citations: Chicago notes-bibliography, fetch-then-cite, verified. ✓
- Images: Wikimedia Commons PD/CC only, downloaded + attributed. ✓
- Length: target ~1000 pp., phased. ✓
- Format: fork existing `docs/textbook/` Playwright PDF pipeline + add image support. ✓
- Exercises: lightweight Review & Discussion Questions only; no exams/worked-solution
  appendices. ✓

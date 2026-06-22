# Section fragment style guide — rmhstudios textbook → PDF

Each section is an **HTML fragment** saved to `docs/textbook/sections/<file>.html`.
The build script injects the chapter title `<h1 class="section">` for you, so your
fragment **starts with the body content** (do NOT include the section `<h1>`).

This is a **CS-student textbook**. Voice: clear, pedagogical, precise. Define terms.
Frame the rmhstudios system as the running case study for general concepts (SSR,
realtime, ORMs, build systems, strangler-fig migration, horizontal scaling).

## Accuracy contract (non-negotiable)
This documents REAL code. READ the actual files named in your task and quote real
identifiers, ports, event names, model names, script names, and behaviors. Where
something is scaffolded vs. production, say so honestly with a `<div class="scope">`.
Do NOT invent metrics, dates, or features. Where unsure, describe the pattern
generically rather than fabricating specifics.

## Required chapter structure (in order)
1. **Learning objectives** box:
   ```html
   <div class="objectives"><h4>Learning Objectives</h4><ul>
     <li>...</li></ul></div>
   ```
2. Lead paragraph: `<p class="lead">…</p>`.
3. Narrative body with `<h2 id="kebab-id">…</h2>` subsections (the `id` is REQUIRED —
   it feeds the table of contents). `<h3>`/`<h4>` for deeper nesting (no id needed).
4. **2–4 Mermaid figures** (see below), each with a `<figcaption>`.
5. **Key terms** where a concept is first introduced:
   `<div class="keyterm"><span class="term">Strangler-fig</span> — definition…</div>`
6. Boxed real-code excerpts: `<pre><code>…</code></pre>` (escape `&lt; &gt; &amp;`).
7. **Chapter summary**: `<div class="summary"><h4>Summary</h4>…</div>`.
8. **Practice exercises** (6–10), inside one block:
   ```html
   <div class="exercises"><h2 id="ch<N>-exercises">Practice Exercises</h2>
     <div class="exercise"><span class="qid">N.1</span>
       <span class="tag concept">concept</span><span class="tag easy">easy</span>
       Question text…</div>
   </div>
   ```
   Number exercises `N.1, N.2, …` where N is the chapter number. Tag each with ONE
   type (`concept` / `trace` / `diagram` / `design`) and ONE difficulty
   (`easy` / `medium` / `hard`). These ids are referenced by Appendix A solutions —
   keep them stable and report them back.

## Callouts available
`<div class="note">`, `<div class="warn">`, `<div class="ok">`, `<div class="scope">`,
`<div class="keyterm">`, `<div class="summary">`. Stat strip:
`<div class="stats"><div class="stat"><div class="v">142</div><div class="l">Prisma models</div></div></div>`.

## Diagrams (Mermaid) — 2–4 per chapter
```html
<figure class="mermaid-fig">
  <div class="mermaid">
flowchart LR
  A[Client] --> B[Nitro SSR] --> C[(Postgres)]
  </div>
  <figcaption>Figure N.1: request path.</figcaption>
</figure>
```
Types: `flowchart`, `sequenceDiagram`, `stateDiagram-v2`, `classDiagram`, `erDiagram`.
Keep labels short. Do NOT put raw `<`/`>` inside mermaid labels. Number figures `N.x`.

## Exam fragments
Use `<div class="exam-meta"><span class="pill">90 minutes</span><span class="pill">100 points</span></div>`
then `<div class="exam-section">` with `<h2 id="...">Part I — Multiple Choice</h2>`, and
questions as `<div class="exam-q"><span class="qid">A1</span><span class="pts">4 pts</span>
Question… <ol class="choices"><li>…</li></ol></div>`. Prefix exam ids by exam:
Midterm = `A1, A2…`, Final = `B1…`, Comprehensive = `C1…`.

## Solution / answer-key fragments (appendices)
`<div class="solution"><span class="qid">3.2</span> <span class="ans">Answer:</span> worked explanation…</div>`

## Length
Dense technical prose + diagrams + code + tables. Chapters: aim for the page target in
your task. This is a thorough reference textbook — thoroughness is welcome.

## Don't
- No `<html>/<head>/<body>`, no `<h1 class="section">`, no `<script>`, no external
  images/CSS. Self-contained HTML fragment only.

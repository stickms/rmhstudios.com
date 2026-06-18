# Section fragment style guide (rmhstudios-go migration report → PDF)

Each section is an **HTML fragment** saved to `docs/go-migration/sections/<file>.html`.
The build script injects the numbered `<h1 class="section">` title for you, so your
fragment **starts with the body content** (do NOT include the section `<h1>`).

## Allowed structure
- Open with a `<p class="lead">…</p>` one-paragraph summary of the section.
- Use `<h2 id="kebab-id">Title</h2>` for subsections — the `id` is REQUIRED (it
  feeds the table of contents). Use `<h3>` / `<h4>` for deeper nesting (no id needed).
- Paragraphs `<p>`, lists `<ul>/<ol><li>`.
- Tables: `<table><thead><tr><th>…</th></tr></thead><tbody><tr><td>…</td></tr></tbody></table>`.
- Code: `<pre><code>…</code></pre>`. Escape `<`, `>`, `&` as `&lt; &gt; &amp;`.
  Keep lines ≤ ~90 chars (they wrap, but keep it readable). Show REAL excerpts.
- Callouts: `<div class="note">`, `<div class="warn">`, `<div class="ok">`,
  `<div class="scope">` (use `scope` for honest "what's faithful vs stubbed" notes).
- Stat strip: `<div class="stats"><div class="stat"><div class="v">9</div><div class="l">services</div></div>…</div>`.

## Diagrams (Mermaid) — use them generously, 1–3 per section
Wrap each in a figure:
```
<figure class="mermaid-fig">
  <div class="mermaid">
flowchart LR
  A[Client] --> B[Gateway] --> C[Service]
  </div>
  <figcaption>Figure: request path.</figcaption>
</figure>
```
Mermaid types you may use: `flowchart`, `sequenceDiagram`, `stateDiagram-v2`,
`classDiagram`, `erDiagram`. Keep node labels short. Do NOT put raw `<`/`>` inside
mermaid labels. Prefer `flowchart` and `sequenceDiagram`.

## Accuracy
This documents REAL code under `go-services/`. READ the actual files you describe
(paths given in your task) and quote real identifiers, ports, event names, SQL,
and behaviors. Be honest about what is faithfully ported vs scaffolded/stubbed —
use a `scope` callout. Do not invent.

## Length
Aim for the page target in your task (dense technical prose + diagrams + code +
tables). It's fine to be thorough; this is a reference document.

## Don't
- No `<html>/<head>/<body>`, no `<h1 class="section">`, no `<script>`, no external
  images/CSS. Self-contained HTML fragment only.

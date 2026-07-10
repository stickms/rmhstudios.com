// Assemble the textbook section fragments into one HTML document, then render to
// PDF with Playwright/Chromium (Mermaid diagrams rendered in-page first). Fully
// offline: Mermaid is inlined from node_modules; no CDN.
//
//   node build.mjs
//
// Output: docs/textbook/rmhstudios-architecture-and-history.(html|pdf)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");            // docs/textbook
const SECTIONS = resolve(ROOT, "sections");
const ASSETS = resolve(ROOT, "assets");

const manifest = JSON.parse(readFileSync(resolve(__dirname, "sections.json"), "utf8"));
const css = readFileSync(resolve(ASSETS, "doc.css"), "utf8");
const mermaidJs = readFileSync(
  resolve(__dirname, "node_modules/mermaid/dist/mermaid.min.js"), "utf8");

const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// ── Build body + collect TOC entries ─────────────────────────────────────────
// Each manifest entry carries an explicit `label` (e.g. "Chapter 1", "Exam A",
// "Appendix A", "Front Matter"). The label is rendered as a kicker above the
// title and used as the TOC numeral.
let body = "";
const toc = [];
manifest.sections.forEach((sec) => {
  const file = resolve(SECTIONS, sec.file);
  if (!existsSync(file)) { console.warn(`!! missing section ${sec.file}`); return; }
  const frag = readFileSync(file, "utf8");
  // Sub-entries: every <h2 id="..."> in the fragment.
  const subs = [...frag.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)]
    .map((m) => ({ id: m[1], title: stripTags(m[2]) }));
  toc.push({ id: sec.id, label: sec.label || "", title: sec.title, subs, part: sec.part });
  body += `<section class="doc-section">
    <h1 class="section" id="${sec.id}">${sec.label ? `<span class="kicker">${sec.label}</span>` : ""}<span class="ttl">${sec.title}</span></h1>
    ${frag}
  </section>\n`;
});

// TOC, grouped by `part` dividers when a section declares a new part.
let lastPart = null;
const tocItems = toc.map((s) => {
  let out = "";
  if (s.part && s.part !== lastPart) {
    out += `<li class="toc-part">${s.part}</li>`;
    lastPart = s.part;
  }
  out += `<li><a href="#${s.id}"><span class="secnum">${s.label}</span><span class="toc-ttl">${s.title}</span></a>
    ${s.subs.length ? `<ol>${s.subs.map((x) => `<li><a href="#${x.id}">${x.title}</a></li>`).join("")}</ol>` : ""}
  </li>`;
  return out;
}).join("\n");
const tocHtml = `<div class="toc"><h1>Contents</h1><ol>${tocItems}</ol></div>`;

const cover = readFileSync(resolve(SECTIONS, manifest.cover), "utf8");

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>${manifest.title}</title>
<style>${css}</style>
</head><body>
${cover}
${tocHtml}
${body}
<script>${mermaidJs}</script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: "neutral", flowchart: { useMaxWidth: true, htmlLabels: true }, sequence: { useMaxWidth: true }, themeVariables: { fontSize: "13px" } });
  (async () => {
    try { await mermaid.run({ querySelector: ".mermaid" }); }
    catch (e) { console.error("mermaid error", e); }
    window.__DOC_READY__ = true;
  })();
</script>
</body></html>`;

const outHtml = resolve(ROOT, "rmhstudios-architecture-and-history.html");
const outPdf = resolve(ROOT, "rmhstudios-architecture-and-history.pdf");
writeFileSync(outHtml, html);
console.log(`assembled ${manifest.sections.length} sections + ${toc.reduce((a, s) => a + s.subs.length, 0)} subsections → ${outHtml}`);

// ── Render ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto("file://" + outHtml, { waitUntil: "networkidle" });
await page.waitForFunction("window.__DOC_READY__ === true", { timeout: 90000 });
await page.waitForTimeout(500); // let SVG layout settle

const footer = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:7pt;color:#5b6675;width:100%;padding:0 15mm;display:flex;justify-content:space-between;">
  <span>${manifest.footer}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
const header = `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:7pt;color:#9aa6b6;width:100%;padding:0 15mm;text-align:right;">${manifest.headerRight}</div>`;

await page.pdf({
  path: outPdf,
  format: "A4",
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: header,
  footerTemplate: footer,
  margin: { top: "16mm", bottom: "16mm", left: "0mm", right: "0mm" },
});
await browser.close();
console.log(`wrote ${outPdf}`);

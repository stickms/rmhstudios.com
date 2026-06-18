// Assemble the section fragments into one HTML document, then render to PDF with
// Playwright/Chromium (Mermaid diagrams rendered in-page first). Fully offline:
// Mermaid is inlined from node_modules; no CDN.
//
//   node build.mjs
//
// Output: docs/go-migration/rmhstudios-go-migration.(html|pdf)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");            // docs/go-migration
const SECTIONS = resolve(ROOT, "sections");
const ASSETS = resolve(ROOT, "assets");

const manifest = JSON.parse(readFileSync(resolve(__dirname, "sections.json"), "utf8"));
const css = readFileSync(resolve(ASSETS, "doc.css"), "utf8");
const mermaidJs = readFileSync(
  resolve(__dirname, "node_modules/mermaid/dist/mermaid.min.js"), "utf8");

const stripTags = (s) => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

// ── Build body + collect TOC entries ─────────────────────────────────────────
let body = "";
const toc = [];
manifest.sections.forEach((sec, i) => {
  const n = i + 1;
  const file = resolve(SECTIONS, sec.file);
  if (!existsSync(file)) { console.warn(`!! missing section ${sec.file}`); return; }
  const frag = readFileSync(file, "utf8");
  // Sub-entries: every <h2 id="..."> in the fragment.
  const subs = [...frag.matchAll(/<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g)]
    .map((m) => ({ id: m[1], title: stripTags(m[2]) }));
  toc.push({ id: sec.id, num: n, title: sec.title, subs });
  body += `<section class="doc-section">
    <h1 class="section" id="${sec.id}"><span class="num">${n}</span>${sec.title}</h1>
    ${frag}
  </section>\n`;
});

const tocHtml = `<div class="toc">
  <h1>Contents</h1>
  <ol>
    ${toc.map((s) => `<li><a href="#${s.id}"><span class="secnum">${s.num}</span>${s.title}</a>
      ${s.subs.length ? `<ol>${s.subs.map((x) => `<li><a href="#${x.id}">${x.title}</a></li>`).join("")}</ol>` : ""}
    </li>`).join("\n")}
  </ol>
</div>`;

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

const outHtml = resolve(ROOT, "rmhstudios-go-migration.html");
const outPdf = resolve(ROOT, "rmhstudios-go-migration.pdf");
writeFileSync(outHtml, html);
console.log(`assembled ${manifest.sections.length} sections + ${toc.reduce((a, s) => a + s.subs.length, 0)} subsections → ${outHtml}`);

// ── Render ───────────────────────────────────────────────────────────────────
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto("file://" + outHtml, { waitUntil: "networkidle" });
await page.waitForFunction("window.__DOC_READY__ === true", { timeout: 60000 });
await page.waitForTimeout(400); // let SVG layout settle

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

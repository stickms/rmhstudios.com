// Assemble Appendix A (chapter exercise solutions) and Appendix B (exam answer
// keys) by concatenating the per-chapter/per-exam solution fragments that the
// authoring agents wrote into sections/_sol/. Re-run any time those change.
//
//   node assemble-appendices.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");          // docs/textbook
const SECTIONS = resolve(ROOT, "sections");
const SOL = resolve(SECTIONS, "_sol");

const manifest = JSON.parse(readFileSync(resolve(__dirname, "sections.json"), "utf8"));
const titleOf = (id) => (manifest.sections.find((s) => s.id === id) || {}).title || id;

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").trim() : `<p><em>(solutions pending)</em></p>`);

// ── Appendix A: chapter exercise solutions ───────────────────────────────────
let a = `<p class="lead">Worked solutions to every chapter's practice exercises.
Attempt each exercise before consulting its solution; the value is in the struggle,
not the answer. Solutions are grouped by chapter and keyed to the exercise numbers
(for example, <code>7.3</code> is the third exercise in Chapter&nbsp;7).</p>\n`;
for (let n = 1; n <= 13; n++) {
  const id = `ch${n}`;
  const file = resolve(SOL, `ch${String(n).padStart(2, "0")}.html`);
  a += `<h2 id="sol-ch${n}">Chapter ${n} · ${titleOf(id)}</h2>\n${read(file)}\n`;
}
writeFileSync(resolve(SECTIONS, "17-appendix-a-solutions.html"), a);

// ── Appendix B: practice-exam answer keys ────────────────────────────────────
const exams = [
  { id: "exam-mid",   key: "examA", label: "Practice Exam A" },
  { id: "exam-final", key: "examB", label: "Practice Exam B" },
  { id: "exam-comp",  key: "examC", label: "Practice Exam C" },
];
let b = `<p class="lead">Full answer keys for the three practice exams. For
multiple-choice items the correct option is named and justified; for short-answer
and design problems a model answer lists the points a grader looks for.</p>\n`;
for (const e of exams) {
  const file = resolve(SOL, `${e.key}.html`);
  b += `<h2 id="key-${e.key}">${e.label} · ${titleOf(e.id)}</h2>\n${read(file)}\n`;
}
writeFileSync(resolve(SECTIONS, "18-appendix-b-exam-keys.html"), b);

console.log("wrote 17-appendix-a-solutions.html and 18-appendix-b-exam-keys.html");
